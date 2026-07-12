/**
 * Phase C5 — Discovery Manual Run Route (hardened)
 *
 * Protected internal endpoint for manually triggering a discovery run.
 * Intended for developer inspection, QA validation, and cost monitoring.
 * NEVER wired to the autopilot scheduler — this is a manual trigger only.
 *
 * Routes:
 *   POST /api/discovery/manual-run   — Dry run (plan only) or live run
 *   GET  /api/discovery/health       — Provider health + capability report
 *
 * Request body (POST) — validated by Zod:
 *   {
 *     dryRun?:        boolean           — If true, return plan only (default: true)
 *     mode?:          OrchestrationMode — "primary_only" | "fallback" | "merge" (default: "primary_only")
 *     costCeilingUSD?: number           — Per-run ceiling in USD (clamped to MAX_RUN_CEILING_USD)
 *   }
 *
 * Security:
 *   - Requires valid Clerk session (userId from getAuth).
 *   - Resolves the client from the DB — no hard-coded client IDs.
 *   - In dryRun mode: zero API calls to DataForSEO.
 *   - In live mode: only runs if DISCOVERY_DATAFORSEO_ENABLED=true AND credentials set.
 *   - Credentials are NEVER returned in any response.
 *   - costCeilingUSD is clamped to MAX_RUN_CEILING_USD regardless of caller input.
 *
 * Cost transparency:
 *   - Every response includes estimatedApiCalls and estimatedCostUSD.
 *   - Live runs include a costLedger block in the response.
 *   - Provider capabilities are reported in the health endpoint.
 *   - Budget rejections are reported as diagnostics (not as failures).
 */

import { Router } from "express";
import { z } from "zod";
import { getAuth } from "@clerk/express";
import {
  db,
  pool,
  DiscoveryPipeline,
  buildDiscoveryContext,
  DrizzleDiscoveryRepository,
  bootstrapDiscoveryTables,
  parseDataForSEOConfig,
  getDataForSEOHealthState,
  DataForSEOContextAdapter,
  buildDataForSEOQueryPlan,
  // C5 imports:
  DATAFORSEO_CAPABILITIES,
  describeCapabilities,
  BudgetGuard,
  MAX_RUN_CEILING_USD,
  DEFAULT_RUN_CEILING_USD,
  SearchOrchestrator,
  CostLedger,
  bootstrapCostTable,
  saveCostRecords,
  deriveCostRecordId,
} from "@workspace/db";
import type { OrchestrationMode } from "@workspace/db";
import { resolveClientContentContextFromDb } from "../lib/client-resolver.js";

// ── Table bootstrap (idempotent, runs once on server start) ───────────────────
bootstrapDiscoveryTables(pool).catch(err =>
  console.error("[DISCOVERY-RUN] Discovery table bootstrap failed:", err),
);
bootstrapCostTable(pool).catch(err =>
  console.error("[DISCOVERY-RUN] Cost table bootstrap failed:", err),
);

const router = Router();

// ── Zod schema for POST body ──────────────────────────────────────────────────

const manualRunBodySchema = z.object({
  /**
   * If true (default), return the query plan without calling DataForSEO.
   * Explicit false is required for a live run.
   */
  dryRun: z.boolean().optional().default(true),
  /**
   * Orchestration mode. Currently only the primary (DataForSEO) provider runs.
   * The interface is in place for future secondary providers.
   */
  mode: z.enum(["primary_only", "fallback", "merge"]).optional().default("primary_only"),
  /**
   * Per-run cost ceiling in USD. Clamped to MAX_RUN_CEILING_USD regardless of input.
   * Defaults to DEFAULT_RUN_CEILING_USD when not supplied.
   */
  costCeilingUSD: z.number().positive().optional(),
});

// ── GET /api/discovery/health ─────────────────────────────────────────────────

router.get("/api/discovery/health", (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const config = parseDataForSEOConfig();
  const health = getDataForSEOHealthState(config);

  res.json({
    provider:     "dataforseo",
    health,
    capabilities: describeCapabilities("dataforseo", DATAFORSEO_CAPABILITIES),
    config: config ? {
      baseUrl:             config.baseUrl,
      timeoutMs:           config.timeoutMs,
      maxQueriesPerRun:    config.maxQueriesPerRun,
      maxResultsPerQuery:  config.maxResultsPerQuery,
      maxKeywordsPerBatch: config.maxKeywordsPerBatch,
      enabled:             config.enabled,
    } : null,
    budget: {
      maxRunCeilingUSD:     MAX_RUN_CEILING_USD,
      defaultRunCeilingUSD: DEFAULT_RUN_CEILING_USD,
    },
  });
});

// ── POST /api/discovery/manual-run ────────────────────────────────────────────

router.post("/api/discovery/manual-run", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Step 1: Validate request body
  const bodyParse = manualRunBodySchema.safeParse(req.body ?? {});
  if (!bodyParse.success) {
    res.status(400).json({
      error:   "invalid_request",
      issues:  bodyParse.error.issues.map(i => ({ path: i.path, message: i.message })),
    });
    return;
  }

  const {
    dryRun,
    mode,
    costCeilingUSD: rawCeiling,
  } = bodyParse.data;

  // Clamp caller-supplied ceiling to system maximum
  const costCeilingUSD = rawCeiling !== undefined
    ? Math.min(rawCeiling, MAX_RUN_CEILING_USD)
    : DEFAULT_RUN_CEILING_USD;

  // Step 2: Resolve this user's client content context
  let resolved;
  try {
    resolved = await resolveClientContentContextFromDb(userId);
  } catch (err) {
    console.error("[discovery-run] Client resolve DB error:", err);
    res.status(500).json({ error: "db_error", message: "Failed to resolve client." });
    return;
  }

  if (!resolved.found) {
    res.status(404).json({
      error:  "client_not_found",
      reason: resolved.reason,
      hint:   "Complete the onboarding flow to register your client.",
    });
    return;
  }

  const { context: contentContext, client } = resolved;
  const clientId = client.id;

  // Step 3: Build discovery context
  const now = new Date();
  const discoveryContext = buildDiscoveryContext({
    contentContext,
    clientId,
    now,
    aiSearchGapScore: 50, // default — no AI audit required for manual run
  });

  // Step 4: Load DataForSEO config and build query plan
  const config = parseDataForSEOConfig();
  const health = getDataForSEOHealthState(config);

  if (!config) {
    res.status(503).json({
      error:  "provider_unconfigured",
      health,
      hint:   "Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD environment variables.",
    });
    return;
  }

  const plan = buildDataForSEOQueryPlan(discoveryContext, config);

  // Step 5: Dry-run — return plan without calling DataForSEO
  if (dryRun) {
    const budgetGuard   = new BudgetGuard({ perRunCeilingUSD: costCeilingUSD, dryRunMode: true });
    const budgetCheck   = budgetGuard.check(plan.estimatedCostUSD, plan.estimatedApiCalls);

    res.json({
      dryRun:     true,
      mode,
      clientId,
      clientName: contentContext.clientName,
      week:       discoveryContext.currentWeek,
      location:   discoveryContext.location,
      health,
      capabilities: describeCapabilities("dataforseo", DATAFORSEO_CAPABILITIES),
      plan: {
        serpQueries: plan.serpQueries.map(q => ({
          keyword:         q.keyword,
          locationName:    q.locationName,
          category:        q.category,
          educationalOnly: q.educationalOnly,
        })),
        volumeKeywordCount: plan.volumeKeywords.length,
        estimatedApiCalls:  plan.estimatedApiCalls,
        estimatedCostUSD:   plan.estimatedCostUSD,
        blockedQueries:     plan.blockedQueries,
      },
      budget: {
        costCeilingUSD,
        maxRunCeilingUSD:  MAX_RUN_CEILING_USD,
        planWithinBudget:  budgetCheck.allowed,
        budgetDiagnostic:  budgetCheck.diagnostic ?? null,
      },
    });
    return;
  }

  // Step 6: Live run — requires enabled=true
  if (health.status !== "configured") {
    res.status(503).json({
      error:  "provider_not_ready",
      health,
      hint:   health.status === "disabled"
        ? "Set DISCOVERY_DATAFORSEO_ENABLED=true to enable live discovery runs."
        : "Configure DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD first.",
    });
    return;
  }

  // Step 7: Budget check before execution
  const budgetGuard = new BudgetGuard({ perRunCeilingUSD: costCeilingUSD });
  const budgetCheck = budgetGuard.check(plan.estimatedCostUSD, plan.estimatedApiCalls);
  if (!budgetCheck.allowed) {
    res.status(402).json({
      error:           "budget_exceeded",
      reason:          budgetCheck.reason,
      budgetDiagnostic: budgetCheck.diagnostic,
      plan: {
        estimatedCostUSD:  plan.estimatedCostUSD,
        estimatedApiCalls: plan.estimatedApiCalls,
        costCeilingUSD,
      },
    });
    return;
  }

  try {
    // Step 8: Build orchestrator (wraps adapter for C5 compatibility)
    const adapter = new DataForSEOContextAdapter(config, discoveryContext);
    const orchestrator = new SearchOrchestrator({
      mode: mode as OrchestrationMode,
      providers: [{ provider: adapter, capabilities: DATAFORSEO_CAPABILITIES, priority: 1 }],
    });

    const repository = new DrizzleDiscoveryRepository(db);
    const pipeline   = new DiscoveryPipeline({ search: orchestrator }, repository);

    const startAt = Date.now();
    const summary = await pipeline.run(discoveryContext);
    const elapsedMs = Date.now() - startAt;

    // Step 9: Build and save cost ledger
    const ledger = new CostLedger();
    ledger.record({
      id:               deriveCostRecordId(summary.runId, "dataforseo", "serp_results", 1),
      runId:            summary.runId,
      clientId,
      provider:         "dataforseo",
      capability:       "serp_results",
      endpoint:         "serp/google/organic/live/regular",
      estimatedCostUSD: plan.estimatedCostUSD,
      actualCostUSD:    null, // DataForSEO does not return billing per call
      requestCount:     plan.estimatedApiCalls,
      retryCount:       0,
      success:          summary.status !== "failed",
      errorKind:        summary.status === "failed" ? "provider_error" : null,
      recordedAt:       new Date(),
    });

    // Fire-and-forget cost persistence — never fails the run response
    saveCostRecords(ledger.getRecords(), pool).catch(err =>
      console.error("[discovery-run] Cost record persistence failed:", err),
    );

    // Step 10: Execution diagnostics from orchestrator
    const executionRecords = orchestrator.getExecutionRecords();

    res.json({
      dryRun:     false,
      mode,
      clientId,
      clientName: contentContext.clientName,
      week:       discoveryContext.currentWeek,
      location:   discoveryContext.location,
      health:     { status: "configured" },
      capabilities: describeCapabilities("dataforseo", DATAFORSEO_CAPABILITIES),
      plan: {
        estimatedApiCalls: plan.estimatedApiCalls,
        estimatedCostUSD:  plan.estimatedCostUSD,
        blockedQueries:    plan.blockedQueries,
      },
      budget: {
        costCeilingUSD,
        maxRunCeilingUSD: MAX_RUN_CEILING_USD,
        planWithinBudget: true,
      },
      summary: {
        runId:               summary.runId,
        weekLabel:           summary.weekLabel,
        status:              summary.status,
        signalsReceived:     summary.signals.received,
        signalsAccepted:     summary.signals.accepted,
        signalsBlocked:      summary.signals.blocked,
        clustersCreated:     summary.clusters.created,
        opportunitiesCreated: summary.opportunities.created,
        highPriorityCount:   summary.opportunities.highPriority,
        providersAttempted:  summary.providersAttempted,
        providersSucceeded:  summary.providersSucceeded,
        providerFailures:    summary.providerFailures,
        durationMs:          elapsedMs,
      },
      costLedger: ledger.toReport(),
      diagnostics: {
        orchestrationMode:  mode,
        providerExecutions: executionRecords,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[discovery-run] Live run failed for client ${clientId}: ${message}`);
    res.status(500).json({ error: "run_failed", message });
  }
});

export default router;

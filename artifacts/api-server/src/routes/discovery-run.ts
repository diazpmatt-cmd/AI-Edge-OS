/**
 * Phase C5 — Discovery Manual Run Route (hardened)
 * Phase C6 — Lifecycle Governance, Idempotency, Rate Limiting, Audit
 *
 * Protected internal endpoint for manually triggering a discovery run.
 * Intended for developer inspection, QA validation, and cost monitoring.
 *
 * Routes:
 *   POST /api/discovery/manual-run   — Dry run (plan only) or live run
 *   GET  /api/discovery/health       — Provider health + capability report
 *
 * Request body (POST) — validated by Zod:
 *   {
 *     dryRun?:          boolean           — If true, return plan only (default: true)
 *     mode?:            OrchestrationMode — "primary_only" | "fallback" | "merge"
 *     costCeilingUSD?:  number            — Per-run ceiling in USD (clamped)
 *   }
 *
 * Optional headers:
 *   Idempotency-Key: <string>    — Replay same request within 24h
 *
 * Security:
 *   - Requires valid Clerk session (userId from getAuth).
 *   - Resolves the client from the DB — no hard-coded client IDs.
 *   - In dryRun mode: zero API calls to DataForSEO.
 *   - In live mode: only runs if DISCOVERY_DATAFORSEO_ENABLED=true AND credentials set.
 *   - Credentials are NEVER returned in any response.
 *   - costCeilingUSD is clamped to MAX_RUN_CEILING_USD regardless of caller input.
 *
 * C6 governance (this route owns):
 *   - Rate limiting: live_run=2/min, dry_run=10/min per userId.
 *   - Idempotency: Idempotency-Key header enables 24h replay.
 *   - Governance: maximum 1 active run per client (default policy).
 *   - Correlation ID: generated per request.
 *   - Audit: dry-run and governance-denied events.
 *
 * C6 execution (DiscoveryExecutionService owns):
 *   - Lease acquire → snapshot pre-init → pipeline → finalization → lease release.
 *   - All four execution invariants (I1–I4) are enforced inside the service.
 *   - The C7 scheduler also calls the service — this route is the manual trigger only.
 */

import { Router }     from "express";
import { randomUUID } from "node:crypto";
import { z }          from "zod";
import { getAuth }    from "@clerk/express";
import {
  pool,
  buildDiscoveryContext,
  bootstrapDiscoveryTables,
  parseDataForSEOConfig,
  getDataForSEOHealthState,
  buildDataForSEOQueryPlan,
  DATAFORSEO_CAPABILITIES,
  describeCapabilities,
  BudgetGuard,
  MAX_RUN_CEILING_USD,
  DEFAULT_RUN_CEILING_USD,
  bootstrapCostTable,
  bootstrapC6Tables,
  DEFAULT_GOVERNANCE_POLICY,
  evaluateGovernance,
  getActiveRunCount,
  deriveIdempotencyId,
  deriveRequestFingerprint,
  deriveIdempotencyExpiry,
  validateIdempotencyKey,
  checkIdempotency,
  saveIdempotency,
  createAuditEvent,
  appendAudit,
} from "@workspace/db";
import type { OrchestrationMode } from "@workspace/db";
import { resolveClientContentContextFromDb } from "../lib/client-resolver.js";
import { discoveryRateLimiter }               from "../lib/discovery-rate-limiter.js";
import { DiscoveryExecutionService }          from "../lib/discovery-execution-service.js";

// ── Table bootstrap (idempotent, runs once on server start) ───────────────────
import {
  bootstrapC7Tables,
} from "@workspace/db";

bootstrapDiscoveryTables(pool).catch(err =>
  console.error("[DISCOVERY-RUN] Discovery table bootstrap failed:", err),
);
bootstrapCostTable(pool).catch(err =>
  console.error("[DISCOVERY-RUN] Cost table bootstrap failed:", err),
);
bootstrapC6Tables(pool).catch(err =>
  console.error("[DISCOVERY-RUN] C6 table bootstrap failed:", err),
);
bootstrapC7Tables(pool).catch(err =>
  console.error("[DISCOVERY-RUN] C7 table bootstrap failed:", err),
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
   */
  mode: z.enum(["primary_only", "fallback", "merge"]).optional().default("primary_only"),
  /**
   * Per-run cost ceiling in USD. Clamped to MAX_RUN_CEILING_USD regardless of input.
   */
  costCeilingUSD: z.number().positive().optional(),
});

// ── GET /api/discovery/health ─────────────────────────────────────────────────

router.get("/api/discovery/health", (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rl = discoveryRateLimiter.check("health", userId, "health", Date.now());
  if (!rl.allowed) {
    res.setHeader("Retry-After", String(rl.retryAfterS));
    res.status(429).json({ error: "rate_limit_exceeded", retryAfterS: rl.retryAfterS });
    return;
  }

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

  // ── C6: Correlation ID for this request ────────────────────────────────────
  const correlationId = randomUUID();

  // ── Step 1: Validate request body ─────────────────────────────────────────
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

  const costCeilingUSD = rawCeiling !== undefined
    ? Math.min(rawCeiling, MAX_RUN_CEILING_USD)
    : DEFAULT_RUN_CEILING_USD;

  // ── C6: Rate limiting ──────────────────────────────────────────────────────
  // Rate limit per userId before resolving client (cheap check)
  const rlOp = dryRun ? "dry_run" : "live_run";
  const rl   = discoveryRateLimiter.check(rlOp, userId, userId, Date.now());
  if (!rl.allowed) {
    res.setHeader("Retry-After", String(rl.retryAfterS));
    res.status(429).json({
      error:        "rate_limit_exceeded",
      operation:    rlOp,
      retryAfterS:  rl.retryAfterS,
      correlationId,
    });
    return;
  }

  // ── C6: Idempotency-Key header ─────────────────────────────────────────────
  const idempotencyKeyHeader = req.headers["idempotency-key"];
  const idempotencyKey       = typeof idempotencyKeyHeader === "string"
    ? idempotencyKeyHeader
    : null;

  if (idempotencyKey !== null) {
    const keyErr = validateIdempotencyKey(idempotencyKey);
    if (keyErr) {
      res.status(400).json({ error: "invalid_idempotency_key", message: keyErr });
      return;
    }
  }

  // ── Step 2: Resolve client ─────────────────────────────────────────────────
  let resolved;
  try {
    resolved = await resolveClientContentContextFromDb(userId);
  } catch (err) {
    console.error("[discovery-run] Client resolve DB error:", err);
    res.status(500).json({ error: "db_error", message: "Failed to resolve client.", correlationId });
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

  // ── C6: Idempotency check (after clientId is known) ───────────────────────
  if (idempotencyKey !== null) {
    const idemOp          = (dryRun ? "dry_run" : "manual_run") as "dry_run" | "manual_run";
    const requestFp       = deriveRequestFingerprint({ mode, costCeilingUSD, isDryRun: dryRun });
    const idemId          = deriveIdempotencyId(clientId, idempotencyKey, idemOp, dryRun);
    const idemCheck       = await checkIdempotency(pool, idemId, requestFp).catch(() => ({ found: false as const }));

    if (idemCheck.found && idemCheck.match) {
      const stored = idemCheck.record;
      res.setHeader("Idempotent-Replayed", "true");
      res.status(stored.responseStatus ?? 200).json({
        ...(stored.responseBody ?? {}),
        idempotentReplay: true,
        correlationId,
        originalCorrelationId: stored.responseBody?.["correlationId"] ?? null,
      });
      return;
    }
    if (idemCheck.found && !idemCheck.match) {
      res.status(422).json({
        error:         "idempotency_mismatch",
        message:       "The Idempotency-Key was already used with different request parameters.",
        correlationId,
      });
      return;
    }
  }

  // ── C6: Governance check for live runs ─────────────────────────────────────
  if (!dryRun) {
    const activeRuns  = await getActiveRunCount(pool, clientId).catch(() => 0);
    const govResult   = evaluateGovernance(DEFAULT_GOVERNANCE_POLICY, activeRuns);
    if (!govResult.allowed) {
      // Audit: execution denied
      const auditEvent = createAuditEvent({
        clientId, runId: null, action: "execution_denied_governance",
        actorType: "user", actorId: userId, correlationId,
        metadata: { reason: govResult.reason, activeRuns, message: govResult.message },
      });
      appendAudit(pool, auditEvent).catch((err: unknown) => {
        console.error("[discovery-run] Audit write failed:", err instanceof Error ? err.message : String(err));
      });

      // Fetch the active run's ID so the caller can track it
      const activeRunRow = await pool
        .query<{ id: string }>(
          `SELECT id FROM discovery_snapshots
           WHERE client_id = $1
             AND status IN ('running', 'queued', 'planned', 'cancel_requested')
           ORDER BY created_at DESC
           LIMIT 1`,
          [clientId],
        )
        .catch(() => ({ rows: [] as { id: string }[] }));

      res.status(409).json({
        error:         "governance_denied",
        reason:        govResult.reason,
        message:       govResult.message,
        runId:         activeRunRow.rows[0]?.id ?? null,
        correlationId,
      });
      return;
    }
  }

  // ── Step 3: Build discovery context ───────────────────────────────────────
  const now              = new Date();
  const discoveryContext = buildDiscoveryContext({
    contentContext,
    clientId,
    now,
    aiSearchGapScore: 50,
  });

  // ── Step 4: Load DataForSEO config and build query plan ────────────────────
  const config = parseDataForSEOConfig();
  const health = getDataForSEOHealthState(config);

  if (!config) {
    res.status(503).json({
      error:  "provider_unconfigured",
      health,
      hint:   "Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD environment variables.",
      correlationId,
    });
    return;
  }

  const plan = buildDataForSEOQueryPlan(discoveryContext, config);

  // ── Step 5: Dry-run ────────────────────────────────────────────────────────
  if (dryRun) {
    const budgetGuard = new BudgetGuard({ perRunCeilingUSD: costCeilingUSD, dryRunMode: true });
    const budgetCheck = budgetGuard.check(plan.estimatedCostUSD, plan.estimatedApiCalls);

    const responseBody = {
      dryRun:     true,
      mode,
      clientId,
      clientName: contentContext.clientName,
      week:       discoveryContext.currentWeek,
      location:   discoveryContext.location,
      correlationId,
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
    };

    // C6: Audit + idempotency for dry run
    const auditEvent = createAuditEvent({
      clientId, runId: null, action: "dry_run_requested",
      actorType: "user", actorId: userId, correlationId,
      metadata: { mode, costCeilingUSD, planWithinBudget: budgetCheck.allowed },
    });
    appendAudit(pool, auditEvent).catch((err: unknown) => {
      console.error("[discovery-run] Audit write failed:", err instanceof Error ? err.message : String(err));
    });

    if (idempotencyKey !== null) {
      const idemId = deriveIdempotencyId(clientId, idempotencyKey, "dry_run", true);
      const idemRecord = {
        id:                 idemId,
        clientId,
        idempotencyKey,
        operation:          "dry_run" as const,
        requestFingerprint: deriveRequestFingerprint({ mode, costCeilingUSD, isDryRun: true }),
        runId:              null,
        isDryRun:           true,
        responseStatus:     200,
        responseBody:       responseBody as Record<string, unknown>,
        createdAt:          new Date(),
        expiresAt:          deriveIdempotencyExpiry(),
      };
      saveIdempotency(pool, idemRecord).catch((err: unknown) => {
        console.error("[discovery-run] Idempotency write failed:", err instanceof Error ? err.message : String(err));
      });
    }

    res.json(responseBody);
    return;
  }

  // ── Step 6: Live run — requires provider enabled ──────────────────────────
  if (health.status !== "configured") {
    res.status(503).json({
      error:  "provider_not_ready",
      health,
      hint:   health.status === "disabled"
        ? "Set DISCOVERY_DATAFORSEO_ENABLED=true to enable live discovery runs."
        : "Configure DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD first.",
      correlationId,
    });
    return;
  }

  // ── Step 7: Budget check before execution ──────────────────────────────────
  const budgetGuard = new BudgetGuard({ perRunCeilingUSD: costCeilingUSD });
  const budgetCheck = budgetGuard.check(plan.estimatedCostUSD, plan.estimatedApiCalls);
  if (!budgetCheck.allowed) {
    appendAudit(pool, createAuditEvent({
      clientId, runId: null, action: "execution_denied_budget",
      actorType: "user", actorId: userId, correlationId,
      metadata: { reason: budgetCheck.reason, costCeilingUSD,
                  estimatedCostUSD: plan.estimatedCostUSD },
    })).catch((err: unknown) => {
      console.error("[discovery-run] Audit write failed:", err instanceof Error ? err.message : String(err));
    });
    res.status(402).json({
      error:            "budget_exceeded",
      reason:           budgetCheck.reason,
      budgetDiagnostic: budgetCheck.diagnostic,
      plan: {
        estimatedCostUSD:  plan.estimatedCostUSD,
        estimatedApiCalls: plan.estimatedApiCalls,
        costCeilingUSD,
      },
      correlationId,
    });
    return;
  }

  // ── Step 8: Execute via DiscoveryExecutionService (C6 canonical path) ──────
  //
  // The service owns: lease → snapshot → audit → pipeline → finalization →
  //                   transitions → diagnostics → cost-ledger → lease-release.
  //
  // All four execution invariants (I1–I4) are enforced inside the service.
  // The C7 scheduler will also call this service — never the HTTP route.
  const executionService = new DiscoveryExecutionService();
  const result = await executionService.execute({
    clientId,
    correlationId,
    mode: mode as OrchestrationMode,
    costCeilingUSD,
    discoveryContext,
    plan: {
      estimatedCostUSD:  plan.estimatedCostUSD,
      estimatedApiCalls: plan.estimatedApiCalls,
    },
    actor: { actorType: "user", actorId: userId },
  });

  // ── Step 9: Dispatch on result status ──────────────────────────────────────

  if (result.status === "lease_denied") {
    res.status(409).json({
      error:        "concurrent_run",
      message:      "A discovery run for this client is already executing. Wait for it to complete or cancel it first.",
      runId:        result.runId,
      correlationId,
    });
    return;
  }

  if (result.status === "failed") {
    res.status(500).json({ error: "run_failed", message: result.error, correlationId });
    return;
  }

  if (result.status === "cancelled") {
    res.status(200).json({
      dryRun: false, mode, clientId,
      runId:   result.runId,
      correlationId,
      status:  "cancelled",
      message: "Run was cancelled cooperatively before completing all provider stages.",
      elapsedMs: result.elapsedMs,
    });
    return;
  }

  // status === "complete" | "partial"
  const { summary, costReport, orchestrationRecords, runId, elapsedMs } = result;

  const responseBody = {
    dryRun:     false,
    mode,
    clientId,
    clientName: contentContext.clientName,
    week:       discoveryContext.currentWeek,
    location:   discoveryContext.location,
    correlationId,
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
      runId:                summary.runId,
      weekLabel:            summary.weekLabel,
      status:               summary.status,
      signalsReceived:      summary.signals.received,
      signalsAccepted:      summary.signals.accepted,
      signalsBlocked:       summary.signals.blocked,
      clustersCreated:      summary.clusters.created,
      opportunitiesCreated: summary.opportunities.created,
      highPriorityCount:    summary.opportunities.highPriority,
      providersAttempted:   summary.providersAttempted,
      providersSucceeded:   summary.providersSucceeded,
      providerFailures:     summary.providerFailures,
      durationMs:           elapsedMs,
    },
    costLedger:  costReport,
    diagnostics: {
      orchestrationMode:  mode,
      providerExecutions: orchestrationRecords,
    },
  };

  // C6: Save idempotency record for replay
  if (idempotencyKey !== null) {
    const idemId = deriveIdempotencyId(clientId, idempotencyKey, "manual_run", false);
    saveIdempotency(pool, {
      id:                 idemId,
      clientId,
      idempotencyKey,
      operation:          "manual_run" as const,
      requestFingerprint: deriveRequestFingerprint({ mode, costCeilingUSD, isDryRun: false }),
      runId:              summary.runId,
      isDryRun:           false,
      responseStatus:     200,
      responseBody: {
        runId: summary.runId, status: summary.status,
        correlationId, dryRun: false, mode, clientId,
      } as Record<string, unknown>,
      createdAt: new Date(),
      expiresAt: deriveIdempotencyExpiry(),
    }).catch((err: unknown) => {
      console.error("[discovery-run] Idempotency write failed:", err instanceof Error ? err.message : String(err));
    });
  }

  res.json(responseBody);
});

export default router;

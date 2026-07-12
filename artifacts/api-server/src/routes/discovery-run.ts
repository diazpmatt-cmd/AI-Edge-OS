/**
 * Phase C4 — Discovery Manual Run Route
 *
 * Protected internal endpoint for manually triggering a discovery run.
 * Intended for developer inspection, QA validation, and cost monitoring.
 * NEVER wired to the autopilot scheduler — this is a manual trigger only.
 *
 * Routes:
 *   POST /api/discovery/manual-run   — Dry run (plan only) or live run
 *   GET  /api/discovery/health       — DataForSEO provider health check
 *
 * Request body (POST):
 *   {
 *     dryRun?: boolean   — If true, return query plan without calling DataForSEO (default: true)
 *   }
 *
 * Security:
 *   - Requires valid Clerk session (userId from getAuth).
 *   - Resolves the client from the DB — no hard-coded client IDs.
 *   - In dryRun mode: zero API calls to DataForSEO.
 *   - In live mode: only runs if DISCOVERY_DATAFORSEO_ENABLED=true AND credentials set.
 *   - Credentials are never returned in any response.
 *
 * Cost transparency:
 *   - Every response includes estimatedApiCalls and estimatedCostUSD.
 *   - The plan shows all blocked queries for auditability.
 */

import { Router } from "express";
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
} from "@workspace/db";
import { resolveClientContentContextFromDb } from "../lib/client-resolver.js";

// ── Discovery table bootstrap (idempotent, runs once on server start) ─────────
bootstrapDiscoveryTables(pool).catch(err =>
  console.error("[DISCOVERY-RUN] Table bootstrap failed:", err),
);

const router = Router();

// ── GET /api/discovery/health ─────────────────────────────────────────────────

router.get("/api/discovery/health", (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const config = parseDataForSEOConfig();
  const health = getDataForSEOHealthState(config);

  res.json({
    provider: "dataforseo",
    health,
    config: config ? {
      baseUrl:             config.baseUrl,
      timeoutMs:           config.timeoutMs,
      maxQueriesPerRun:    config.maxQueriesPerRun,
      maxResultsPerQuery:  config.maxResultsPerQuery,
      maxKeywordsPerBatch: config.maxKeywordsPerBatch,
      enabled:             config.enabled,
    } : null,
  });
});

// ── POST /api/discovery/manual-run ────────────────────────────────────────────

router.post("/api/discovery/manual-run", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const dryRun = req.body?.dryRun !== false; // default true (safe)

  // Step 1: Resolve this user's client content context
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

  // Step 2: Build discovery context
  const now = new Date();
  const discoveryContext = buildDiscoveryContext({
    contentContext,
    clientId,
    now,
    aiSearchGapScore: 50, // default — no AI audit required for manual run
  });

  // Step 3: Load DataForSEO config and build query plan
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

  // Step 4: Dry-run — return plan without calling DataForSEO
  if (dryRun) {
    res.json({
      dryRun:     true,
      clientId,
      clientName: contentContext.clientName,
      week:       discoveryContext.currentWeek,
      location:   discoveryContext.location,
      health,
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
    });
    return;
  }

  // Step 5: Live run — requires enabled=true
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

  try {
    const adapter    = new DataForSEOContextAdapter(config, discoveryContext);
    const repository = new DrizzleDiscoveryRepository(db);
    const pipeline   = new DiscoveryPipeline({ search: adapter }, repository);

    const startAt = Date.now();
    const summary = await pipeline.run(discoveryContext);
    const elapsedMs = Date.now() - startAt;

    res.json({
      dryRun:     false,
      clientId,
      clientName: contentContext.clientName,
      week:       discoveryContext.currentWeek,
      location:   discoveryContext.location,
      health:     { status: "configured" },
      plan: {
        estimatedApiCalls: plan.estimatedApiCalls,
        estimatedCostUSD:  plan.estimatedCostUSD,
        blockedQueries:    plan.blockedQueries,
      },
      summary: {
        runId:              summary.runId,
        weekLabel:          summary.weekLabel,
        status:             summary.status,
        signalsReceived:    summary.signals.received,
        signalsAccepted:    summary.signals.accepted,
        signalsBlocked:     summary.signals.blocked,
        clustersCreated:    summary.clusters.created,
        opportunitiesCreated: summary.opportunities.created,
        highPriorityCount:  summary.opportunities.highPriority,
        providersAttempted: summary.providersAttempted,
        providersSucceeded: summary.providersSucceeded,
        providerFailures:   summary.providerFailures,
        durationMs:         elapsedMs,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[discovery-run] Live run failed for client ${clientId}: ${message}`);
    res.status(500).json({ error: "run_failed", message });
  }
});

export default router;

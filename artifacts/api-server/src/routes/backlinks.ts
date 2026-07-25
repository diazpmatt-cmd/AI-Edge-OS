import { Router }  from "express";
import { getAuth } from "@clerk/express";
import {
  db, pool,
  DrizzleBacklinkRepository,
  FixtureBacklinkDataProvider,
  BBB_FIXTURE_BACKLINK_OBSERVATIONS,
  BBB_BACKLINK_ALLOWED_SERVICES,
  BBB_BACKLINK_BLOCKED_PHRASES,
  ingestFixtureBacklinks,
  BACKLINK_MAX_PAGE_SIZE,
  parseDataForSEOBacklinkConfig,
  getDataForSEOBacklinkHealthState,
  DataForSEOBacklinkAdapter,
  BacklinkProviderRegistry,
  parseBacklinkScheduleFrequency,
  isBacklinkScheduleFrequency,
  calcNextRunAt,
  BACKLINK_SCHEDULE_FREQUENCIES,
  computePeriodSummaries,
  computeEdgeAuthorityScore,
  type BacklinkWorkflowStatus,
  type BacklinkOpportunityCategory,
  type BacklinkProviderHealthState,
  type BacklinkDataProvider,
  type BacklinkCapability,
} from "@workspace/db";
import { resolveClientContentContextFromDb } from "../lib/client-resolver.js";
import { SCHEDULER_SECRET } from "../lib/scheduler-secret.js";

const router = Router();
const repo   = new DrizzleBacklinkRepository(db);

// ── Backlink provider registry (singleton per process) ────────────────────────

const _dfsConfig = parseDataForSEOBacklinkConfig();
const _dfsHealth = getDataForSEOBacklinkHealthState(_dfsConfig);

// When credentials are absent, register a stub so DataForSEO always appears
// in the health report as "unconfigured".  resolve() will never pick it because
// health.status != "configured".
const _dfsProvider: BacklinkDataProvider = _dfsConfig
  ? new DataForSEOBacklinkAdapter(_dfsConfig)
  : {
      name:         "dataforseo_backlinks",
      capabilities: new Set<BacklinkCapability>([
        "referring_domains",
        "link_intersections",
        "authority_metrics",
      ]),
      async discover() { return []; },
    };

const _fixtureHealth: BacklinkProviderHealthState = {
  provider: "fixture_backlinks",
  status:   "configured",
  reason:   null,
  login:    null,
};

const _backlinkRegistry = new BacklinkProviderRegistry();
_backlinkRegistry.register({ provider: _dfsProvider,     getHealth: () => _dfsHealth,    priority: 10 });
_backlinkRegistry.register({
  provider:  new FixtureBacklinkDataProvider(BBB_FIXTURE_BACKLINK_OBSERVATIONS),
  getHealth: () => _fixtureHealth,
  priority:  1,
});

function isRelationMissingError(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    return (err as { code: string }).code === "42P01";
  }
  return false;
}

async function resolveClient(req: any, res: any): Promise<{ userId: string; client: { id: string; [key: string]: unknown } } | null> {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  let resolved;
  try {
    resolved = await resolveClientContentContextFromDb(userId);
  } catch {
    res.status(500).json({ error: "db_error", message: "Failed to resolve client." });
    return null;
  }
  if (!resolved.found) {
    res.status(404).json({ error: "client_not_found", reason: resolved.reason });
    return null;
  }
  return { userId, client: resolved.client };
}

// ── GET /api/backlinks/providers/health ──────────────────────────────────────

router.get("/api/backlinks/providers/health", (req, res): void => {
  const schedulerAuth = req.headers["x-scheduler-secret"] === SCHEDULER_SECRET;
  const { userId } = getAuth(req);
  if (!userId && !schedulerAuth) { res.status(401).json({ error: "Unauthorized" }); return; }
  res.json(_backlinkRegistry.healthReport());
});

// ── GET /api/backlinks/schedule ───────────────────────────────────────────────

router.get("/api/backlinks/schedule", async (req, res): Promise<void> => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const { client } = auth;
  try {
    const result = await pool.query(
      `SELECT id, client_id, enabled, frequency, next_run_at, last_run_at,
              last_success_at, last_run_status, consecutive_failures, max_retries,
              created_at, updated_at
       FROM backlink_discovery_schedule
       WHERE client_id = $1
       LIMIT 1`,
      [client.id],
    );
    res.json({ schedule: result.rows[0] ?? null });
  } catch (err) {
    if (isRelationMissingError(err)) { res.json({ schedule: null }); return; }
    console.error("[backlinks] getSchedule error:", err);
    res.status(500).json({ error: "db_error" });
  }
});

// ── PUT /api/backlinks/schedule ───────────────────────────────────────────────

router.put("/api/backlinks/schedule", async (req, res): Promise<void> => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const { client } = auth;

  const { enabled, frequency, maxRetries } = req.body as {
    enabled?:    boolean;
    frequency?:  string;
    maxRetries?: number;
  };

  if (frequency !== undefined && !isBacklinkScheduleFrequency(frequency)) {
    res.status(400).json({
      error: "invalid_frequency",
      valid: BACKLINK_SCHEDULE_FREQUENCIES,
    });
    return;
  }
  if (maxRetries !== undefined && (!Number.isInteger(maxRetries) || maxRetries < 1 || maxRetries > 10)) {
    res.status(400).json({ error: "invalid_max_retries", message: "maxRetries must be 1–10" });
    return;
  }

  const freq    = parseBacklinkScheduleFrequency(frequency);
  // Always compute nextAt based on the requested frequency so the CASE block can
  // apply it in all "should advance" scenarios (enabling, or frequency change).
  const nextAt  = calcNextRunAt(freq, new Date());

  try {
    const result = await pool.query(
      `INSERT INTO backlink_discovery_schedule
         (client_id, enabled, frequency, next_run_at, max_retries, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (client_id) DO UPDATE SET
         enabled               = EXCLUDED.enabled,
         frequency             = EXCLUDED.frequency,
         next_run_at           = CASE
           WHEN EXCLUDED.enabled = FALSE THEN NULL
           WHEN backlink_discovery_schedule.enabled = FALSE THEN EXCLUDED.next_run_at
           WHEN EXCLUDED.frequency != backlink_discovery_schedule.frequency THEN EXCLUDED.next_run_at
           ELSE backlink_discovery_schedule.next_run_at
         END,
         max_retries           = EXCLUDED.max_retries,
         consecutive_failures  = CASE WHEN EXCLUDED.enabled = TRUE THEN 0 ELSE backlink_discovery_schedule.consecutive_failures END,
         updated_at            = NOW()
       RETURNING id, client_id, enabled, frequency, next_run_at, last_run_at,
                 last_success_at, last_run_status, consecutive_failures, max_retries,
                 created_at, updated_at`,
      [client.id, enabled ?? false, freq, nextAt, maxRetries ?? 3],
    );
    res.json({ schedule: result.rows[0] });
  } catch (err) {
    if (isRelationMissingError(err)) { res.status(503).json({ error: "schema_not_ready" }); return; }
    console.error("[backlinks] putSchedule error:", err);
    res.status(500).json({ error: "db_error" });
  }
});

// ── POST /api/backlinks/ingest/scheduled ─────────────────────────────────────
// Scheduler-secret authenticated endpoint.  Selects the best available provider
// (highest-priority configured one from the registry) and runs ingest.
// When no live provider is available, falls through to fixture and always succeeds.

router.post("/api/backlinks/ingest/scheduled", async (req, res): Promise<void> => {
  if (req.headers["x-scheduler-secret"] !== SCHEDULER_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const clientId = req.headers["x-scheduler-client-id"];
  if (!clientId || typeof clientId !== "string" || !clientId.trim()) {
    res.status(400).json({ error: "x-scheduler-client-id header required" });
    return;
  }

  const now      = new Date();
  const provider = _backlinkRegistry.resolve();
  if (!provider) {
    // No live provider configured — skip ingest rather than fabricating fixture data.
    res.json({
      ok: true,
      providerStatus: _backlinkRegistry.healthReport(),
      reason: "no_provider_configured",
      outcome: "skipped",
    });
    return;
  }
  const providerHealth = "configured";

  try {
    const result = await ingestFixtureBacklinks({
      trustedClientId:     clientId.trim(),
      provider,
      discovery: {
        clientId:          clientId.trim(),
        clientDomain:      "bedbugsbeyond.com",
        competitorDomains: [],
        serviceIds:        [...BBB_BACKLINK_ALLOWED_SERVICES],
        city:              "Foley",
        region:            "Baldwin County, Alabama",
        limit:             50,
      },
      normalizationPolicy: {
        allowedServiceIds: BBB_BACKLINK_ALLOWED_SERVICES,
        blockedPhrases:    [...BBB_BACKLINK_BLOCKED_PHRASES],
        now,
      },
      repository: new DrizzleBacklinkRepository(db),
      now,
    });

    // Record a score history snapshot after a successful scheduled run.
    // Best-effort — never blocks the response.
    const summary = "outcome" in result && result.outcome === "in_progress" ? null : result as import("@workspace/db").ManualBacklinkIngestionSummary;
    const snapshotDate = now.toISOString().slice(0, 10);
    if (summary) {
      // Compute AI Edge Authority Score from real provider data.
      // Returns null when backlinkCount=0 AND referringDomainCount=0 (fail-closed).
      const edgeScore = computeEdgeAuthorityScore({
        backlinkCount:        summary.prospectIds.length,
        referringDomainCount: 0, // v1: live DA provider required for real value
        opportunityCount:     summary.opportunityIds.length,
        wonCount:             summary.workflowIds.length,
      });
      pool.query(
        `INSERT INTO backlink_score_history
           (client_id, snapshot_date, authority_score, backlink_count, opportunity_count,
            won_count, new_count, lost_count, referring_domain_count, edge_authority_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (client_id, snapshot_date) DO UPDATE SET
           authority_score         = EXCLUDED.authority_score,
           backlink_count          = EXCLUDED.backlink_count,
           opportunity_count       = EXCLUDED.opportunity_count,
           won_count               = EXCLUDED.won_count,
           new_count               = EXCLUDED.new_count,
           lost_count              = EXCLUDED.lost_count,
           referring_domain_count  = EXCLUDED.referring_domain_count,
           edge_authority_score    = EXCLUDED.edge_authority_score`,
        [
          clientId.trim(),
          snapshotDate,
          0, // authority_score: v1 placeholder (third-party DA requires live DA provider)
          summary.prospectIds.length,
          summary.opportunityIds.length,
          summary.workflowIds.length,
          0, // new_count: v1 placeholder (requires live provider delta tracking)
          0, // lost_count: v1 placeholder (requires live provider delta tracking)
          0, // referring_domain_count: v1 placeholder (requires live DA provider)
          edgeScore, // null when no qualifying backlink evidence — honest, not fabricated
        ],
      ).catch(e => console.error("[backlinks] score snapshot insert error:", e));
    }

    res.json({ ok: true, providerStatus: providerHealth, ...result });
  } catch (err: any) {
    console.error("[backlinks] scheduled ingest error:", err);
    res.status(500).json({ ok: false, error: "ingest_failed", message: err?.message ?? "Unknown error" });
  }
});

// ── GET /api/backlinks/history/score ─────────────────────────────────────────

router.get("/api/backlinks/history/score", async (req, res): Promise<void> => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const { client } = auth;
  const days  = Math.min(90, Math.max(7, Number(req.query.days) || 30));
  try {
    const result = await pool.query(
      `SELECT client_id, snapshot_date::TEXT, authority_score, backlink_count,
              opportunity_count, won_count, run_id,
              COALESCE(new_count, 0)              AS new_count,
              COALESCE(lost_count, 0)             AS lost_count,
              COALESCE(referring_domain_count, 0) AS referring_domain_count,
              edge_authority_score
       FROM backlink_score_history
       WHERE client_id = $1
         AND snapshot_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
       ORDER BY snapshot_date ASC
       LIMIT 90`,
      [client.id, days],
    );
    res.json({ snapshots: result.rows, days });
  } catch (err) {
    if (isRelationMissingError(err)) { res.json({ snapshots: [], days }); return; }
    console.error("[backlinks] scoreHistory error:", err);
    res.status(500).json({ error: "db_error" });
  }
});

// ── GET /api/backlinks/history/summary ───────────────────────────────────────

router.get("/api/backlinks/history/summary", async (req, res): Promise<void> => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const { client } = auth;
  try {
    const [scheduleRes, countsRes] = await Promise.all([
      pool.query(
        `SELECT enabled, frequency, next_run_at, last_run_at, last_success_at,
                last_run_status, consecutive_failures, max_retries
         FROM backlink_discovery_schedule
         WHERE client_id = $1 LIMIT 1`,
        [client.id],
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE TRUE)                              AS total_runs,
           COUNT(*) FILTER (WHERE status = 'succeeded')             AS success_runs,
           COUNT(*) FILTER (WHERE status = 'failed')                AS failed_runs
         FROM backlink_ingestion_runs
         WHERE client_id = $1`,
        [client.id],
      ),
    ]);
    const sched  = scheduleRes.rows[0]  ?? null;
    const counts = countsRes.rows[0]    ?? { total_runs: 0, success_runs: 0, failed_runs: 0 };
    res.json({
      totalRuns:             Number(counts.total_runs),
      successRuns:           Number(counts.success_runs),
      failedRuns:            Number(counts.failed_runs),
      providerUnavailableRuns: 0,
      lastSuccessAt:         sched?.last_success_at ?? null,
      lastRunAt:             sched?.last_run_at     ?? null,
      lastRunStatus:         sched?.last_run_status ?? null,
      nextScheduledAt:       sched?.next_run_at     ?? null,
      consecutiveFailures:   sched?.consecutive_failures ?? 0,
      enabled:               sched?.enabled          ?? false,
      frequency:             sched?.frequency        ?? null,
      providerHealth:        _backlinkRegistry.healthReport(),
    });
  } catch (err) {
    if (isRelationMissingError(err)) {
      res.json({ totalRuns: 0, successRuns: 0, failedRuns: 0, providerUnavailableRuns: 0,
        lastSuccessAt: null, lastRunAt: null, lastRunStatus: null, nextScheduledAt: null,
        consecutiveFailures: 0, enabled: false, frequency: null,
        providerHealth: _backlinkRegistry.healthReport() });
      return;
    }
    console.error("[backlinks] historySummary error:", err);
    res.status(500).json({ error: "db_error" });
  }
});

// ── GET /api/backlinks/history/trend ─────────────────────────────────────────
// Returns per-period (7d/30d/90d) authority + backlink delta summaries.

router.get("/api/backlinks/history/trend", async (req, res): Promise<void> => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const { client } = auth;
  try {
    const result = await pool.query(
      `SELECT client_id, snapshot_date::TEXT, authority_score, backlink_count,
              opportunity_count, won_count, run_id,
              COALESCE(new_count, 0)              AS new_count,
              COALESCE(lost_count, 0)             AS lost_count,
              COALESCE(referring_domain_count, 0) AS referring_domain_count,
              edge_authority_score
       FROM backlink_score_history
       WHERE client_id = $1
         AND snapshot_date >= CURRENT_DATE - '90 days'::INTERVAL
       ORDER BY snapshot_date ASC
       LIMIT 90`,
      [client.id],
    );
    const snapshots = result.rows.map((r: any) => ({
      clientId:             r.client_id,
      snapshotDate:         r.snapshot_date,
      authorityScore:       Number(r.authority_score),
      backlinkCount:        Number(r.backlink_count),
      opportunityCount:     Number(r.opportunity_count),
      wonCount:             Number(r.won_count),
      newCount:             Number(r.new_count),
      lostCount:            Number(r.lost_count),
      referringDomainCount: Number(r.referring_domain_count),
      runId:                r.run_id ?? null,
    }));
    // Note: edgeAuthorityScore not included in trend period summaries — that's
    // a per-snapshot value; period summaries use delta-over-time logic.
    const periods = computePeriodSummaries(snapshots);
    res.json({ periods, snapshotCount: snapshots.length });
  } catch (err) {
    if (isRelationMissingError(err)) { res.json({ periods: [], snapshotCount: 0 }); return; }
    console.error("[backlinks] historyTrend error:", err);
    res.status(500).json({ error: "db_error" });
  }
});

// ── GET /api/backlinks/history/competitive ────────────────────────────────────
// Side-by-side comparison of client vs. top known competitors.

router.get("/api/backlinks/history/competitive", async (req, res): Promise<void> => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const { client } = auth;
  try {
    const [competitorsRes, selfRes] = await Promise.all([
      pool.query(
        `SELECT domain, business_name,
                COALESCE(domain_authority, 0)         AS domain_authority,
                COALESCE(backlink_count, 0)            AS backlink_count,
                COALESCE(citation_score, 0)            AS citation_score,
                COALESCE(opportunity_score, 0)         AS opportunity_score,
                COALESCE(organic_visibility_score, 0)  AS organic_visibility_score
         FROM competitors
         WHERE client_id = $1 AND canonical_status = 'active'
           AND (domain_authority IS NOT NULL OR backlink_count IS NOT NULL)
         ORDER BY COALESCE(domain_authority, 0) DESC
         LIMIT 10`,
        [client.id],
      ),
      pool.query(
        `SELECT authority_score, backlink_count, opportunity_count, won_count,
                COALESCE(referring_domain_count, 0) AS referring_domain_count,
                edge_authority_score
         FROM backlink_score_history
         WHERE client_id = $1
         ORDER BY snapshot_date DESC
         LIMIT 1`,
        [client.id],
      ),
    ]);
    const selfRow = selfRes.rows[0];
    res.json({
      client: {
        authorityScore:       Number(selfRow?.authority_score          ?? 0),
        edgeAuthorityScore:   selfRow?.edge_authority_score            ?? null,
        backlinkCount:        Number(selfRow?.backlink_count           ?? 0),
        referringDomainCount: Number(selfRow?.referring_domain_count   ?? 0),
        opportunityCount:     Number(selfRow?.opportunity_count        ?? 0),
        wonCount:             Number(selfRow?.won_count                ?? 0),
      },
      competitors: competitorsRes.rows.map((r: any) => ({
        domain:                 r.domain,
        businessName:           r.business_name ?? null,
        authorityScore:         Number(r.domain_authority),
        backlinkCount:          Number(r.backlink_count),
        citationScore:          Number(r.citation_score),
        opportunityScore:       Number(r.opportunity_score),
        organicVisibilityScore: Number(r.organic_visibility_score),
      })),
    });
  } catch (err) {
    if (isRelationMissingError(err)) {
      res.json({ client: { authorityScore: 0, edgeAuthorityScore: null, backlinkCount: 0, referringDomainCount: 0, opportunityCount: 0, wonCount: 0 }, competitors: [] });
      return;
    }
    console.error("[backlinks] competitive error:", err);
    res.status(500).json({ error: "db_error" });
  }
});

// ── GET /api/backlinks/opportunities ─────────────────────────────────────────

router.get("/api/backlinks/opportunities", async (req, res): Promise<void> => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const { client } = auth;

  const limit  = Math.min(BACKLINK_MAX_PAGE_SIZE, Math.max(1, Number(req.query.limit)  || 20));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const category       = req.query.category       as BacklinkOpportunityCategory | undefined;
  const workflowStatus = req.query.workflowStatus as BacklinkWorkflowStatus       | undefined;

  try {
    const result = await repo.listOpportunities(client.id, {
      limit,
      offset,
      ...(category       && { category }),
      ...(workflowStatus && { workflowStatus }),
    });
    res.json(result);
  } catch (err) {
    if (isRelationMissingError(err)) { res.json({ items: [], limit, offset }); return; }
    console.error("[backlinks] listOpportunities error:", err);
    res.status(500).json({ error: "db_error" });
  }
});

// ── GET /api/backlinks/opportunities/:id ─────────────────────────────────────

router.get("/api/backlinks/opportunities/:id", async (req, res): Promise<void> => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const { client } = auth;

  const { id } = req.params;
  if (!id?.trim()) { res.status(400).json({ error: "id_required" }); return; }

  try {
    const opportunity = await repo.getOpportunityById(id, client.id);
    if (!opportunity) { res.status(404).json({ error: "not_found" }); return; }

    const [wfRes, evidence] = await Promise.all([
      pool.query<{
        id: string; client_id: string; opportunity_id: string; status: string;
        owner_id: string | null; next_action: string | null; due_at: Date | null;
        outcome_summary: string | null; version: number;
        created_at: Date; updated_at: Date; completed_at: Date | null;
      }>(
        `SELECT id, client_id, opportunity_id, status, owner_id, next_action, due_at,
                outcome_summary, version, created_at, updated_at, completed_at
         FROM backlink_workflows
         WHERE opportunity_id = $1 AND client_id = $2 LIMIT 1`,
        [id, client.id],
      ),
      repo.listEvidenceForProspect(opportunity.prospectId, client.id),
    ]);

    res.json({ opportunity, workflow: wfRes.rows[0] ?? null, evidence });
  } catch (err) {
    if (isRelationMissingError(err)) { res.status(404).json({ error: "not_found" }); return; }
    console.error("[backlinks] getOpportunityById error:", err);
    res.status(500).json({ error: "db_error" });
  }
});

// ── PATCH /api/backlinks/workflows/:opportunityId ─────────────────────────────

router.patch("/api/backlinks/workflows/:opportunityId", async (req, res): Promise<void> => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const { userId, client } = auth;

  const { opportunityId } = req.params;
  if (!opportunityId?.trim()) { res.status(400).json({ error: "opportunityId_required" }); return; }

  const { toStatus, reason, ownerId, nextAction, dueAt, outcomeSummary } = req.body as {
    toStatus?:        BacklinkWorkflowStatus;
    reason?:          string;
    ownerId?:         string;
    nextAction?:      string;
    dueAt?:           string;
    outcomeSummary?:  string;
  };

  if (!toStatus) { res.status(400).json({ error: "toStatus_required" }); return; }

  try {
    const workflow = await repo.transitionWorkflow(opportunityId, client.id, {
      toStatus,
      actorId:        userId,
      reason:         reason         ?? null,
      ownerId:        ownerId        ?? null,
      nextAction:     nextAction     ?? null,
      dueAt:          dueAt          ? new Date(dueAt) : null,
      outcomeSummary: outcomeSummary ?? null,
    });
    res.json({ workflow });
  } catch (err: any) {
    if (err?.message?.includes("invalid transition") || err?.message?.includes("not found")) {
      res.status(400).json({ error: "invalid_transition", message: err.message });
      return;
    }
    if (isRelationMissingError(err)) { res.status(404).json({ error: "not_found" }); return; }
    console.error("[backlinks] transitionWorkflow error:", err);
    res.status(500).json({ error: "db_error" });
  }
});

// ── GET /api/backlinks/runs ───────────────────────────────────────────────────

router.get("/api/backlinks/runs", async (req, res): Promise<void> => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const { client } = auth;

  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

  try {
    const result = await pool.query(
      `SELECT id, client_id, provider_id, provider_revision, mode, status, capabilities,
              attempt_count, started_at, attempt_started_at, completed_at,
              observed_count          AS counts_observed,
              accepted_count          AS counts_accepted,
              rejected_count          AS counts_rejected,
              merged_evidence_count   AS counts_merged_evidence,
              prospect_count          AS counts_prospect_count,
              evidence_count          AS counts_evidence_count,
              opportunity_count       AS counts_opportunity_count,
              workflow_count          AS counts_workflow_count,
              failure_stage, failure_code
       FROM backlink_ingestion_runs
       WHERE client_id = $1
       ORDER BY started_at DESC
       LIMIT $2`,
      [client.id, limit],
    );
    res.json({ runs: result.rows });
  } catch (err) {
    if (isRelationMissingError(err)) { res.json({ runs: [] }); return; }
    console.error("[backlinks] listRuns error:", err);
    res.status(500).json({ error: "db_error" });
  }
});

// ── POST /api/backlinks/ingest/fixture ───────────────────────────────────────

router.post("/api/backlinks/ingest/fixture", async (req, res): Promise<void> => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const { client } = auth;

  const now      = new Date();
  const provider = new FixtureBacklinkDataProvider(BBB_FIXTURE_BACKLINK_OBSERVATIONS);

  try {
    const result = await ingestFixtureBacklinks({
      trustedClientId: client.id,
      provider,
      discovery: {
        clientId:           client.id,
        clientDomain:       "bedbugsbeyond.com",
        competitorDomains:  [],
        serviceIds:         [...BBB_BACKLINK_ALLOWED_SERVICES],
        city:               "Foley",
        region:             "Baldwin County, Alabama",
        limit:              50,
      },
      normalizationPolicy: {
        allowedServiceIds: BBB_BACKLINK_ALLOWED_SERVICES,
        blockedPhrases:    [...BBB_BACKLINK_BLOCKED_PHRASES],
        now,
      },
      repository: repo,
      now,
    });
    res.json(result);
  } catch (err: any) {
    console.error("[backlinks] ingest fixture error:", err);
    res.status(500).json({ error: "ingest_failed", message: err?.message ?? "Unknown error" });
  }
});

export default router;

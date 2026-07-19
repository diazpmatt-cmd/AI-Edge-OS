/**
 * Competitor Intelligence API — Phase 1
 *
 * Routes:
 *   GET /api/competitor-intelligence/summary   — Latest run stats + keyword gap counts
 *   GET /api/competitor-intelligence/gaps       — Keyword gap analysis from signals
 *   GET /api/competitor-intelligence/opportunities — Top scored opportunities
 *   GET /api/competitor-intelligence/history    — Run history for trend chart
 *
 * Data sources:
 *   - discovery_snapshots  (run header, metrics)
 *   - discovery_signals    (raw keyword signals; competitor_rank reveals gaps)
 *   - discovery_opportunities (scored, actionable findings)
 *
 * Security: all routes require valid Clerk session; clientId always scoped by userId.
 */

import { Router }  from "express";
import { getAuth } from "@clerk/express";
import { pool, db, DrizzleCompetitorRepository } from "@workspace/db";
import { resolveClientContentContextFromDb } from "../lib/client-resolver.js";
import { competitorDiscoveryService }          from "../lib/competitor-discovery-service.js";

const router = Router();

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract a human-readable competitor name from a signal's raw_provider_data.
 *
 * Priority:
 *   1. raw_provider_data.competitorName  — pre-extracted by normalizer on new signals
 *   2. raw_provider_data.topCompetitorTitle — raw page title stored by DataForSEO adapter;
 *      cleaned by splitting at the first " | ", " - ", " – ", or " — " separator so that
 *      "Arrow Exterminators | Pest Control" → "Arrow Exterminators".
 *   3. raw_provider_data.topCompetitorDomain — bare domain as last resort
 *   4. raw_provider_data.competitorDomains[0] — fallback for pre-feature signals
 *
 * Returns null when no competitor data is present.
 */
function extractCompetitorName(raw: Record<string, unknown> | null | undefined): string | null {
  if (!raw) return null;

  // 1. Pre-extracted name (set by normalizer)
  if (typeof raw["competitorName"] === "string" && raw["competitorName"]) {
    return cleanTitle(raw["competitorName"]);
  }

  // 2. Page title stored by adapter
  if (typeof raw["topCompetitorTitle"] === "string" && raw["topCompetitorTitle"]) {
    return cleanTitle(raw["topCompetitorTitle"]);
  }

  // 3. Domain stored by adapter
  if (typeof raw["topCompetitorDomain"] === "string" && raw["topCompetitorDomain"]) {
    return raw["topCompetitorDomain"];
  }

  // 4. Oldest fallback: first entry in competitorDomains array
  const domains = raw["competitorDomains"];
  if (Array.isArray(domains) && domains.length > 0 && typeof domains[0] === "string") {
    return domains[0];
  }

  return null;
}

/**
 * Strip common page-title suffixes to extract a clean business name.
 * "Arrow Exterminators | Pest Control Services" → "Arrow Exterminators"
 * "Bed Bug Experts - Local Treatment" → "Bed Bug Experts"
 */
function cleanTitle(title: string): string {
  return title.split(/\s+[|–—-]\s+/)[0]?.trim() || title.trim();
}

// ── pg error helper ───────────────────────────────────────────────────────────

/**
 * Returns true when the error is a PostgreSQL "relation does not exist" error
 * (SQLSTATE 42P01). This happens on fresh environments where
 * bootstrapDiscoveryTables() hasn't run yet.
 */
function isRelationMissingError(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    return (err as { code: string }).code === "42P01";
  }
  return false;
}

// ── shared auth + client resolver ────────────────────────────────────────────

async function resolveClient(req: any, res: any) {
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

// ── GET /api/competitor-intelligence/summary ──────────────────────────────────

router.get("/api/competitor-intelligence/summary", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const { client } = auth;

  try {
    // Latest completed (or partial) run for this client
    const snapRes = await pool.query<{
      id: string; week_label: string; status: string;
      signals_received: number; signals_accepted: number; signals_blocked: number;
      cluster_count: number; opportunity_count: number;
      high_priority_opportunity_count: number; top_opportunity_score: number;
      run_duration_ms: number; created_at: Date; completed_at: Date | null;
    }>(
      `SELECT id, week_label, status,
              signals_received, signals_accepted, signals_blocked,
              cluster_count, opportunity_count,
              high_priority_opportunity_count, top_opportunity_score,
              run_duration_ms, created_at, completed_at
       FROM discovery_snapshots
       WHERE client_id = $1 AND status IN ('complete','partial')
       ORDER BY created_at DESC LIMIT 1`,
      [client.id],
    );

    if (snapRes.rows.length === 0) {
      res.json({ hasData: false, clientId: client.id });
      return;
    }

    const snap = snapRes.rows[0];

    // Count competitor keyword gaps: signals where competitor_rank IS NOT NULL
    const gapCountRes = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM discovery_signals
       WHERE client_id = $1 AND snapshot_id = $2
         AND competitor_rank IS NOT NULL`,
      [client.id, snap.id],
    );
    const competitorGapCount = parseInt(gapCountRes.rows[0]?.count ?? "0", 10);

    // Count gaps where no competitor name can be resolved from any field
    const unresolvableGapRes = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM discovery_signals
       WHERE client_id = $1 AND snapshot_id = $2
         AND competitor_rank IS NOT NULL
         AND (raw_provider_data->>'competitorName'     IS NULL OR raw_provider_data->>'competitorName'     = '')
         AND (raw_provider_data->>'topCompetitorTitle' IS NULL OR raw_provider_data->>'topCompetitorTitle' = '')
         AND (raw_provider_data->>'topCompetitorDomain'IS NULL OR raw_provider_data->>'topCompetitorDomain'= '')
         AND (raw_provider_data->'competitorDomains'->>0 IS NULL OR raw_provider_data->'competitorDomains'->>0 = '')`,
      [client.id, snap.id],
    );
    const unresolvableGapCount = parseInt(unresolvableGapRes.rows[0]?.count ?? "0", 10);

    // Count high-volume gaps (volume_estimate > 100)
    const highVolGapRes = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM discovery_signals
       WHERE client_id = $1 AND snapshot_id = $2
         AND competitor_rank IS NOT NULL
         AND volume_estimate > 100`,
      [client.id, snap.id],
    );
    const highVolumeGapCount = parseInt(highVolGapRes.rows[0]?.count ?? "0", 10);

    // Total run count for this client
    const runCountRes = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM discovery_snapshots
       WHERE client_id = $1 AND status IN ('complete','partial')`,
      [client.id],
    );
    const totalRuns = parseInt(runCountRes.rows[0]?.count ?? "0", 10);

    res.json({
      hasData:                   true,
      clientId:                  client.id,
      latestRun: {
        runId:                   snap.id,
        weekLabel:               snap.week_label,
        status:                  snap.status,
        signalsReceived:         snap.signals_received,
        signalsAccepted:         snap.signals_accepted,
        signalsBlocked:          snap.signals_blocked,
        clusterCount:            snap.cluster_count,
        opportunityCount:        snap.opportunity_count,
        highPriorityCount:       snap.high_priority_opportunity_count,
        topOpportunityScore:     snap.top_opportunity_score,
        runDurationMs:           snap.run_duration_ms,
        createdAt:               snap.created_at,
        completedAt:             snap.completed_at,
      },
      competitorGapCount,
      highVolumeGapCount,
      unresolvableGapCount,
      totalRuns,
    });
  } catch (err) {
    if (isRelationMissingError(err)) {
      res.json({ hasData: false, reason: "tables_not_initialized" });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "db_error", message: msg });
  }
});

// ── GET /api/competitor-intelligence/gaps ─────────────────────────────────────

router.get("/api/competitor-intelligence/gaps", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const { client } = auth;

  const limit = Math.min(parseInt(String(req.query["limit"] ?? "50"), 10) || 50, 200);

  try {
    // Two most recent complete/partial runs
    const snapRes = await pool.query<{ id: string; week_label: string }>(
      `SELECT id, week_label FROM discovery_snapshots
       WHERE client_id = $1 AND status IN ('complete','partial')
       ORDER BY created_at DESC LIMIT 2`,
      [client.id],
    );
    if (snapRes.rows.length === 0) {
      res.json({ hasData: false, gaps: [] });
      return;
    }
    const snap     = snapRes.rows[0];
    const prevSnap = snapRes.rows[1] ?? null;

    // Keyword gap signals: competitor ranks here but we likely don't
    const gapRes = await pool.query<{
      id: string; normalized_value: string; raw_value: string;
      signal_type: string; source: string; intent: string;
      volume_estimate: number | null; difficulty_score: number | null;
      competitor_rank: number | null; evidence_strength: number;
      trend_direction: string; geographic_scope: string;
      service_id: string | null; raw_provider_data: Record<string, unknown>;
    }>(
      `SELECT id, normalized_value, raw_value, signal_type, source, intent,
              volume_estimate, difficulty_score, competitor_rank,
              evidence_strength, trend_direction, geographic_scope, service_id,
              raw_provider_data
       FROM discovery_signals
       WHERE client_id = $1 AND snapshot_id = $2
         AND competitor_rank IS NOT NULL
       ORDER BY
         COALESCE(volume_estimate, 0) DESC,
         evidence_strength DESC
       LIMIT $3`,
      [client.id, snap.id, limit],
    );

    // Build a set of normalized_values present in the previous run so we can
    // label each gap as "new" (first time seen) or "returning" (also in prev run).
    const prevKeywords = new Set<string>();
    if (prevSnap) {
      const prevRes = await pool.query<{ normalized_value: string }>(
        `SELECT DISTINCT normalized_value
         FROM discovery_signals
         WHERE client_id = $1 AND snapshot_id = $2
           AND competitor_rank IS NOT NULL`,
        [client.id, prevSnap.id],
      );
      for (const row of prevRes.rows) prevKeywords.add(row.normalized_value);
    }

    const isBaseline = !prevSnap;

    res.json({
      hasData:    true,
      runId:      snap.id,
      weekLabel:  snap.week_label,
      isBaseline,
      gaps:       gapRes.rows.map(r => ({
        id:              r.id,
        keyword:         r.normalized_value,
        rawKeyword:      r.raw_value,
        signalType:      r.signal_type,
        source:          r.source,
        intent:          r.intent,
        volumeEstimate:  r.volume_estimate,
        difficultyScore: r.difficulty_score,
        competitorRank:  r.competitor_rank,
        competitorName:  extractCompetitorName(r.raw_provider_data),
        evidenceStrength:r.evidence_strength,
        trendDirection:  r.trend_direction,
        geographicScope: r.geographic_scope,
        serviceId:       r.service_id,
        status:          isBaseline
                           ? "baseline"
                           : (prevKeywords.has(r.normalized_value) ? "returning" : "new"),
      })),
      count: gapRes.rows.length,
    });
  } catch (err) {
    if (isRelationMissingError(err)) {
      res.json({ hasData: false, gaps: [], reason: "tables_not_initialized" });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "db_error", message: msg });
  }
});

// ── GET /api/competitor-intelligence/opportunities ────────────────────────────

router.get("/api/competitor-intelligence/opportunities", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const { client } = auth;

  const limit = Math.min(parseInt(String(req.query["limit"] ?? "20"), 10) || 20, 100);

  try {
    const snapRes = await pool.query<{ id: string; week_label: string }>(
      `SELECT id, week_label FROM discovery_snapshots
       WHERE client_id = $1 AND status IN ('complete','partial')
       ORDER BY created_at DESC LIMIT 1`,
      [client.id],
    );
    if (snapRes.rows.length === 0) {
      res.json({ hasData: false, opportunities: [] });
      return;
    }
    const snap = snapRes.rows[0];

    const oppRes = await pool.query<{
      id: string; title: string; description: string;
      opportunity_type: string; target_engine: string;
      composite_score: number; priority: string;
      score_card: Record<string, unknown>;
      status: string; created_at: Date;
    }>(
      `SELECT id, title, description, opportunity_type, target_engine,
              composite_score, priority, score_card, status, created_at
       FROM discovery_opportunities
       WHERE client_id = $1 AND snapshot_id = $2
       ORDER BY composite_score DESC
       LIMIT $3`,
      [client.id, snap.id, limit],
    );

    res.json({
      hasData:   true,
      runId:     snap.id,
      weekLabel: snap.week_label,
      opportunities: oppRes.rows.map(r => ({
        id:              r.id,
        title:           r.title,
        description:     r.description,
        opportunityType: r.opportunity_type,
        targetEngine:    r.target_engine,
        compositeScore:  r.composite_score,
        priority:        r.priority,
        scoreCard:       r.score_card,
        status:          r.status,
        createdAt:       r.created_at,
      })),
      count: oppRes.rows.length,
    });
  } catch (err) {
    if (isRelationMissingError(err)) {
      res.json({ hasData: false, opportunities: [], reason: "tables_not_initialized" });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "db_error", message: msg });
  }
});

// ── GET /api/competitor-intelligence/history ──────────────────────────────────

router.get("/api/competitor-intelligence/history", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const { client } = auth;

  const limit = Math.min(parseInt(String(req.query["limit"] ?? "10"), 10) || 10, 52);

  try {
    const histRes = await pool.query<{
      id: string; week_label: string; status: string;
      opportunity_count: number; high_priority_opportunity_count: number;
      top_opportunity_score: number; signals_received: number;
      cluster_count: number; created_at: Date; completed_at: Date | null;
    }>(
      `SELECT id, week_label, status, opportunity_count,
              high_priority_opportunity_count, top_opportunity_score,
              signals_received, cluster_count, created_at, completed_at
       FROM discovery_snapshots
       WHERE client_id = $1 AND status IN ('complete','partial')
       ORDER BY created_at DESC LIMIT $2`,
      [client.id, limit],
    );

    const rows = histRes.rows;

    // Fetch competitor gap counts for all returned snapshots in one query
    const snapshotIds = rows.map(r => r.id);
    const gapCountMap: Record<string, number> = {};
    if (snapshotIds.length > 0) {
      const gapRes = await pool.query<{ snapshot_id: string; cnt: string }>(
        `SELECT snapshot_id, COUNT(*) AS cnt
         FROM discovery_signals
         WHERE client_id = $1
           AND snapshot_id = ANY($2::uuid[])
           AND competitor_rank IS NOT NULL
         GROUP BY snapshot_id`,
        [client.id, snapshotIds],
      );
      for (const row of gapRes.rows) {
        gapCountMap[row.snapshot_id] = parseInt(row.cnt, 10);
      }
    }

    // Build enriched history array (newest first), then compute week-over-week deltas.
    // rows is already DESC by created_at, so rows[0] is newest, rows[1] is previous, etc.
    const history = rows.map((r, i) => {
      const prev = rows[i + 1];
      const gapCount     = gapCountMap[r.id] ?? 0;
      const prevGapCount = prev ? (gapCountMap[prev.id] ?? 0) : null;

      const opportunityCountDelta = prev != null ? r.opportunity_count - prev.opportunity_count : null;
      const topScoreDelta         = prev != null ? r.top_opportunity_score - prev.top_opportunity_score : null;
      const gapCountDelta         = prevGapCount != null ? gapCount - prevGapCount : null;

      return {
        runId:                r.id,
        weekLabel:            r.week_label,
        status:               r.status,
        opportunityCount:     r.opportunity_count,
        highPriorityCount:    r.high_priority_opportunity_count,
        topScore:             r.top_opportunity_score,
        signalsReceived:      r.signals_received,
        clusterCount:         r.cluster_count,
        gapCount,
        createdAt:            r.created_at,
        completedAt:          r.completed_at,
        opportunityCountDelta,
        topScoreDelta,
        gapCountDelta,
      };
    });

    res.json({
      clientId: client.id,
      history,
      count: history.length,
    });
  } catch (err) {
    if (isRelationMissingError(err)) {
      res.json({ clientId: auth.client.id, history: [], count: 0, reason: "tables_not_initialized" });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "db_error", message: msg });
  }
});

// ── POST /api/competitor-intelligence/extract-entities ────────────────────────
/**
 * Manually trigger competitor entity extraction from the latest discovery run.
 * Useful for backfilling before the next automated discovery run fires.
 */
router.post("/api/competitor-intelligence/extract-entities", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const { client } = auth;

  try {
    const result = await competitorDiscoveryService.extractCompetitorsFromLatestRun(client.id);
    res.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "extraction_failed", message: msg });
  }
});

// ── GET /api/competitor-intelligence/competitors ───────────────────────────────
/**
 * List canonical competitor entities for the authenticated client.
 *
 * Query params:
 *   limit       integer  max results (default 50, max 200)
 *   offset      integer  pagination offset (default 0)
 *   orderBy     "opportunityScore" | "keywordGapCount" | "lastSeenAt"
 *   search      string   filter by domain or business_name (case-insensitive)
 *   minScore    integer  minimum opportunity_score (0–100)
 *   threatLevel "low" | "medium" | "high" | "critical"  (exact match)
 */
router.get("/api/competitor-intelligence/competitors", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const { client } = auth;

  const limit     = Math.min(parseInt(String(req.query["limit"]  ?? "50"),  10) || 50,  200);
  const offset    = Math.max(parseInt(String(req.query["offset"] ?? "0"),   10) || 0,   0);
  const orderBy   = String(req.query["orderBy"] ?? "opportunityScore");
  const search    = String(req.query["search"]  ?? "").trim().toLowerCase();
  const minScore  = parseInt(String(req.query["minScore"] ?? "0"), 10) || 0;
  const threatFlt = String(req.query["threatLevel"] ?? "").trim().toLowerCase();

  const validOrder = ["opportunityScore", "keywordGapCount", "lastSeenAt", "topKeywordRank"];
  const safeOrder  = validOrder.includes(orderBy) ? orderBy : "opportunityScore";

  const orderSql =
    safeOrder === "keywordGapCount" ? "keyword_gap_count DESC"               :
    safeOrder === "lastSeenAt"      ? "last_seen_at DESC"                    :
    safeOrder === "topKeywordRank"  ? "top_keyword_rank ASC NULLS LAST"      :
                                      "opportunity_score DESC";

  try {
    // Build WHERE clause for optional filters
    const conditions: string[] = [
      "client_id = $1",
      "canonical_status = 'active'",
      "opportunity_score >= $2",
    ];
    const params: unknown[] = [client.id, minScore];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(LOWER(domain) LIKE $${params.length} OR LOWER(COALESCE(business_name,'')) LIKE $${params.length})`);
    }

    if (threatFlt && ["low","medium","high","critical"].includes(threatFlt)) {
      params.push(threatFlt);
      conditions.push(`threat_level = $${params.length}`);
    }

    const where = conditions.join(" AND ");

    // Count total for pagination
    const countRes = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM competitors WHERE ${where}`,
      params,
    );
    const total = parseInt(countRes.rows[0]?.total ?? "0", 10);

    // Fetch page
    params.push(limit, offset);
    const rowRes = await pool.query<{
      id: string; domain: string; business_name: string | null;
      website: string | null; primary_category: string | null;
      city: string | null; state: string | null;
      review_count: number | null; avg_rating: string | null;
      top_keyword_rank: number | null; keyword_gap_count: number;
      opportunity_score: number; threat_level: string | null;
      confidence_score: number; discovery_source: string;
      first_seen_at: Date; last_seen_at: Date;
      domain_authority: number | null; backlink_count: number | null;
      local_presence_score: number | null; gbp_health_score: number | null;
      ai_visibility_score: number | null; citation_score: number | null;
      primary_photo_url: string | null; logo_url: string | null;
      canonical_status: string;
    }>(
      `SELECT id, domain, business_name, website, primary_category,
              city, state, review_count, avg_rating,
              top_keyword_rank, keyword_gap_count,
              opportunity_score, threat_level, confidence_score,
              discovery_source, first_seen_at, last_seen_at,
              domain_authority, backlink_count,
              local_presence_score, gbp_health_score,
              ai_visibility_score, citation_score,
              primary_photo_url, logo_url, canonical_status
       FROM competitors
       WHERE ${where}
       ORDER BY ${orderSql}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json({
      ok:          true,
      clientId:    client.id,
      total,
      limit,
      offset,
      count:       rowRes.rows.length,
      competitors: rowRes.rows.map(r => ({
        id:                  r.id,
        domain:              r.domain,
        businessName:        r.business_name ?? r.domain,
        website:             r.website,
        primaryCategory:     r.primary_category,
        city:                r.city,
        state:               r.state,
        reviewCount:         r.review_count,
        avgRating:           r.avg_rating != null ? parseFloat(r.avg_rating) : null,
        topKeywordRank:      r.top_keyword_rank,
        keywordGapCount:     r.keyword_gap_count,
        opportunityScore:    r.opportunity_score,
        threatLevel:         r.threat_level,
        confidenceScore:     r.confidence_score,
        discoverySource:     r.discovery_source,
        firstSeenAt:         r.first_seen_at,
        lastSeenAt:          r.last_seen_at,
        domainAuthority:     r.domain_authority,
        backlinkCount:       r.backlink_count,
        localPresenceScore:  r.local_presence_score,
        gbpHealthScore:      r.gbp_health_score,
        aiVisibilityScore:   r.ai_visibility_score,
        citationScore:       r.citation_score,
        primaryPhotoUrl:     r.primary_photo_url,
        logoUrl:             r.logo_url,
        canonicalStatus:     r.canonical_status,
      })),
    });
  } catch (err) {
    if (isRelationMissingError(err)) {
      res.json({ ok: true, clientId: client.id, total: 0, limit, offset, count: 0, competitors: [] });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "db_error", message: msg });
  }
});

// ── GET /api/competitor-intelligence/competitors/:domain ──────────────────────
/**
 * Full competitor profile for a single domain.
 * :domain is URL-encoded, e.g. "arrowexterminators.com"
 */
router.get("/api/competitor-intelligence/competitors/:domain", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const { client } = auth;

  const domain = decodeURIComponent(req.params["domain"] ?? "").trim().toLowerCase();
  if (!domain) {
    res.status(400).json({ error: "bad_request", message: "domain param required" });
    return;
  }

  try {
    const repo    = new DrizzleCompetitorRepository(db);
    const profile = await repo.getByDomain(client.id, domain);

    if (!profile) {
      res.status(404).json({ error: "not_found", domain, clientId: client.id });
      return;
    }

    res.json({ ok: true, competitor: profile });
  } catch (err) {
    if (isRelationMissingError(err)) {
      res.status(404).json({ error: "not_found", reason: "tables_not_initialized" });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "db_error", message: msg });
  }
});

// ── POST /api/admin/competitor-intelligence/backfill-competitor-names ─────────
/**
 * One-time (idempotent) backfill that patches raw_provider_data with a
 * `competitorName` field derived from `organicResults[0].domain` for any
 * discovery_signals row belonging to the authenticated user's client that:
 *   - has competitor_rank IS NOT NULL  (marked as a gap)
 *   - has no raw_provider_data->>'competitorName'  (pre-dates the feature)
 *   - has raw_provider_data->'organicResults'->0->>'domain' available
 *
 * Scope is always limited to the caller's own resolved client — no arbitrary
 * client targeting is permitted. Safe to run multiple times (idempotent).
 *
 * Auth: Clerk session + resolvable client required.
 */
router.post("/api/admin/competitor-intelligence/backfill-competitor-names", async (req, res) => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const { client } = auth;

  try {
    const result = await pool.query<{ id: string }>(
      `UPDATE discovery_signals
       SET raw_provider_data = raw_provider_data
         || jsonb_build_object('competitorName',
              raw_provider_data->'organicResults'->0->>'domain')
       WHERE client_id = $1
         AND competitor_rank IS NOT NULL
         AND (raw_provider_data->>'competitorName' IS NULL
              OR raw_provider_data->>'competitorName' = '')
         AND raw_provider_data->'organicResults'->0->>'domain' IS NOT NULL
       RETURNING id`,
      [client.id],
    );

    res.json({
      ok: true,
      rowsPatched: result.rowCount ?? 0,
      clientId: client.id,
      message: `Backfill complete. ${result.rowCount ?? 0} signal(s) updated with competitorName from organicResults[0].domain.`,
    });
  } catch (err) {
    if (isRelationMissingError(err)) {
      res.json({ ok: false, rowsPatched: 0, reason: "tables_not_initialized" });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "db_error", message: msg });
  }
});

export default router;

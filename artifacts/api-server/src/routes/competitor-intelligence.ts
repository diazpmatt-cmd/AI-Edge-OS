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
import { pool }    from "@workspace/db";
import { resolveClientContentContextFromDb } from "../lib/client-resolver.js";

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
      totalRuns,
    });
  } catch (err) {
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
    // Latest complete/partial run
    const snapRes = await pool.query<{ id: string; week_label: string }>(
      `SELECT id, week_label FROM discovery_snapshots
       WHERE client_id = $1 AND status IN ('complete','partial')
       ORDER BY created_at DESC LIMIT 1`,
      [client.id],
    );
    if (snapRes.rows.length === 0) {
      res.json({ hasData: false, gaps: [] });
      return;
    }
    const snap = snapRes.rows[0];

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

    res.json({
      hasData:   true,
      runId:     snap.id,
      weekLabel: snap.week_label,
      gaps:      gapRes.rows.map(r => ({
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
      })),
      count: gapRes.rows.length,
    });
  } catch (err) {
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

    res.json({
      clientId: client.id,
      history:  histRes.rows.map(r => ({
        runId:             r.id,
        weekLabel:         r.week_label,
        status:            r.status,
        opportunityCount:  r.opportunity_count,
        highPriorityCount: r.high_priority_opportunity_count,
        topScore:          r.top_opportunity_score,
        signalsReceived:   r.signals_received,
        clusterCount:      r.cluster_count,
        createdAt:         r.created_at,
        completedAt:       r.completed_at,
      })),
      count: histRes.rows.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "db_error", message: msg });
  }
});

export default router;

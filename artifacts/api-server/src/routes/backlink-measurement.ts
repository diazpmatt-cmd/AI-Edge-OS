import { Router } from "express";
import { getAuth } from "@clerk/express";
import { pool } from "@workspace/db";
import { resolveClientContentContextFromDb } from "../lib/client-resolver.js";
import { OBSERVED_BACKLINK_MEASUREMENT_SOURCE } from "../lib/observed-backlink-measurement.js";

const router = Router();

interface MeasurementRow {
  client_id: string;
  snapshot_date: string;
  backlink_count: number;
  opportunity_count: number;
  won_count: number;
  run_id: string | null;
  new_count: number;
  lost_count: number;
  restored_count: number;
  referring_domain_count: number;
  edge_authority_score: number | null;
  measurement_source: string;
  measurement_inventory_run_id: string;
  measurement_observed_at: Date;
}

async function resolveClient(req: any, res: any): Promise<{ id: string } | null> {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  try {
    const resolved = await resolveClientContentContextFromDb(userId);
    if (!resolved.found) {
      res.status(404).json({ error: "client_not_found", reason: resolved.reason });
      return null;
    }
    return { id: resolved.client.id };
  } catch {
    res.status(500).json({ error: "db_error", message: "Failed to resolve client." });
    return null;
  }
}

function project(row: MeasurementRow) {
  return Object.freeze({
    clientId: row.client_id,
    snapshotDate: row.snapshot_date,
    backlinkCount: Number(row.backlink_count),
    referringDomainCount: Number(row.referring_domain_count),
    newCount: Number(row.new_count),
    lostCount: Number(row.lost_count),
    restoredCount: Number(row.restored_count),
    opportunityCount: Number(row.opportunity_count),
    wonCount: Number(row.won_count),
    edgeAuthorityScore: row.edge_authority_score === null ? null : Number(row.edge_authority_score),
    inventoryRunId: row.measurement_inventory_run_id,
    measurementSource: row.measurement_source,
    measurementObservedAt: row.measurement_observed_at.toISOString(),
  });
}

router.get("/api/backlinks/measurement/current", async (req, res): Promise<void> => {
  const client = await resolveClient(req, res);
  if (!client) return;

  try {
    const result = await pool.query<MeasurementRow>(
      `SELECT client_id, snapshot_date::TEXT, backlink_count, opportunity_count,
              won_count, run_id, new_count, lost_count, restored_count,
              referring_domain_count, edge_authority_score, measurement_source,
              measurement_inventory_run_id, measurement_observed_at
       FROM backlink_score_history
       WHERE client_id = $1
         AND measurement_source = $2
         AND measurement_inventory_run_id IS NOT NULL
         AND measurement_observed_at IS NOT NULL
       ORDER BY snapshot_date DESC, measurement_observed_at DESC
       LIMIT 1`,
      [client.id, OBSERVED_BACKLINK_MEASUREMENT_SOURCE],
    );

    const row = result.rows[0];
    res.setHeader("Cache-Control", "no-store");
    if (!row) {
      res.status(200).json({
        available: false,
        reason: "trusted_measurement_unavailable",
        measurementSource: OBSERVED_BACKLINK_MEASUREMENT_SOURCE,
        snapshot: null,
      });
      return;
    }
    res.status(200).json({
      available: true,
      reason: null,
      measurementSource: OBSERVED_BACKLINK_MEASUREMENT_SOURCE,
      snapshot: project(row),
    });
  } catch (error) {
    console.error("[BACKLINK-MEASUREMENT] current read failed:", error);
    res.status(500).json({ error: "BACKLINK_MEASUREMENT_READ_FAILED" });
  }
});

router.get("/api/backlinks/measurement/history", async (req, res): Promise<void> => {
  const client = await resolveClient(req, res);
  if (!client) return;
  const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));

  try {
    const result = await pool.query<MeasurementRow>(
      `SELECT client_id, snapshot_date::TEXT, backlink_count, opportunity_count,
              won_count, run_id, new_count, lost_count, restored_count,
              referring_domain_count, edge_authority_score, measurement_source,
              measurement_inventory_run_id, measurement_observed_at
       FROM backlink_score_history
       WHERE client_id = $1
         AND measurement_source = $2
         AND measurement_inventory_run_id IS NOT NULL
         AND measurement_observed_at IS NOT NULL
         AND snapshot_date >= CURRENT_DATE - ($3 || ' days')::INTERVAL
       ORDER BY snapshot_date ASC, measurement_observed_at ASC
       LIMIT 90`,
      [client.id, OBSERVED_BACKLINK_MEASUREMENT_SOURCE, days],
    );

    const snapshots = result.rows.map(project);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      available: snapshots.length > 0,
      reason: snapshots.length > 0 ? null : "trusted_measurement_unavailable",
      measurementSource: OBSERVED_BACKLINK_MEASUREMENT_SOURCE,
      days,
      snapshots,
    });
  } catch (error) {
    console.error("[BACKLINK-MEASUREMENT] history read failed:", error);
    res.status(500).json({ error: "BACKLINK_MEASUREMENT_HISTORY_READ_FAILED" });
  }
});

export default router;

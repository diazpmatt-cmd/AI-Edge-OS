import { computeEdgeAuthorityScore, pool } from "@workspace/db";
import { countVerifiedAuthorityWins } from "./authority-verified-win-measurement.js";

export const OBSERVED_BACKLINK_MEASUREMENT_SOURCE = "observed_backlink_lifecycle_v1" as const;

export interface CompleteInventoryBaseline {
  readonly runId: string;
  readonly completedAt: string;
}

export interface CurrentObservedBacklinkMetrics {
  readonly activeBacklinkCount: number;
  readonly referringDomainCount: number;
}

export interface ObservedBacklinkPeriodTransitions {
  readonly newCount: number;
  readonly lostCount: number;
  readonly restoredCount: number;
}

export interface LifecycleBacklinkMeasurementSnapshot {
  readonly clientId: string;
  readonly snapshotDate: string;
  readonly inventoryRunId: string;
  readonly measurementSource: typeof OBSERVED_BACKLINK_MEASUREMENT_SOURCE;
  readonly measurementObservedAt: string;
  readonly backlinkCount: number;
  readonly referringDomainCount: number;
  readonly newCount: number;
  readonly lostCount: number;
  readonly restoredCount: number;
  readonly opportunityCount: number;
  readonly wonCount: number;
  readonly edgeAuthorityScore: number | null;
}

export type LifecycleBacklinkMeasurementResult =
  | {
      readonly written: false;
      readonly reason: "complete_inventory_baseline_unavailable";
    }
  | {
      readonly written: true;
      readonly snapshot: LifecycleBacklinkMeasurementSnapshot;
    };

export interface ObservedBacklinkMeasurementDependencies {
  getLatestCompleteBaseline(clientId: string, observedAt: Date): Promise<CompleteInventoryBaseline | null>;
  getCurrentMetrics(clientId: string): Promise<CurrentObservedBacklinkMetrics>;
  getPeriodTransitions(clientId: string, start: Date, end: Date): Promise<ObservedBacklinkPeriodTransitions>;
  getOpportunityCount(clientId: string): Promise<number>;
  getVerifiedWinCount(clientId: string): Promise<number>;
  upsertSnapshot(snapshot: LifecycleBacklinkMeasurementSnapshot): Promise<void>;
}

function nonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${field}_must_be_nonnegative_integer`);
  return value;
}

function normalizeClientId(clientId: string): string {
  const normalized = clientId.trim();
  if (!normalized) throw new Error("client_id_required");
  return normalized;
}

function utcDayRange(now: Date): { snapshotDate: string; start: Date; end: Date } {
  if (!Number.isFinite(now.getTime())) throw new Error("measurement_time_invalid");
  const snapshotDate = now.toISOString().slice(0, 10);
  const start = new Date(`${snapshotDate}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { snapshotDate, start, end };
}

export function buildLifecycleBacklinkMeasurementSnapshot(input: {
  readonly clientId: string;
  readonly snapshotDate: string;
  readonly inventoryRunId: string;
  readonly measurementObservedAt: string;
  readonly current: CurrentObservedBacklinkMetrics;
  readonly period: ObservedBacklinkPeriodTransitions;
  readonly opportunityCount: number;
  readonly wonCount: number;
}): LifecycleBacklinkMeasurementSnapshot {
  const clientId = normalizeClientId(input.clientId);
  const inventoryRunId = input.inventoryRunId.trim();
  if (!inventoryRunId) throw new Error("inventory_run_id_required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.snapshotDate)) throw new Error("snapshot_date_invalid");
  if (!Number.isFinite(Date.parse(input.measurementObservedAt))) throw new Error("measurement_observed_at_invalid");

  const backlinkCount = nonNegativeInteger(input.current.activeBacklinkCount, "backlink_count");
  const referringDomainCount = nonNegativeInteger(input.current.referringDomainCount, "referring_domain_count");
  const newCount = nonNegativeInteger(input.period.newCount, "new_count");
  const lostCount = nonNegativeInteger(input.period.lostCount, "lost_count");
  const restoredCount = nonNegativeInteger(input.period.restoredCount, "restored_count");
  const opportunityCount = nonNegativeInteger(input.opportunityCount, "opportunity_count");
  const wonCount = nonNegativeInteger(input.wonCount, "won_count");

  if (referringDomainCount > backlinkCount) {
    throw new Error("referring_domain_count_exceeds_backlink_count");
  }
  if (wonCount > opportunityCount) {
    throw new Error("verified_won_count_exceeds_opportunity_count");
  }

  return Object.freeze({
    clientId,
    snapshotDate: input.snapshotDate,
    inventoryRunId,
    measurementSource: OBSERVED_BACKLINK_MEASUREMENT_SOURCE,
    measurementObservedAt: new Date(input.measurementObservedAt).toISOString(),
    backlinkCount,
    referringDomainCount,
    newCount,
    lostCount,
    restoredCount,
    opportunityCount,
    wonCount,
    edgeAuthorityScore: computeEdgeAuthorityScore({
      backlinkCount,
      referringDomainCount,
      opportunityCount,
      wonCount,
    }),
  });
}

export async function recordObservedBacklinkMeasurementSnapshot(
  clientIdInput: string,
  now = new Date(),
  dependencies: ObservedBacklinkMeasurementDependencies = productionObservedBacklinkMeasurementDependencies,
): Promise<LifecycleBacklinkMeasurementResult> {
  const clientId = normalizeClientId(clientIdInput);
  const { snapshotDate, start, end } = utcDayRange(now);
  const baseline = await dependencies.getLatestCompleteBaseline(clientId, now);
  if (!baseline) {
    return Object.freeze({
      written: false,
      reason: "complete_inventory_baseline_unavailable" as const,
    });
  }

  const [current, period, opportunityCount, wonCount] = await Promise.all([
    dependencies.getCurrentMetrics(clientId),
    dependencies.getPeriodTransitions(clientId, start, end),
    dependencies.getOpportunityCount(clientId),
    dependencies.getVerifiedWinCount(clientId),
  ]);

  const snapshot = buildLifecycleBacklinkMeasurementSnapshot({
    clientId,
    snapshotDate,
    inventoryRunId: baseline.runId,
    measurementObservedAt: now.toISOString(),
    current,
    period,
    opportunityCount,
    wonCount,
  });

  await dependencies.upsertSnapshot(snapshot);
  return Object.freeze({ written: true as const, snapshot });
}

export const productionObservedBacklinkMeasurementDependencies: ObservedBacklinkMeasurementDependencies = {
  async getLatestCompleteBaseline(clientId, observedAt) {
    const result = await pool.query<{ run_id: string; completed_at: Date }>(
      `SELECT run_id, completed_at
       FROM backlink_inventory_runs
       WHERE client_id = $1
         AND status = 'succeeded'
         AND completeness = 'complete'
         AND completed_at <= $2
       ORDER BY completed_at DESC, run_id DESC
       LIMIT 1`,
      [clientId, observedAt],
    );
    const row = result.rows[0];
    return row
      ? Object.freeze({ runId: row.run_id, completedAt: row.completed_at.toISOString() })
      : null;
  },

  async getCurrentMetrics(clientId) {
    const result = await pool.query<{ active_backlink_count: number; referring_domain_count: number }>(
      `SELECT
         COUNT(*)::int AS active_backlink_count,
         COUNT(DISTINCT source_domain)::int AS referring_domain_count
       FROM observed_backlinks
       WHERE client_id = $1
         AND status = 'active'`,
      [clientId],
    );
    return Object.freeze({
      activeBacklinkCount: Number(result.rows[0]?.active_backlink_count ?? 0),
      referringDomainCount: Number(result.rows[0]?.referring_domain_count ?? 0),
    });
  },

  async getPeriodTransitions(clientId, start, end) {
    const result = await pool.query<{ new_count: number; lost_count: number; restored_count: number }>(
      `SELECT
         COUNT(*) FILTER (WHERE type = 'new')::int AS new_count,
         COUNT(*) FILTER (WHERE type = 'lost')::int AS lost_count,
         COUNT(*) FILTER (WHERE type = 'restored')::int AS restored_count
       FROM observed_backlink_transitions
       WHERE client_id = $1
         AND at >= $2
         AND at < $3`,
      [clientId, start, end],
    );
    return Object.freeze({
      newCount: Number(result.rows[0]?.new_count ?? 0),
      lostCount: Number(result.rows[0]?.lost_count ?? 0),
      restoredCount: Number(result.rows[0]?.restored_count ?? 0),
    });
  },

  async getOpportunityCount(clientId) {
    const result = await pool.query<{ opportunity_count: number }>(
      `SELECT COUNT(*)::int AS opportunity_count
       FROM backlink_opportunities
       WHERE client_id = $1`,
      [clientId],
    );
    return Number(result.rows[0]?.opportunity_count ?? 0);
  },

  getVerifiedWinCount: countVerifiedAuthorityWins,

  async upsertSnapshot(snapshot) {
    await pool.query(
      `INSERT INTO backlink_score_history
         (client_id, snapshot_date, backlink_count, opportunity_count, won_count,
          run_id, new_count, lost_count, restored_count, referring_domain_count,
          edge_authority_score, measurement_source, measurement_inventory_run_id,
          measurement_observed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (client_id, snapshot_date) DO UPDATE SET
         backlink_count               = EXCLUDED.backlink_count,
         opportunity_count            = EXCLUDED.opportunity_count,
         won_count                    = EXCLUDED.won_count,
         run_id                       = EXCLUDED.run_id,
         new_count                    = EXCLUDED.new_count,
         lost_count                   = EXCLUDED.lost_count,
         restored_count               = EXCLUDED.restored_count,
         referring_domain_count       = EXCLUDED.referring_domain_count,
         edge_authority_score         = EXCLUDED.edge_authority_score,
         measurement_source           = EXCLUDED.measurement_source,
         measurement_inventory_run_id = EXCLUDED.measurement_inventory_run_id,
         measurement_observed_at      = EXCLUDED.measurement_observed_at`,
      [
        snapshot.clientId,
        snapshot.snapshotDate,
        snapshot.backlinkCount,
        snapshot.opportunityCount,
        snapshot.wonCount,
        snapshot.inventoryRunId,
        snapshot.newCount,
        snapshot.lostCount,
        snapshot.restoredCount,
        snapshot.referringDomainCount,
        snapshot.edgeAuthorityScore,
        snapshot.measurementSource,
        snapshot.inventoryRunId,
        snapshot.measurementObservedAt,
      ],
    );
  },
};

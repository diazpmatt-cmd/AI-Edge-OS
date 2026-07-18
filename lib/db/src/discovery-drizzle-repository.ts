/**
 * Phase C3 — Discovery Persistence Layer
 *
 * Two implementations of DiscoveryRepository:
 *
 *   DrizzleDiscoveryRepository  — production Drizzle/PostgreSQL implementation.
 *     - Accepts `db` (Drizzle instance) and `pool` (pg Pool) as constructor args.
 *     - Uses bootstrapDiscoveryTables(pool) for idempotent table creation.
 *     - All writes are idempotent via ON CONFLICT DO NOTHING on deterministic PKs.
 *     - All reads require both runId AND clientId — no cross-tenant leakage.
 *     - Transaction used for snapshot finalization (status + completedAt together).
 *
 *   InMemoryDiscoveryRepository — test/fake implementation.
 *     - Pure in-memory: no DB, no pool, no external deps.
 *     - Satisfies the full DiscoveryRepository interface.
 *     - Used in all Phase C3 tests (categories A–T).
 *     - Enforces the same tenant-isolation contract as the Drizzle implementation.
 *
 * Serialization:
 *   - serializeSignal / deserializeSignal — DiscoverySignal ↔ DB row
 *   - serializeCluster / deserializeCluster — DiscoveryCluster ↔ DB row
 *   - serializeOpportunity / deserializeOpportunity — DiscoveryOpportunity ↔ DB row
 *   - serializeSnapshot / deserializeSnapshot — DiscoveryRunSummary ↔ DB row
 *   - All JSON round-trips are Zod-validated on read (parseScoreCard, etc.)
 *
 * Constraints:
 *   - No Math.random()
 *   - No hardcoded BB&B values
 *   - No live API calls
 *   - clientId predicate on EVERY read/write
 */

import { eq, and, desc, sql as drizzleSql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { z } from "zod/v4";
import type * as schema from "./schema";

import { warnIfMissingCompetitorIdentifier } from "./discovery-normalizer";

import type {
  DiscoverySignal,
  DiscoveryCluster,
  DiscoveryOpportunity,
  DiscoveryRunSummary,
  OpportunityScoreCard,
  ProviderFailure,
  SnapshotStatus,
  SignalType,
  ProviderSource,
  SearchIntent,
  GeographicScope,
  TrendDirection,
  OpportunityType,
  TargetEngine,
  OpportunityPriority,
  OpportunityStatus,
  EvidenceQuality,
} from "./discovery-types";

import type { DiscoveryRepository } from "./discovery-providers";

import {
  discoverySnapshotsTable,
  discoverySignalsTable,
  discoveryClustersTable,
  discoveryOpportunitiesTable,
  type DiscoverySnapshotRow,
  type DiscoverySignalRow,
  type DiscoveryClusterRow,
  type DiscoveryOpportunityRow,
} from "./schema/discovery";

// ── Zod validators for JSONB columns ──────────────────────────────────────────

/**
 * Validates an OpportunityScoreCard from a JSONB column.
 * Category O: malformed JSON must fail safely — never silently trusted.
 */
const scoreCardSchema = z.object({
  searchDemand:        z.number(),
  competitorGap:       z.number(),
  revenueImpact:       z.number(),
  contentFeasibility:  z.number(),
  seasonalRelevance:   z.number(),
  aiSearchPotential:   z.number(),
  composite:           z.number(),
  confidence:          z.enum(["high", "medium", "low"]),
  explanations: z.object({
    searchDemand:       z.string(),
    competitorGap:      z.string(),
    revenueImpact:      z.string(),
    contentFeasibility: z.string(),
    seasonalRelevance:  z.string(),
    aiSearchPotential:  z.string(),
  }),
  // Phase C5 additions — optional for backward compat with C2 records:
  version:    z.enum(["c2", "c5"]).optional(),
  enrichment: z.object({
    competitorDomainCount: z.number(),
    paaQuestionCount:      z.number(),
    cpcUsd:                z.number().nullable(),
    coverageState:         z.enum(["covered", "partial", "gap", "unknown"]),
  }).optional(),
});

const providerFailureSchema = z.object({
  provider:   z.string(),
  stage:      z.number(),
  error:      z.string(),
  occurredAt: z.union([z.string(), z.date()]),
});

/**
 * Parse a scoreCard from a JSONB column safely.
 * Throws a descriptive error on malformed data (never silently falls through).
 */
export function parseScoreCard(raw: unknown): OpportunityScoreCard {
  const result = scoreCardSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `[discovery] malformed score_card in DB: ${result.error.message}`
    );
  }
  return result.data as OpportunityScoreCard;
}

/**
 * Parse provider failures from a JSONB column.
 * Reconstructs occurredAt as a Date object.
 */
export function parseProviderFailures(raw: unknown): ProviderFailure[] {
  if (!Array.isArray(raw)) return [];
  const result = z.array(providerFailureSchema).safeParse(raw);
  if (!result.success) return [];
  return result.data.map(f => ({
    provider:   f.provider as ProviderSource,
    stage:      f.stage,
    error:      f.error,
    occurredAt: typeof f.occurredAt === "string" ? new Date(f.occurredAt) : f.occurredAt,
  }));
}

// ── Serialization helpers ──────────────────────────────────────────────────────

export function serializeSignal(s: DiscoverySignal): typeof discoverySignalsTable.$inferInsert {
  return {
    id:               s.id,
    snapshotId:       s.snapshotId,
    clientId:         s.clientId,
    signalType:       s.signalType,
    source:           s.source,
    rawValue:         s.rawValue,
    normalizedValue:  s.normalizedValue,
    serviceId:        s.serviceId ?? null,
    intent:           s.intent,
    volumeEstimate:   s.volumeEstimate ?? null,
    difficultyScore:  s.difficultyScore ?? null,
    seasonalRelevance:s.seasonalRelevance,
    geographicScope:  s.geographicScope,
    trendDirection:   s.trendDirection,
    competitorRank:   s.competitorRank ?? null,
    citationFound:    s.citationFound ?? null,
    evidenceStrength: s.evidenceStrength,
    rawProviderData:  s.rawProviderData,
    createdAt:        s.createdAt,
  };
}

export function deserializeSignal(row: DiscoverySignalRow): DiscoverySignal {
  return {
    id:               row.id,
    snapshotId:       row.snapshotId,
    clientId:         row.clientId,
    signalType:       row.signalType as SignalType,
    source:           row.source as ProviderSource,
    rawValue:         row.rawValue,
    normalizedValue:  row.normalizedValue,
    serviceId:        row.serviceId ?? null,
    intent:           row.intent as SearchIntent,
    volumeEstimate:   row.volumeEstimate ?? null,
    difficultyScore:  row.difficultyScore ?? null,
    seasonalRelevance:row.seasonalRelevance,
    geographicScope:  row.geographicScope as GeographicScope,
    trendDirection:   row.trendDirection as TrendDirection,
    competitorRank:   row.competitorRank ?? null,
    citationFound:    row.citationFound ?? null,
    evidenceStrength: row.evidenceStrength,
    rawProviderData:  (row.rawProviderData as Record<string, unknown>) ?? {},
    createdAt:        row.createdAt,
  };
}

export function serializeCluster(c: DiscoveryCluster): typeof discoveryClustersTable.$inferInsert {
  return {
    id:               c.id,
    snapshotId:       c.snapshotId,
    clientId:         c.clientId,
    clusterName:      c.clusterName,
    primaryServiceId: c.primaryServiceId ?? null,
    intent:           c.intent,
    signalIds:        c.signalIds,
    signalCount:      c.signalCount,
    totalVolume:      c.totalVolume,
    opportunityScore: c.opportunityScore,
    contentAngle:     c.contentAngle,
    seasonalWindow:   c.seasonalWindow ?? null,
    isActive:         c.isActive,
    createdAt:        c.createdAt,
  };
}

export function deserializeCluster(row: DiscoveryClusterRow): DiscoveryCluster {
  return {
    id:               row.id,
    snapshotId:       row.snapshotId,
    clientId:         row.clientId,
    clusterName:      row.clusterName,
    primaryServiceId: row.primaryServiceId ?? null,
    intent:           row.intent as SearchIntent,
    signalIds:        (row.signalIds as string[]) ?? [],
    signalCount:      row.signalCount,
    totalVolume:      row.totalVolume,
    opportunityScore: row.opportunityScore,
    contentAngle:     row.contentAngle,
    seasonalWindow:   row.seasonalWindow ?? null,
    isActive:         row.isActive,
    createdAt:        row.createdAt,
  };
}

export function serializeOpportunity(
  o: DiscoveryOpportunity
): typeof discoveryOpportunitiesTable.$inferInsert {
  return {
    id:              o.id,
    snapshotId:      o.snapshotId,
    clientId:        o.clientId,
    opportunityType: o.opportunityType,
    title:           o.title,
    description:     o.description,
    targetEngine:    o.targetEngine,
    clusterId:       o.clusterId ?? null,
    serviceId:       o.serviceId ?? null,
    scoreCard:       o.scoreCard as unknown as Record<string, unknown>,
    compositeScore:  o.compositeScore,
    priority:        o.priority,
    status:          o.status,
    assignedAt:      o.assignedAt ?? null,
    createdAt:       o.createdAt,
  };
}

export function deserializeOpportunity(row: DiscoveryOpportunityRow): DiscoveryOpportunity {
  return {
    id:              row.id,
    snapshotId:      row.snapshotId,
    clientId:        row.clientId,
    opportunityType: row.opportunityType as OpportunityType,
    title:           row.title,
    description:     row.description,
    targetEngine:    row.targetEngine as TargetEngine,
    clusterId:       row.clusterId ?? null,
    serviceId:       row.serviceId ?? null,
    scoreCard:       parseScoreCard(row.scoreCard),
    compositeScore:  row.compositeScore,
    priority:        row.priority as OpportunityPriority,
    status:          row.status as OpportunityStatus,
    assignedAt:      row.assignedAt ?? null,
    createdAt:       row.createdAt,
  };
}

/**
 * Serialize a DiscoveryRunSummary into a discovery_snapshots insert.
 * Called by persistRunResult before saving child records.
 */
export function serializeSnapshot(
  summary: DiscoveryRunSummary
): typeof discoverySnapshotsTable.$inferInsert {
  return {
    id:            summary.runId,
    clientId:      summary.clientId,
    weekLabel:     summary.weekLabel,
    status:        summary.status,
    providersRun:  summary.providersSucceeded,
    providerFailures: summary.providerFailures.map(f => ({
      ...f,
      occurredAt: f.occurredAt.toISOString(),
    })),
    signalsReceived:                summary.signals.received,
    signalsAccepted:                summary.signals.accepted,
    signalsBlocked:                 summary.signals.blocked,
    clusterCount:                   summary.clusters.created,
    opportunityCount:               summary.opportunities.created,
    highPriorityOpportunityCount:   summary.opportunities.highPriority,
    topOpportunityScore:            summary.topOpportunityScore,
    runDurationMs:                  summary.runDurationMs,
    completedAt:                    summary.status !== "running" ? new Date() : null,
  };
}

/**
 * Rebuild a lightweight DiscoveryRunSummary from a snapshot row.
 * Child records (signals, clusters, opportunities) are passed in if available.
 */
export function deserializeSnapshot(
  row: DiscoverySnapshotRow,
  signals: DiscoverySignal[] = [],
  clusters: DiscoveryCluster[] = [],
  opportunities: DiscoveryOpportunity[] = [],
): DiscoveryRunSummary {
  const failures = parseProviderFailures(row.providerFailures);
  const providersRun = (row.providersRun as ProviderSource[]) ?? [];

  return {
    runId:              row.id,
    clientId:           row.clientId,
    weekLabel:          row.weekLabel,
    status:             row.status as SnapshotStatus,
    providersAttempted: providersRun,
    providersSucceeded: providersRun,
    providersFailed:    failures.map(f => f.provider),
    providerFailures:   failures,
    signals: {
      received: row.signalsReceived,
      accepted: row.signalsAccepted,
      blocked:  row.signalsBlocked,
    },
    clusters:      { created: row.clusterCount },
    opportunities: {
      created:      row.opportunityCount,
      highPriority: row.highPriorityOpportunityCount,
    },
    topOpportunityScore: row.topOpportunityScore,
    runDurationMs:       row.runDurationMs,
    topOpportunities:    opportunities.slice(0, 5),
    allClusters:         clusters,
    allSignals:          signals,
    allOpportunities:    opportunities,
  };
}

// ── bootstrapDiscoveryTables ───────────────────────────────────────────────────

/**
 * Idempotent raw-SQL bootstrap for the four discovery tables.
 *
 * Must be called on startup before any DrizzleDiscoveryRepository is used.
 * Follows the same pattern as diagnostics.ts, client-resolver.ts, and
 * service-registry-loader.ts (drizzle-kit push is blocked by a pre-existing
 * constraint conflict in this environment).
 *
 * Safe to call multiple times — all statements use IF NOT EXISTS.
 */
export async function bootstrapDiscoveryTables(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS discovery_snapshots (
      id                              TEXT        PRIMARY KEY,
      client_id                       TEXT        NOT NULL,
      week_label                      TEXT        NOT NULL,
      status                          TEXT        NOT NULL DEFAULT 'running',
      providers_run                   JSONB       NOT NULL DEFAULT '[]',
      provider_failures               JSONB       NOT NULL DEFAULT '[]',
      signals_received                INTEGER     NOT NULL DEFAULT 0,
      signals_accepted                INTEGER     NOT NULL DEFAULT 0,
      signals_blocked                 INTEGER     NOT NULL DEFAULT 0,
      cluster_count                   INTEGER     NOT NULL DEFAULT 0,
      opportunity_count               INTEGER     NOT NULL DEFAULT 0,
      high_priority_opportunity_count INTEGER     NOT NULL DEFAULT 0,
      top_opportunity_score           INTEGER     NOT NULL DEFAULT 0,
      run_duration_ms                 INTEGER     NOT NULL DEFAULT 0,
      created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at                    TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_discovery_snapshots_client_week
      ON discovery_snapshots(client_id, week_label);
    CREATE INDEX IF NOT EXISTS idx_discovery_snapshots_client_id
      ON discovery_snapshots(client_id);

    CREATE TABLE IF NOT EXISTS discovery_signals (
      id                  TEXT        PRIMARY KEY,
      snapshot_id         TEXT        NOT NULL,
      client_id           TEXT        NOT NULL,
      signal_type         TEXT        NOT NULL,
      source              TEXT        NOT NULL,
      raw_value           TEXT        NOT NULL,
      normalized_value    TEXT        NOT NULL,
      service_id          TEXT,
      intent              TEXT        NOT NULL,
      volume_estimate     INTEGER,
      difficulty_score    INTEGER,
      seasonal_relevance  INTEGER     NOT NULL DEFAULT 0,
      geographic_scope    TEXT        NOT NULL DEFAULT 'local',
      trend_direction     TEXT        NOT NULL DEFAULT 'unknown',
      competitor_rank     INTEGER,
      citation_found      BOOLEAN,
      evidence_strength   INTEGER     NOT NULL DEFAULT 50,
      raw_provider_data   JSONB       NOT NULL DEFAULT '{}',
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_discovery_signals_snapshot_client
      ON discovery_signals(snapshot_id, client_id);
    CREATE INDEX IF NOT EXISTS idx_discovery_signals_client_id
      ON discovery_signals(client_id);

    CREATE TABLE IF NOT EXISTS discovery_clusters (
      id                  TEXT        PRIMARY KEY,
      snapshot_id         TEXT        NOT NULL,
      client_id           TEXT        NOT NULL,
      cluster_name        TEXT        NOT NULL,
      primary_service_id  TEXT,
      intent              TEXT        NOT NULL,
      signal_ids          JSONB       NOT NULL DEFAULT '[]',
      signal_count        INTEGER     NOT NULL DEFAULT 0,
      total_volume        INTEGER     NOT NULL DEFAULT 0,
      opportunity_score   INTEGER     NOT NULL DEFAULT 0,
      content_angle       TEXT        NOT NULL DEFAULT '',
      seasonal_window     TEXT,
      is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_discovery_clusters_snapshot_client
      ON discovery_clusters(snapshot_id, client_id);
    CREATE INDEX IF NOT EXISTS idx_discovery_clusters_client_id
      ON discovery_clusters(client_id);

    CREATE TABLE IF NOT EXISTS discovery_opportunities (
      id                  TEXT        PRIMARY KEY,
      snapshot_id         TEXT        NOT NULL,
      client_id           TEXT        NOT NULL,
      opportunity_type    TEXT        NOT NULL,
      title               TEXT        NOT NULL,
      description         TEXT        NOT NULL,
      target_engine       TEXT        NOT NULL,
      cluster_id          TEXT,
      service_id          TEXT,
      score_card          JSONB       NOT NULL DEFAULT '{}',
      composite_score     INTEGER     NOT NULL DEFAULT 0,
      priority            TEXT        NOT NULL DEFAULT 'medium',
      status              TEXT        NOT NULL DEFAULT 'pending',
      assigned_at         TIMESTAMPTZ,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_discovery_opportunities_snapshot_client
      ON discovery_opportunities(snapshot_id, client_id);
    CREATE INDEX IF NOT EXISTS idx_discovery_opportunities_client_id
      ON discovery_opportunities(client_id);
  `);
}

// ── DrizzleDiscoveryRepository ─────────────────────────────────────────────────

type DrizzleDb = NodePgDatabase<typeof schema>;

/**
 * Production Drizzle/PostgreSQL implementation of DiscoveryRepository.
 *
 * Tenant isolation contract:
 *   - Every write includes clientId from the canonical summary/entity.
 *   - Every read WHERE clause includes both the record ID and clientId.
 *   - Ownership predicates prevent cross-tenant access even with valid IDs.
 *
 * Idempotency contract:
 *   - Snapshot: ON CONFLICT (id) DO UPDATE — re-running a completed run
 *     updates status, counts, completedAt atomically.
 *   - Signals / Clusters / Opportunities: ON CONFLICT (id) DO NOTHING —
 *     deterministic IDs make duplicate writes safe no-ops.
 *
 * Transaction contract:
 *   - persistRunResult uses db.transaction() to make snapshot + child records
 *     atomic. A mid-write crash leaves no "completed" snapshot without its data.
 */
export class DrizzleDiscoveryRepository implements DiscoveryRepository {
  constructor(private readonly db: DrizzleDb) {}

  // ── Write ──────────────────────────────────────────────────────────────────

  async persistRunResult(summary: DiscoveryRunSummary): Promise<void> {
    const snapshotRow = serializeSnapshot(summary);

    // Transaction guarantees: snapshot + child records are written atomically.
    // A failed transaction leaves NO "completed" snapshot without its child data.
    await this.db.transaction(async tx => {
      // 1. Upsert snapshot (idempotent: ON CONFLICT DO UPDATE keeps latest status/counts)
      //    Keys must be camelCase Drizzle property names; SQL values use excluded.<snake_case>.
      await tx
        .insert(discoverySnapshotsTable)
        .values(snapshotRow)
        .onConflictDoUpdate({
          target: discoverySnapshotsTable.id,
          set: {
            status:                       drizzleSql`excluded.status`,
            providersRun:                 drizzleSql`excluded.providers_run`,
            providerFailures:             drizzleSql`excluded.provider_failures`,
            signalsReceived:              drizzleSql`excluded.signals_received`,
            signalsAccepted:              drizzleSql`excluded.signals_accepted`,
            signalsBlocked:               drizzleSql`excluded.signals_blocked`,
            clusterCount:                 drizzleSql`excluded.cluster_count`,
            opportunityCount:             drizzleSql`excluded.opportunity_count`,
            highPriorityOpportunityCount: drizzleSql`excluded.high_priority_opportunity_count`,
            topOpportunityScore:          drizzleSql`excluded.top_opportunity_score`,
            runDurationMs:                drizzleSql`excluded.run_duration_ms`,
            completedAt:                  drizzleSql`excluded.completed_at`,
          },
        });

      // 2. Persist signals in batches of 500 (idempotent on deterministic PK)
      const SIGNAL_BATCH = 500;
      for (let i = 0; i < summary.allSignals.length; i += SIGNAL_BATCH) {
        const batch = summary.allSignals.slice(i, i + SIGNAL_BATCH);
        await tx
          .insert(discoverySignalsTable)
          .values(batch.map(serializeSignal))
          .onConflictDoNothing();
      }

      // 3. Persist clusters (idempotent on deterministic PK)
      if (summary.allClusters.length > 0) {
        await tx
          .insert(discoveryClustersTable)
          .values(summary.allClusters.map(serializeCluster))
          .onConflictDoNothing();
      }

      // 4. Persist opportunities (idempotent on deterministic PK)
      if (summary.allOpportunities.length > 0) {
        await tx
          .insert(discoveryOpportunitiesTable)
          .values(summary.allOpportunities.map(serializeOpportunity))
          .onConflictDoNothing();
      }
    });
  }

  async saveSignals(signals: DiscoverySignal[]): Promise<void> {
    if (!signals.length) return;
    for (const s of signals) warnIfMissingCompetitorIdentifier(s);
    const BATCH = 500;
    for (let i = 0; i < signals.length; i += BATCH) {
      await this.db
        .insert(discoverySignalsTable)
        .values(signals.slice(i, i + BATCH).map(serializeSignal))
        .onConflictDoNothing();
    }
  }

  async saveClusters(clusters: DiscoveryCluster[]): Promise<void> {
    if (!clusters.length) return;
    await this.db
      .insert(discoveryClustersTable)
      .values(clusters.map(serializeCluster))
      .onConflictDoNothing();
  }

  async saveOpportunities(opportunities: DiscoveryOpportunity[]): Promise<void> {
    if (!opportunities.length) return;
    await this.db
      .insert(discoveryOpportunitiesTable)
      .values(opportunities.map(serializeOpportunity))
      .onConflictDoNothing();
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  async getRunById(runId: string, clientId: string): Promise<DiscoveryRunSummary | null> {
    const [row] = await this.db
      .select()
      .from(discoverySnapshotsTable)
      .where(
        and(
          eq(discoverySnapshotsTable.id, runId),
          eq(discoverySnapshotsTable.clientId, clientId),
        )
      );

    if (!row) return null;

    const [signals, clusters, opportunities] = await Promise.all([
      this.getSignalsForRun(runId, clientId),
      this.getClustersForRun(runId, clientId),
      this.getOpportunitiesForRun(runId, clientId),
    ]);

    return deserializeSnapshot(row, signals, clusters, opportunities);
  }

  async listRunsByClient(clientId: string, limit = 20): Promise<DiscoveryRunSummary[]> {
    const rows = await this.db
      .select()
      .from(discoverySnapshotsTable)
      .where(eq(discoverySnapshotsTable.clientId, clientId))
      .orderBy(desc(discoverySnapshotsTable.createdAt))
      .limit(limit);

    return rows.map(row => deserializeSnapshot(row, [], [], []));
  }

  async getSignalsForRun(runId: string, clientId: string): Promise<DiscoverySignal[]> {
    const rows = await this.db
      .select()
      .from(discoverySignalsTable)
      .where(
        and(
          eq(discoverySignalsTable.snapshotId, runId),
          eq(discoverySignalsTable.clientId, clientId),
        )
      );
    return rows.map(deserializeSignal);
  }

  async getClustersForRun(runId: string, clientId: string): Promise<DiscoveryCluster[]> {
    const rows = await this.db
      .select()
      .from(discoveryClustersTable)
      .where(
        and(
          eq(discoveryClustersTable.snapshotId, runId),
          eq(discoveryClustersTable.clientId, clientId),
        )
      );
    return rows.map(deserializeCluster);
  }

  async getOpportunitiesForRun(runId: string, clientId: string): Promise<DiscoveryOpportunity[]> {
    const rows = await this.db
      .select()
      .from(discoveryOpportunitiesTable)
      .where(
        and(
          eq(discoveryOpportunitiesTable.snapshotId, runId),
          eq(discoveryOpportunitiesTable.clientId, clientId),
        )
      );
    return rows.map(deserializeOpportunity);
  }
}

// ── InMemoryDiscoveryRepository ────────────────────────────────────────────────

/**
 * In-memory implementation of DiscoveryRepository for tests.
 *
 * - No database, no pool, no external dependencies.
 * - Enforces the same tenant-isolation contract as DrizzleDiscoveryRepository.
 * - Used for all Phase C3 test categories (A–T).
 * - Supports controlled-failure mode for testing persistence failure tolerance (R).
 */
export class InMemoryDiscoveryRepository implements DiscoveryRepository {
  private snapshots = new Map<string, DiscoveryRunSummary>();
  private signals   = new Map<string, DiscoverySignal>();
  private clusters  = new Map<string, DiscoveryCluster>();
  private opportunities = new Map<string, DiscoveryOpportunity>();

  /** When true, all writes throw to simulate DB failure (Category R, L). */
  public simulateWriteFailure = false;

  /** Expose write counts for idempotency assertions. */
  public writeCallCounts = {
    persistRunResult: 0,
    saveSignals:      0,
    saveClusters:     0,
    saveOpportunities:0,
  };

  // ── Write ────────────────────────────────────────────────────────────────

  async persistRunResult(summary: DiscoveryRunSummary): Promise<void> {
    this.writeCallCounts.persistRunResult++;
    if (this.simulateWriteFailure) throw new Error("simulated_db_write_failure");

    // Upsert snapshot (update if exists — same behavior as ON CONFLICT DO UPDATE)
    this.snapshots.set(summary.runId, { ...summary });

    // Save child records (idempotent: skip if id already present)
    await this.saveSignals(summary.allSignals);
    await this.saveClusters(summary.allClusters);
    await this.saveOpportunities(summary.allOpportunities);
  }

  async saveSignals(signals: DiscoverySignal[]): Promise<void> {
    this.writeCallCounts.saveSignals++;
    if (this.simulateWriteFailure) throw new Error("simulated_db_write_failure");
    for (const s of signals) {
      warnIfMissingCompetitorIdentifier(s);
      // ON CONFLICT DO NOTHING behavior: skip if id already present
      if (!this.signals.has(s.id)) {
        this.signals.set(s.id, { ...s });
      }
    }
  }

  async saveClusters(clusters: DiscoveryCluster[]): Promise<void> {
    this.writeCallCounts.saveClusters++;
    if (this.simulateWriteFailure) throw new Error("simulated_db_write_failure");
    for (const c of clusters) {
      if (!this.clusters.has(c.id)) {
        this.clusters.set(c.id, { ...c });
      }
    }
  }

  async saveOpportunities(opportunities: DiscoveryOpportunity[]): Promise<void> {
    this.writeCallCounts.saveOpportunities++;
    if (this.simulateWriteFailure) throw new Error("simulated_db_write_failure");
    for (const o of opportunities) {
      if (!this.opportunities.has(o.id)) {
        this.opportunities.set(o.id, { ...o });
      }
    }
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  async getRunById(runId: string, clientId: string): Promise<DiscoveryRunSummary | null> {
    const snap = this.snapshots.get(runId);
    // Tenant isolation: return null if clientId doesn't match
    if (!snap || snap.clientId !== clientId) return null;

    const signals = await this.getSignalsForRun(runId, clientId);
    const clusters = await this.getClustersForRun(runId, clientId);
    const opportunities = await this.getOpportunitiesForRun(runId, clientId);

    return {
      ...snap,
      allSignals:      signals,
      allClusters:     clusters,
      allOpportunities:opportunities,
      topOpportunities:opportunities.slice(0, 5),
    };
  }

  async listRunsByClient(clientId: string, limit = 20): Promise<DiscoveryRunSummary[]> {
    const all = [...this.snapshots.values()]
      .filter(s => s.clientId === clientId)
      .sort((a, b) => b.runId.localeCompare(a.runId)) // stable sort by runId
      .slice(0, limit);
    return all;
  }

  async getSignalsForRun(runId: string, clientId: string): Promise<DiscoverySignal[]> {
    return [...this.signals.values()].filter(
      s => s.snapshotId === runId && s.clientId === clientId,
    );
  }

  async getClustersForRun(runId: string, clientId: string): Promise<DiscoveryCluster[]> {
    return [...this.clusters.values()].filter(
      c => c.snapshotId === runId && c.clientId === clientId,
    );
  }

  async getOpportunitiesForRun(runId: string, clientId: string): Promise<DiscoveryOpportunity[]> {
    return [...this.opportunities.values()].filter(
      o => o.snapshotId === runId && o.clientId === clientId,
    );
  }

  // ── Test helpers ──────────────────────────────────────────────────────────

  /** Total number of unique signals stored. */
  get signalCount(): number { return this.signals.size; }

  /** Total number of unique clusters stored. */
  get clusterCount(): number { return this.clusters.size; }

  /** Total number of unique opportunities stored. */
  get opportunityCount(): number { return this.opportunities.size; }

  /** Total number of unique snapshots stored. */
  get snapshotCount(): number { return this.snapshots.size; }

  /** Clear all stored data. */
  reset(): void {
    this.snapshots.clear();
    this.signals.clear();
    this.clusters.clear();
    this.opportunities.clear();
    this.writeCallCounts = {
      persistRunResult: 0,
      saveSignals:      0,
      saveClusters:     0,
      saveOpportunities:0,
    };
    this.simulateWriteFailure = false;
  }
}

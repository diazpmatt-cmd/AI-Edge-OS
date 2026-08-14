import { db, pool, DrizzleCompetitorRepository } from "@workspace/db";

import {
  buildBacklinkOpportunityReadModel,
  type BacklinkOpportunityReadModel,
} from "./backlink-opportunity-read-model.js";
import { OBSERVED_BACKLINK_MEASUREMENT_SOURCE } from "./observed-backlink-measurement.js";

const competitorRepository = new DrizzleCompetitorRepository(db);
const MAX_COMPETITORS = 10;
const MAX_DISCOVERY_GAPS = 10;
const MAX_DISCOVERY_OPPORTUNITIES = 10;
const MAX_AUTHORITY_OPPORTUNITIES = 10;
const MAX_ACTIONS_PER_LANE = 5;

export interface CompetitiveEdgeClientContext {
  readonly clientId: string;
  readonly clientName: string;
  readonly industry: string;
  readonly region: string;
}

export interface CompetitiveEdgeCompetitorItem {
  readonly id: string;
  readonly businessName: string;
  readonly domain: string;
  readonly keywordGapCount: number;
  readonly opportunityScore: number;
  readonly threatLevel: string | null;
  readonly confidenceScore: number;
  readonly discoveredProviders: readonly string[];
  readonly lastSeenAt: string;
}

export interface CompetitiveEdgeCompetitorData {
  readonly totalCompetitors: number;
  readonly criticalCount: number;
  readonly highCount: number;
  readonly mediumCount: number;
  readonly lowCount: number;
  readonly lastUpdatedAt: string | null;
  readonly items: readonly CompetitiveEdgeCompetitorItem[];
}

export interface CompetitiveEdgeDiscoveryGap {
  readonly id: string;
  readonly keyword: string;
  readonly source: string;
  readonly intent: string;
  readonly volumeEstimate: number | null;
  readonly difficultyScore: number | null;
  readonly competitorRank: number | null;
  readonly competitorName: string | null;
  readonly evidenceStrength: number;
  readonly trendDirection: string;
  readonly geographicScope: string;
  readonly serviceId: string | null;
}

export interface CompetitiveEdgeDiscoveryOpportunity {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly opportunityType: string;
  readonly targetEngine: string;
  readonly compositeScore: number;
  readonly priority: string;
  readonly status: string;
  readonly createdAt: string;
}

export interface CompetitiveEdgeDiscoveryData {
  readonly runId: string;
  readonly weekLabel: string;
  readonly status: string;
  readonly signalsReceived: number;
  readonly signalsAccepted: number;
  readonly signalsBlocked: number;
  readonly clusterCount: number;
  readonly opportunityCount: number;
  readonly highPriorityCount: number;
  readonly topOpportunityScore: number;
  readonly competitorGapCount: number;
  readonly gaps: readonly CompetitiveEdgeDiscoveryGap[];
  readonly opportunities: readonly CompetitiveEdgeDiscoveryOpportunity[];
}

export interface CompetitiveEdgeAiVisibilityData {
  readonly scanId: string;
  readonly provider: string;
  readonly model: string;
  readonly queryCount: number;
  readonly completedCount: number;
  readonly mentionCount: number;
  readonly competitorMentionCount: number | null;
  readonly citationCount: number | null;
  readonly startedAt: string;
  readonly completedAt: string | null;
}

export interface CompetitiveEdgeMeasurementData {
  readonly snapshotDate: string;
  readonly backlinkCount: number;
  readonly referringDomainCount: number;
  readonly newCount: number;
  readonly lostCount: number;
  readonly restoredCount: number;
  readonly opportunityCount: number;
  readonly wonCount: number;
  readonly edgeAuthorityScore: number | null;
  readonly inventoryRunId: string;
  readonly measurementSource: string;
  readonly measurementObservedAt: string;
}

export type CompetitiveEdgeLane<T> =
  | {
      readonly available: true;
      readonly observedAt: string | null;
      readonly reason: null;
      readonly data: T;
    }
  | {
      readonly available: false;
      readonly observedAt: null;
      readonly reason: string;
      readonly data: null;
    };

export interface CompetitiveEdgeSources {
  readonly competitors: (clientId: string) => Promise<{
    readonly data: CompetitiveEdgeCompetitorData;
    readonly observedAt: string | null;
  } | null>;
  readonly discovery: (clientId: string) => Promise<{
    readonly data: CompetitiveEdgeDiscoveryData;
    readonly observedAt: string | null;
  } | null>;
  readonly authority: (clientId: string) => Promise<{
    readonly data: BacklinkOpportunityReadModel;
    readonly observedAt: string | null;
  } | null>;
  readonly aiVisibility: (clientId: string) => Promise<{
    readonly data: CompetitiveEdgeAiVisibilityData;
    readonly observedAt: string | null;
  } | null>;
  readonly measurement: (clientId: string) => Promise<{
    readonly data: CompetitiveEdgeMeasurementData;
    readonly observedAt: string | null;
  } | null>;
}

export interface CompetitiveEdgeReadModel {
  readonly client: CompetitiveEdgeClientContext;
  readonly generatedAt: string;
  readonly lanes: {
    readonly competitors: CompetitiveEdgeLane<CompetitiveEdgeCompetitorData>;
    readonly discovery: CompetitiveEdgeLane<CompetitiveEdgeDiscoveryData>;
    readonly authority: CompetitiveEdgeLane<BacklinkOpportunityReadModel>;
    readonly aiVisibility: CompetitiveEdgeLane<CompetitiveEdgeAiVisibilityData>;
    readonly measurement: CompetitiveEdgeLane<CompetitiveEdgeMeasurementData>;
    readonly localPresence: CompetitiveEdgeLane<never>;
  };
  readonly actionPlan: {
    readonly discovery: readonly CompetitiveEdgeDiscoveryOpportunity[];
    readonly authority: readonly unknown[];
  };
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function relationMissing(error: unknown): boolean {
  return Boolean(
    error
      && typeof error === "object"
      && "code" in error
      && (error as { readonly code?: unknown }).code === "42P01",
  );
}

function cleanCompetitorName(raw: Record<string, unknown> | null): string | null {
  if (!raw) return null;
  const candidates = [
    raw["competitorName"],
    raw["topCompetitorTitle"],
    raw["topCompetitorDomain"],
    Array.isArray(raw["competitorDomains"]) ? raw["competitorDomains"][0] : null,
  ];
  const value = candidates.find((candidate) => typeof candidate === "string" && candidate.trim()) as string | undefined;
  if (!value) return null;
  return value.split(/\s+[|–—-]\s+/)[0]?.trim() || value.trim();
}

async function readCompetitors(clientId: string) {
  const [summary, competitors] = await Promise.all([
    competitorRepository.getDashboardSummary(clientId),
    competitorRepository.list(clientId, {
      limit: MAX_COMPETITORS,
      orderBy: "opportunityScore",
    }),
  ]);

  if (summary.totalCompetitors === 0 && competitors.length === 0) return null;

  const observedAt = iso(summary.lastUpdatedAt);
  return Object.freeze({
    observedAt,
    data: Object.freeze({
      totalCompetitors: summary.totalCompetitors,
      criticalCount: summary.criticalCount,
      highCount: summary.highCount,
      mediumCount: summary.mediumCount,
      lowCount: summary.lowCount,
      lastUpdatedAt: observedAt,
      items: Object.freeze(competitors.map((competitor) => Object.freeze({
        id: competitor.id,
        businessName: competitor.businessName,
        domain: competitor.domain,
        keywordGapCount: competitor.keywordGapCount,
        opportunityScore: competitor.opportunityScore,
        threatLevel: competitor.threatLevel,
        confidenceScore: competitor.confidenceScore,
        discoveredProviders: Object.freeze([...competitor.discoveredProviders]),
        lastSeenAt: competitor.lastSeenAt.toISOString(),
      }))),
    }),
  });
}

async function readDiscovery(clientId: string) {
  try {
    const snapshotResult = await pool.query<{
      id: string;
      week_label: string;
      status: string;
      signals_received: number;
      signals_accepted: number;
      signals_blocked: number;
      cluster_count: number;
      opportunity_count: number;
      high_priority_opportunity_count: number;
      top_opportunity_score: number;
      created_at: Date;
      completed_at: Date | null;
    }>(
      `SELECT id, week_label, status, signals_received, signals_accepted,
              signals_blocked, cluster_count, opportunity_count,
              high_priority_opportunity_count, top_opportunity_score,
              created_at, completed_at
         FROM discovery_snapshots
        WHERE client_id = $1
          AND status IN ('complete', 'partial')
        ORDER BY created_at DESC
        LIMIT 1`,
      [clientId],
    );
    const snapshot = snapshotResult.rows[0];
    if (!snapshot) return null;

    const [gapCountResult, gapsResult, opportunitiesResult] = await Promise.all([
      pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count
           FROM discovery_signals
          WHERE client_id = $1
            AND snapshot_id = $2
            AND competitor_rank IS NOT NULL`,
        [clientId, snapshot.id],
      ),
      pool.query<{
        id: string;
        normalized_value: string;
        source: string;
        intent: string;
        volume_estimate: number | null;
        difficulty_score: number | null;
        competitor_rank: number | null;
        evidence_strength: number;
        trend_direction: string;
        geographic_scope: string;
        service_id: string | null;
        raw_provider_data: Record<string, unknown> | null;
      }>(
        `SELECT id, normalized_value, source, intent, volume_estimate,
                difficulty_score, competitor_rank, evidence_strength,
                trend_direction, geographic_scope, service_id, raw_provider_data
           FROM discovery_signals
          WHERE client_id = $1
            AND snapshot_id = $2
            AND competitor_rank IS NOT NULL
          ORDER BY COALESCE(volume_estimate, 0) DESC, evidence_strength DESC
          LIMIT $3`,
        [clientId, snapshot.id, MAX_DISCOVERY_GAPS],
      ),
      pool.query<{
        id: string;
        title: string;
        description: string;
        opportunity_type: string;
        target_engine: string;
        composite_score: number;
        priority: string;
        status: string;
        created_at: Date;
      }>(
        `SELECT id, title, description, opportunity_type, target_engine,
                composite_score, priority, status, created_at
           FROM discovery_opportunities
          WHERE client_id = $1
            AND snapshot_id = $2
          ORDER BY composite_score DESC
          LIMIT $3`,
        [clientId, snapshot.id, MAX_DISCOVERY_OPPORTUNITIES],
      ),
    ]);

    const observedAt = iso(snapshot.completed_at ?? snapshot.created_at);
    return Object.freeze({
      observedAt,
      data: Object.freeze({
        runId: snapshot.id,
        weekLabel: snapshot.week_label,
        status: snapshot.status,
        signalsReceived: Number(snapshot.signals_received),
        signalsAccepted: Number(snapshot.signals_accepted),
        signalsBlocked: Number(snapshot.signals_blocked),
        clusterCount: Number(snapshot.cluster_count),
        opportunityCount: Number(snapshot.opportunity_count),
        highPriorityCount: Number(snapshot.high_priority_opportunity_count),
        topOpportunityScore: Number(snapshot.top_opportunity_score),
        competitorGapCount: Number.parseInt(gapCountResult.rows[0]?.count ?? "0", 10),
        gaps: Object.freeze(gapsResult.rows.map((gap) => Object.freeze({
          id: gap.id,
          keyword: gap.normalized_value,
          source: gap.source,
          intent: gap.intent,
          volumeEstimate: gap.volume_estimate === null ? null : Number(gap.volume_estimate),
          difficultyScore: gap.difficulty_score === null ? null : Number(gap.difficulty_score),
          competitorRank: gap.competitor_rank === null ? null : Number(gap.competitor_rank),
          competitorName: cleanCompetitorName(gap.raw_provider_data),
          evidenceStrength: Number(gap.evidence_strength),
          trendDirection: gap.trend_direction,
          geographicScope: gap.geographic_scope,
          serviceId: gap.service_id,
        }))),
        opportunities: Object.freeze(opportunitiesResult.rows.map((opportunity) => Object.freeze({
          id: opportunity.id,
          title: opportunity.title,
          description: opportunity.description,
          opportunityType: opportunity.opportunity_type,
          targetEngine: opportunity.target_engine,
          compositeScore: Number(opportunity.composite_score),
          priority: opportunity.priority,
          status: opportunity.status,
          createdAt: opportunity.created_at.toISOString(),
        }))),
      }),
    });
  } catch (error) {
    if (relationMissing(error)) return null;
    throw error;
  }
}

async function readAuthority(clientId: string) {
  const data = await buildBacklinkOpportunityReadModel(clientId, MAX_AUTHORITY_OPPORTUNITIES);
  if (data.summary.totalActionable === 0 && data.items.length === 0) return null;
  return Object.freeze({ data, observedAt: null });
}

async function readAiVisibility(clientId: string) {
  try {
    const result = await pool.query<{
      id: string;
      provider: string;
      model: string;
      query_count: number;
      completed_count: number;
      mention_count: number;
      competitor_mention_count: number | null;
      citation_count: number | null;
      started_at: Date;
      completed_at: Date | null;
    }>(
      `SELECT id, provider, model, query_count, completed_count, mention_count,
              competitor_mention_count, citation_count, started_at, completed_at
         FROM ai_query_scans
        WHERE client_id = $1
          AND status = 'completed'
        ORDER BY started_at DESC
        LIMIT 1`,
      [clientId],
    );
    const row = result.rows[0];
    if (!row) return null;
    const completedAt = iso(row.completed_at);
    return Object.freeze({
      observedAt: completedAt ?? row.started_at.toISOString(),
      data: Object.freeze({
        scanId: row.id,
        provider: row.provider,
        model: row.model,
        queryCount: Number(row.query_count),
        completedCount: Number(row.completed_count),
        mentionCount: Number(row.mention_count),
        competitorMentionCount: row.competitor_mention_count === null ? null : Number(row.competitor_mention_count),
        citationCount: row.citation_count === null ? null : Number(row.citation_count),
        startedAt: row.started_at.toISOString(),
        completedAt,
      }),
    });
  } catch (error) {
    if (relationMissing(error)) return null;
    throw error;
  }
}

async function readMeasurement(clientId: string) {
  try {
    const result = await pool.query<{
      snapshot_date: string;
      backlink_count: number;
      opportunity_count: number;
      won_count: number;
      new_count: number;
      lost_count: number;
      restored_count: number;
      referring_domain_count: number;
      edge_authority_score: number | null;
      measurement_source: string;
      measurement_inventory_run_id: string;
      measurement_observed_at: Date;
    }>(
      `SELECT snapshot_date::TEXT, backlink_count, opportunity_count, won_count,
              new_count, lost_count, restored_count, referring_domain_count,
              edge_authority_score, measurement_source,
              measurement_inventory_run_id, measurement_observed_at
         FROM backlink_score_history
        WHERE client_id = $1
          AND measurement_source = $2
          AND measurement_inventory_run_id IS NOT NULL
          AND measurement_observed_at IS NOT NULL
        ORDER BY snapshot_date DESC, measurement_observed_at DESC
        LIMIT 1`,
      [clientId, OBSERVED_BACKLINK_MEASUREMENT_SOURCE],
    );
    const row = result.rows[0];
    if (!row) return null;
    const observedAt = row.measurement_observed_at.toISOString();
    return Object.freeze({
      observedAt,
      data: Object.freeze({
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
        measurementObservedAt: observedAt,
      }),
    });
  } catch (error) {
    if (relationMissing(error)) return null;
    throw error;
  }
}

export const DEFAULT_COMPETITIVE_EDGE_SOURCES: CompetitiveEdgeSources = Object.freeze({
  competitors: readCompetitors,
  discovery: readDiscovery,
  authority: readAuthority,
  aiVisibility: readAiVisibility,
  measurement: readMeasurement,
});

async function readLane<T>(
  source: () => Promise<{ readonly data: T; readonly observedAt: string | null } | null>,
  unavailableReason: string,
): Promise<CompetitiveEdgeLane<T>> {
  try {
    const result = await source();
    return result
      ? Object.freeze({ available: true as const, observedAt: result.observedAt, reason: null, data: result.data })
      : Object.freeze({ available: false as const, observedAt: null, reason: unavailableReason, data: null });
  } catch {
    return Object.freeze({ available: false as const, observedAt: null, reason: unavailableReason, data: null });
  }
}

export async function buildCompetitiveEdgeReadModel(
  client: CompetitiveEdgeClientContext,
  sources: CompetitiveEdgeSources = DEFAULT_COMPETITIVE_EDGE_SOURCES,
): Promise<CompetitiveEdgeReadModel> {
  const clientId = client.clientId.trim();
  if (!clientId) throw new Error("COMPETITIVE_EDGE_CLIENT_ID_REQUIRED");

  const [competitors, discovery, authority, aiVisibility, measurement] = await Promise.all([
    readLane(() => sources.competitors(clientId), "competitor_evidence_unavailable"),
    readLane(() => sources.discovery(clientId), "discovery_evidence_unavailable"),
    readLane(() => sources.authority(clientId), "authority_evidence_unavailable"),
    readLane(() => sources.aiVisibility(clientId), "ai_visibility_evidence_unavailable"),
    readLane(() => sources.measurement(clientId), "trusted_measurement_unavailable"),
  ]);

  const localPresence: CompetitiveEdgeLane<never> = Object.freeze({
    available: false,
    observedAt: null,
    reason: "local_presence_not_aggregated_in_a1",
    data: null,
  });

  return Object.freeze({
    client: Object.freeze({
      clientId,
      clientName: client.clientName,
      industry: client.industry,
      region: client.region,
    }),
    generatedAt: new Date().toISOString(),
    lanes: Object.freeze({ competitors, discovery, authority, aiVisibility, measurement, localPresence }),
    actionPlan: Object.freeze({
      discovery: discovery.available
        ? Object.freeze(discovery.data.opportunities.slice(0, MAX_ACTIONS_PER_LANE))
        : Object.freeze([]),
      authority: authority.available
        ? Object.freeze(authority.data.items.slice(0, MAX_ACTIONS_PER_LANE))
        : Object.freeze([]),
    }),
  });
}

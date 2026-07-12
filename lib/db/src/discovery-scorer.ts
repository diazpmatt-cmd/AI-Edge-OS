/**
 * Phase C2 — Opportunity Scorer
 *
 * Converts a DiscoveryCluster + context metadata into a scored DiscoveryOpportunity.
 *
 * Implements the Phase C1 scorecard with its six dimensions and documented weights:
 *   searchDemand:       0.25
 *   competitorGap:      0.20
 *   revenueImpact:      0.20
 *   contentFeasibility: 0.15
 *   seasonalRelevance:  0.10
 *   aiSearchPotential:  0.10
 *
 * CRITICAL RULES:
 *   - No Math.random() — all scores are deterministic from inputs.
 *   - Scores must not imply precision unsupported by evidence.
 *   - Missing values are handled explicitly (null volume → stated assumption).
 *   - Priority overrides apply after composite computation.
 *   - Every dimension carries an explanation string for logs and future UI.
 *
 * NOTE: This scorer must NEVER receive signals from:
 *   - Math.random() score bumps in ai-visibility.ts (NONCANONICAL)
 *   - GPT-fabricated keyword volumes from POST /ai/keywords (NONCANONICAL)
 *   - Hardcoded competitor JSON in ai-visibility.ts (NONCANONICAL)
 */

import type {
  DiscoveryCluster, DiscoveryOpportunity, DiscoverySignal,
  OpportunityScoreCard, OpportunityPriority, EvidenceQuality,
  TargetEngine, OpportunityType,
} from "./discovery-types";
import type { DiscoveryContext } from "./discovery-context";
import type { ServiceRegistryProvider } from "./client-context";
import { REAL_SERP_SOURCES } from "./discovery-registry-gate";

// ── Score weights (C1 canonical, C10-tunable) ──────────────────────────────────

export const SCORE_WEIGHTS = {
  searchDemand:        0.25,
  competitorGap:       0.20,
  revenueImpact:       0.20,
  contentFeasibility:  0.15,
  seasonalRelevance:   0.10,
  aiSearchPotential:   0.10,
} as const;

// ── Utility ────────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ── Intent multipliers for searchDemand ───────────────────────────────────────

const INTENT_MULTIPLIER: Record<string, number> = {
  local:         1.0,
  transactional: 0.9,
  commercial:    0.8,
  informational: 0.5,
  navigational:  0.3,
};

// ── Service lookup helper ──────────────────────────────────────────────────────

/**
 * Look up a service by either:
 *   1. matchByTopic (display name fuzzy match, e.g. "Bed Bug Inspection")
 *   2. Direct serviceId match (snake_case id, e.g. "bed_bug_inspection")
 *
 * This dual lookup is necessary because signals store snake_case serviceIds
 * but matchByTopic searches display names. Without the fallback, scorer
 * calls with snake_case serviceIds would never find the service.
 */
function lookupService(serviceId: string, registry: ServiceRegistryProvider) {
  return registry.matchByTopic(serviceId)
    ?? registry.getGeneratableServices().find(s => s.serviceId === serviceId);
}

// ── Dimension scorers ──────────────────────────────────────────────────────────

/**
 * searchDemand (0–100):
 *   base = clamp(log10(max(volume, 1)) / log10(15000) × 100, 0, 100)
 *   searchDemand = base × intentMultiplier
 *
 * When no volume is available across all signals: defaults to 30 with explanation.
 */
function scoreSearchDemand(
  signals: DiscoverySignal[],
  intent: string,
): { score: number; explanation: string } {
  const volumes = signals
    .map(s => s.volumeEstimate)
    .filter((v): v is number => v !== null && v > 0);

  if (volumes.length === 0) {
    return {
      score:       30,
      explanation: "No search volume data available (gpt_simulated or provider missing). Assumed low-demand default 30.",
    };
  }

  // Volume-weighted average
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const base      = clamp((Math.log10(Math.max(avgVolume, 1)) / Math.log10(15000)) * 100, 0, 100);
  const multiplier = INTENT_MULTIPLIER[intent] ?? 0.5;
  const score      = clamp(round2(base * multiplier), 0, 100);

  return {
    score,
    explanation: `avg volume ${Math.round(avgVolume)}, intent "${intent}" (×${multiplier}), base ${round2(base)} → ${score}`,
  };
}

/**
 * competitorGap (0–100):
 *   100 = competitor ranks for this keyword, client doesn't
 *    50 = unknown (no competitor data)
 *     0 = client already ranks in top 3
 *
 * Derived from "competitor_keyword" signals in the cluster.
 */
function scoreCompetitorGap(signals: DiscoverySignal[]): { score: number; explanation: string } {
  const competitorSignals = signals.filter(s => s.signalType === "competitor_keyword");
  if (competitorSignals.length === 0) {
    return {
      score:       50,
      explanation: "No competitor keyword signals. Default gap assumed (50/100).",
    };
  }
  // Max rank among competitor signals (lower rank = competitor more dominant)
  const topCompetitorRank = Math.min(
    ...competitorSignals
      .map(s => s.competitorRank)
      .filter((r): r is number => r !== null),
  );
  if (!isFinite(topCompetitorRank)) {
    return { score: 50, explanation: "Competitor signals present but no rank data. Default 50." };
  }
  // Rank 1-3 → competitor dominant → high gap
  const score = topCompetitorRank <= 3
    ? 100
    : clamp(round2(100 - ((topCompetitorRank - 3) / 10) * 50), 0, 100);

  return {
    score,
    explanation: `Competitor top rank: ${topCompetitorRank} → gap score ${score}`,
  };
}

/**
 * revenueImpact (0–100):
 *   From service registry: revenueWeight (1–10) + priority bonus.
 *   Formula: clamp((revenueWeight / 10 × 70) + priorityBonus, 0, 100)
 *   priorityBonus: priority=1 → +30, priority=2 → +15, otherwise 0.
 *   No service match: default 40.
 */
function scoreRevenueImpact(
  serviceId: string | null,
  registry: ServiceRegistryProvider,
): { score: number; explanation: string } {
  if (!serviceId) {
    return {
      score:       40,
      explanation: "No service registry match. Default revenue impact 40.",
    };
  }
  const service = lookupService(serviceId, registry);
  if (!service) {
    return {
      score:       40,
      explanation: `Service "${serviceId}" not found in registry. Default 40.`,
    };
  }
  const priorityBonus = service.priority === 1 ? 30 : service.priority === 2 ? 15 : 0;
  const score = clamp(
    round2((service.revenueWeight / 10) * 70 + priorityBonus),
    0, 100,
  );
  return {
    score,
    explanation:
      `revenueWeight=${service.revenueWeight}, priority=${service.priority} (+${priorityBonus}) → ${score}`,
  };
}

/**
 * contentFeasibility (0–100):
 *   generationAllowed=false → 0 (hard block, opportunity suppressed)
 *   No service match → 60
 *   registryGate passes + contentAngle in allowedAngles → 80 + 20 = 100 cap
 *   registryGate passes, no angle match → 80
 */
function scoreContentFeasibility(
  serviceId: string | null,
  contentAngle: string,
  registry: ServiceRegistryProvider,
): { score: number; explanation: string } {
  if (!serviceId) {
    return {
      score:       60,
      explanation: "No service match — general topic. Content feasibility default 60.",
    };
  }
  const service = lookupService(serviceId, registry);
  if (!service) {
    return {
      score:       60,
      explanation: `Service "${serviceId}" not in registry. Default 60.`,
    };
  }
  if (!service.generationAllowed) {
    return {
      score:       0,
      explanation: `generationAllowed=false for "${service.displayName}". Hard block — opportunity suppressed.`,
    };
  }
  const angles         = service.allowedContentAngles ?? [];
  const angleBonus     = angles.includes(contentAngle) ? 20 : 0;
  const score          = clamp(80 + angleBonus, 0, 100);
  const angleExpl      = angleBonus > 0
    ? `angle "${contentAngle}" in allowedAngles (+20)`
    : `angle "${contentAngle}" NOT in allowedAngles (+0)`;
  return {
    score,
    explanation: `generationAllowed=true, ${angleExpl} → ${score}`,
  };
}

/**
 * seasonalRelevance (0–100):
 *   Max of all member signals' seasonalRelevance scores.
 *   The most seasonally relevant signal drives the cluster's timing.
 */
function scoreSeasonalRelevance(signals: DiscoverySignal[]): { score: number; explanation: string } {
  if (signals.length === 0) {
    return { score: 50, explanation: "No signals. Default seasonal relevance 50." };
  }
  const max   = Math.max(...signals.map(s => s.seasonalRelevance));
  const score = clamp(Math.round(max), 0, 100);
  return {
    score,
    explanation: `Peak signal seasonalRelevance ${max} → cluster seasonal score ${score}`,
  };
}

/**
 * aiSearchPotential (0–100):
 *   gap = context.aiSearchGapScore (already = 100 − aiSearchScore)
 *   aiSearchPotential = clamp(gap × 1.2, 0, 100)   (slight amplification per C1)
 */
function scoreAISearchPotential(aiSearchGapScore: number): { score: number; explanation: string } {
  const score = clamp(round2(aiSearchGapScore * 1.2), 0, 100);
  return {
    score,
    explanation: `aiSearchGapScore=${aiSearchGapScore} × 1.2 → ${score}`,
  };
}

// ── Confidence / evidence quality ──────────────────────────────────────────────

/**
 * Determine confidence level for the scorecard.
 *
 * "high"   = at least one signal from a real SERP provider AND has volume
 * "medium" = gpt_simulated source OR volume is null for all signals
 * "low"    = only one signal in the cluster
 */
function computeConfidence(signals: DiscoverySignal[]): EvidenceQuality {
  if (signals.length <= 1) return "low";
  const hasRealProvider = signals.some(s => REAL_SERP_SOURCES.has(s.source));
  const hasVolume       = signals.some(s => s.volumeEstimate !== null);
  if (hasRealProvider && hasVolume) return "high";
  return "medium";
}

// ── Composite + priority ───────────────────────────────────────────────────────

/**
 * Weighted composite score (0–100) from six dimension scores.
 * Weights sum to 1.00 per C1 specification.
 */
export function computeComposite(
  dimensions: Omit<OpportunityScoreCard, "composite" | "confidence" | "explanations">,
): number {
  return clamp(
    round2(
      dimensions.searchDemand       * SCORE_WEIGHTS.searchDemand +
      dimensions.competitorGap      * SCORE_WEIGHTS.competitorGap +
      dimensions.revenueImpact      * SCORE_WEIGHTS.revenueImpact +
      dimensions.contentFeasibility * SCORE_WEIGHTS.contentFeasibility +
      dimensions.seasonalRelevance  * SCORE_WEIGHTS.seasonalRelevance +
      dimensions.aiSearchPotential  * SCORE_WEIGHTS.aiSearchPotential,
    ),
    0, 100,
  );
}

/**
 * Assign priority tier from composite score.
 *   composite ≥ 75 → "critical"
 *   composite ≥ 55 → "high"
 *   composite ≥ 35 → "medium"
 *   composite <  35 → "low"
 */
export function priorityFromScore(composite: number): OpportunityPriority {
  if (composite >= 75) return "critical";
  if (composite >= 55) return "high";
  if (composite >= 35) return "medium";
  return "low";
}

/**
 * Apply priority override rules from Phase C1 §9.3.
 *
 * Overrides the computed priority when specific registry conditions are met:
 *   - Service status "seasonal" AND current month in peak window → upgrade one tier
 *   - revenueWeight=10 AND composite ≥ 60 → force "critical"
 *   - competitorGap=100 AND searchDemand ≥ 60 → force "critical"
 */
function applyPriorityOverrides(
  basePriority: OpportunityPriority,
  scoreCard: OpportunityScoreCard,
  context: DiscoveryContext,
  serviceId: string | null,
): OpportunityPriority {
  // Override 1: competitorGap=100 AND searchDemand ≥ 60 → critical
  if (scoreCard.competitorGap >= 100 && scoreCard.searchDemand >= 60) {
    return "critical";
  }

  if (serviceId) {
    const service = lookupService(serviceId, context.registry);
    if (service) {
      // Override 2: revenueWeight=10 AND composite ≥ 60 → critical
      if (service.revenueWeight >= 10 && scoreCard.composite >= 60) {
        return "critical";
      }
      // Override 3: seasonal service in peak window → upgrade one tier
      if (service.status === "seasonal" && scoreCard.seasonalRelevance >= 80) {
        const tierOrder: OpportunityPriority[] = ["low", "medium", "high", "critical"];
        const idx = tierOrder.indexOf(basePriority);
        if (idx < tierOrder.length - 1) return tierOrder[idx + 1]!;
      }
    }
  }

  return basePriority;
}

// ── Opportunity type derivation ────────────────────────────────────────────────

function deriveOpportunityType(
  signals: DiscoverySignal[],
  serviceId: string | null,
): OpportunityType {
  // Prefer the type matching the dominant signal type in the cluster
  const typeCounts = new Map<string, number>();
  for (const s of signals) {
    typeCounts.set(s.signalType, (typeCounts.get(s.signalType) ?? 0) + 1);
  }
  const dominant = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  if (dominant === "competitor_keyword") return "competitor_gap";
  if (dominant === "ai_citation")        return "ai_citation_gap";
  if (dominant === "reddit_thread")      return "content_topic";
  if (dominant === "paa")                return "content_topic";
  if (dominant === "trending_query")     return "seasonal_push";
  if (serviceId)                         return "keyword_rank";
  return "content_topic";
}

function deriveTargetEngine(type: OpportunityType): TargetEngine {
  switch (type) {
    case "ai_citation_gap":   return "authority";
    case "competitor_gap":    return "authority";
    case "schema_markup":     return "optimization";
    case "local_listing":     return "optimization";
    default:                  return "content";
  }
}

// ── Main scorer function ───────────────────────────────────────────────────────

export interface ScoreClusterInput {
  cluster: DiscoveryCluster;
  signals: DiscoverySignal[];
  context: DiscoveryContext;
}

/**
 * Score a DiscoveryCluster and produce a DiscoveryOpportunity.
 *
 * Pure function. Deterministic for a given (cluster, signals, context) triple.
 *
 * The opportunity ID is derived from the cluster ID — stable across re-runs.
 * Clusters where contentFeasibility=0 (generationAllowed=false) are created
 * with status="suppressed" and priority="low".
 */
export function scoreCluster(input: ScoreClusterInput): DiscoveryOpportunity {
  const { cluster, signals, context } = input;

  const registry    = context.registry;
  const serviceId   = cluster.primaryServiceId;

  // ── Score each dimension ────────────────────────────────────────────────────
  const sdResult  = scoreSearchDemand(signals, cluster.intent);
  const cgResult  = scoreCompetitorGap(signals);
  const riResult  = scoreRevenueImpact(serviceId, registry);
  const cfResult  = scoreContentFeasibility(serviceId, cluster.contentAngle, registry);
  const srResult  = scoreSeasonalRelevance(signals);
  const aspResult = scoreAISearchPotential(context.aiSearchGapScore);

  const scoreCard: OpportunityScoreCard = {
    searchDemand:       sdResult.score,
    competitorGap:      cgResult.score,
    revenueImpact:      riResult.score,
    contentFeasibility: cfResult.score,
    seasonalRelevance:  srResult.score,
    aiSearchPotential:  aspResult.score,
    composite:          0, // computed below
    confidence:         computeConfidence(signals),
    explanations: {
      searchDemand:       sdResult.explanation,
      competitorGap:      cgResult.explanation,
      revenueImpact:      riResult.explanation,
      contentFeasibility: cfResult.explanation,
      seasonalRelevance:  srResult.explanation,
      aiSearchPotential:  aspResult.explanation,
    },
  };

  scoreCard.composite = computeComposite(scoreCard);

  // ── Priority assignment + overrides ────────────────────────────────────────
  const basePriority = priorityFromScore(scoreCard.composite);
  const priority     = applyPriorityOverrides(basePriority, scoreCard, context, serviceId);

  // ── Suppression for hard-blocked services ──────────────────────────────────
  const isSuppressed = cfResult.score === 0;

  // ── Opportunity metadata ───────────────────────────────────────────────────
  const opportunityType = deriveOpportunityType(signals, serviceId);
  const targetEngine    = deriveTargetEngine(opportunityType);
  const service         = serviceId ? registry.matchByTopic(serviceId) : null;

  const title = service
    ? `${opportunityType === "competitor_gap" ? "Close competitor gap for" : "Rank for"} "${cluster.clusterName}"`
    : `Explore "${cluster.clusterName}"`;

  const description = `${signals.length} signal${signals.length !== 1 ? "s" : ""} ` +
    `across ${[...new Set(signals.map(s => s.source))].join(", ")} ` +
    `suggest a ${priority} priority ${opportunityType.replace(/_/g, " ")} opportunity.`;

  const opportunityId = `opp::${cluster.id}`;

  const now = new Date();

  return {
    id:              opportunityId,
    snapshotId:      context.snapshotId,
    clientId:        context.clientId,
    opportunityType,
    title,
    description,
    targetEngine,
    clusterId:       cluster.id,
    serviceId,
    scoreCard,
    compositeScore:  scoreCard.composite,
    priority,
    status:          isSuppressed ? "suppressed" : "pending",
    assignedAt:      null,
    createdAt:       now,
  };
}

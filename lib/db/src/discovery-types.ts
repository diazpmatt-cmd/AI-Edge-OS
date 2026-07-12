/**
 * Phase C2 — Canonical Discovery Engine Types
 *
 * Provider-agnostic. Industry-agnostic. Multi-tenant. Serializable.
 *
 * These types form the stable contract for the Discovery Engine core.
 * No BB&B-specific values appear here — those live in bbb-services.ts.
 * No Drizzle imports — these are pure TypeScript contracts.
 *
 * ── NONCANONICAL SOURCES (must NOT feed Discovery Engine) ──────────────────
 * The following legacy features exist in the codebase and produce data that
 * MUST NEVER be used as Discovery Engine input:
 *
 *   artifacts/api-server/src/routes/ai-visibility.ts
 *     → Math.random() score bumps in the generate-report endpoint
 *     → Hardcoded competitor JSON (BB&B demo competitors)
 *
 *   artifacts/api-server/src/routes/ai.ts (POST /ai/keywords)
 *     → GPT-fabricated keyword volumes (simulated, not from real SERP data)
 *
 * These sources are preserved for existing UI features but MUST NOT be
 * connected to DiscoverySignal, DiscoveryOpportunity, or OpportunityScoreCard.
 * ───────────────────────────────────────────────────────────────────────────
 */

// ── Signal taxonomy ────────────────────────────────────────────────────────────

export type SignalType =
  | "keyword"            // classic SERP keyword
  | "paa"                // People Also Ask question
  | "reddit_thread"      // Reddit thread title or upvoted comment
  | "competitor_keyword" // keyword a competitor ranks for that the client doesn't
  | "ai_citation"        // AI platform (ChatGPT/Gemini/Perplexity) citation hit or miss
  | "trending_query"     // Google Trends rising query
  | "voice_query"        // Siri/Alexa/Assistant query form ("best pest control near me")
  | "review_theme";      // recurrent theme from review text analysis

export type SearchIntent =
  | "informational"
  | "commercial"
  | "transactional"
  | "local"
  | "navigational";

/**
 * Source of a discovery signal.
 * "test_fixture" is valid ONLY in test environments — never stored in production.
 */
export type ProviderSource =
  | "gpt_simulated"    // existing: OpenAI-generated simulated data
  | "dataforseo"       // Phase C7: real SERP data
  | "serp_api"         // Phase C7: SERP API alternative
  | "google_trends"    // Phase C8: Google Trends
  | "reddit_api"       // Phase C9: Reddit public JSON
  | "llm_probe"        // Phase C8: direct LLM citation check
  | "review_analysis"  // Phase C10: review text mining
  | "test_fixture";    // test environments ONLY — never in production

export type OpportunityType =
  | "keyword_rank"       // target a keyword in organic search
  | "ai_citation_gap"    // business not cited by AI platform for a query
  | "competitor_gap"     // competitor ranks for keyword client doesn't
  | "content_topic"      // create content for a discovered topic cluster
  | "local_listing"      // claim/optimize a local directory listing
  | "review_velocity"    // increase review count on a platform
  | "schema_markup"      // add structured data for a service/page
  | "seasonal_push"      // time-bound opportunity (active season)
  | "voice_optimization";// optimize for voice query form

export type TargetEngine =
  | "content"      // → auto-content scheduler (existing Phase B engine)
  | "authority"    // → Phase D: Authority Engine
  | "optimization" // → Phase E: Optimization Engine
  | "measurement"; // → Phase F: Measurement Engine

export type SnapshotStatus = "running" | "complete" | "failed" | "partial";

export type OpportunityStatus = "pending" | "assigned" | "in_progress" | "complete" | "suppressed";

export type OpportunityPriority = "critical" | "high" | "medium" | "low";

export type EvidenceQuality = "high" | "medium" | "low";

export type GeographicScope = "local" | "regional" | "national";

export type TrendDirection = "rising" | "stable" | "declining" | "unknown";

// ── Registry gate result ───────────────────────────────────────────────────────

/**
 * Typed result from registryGate().
 *
 * status:
 *   "allowed"           signal may proceed to opportunity scoring
 *   "educational_only"  signal may surface only for educational content angles;
 *                       no transactional or promotional opportunities
 *   "blocked"           signal must be suppressed; no opportunity created
 *   "unknown"           no registry match; signal passes through as general topic
 *   "unsupported"       malformed or empty signal topic; suppressed
 *
 * reason: always populated; suitable for logs and future UI display.
 * prohibitedClaims: content restrictions enforced at AI prompt time.
 *   Empty for blocked/unknown/unsupported statuses.
 * allowedAngles: eligible content angles for this service.
 *   Empty for blocked/unsupported statuses.
 */
export interface RegistryGateResult {
  status: "allowed" | "educational_only" | "blocked" | "unknown" | "unsupported";
  reason: string;
  serviceId: string | null;
  displayName: string | null;
  prohibitedClaims: string[];
  allowedAngles: string[];
}

// ── Core signal ────────────────────────────────────────────────────────────────

/**
 * Canonical normalized research unit produced by the Discovery Engine.
 *
 * In Phase C2 (no DB), id is a deterministic string: "sig::{clientId}::{source}::{normalizedValue}".
 * In Phase C3+, id will be a UUID stored in the discovery_signals table.
 *
 * volumeEstimate and difficultyScore are NULLABLE by design.
 * The normalizer MUST NOT fabricate values for missing fields — unknown = null.
 */
export interface DiscoverySignal {
  /** Deterministic: "sig::{clientId}::{source}::{normalizedValue}" */
  id: string;
  /** "pending" in C2 (pre-persistence); real uuid in C3+. */
  snapshotId: string;
  /** FK → clients.id. Required for tenant isolation — never null. */
  clientId: string;
  signalType: SignalType;
  source: ProviderSource;
  /** Exact text from the provider (search term, PAA question, Reddit title, etc.). */
  rawValue: string;
  /** Lowercase, trimmed, special-chars stripped — stable for deduplication. */
  normalizedValue: string;
  /** Registry serviceId if the signal maps to a known service; null otherwise. */
  serviceId: string | null;
  intent: SearchIntent;
  /**
   * Monthly search volume. NULL when the source doesn't provide it.
   * NEVER fabricate: if the provider doesn't give a volume, this is null.
   * "gpt_simulated" volumes are fabricated at source — the Discovery Engine
   * must not pass them off as real data.
   */
  volumeEstimate: number | null;
  /**
   * Keyword difficulty 0–100. NULL when the source doesn't provide it.
   * NEVER fabricate.
   */
  difficultyScore: number | null;
  /** Seasonal relevance RIGHT NOW (0–100). From SeasonalityEvaluator. */
  seasonalRelevance: number;
  geographicScope: GeographicScope;
  trendDirection: TrendDirection;
  /** For "competitor_keyword" signals: the competitor's ranking position. */
  competitorRank: number | null;
  /** For "ai_citation" signals: whether the business was cited. */
  citationFound: boolean | null;
  /**
   * Evidence strength proxy (0–100). Based on source quality tier.
   * dataforseo/serp_api → 90; google_trends/llm_probe → 65;
   * gpt_simulated/reddit_api → 40; test_fixture/review_analysis → 50.
   */
  evidenceStrength: number;
  /** Full provider response preserved for auditability. */
  rawProviderData: Record<string, unknown>;
  createdAt: Date;
}

// ── Cluster ────────────────────────────────────────────────────────────────────

/**
 * Semantic grouping of related signals.
 * Each cluster becomes one potential "topic" available to the Content Engine.
 *
 * Cluster IDs are deterministic in C2:
 *   "${clientId}::${serviceId || 'general'}::${intent}"
 */
export interface DiscoveryCluster {
  /** Deterministic: "${clientId}::${serviceId || 'general'}::${intent}" */
  id: string;
  snapshotId: string;
  clientId: string;
  clusterName: string;
  primaryServiceId: string | null;
  intent: SearchIntent;
  signalIds: string[];
  signalCount: number;
  /** Sum of non-null member signal volumeEstimates. */
  totalVolume: number;
  /** Populated by OpportunityScorer after cluster is built; 0 until scored. */
  opportunityScore: number;
  contentAngle: string;
  seasonalWindow: string | null;
  /** false = suppressed by registry validation. */
  isActive: boolean;
  createdAt: Date;
}

// ── Opportunity scorecard ──────────────────────────────────────────────────────

/**
 * Full scoring breakdown for a DiscoveryOpportunity.
 *
 * Weights (Phase C2 defaults — tunable per client in Phase C10):
 *   searchDemand:       0.25
 *   competitorGap:      0.20
 *   revenueImpact:      0.20
 *   contentFeasibility: 0.15
 *   seasonalRelevance:  0.10
 *   aiSearchPotential:  0.10
 *   ──────────────────────────
 *   Total:              1.00
 *
 * confidence:
 *   "high"   = real SERP provider (dataforseo/serp_api) AND volume non-null
 *   "medium" = gpt_simulated source OR volume is null
 *   "low"    = only one signal in the cluster
 */
export interface OpportunityScoreCard {
  searchDemand:        number; // 0–100
  competitorGap:       number; // 0–100
  revenueImpact:       number; // 0–100
  contentFeasibility:  number; // 0–100
  seasonalRelevance:   number; // 0–100
  aiSearchPotential:   number; // 0–100
  composite:           number; // 0–100, weighted sum
  confidence:          EvidenceQuality;
  /** Per-dimension explanation strings — for logs and future UI display. */
  explanations: {
    searchDemand:       string;
    competitorGap:      string;
    revenueImpact:      string;
    contentFeasibility: string;
    seasonalRelevance:  string;
    aiSearchPotential:  string;
  };
}

// ── Opportunity ────────────────────────────────────────────────────────────────

/** Scored, ranked action item ready for assignment to a downstream engine. */
export interface DiscoveryOpportunity {
  id: string;
  snapshotId: string;
  clientId: string;
  opportunityType: OpportunityType;
  title: string;
  description: string;
  targetEngine: TargetEngine;
  clusterId: string | null;
  serviceId: string | null;
  scoreCard: OpportunityScoreCard;
  compositeScore: number;
  priority: OpportunityPriority;
  status: OpportunityStatus;
  assignedAt: Date | null;
  createdAt: Date;
}

// ── Provider failure ───────────────────────────────────────────────────────────

export interface ProviderFailure {
  provider: ProviderSource;
  stage: number;
  error: string;
  occurredAt: Date;
}

// ── Run summary ────────────────────────────────────────────────────────────────

/**
 * Final output of DiscoveryPipeline.run().
 * Contains everything needed to persist the result and surface it in the UI.
 */
export interface DiscoveryRunSummary {
  runId: string;
  clientId: string;
  weekLabel: string;
  status: SnapshotStatus;
  providersAttempted: ProviderSource[];
  providersSucceeded: ProviderSource[];
  providersFailed: ProviderSource[];
  providerFailures: ProviderFailure[];
  signals: {
    received: number;
    accepted: number;
    blocked:  number;
  };
  clusters: {
    created: number;
  };
  opportunities: {
    created:      number;
    highPriority: number;
  };
  topOpportunityScore: number;
  runDurationMs: number;
  /** Top opportunities sorted by compositeScore desc. */
  topOpportunities: DiscoveryOpportunity[];
  /** All clusters built during this run. */
  allClusters: DiscoveryCluster[];
}

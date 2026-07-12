/**
 * Phase C2 — Discovery Provider Interfaces + Repository Boundary
 *
 * All external data sources implement one of these interfaces.
 * The Discovery Engine never calls a provider directly — only via these interfaces.
 * Providers are injected at runtime (dependency injection).
 *
 * No live API calls are made in Phase C2.
 * Implementations are added in Phases C4 (GPT), C7 (SERP), C8 (Trends + AI),
 * C9 (Reddit + PAA), C10 (Review).
 */

import type { ProviderSource, SearchIntent, CoverageState } from "./discovery-types";
import type {
  DiscoverySignal,
  DiscoveryCluster,
  DiscoveryOpportunity,
  DiscoveryRunSummary,
} from "./discovery-types";

// ── Raw result types ───────────────────────────────────────────────────────────

export interface RawKeywordResult {
  keyword: string;
  /**
   * Monthly search volume. NULL if the provider doesn't supply it.
   * NEVER fabricate. "gpt_simulated" volumes are marked at source.
   */
  volumeMonthly: number | null;
  /** Difficulty 0–100 on the provider's own scale. NULL if not supplied. */
  difficulty: number | null;
  intent: SearchIntent;
  /** Cost-per-click in USD — proxy for commercial value. NULL if not supplied. */
  cpc: number | null;
  relatedQueries: string[];
  providerRaw: Record<string, unknown>;
}

export interface RawPAAResult {
  question: string;
  /** Featured snippet text if available. */
  snippet: string | null;
  /** 1 = first PAA box position in SERP. */
  rank: number;
  providerRaw: Record<string, unknown>;
}

export interface RawTrendResult {
  keyword: string;
  /** 0–100 on Google Trends relative-interest scale. */
  relativeInterest: number;
  /** 1–12, or null if no clear seasonal peak. */
  peakMonth: number | null;
  trend: "rising" | "stable" | "declining";
  providerRaw: Record<string, unknown>;
}

export type AISearchPlatform = "chatgpt" | "perplexity" | "gemini" | "copilot" | "claude";

export interface RawAIProbeResult {
  isCited: boolean;
  /** 1 = first mention; null if the business was not cited. */
  citationRank: number | null;
  responseExcerpt: string | null;
  /** Other businesses mentioned in the same AI response. */
  competitorsCited: string[];
  providerRaw: Record<string, unknown>;
}

export interface RawRedditResult {
  title: string;
  body: string | null;
  /** Reddit upvote score. */
  score: number;
  commentCount: number;
  subreddit: string;
  url: string;
  createdAt: Date;
  providerRaw: Record<string, unknown>;
}

// ── Provider interfaces ────────────────────────────────────────────────────────

export interface SearchDataProvider {
  readonly name: ProviderSource;

  /**
   * Fetch keyword ideas for a set of seed terms + location.
   * Returns raw signal data — the engine normalizes and scores.
   *
   * Phase C4 implementation: GptSearchDataProvider (wraps existing /ai/keywords).
   * Phase C7 implementation: DataForSeoProvider or ValueSerpProvider.
   */
  fetchKeywords(input: {
    seeds: string[];
    city: string;
    state: string;
    industry: string;
    limit: number;
  }): Promise<RawKeywordResult[]>;

  /**
   * Fetch keywords a competitor ranks for that the client doesn't.
   * Returns empty array if competitor data is unavailable.
   */
  fetchCompetitorKeywords(input: {
    competitorDomain: string;
    clientDomain: string;
    location: string;
  }): Promise<RawKeywordResult[]>;
}

export interface PeopleAlsoAskProvider {
  readonly name: ProviderSource;

  /**
   * Fetch People Also Ask questions for a seed keyword.
   * Phase C9 implementation: DataForSeoPAAProvider.
   */
  fetchPAA(input: {
    seedKeyword: string;
    location: string;
    language: string;
  }): Promise<RawPAAResult[]>;
}

export interface TrendProvider {
  readonly name: ProviderSource;

  /**
   * Fetch seasonal trend data for a list of keywords.
   * Phase C8 implementation: GoogleTrendsProvider.
   */
  getSeasonalTrends(input: {
    keywords: string[];
    region: string;
    monthsBack: number;
  }): Promise<RawTrendResult[]>;
}

export interface AISearchProvider {
  readonly name: ProviderSource;

  /**
   * Check whether the business is cited by an AI platform for a target query.
   * Phase C8 implementation: LLMProbeProvider (direct OpenAI/Anthropic/Gemini calls).
   * Rate limit: 1 probe per query × platform × week × client.
   */
  probeQuery(input: {
    query: string;
    businessName: string;
    platform: AISearchPlatform;
  }): Promise<RawAIProbeResult>;
}

export interface SocialListeningProvider {
  readonly name: ProviderSource;

  /**
   * Fetch relevant Reddit threads for a set of keywords.
   * Phase C9 implementation: RedditProvider (public JSON, no auth required).
   */
  fetchRedditSignals(input: {
    subreddits: string[];
    keywords: string[];
    limit: number;
  }): Promise<RawRedditResult[]>;
}

// ── Site coverage provider (Phase C5) ─────────────────────────────────────────

export interface CoverageResult {
  state:       CoverageState;
  reason:      string;
  coveredUrls: string[];
}

/**
 * Phase C5 — Site coverage provider interface.
 * Determines whether the client already has meaningful coverage for a topic.
 *
 * C5 default: UnknownCoverageProvider (returns "unknown" for all topics).
 * Phase C6: content-inventory-backed implementation.
 */
export interface SiteCoverageProvider {
  readonly name: string;
  checkCoverage(input: {
    topic:     string;
    clientId:  string;
    serviceId: string | null;
  }): Promise<CoverageResult>;
}

// ── Provider set (injected into the pipeline) ─────────────────────────────────

/**
 * All providers passed to DiscoveryPipeline.
 * Fields are optional — the pipeline gracefully skips stages with no provider.
 */
export interface DiscoveryProviderSet {
  search?:   SearchDataProvider;
  paa?:      PeopleAlsoAskProvider;
  trend?:    TrendProvider;
  aiSearch?: AISearchProvider;
  social?:   SocialListeningProvider;
  /** Phase C5: site coverage provider. Optional — skipped when absent. */
  coverage?: SiteCoverageProvider;
}

// ── Persistence boundary ───────────────────────────────────────────────────────

/**
 * Repository interface for the Discovery Engine.
 *
 * The core engine (pipeline, scorer, cluster builder) NEVER calls Drizzle
 * directly. In Phase C2, no implementation exists — the pipeline accepts an
 * optional repository and skips persistence when absent.
 *
 * In Phase C3, DrizzleDiscoveryRepository implements this interface.
 *
 * Write-path contract:
 *   - All writes are idempotent on deterministic IDs (ON CONFLICT DO NOTHING).
 *   - persistRunResult is the primary entry point: it persists the snapshot,
 *     all signals, all clusters, and all opportunities atomically.
 *   - saveSignals / saveClusters / saveOpportunities are exposed individually
 *     for partial writes and retry scenarios.
 *
 * Read-path contract:
 *   - Every read method requires BOTH the runId/snapshotId AND the clientId.
 *   - A caller cannot retrieve another tenant's records even with a valid ID.
 *   - listRunsByClient returns summaries without child records (lightweight).
 */
export interface DiscoveryRepository {
  // ── Write ───────────────────────────────────────────────────────────────────

  /**
   * Persist a complete run result: snapshot + all signals + clusters + opportunities.
   * Idempotent: re-persisting the same run is safe (ON CONFLICT DO NOTHING on children).
   */
  persistRunResult(summary: DiscoveryRunSummary): Promise<void>;

  /**
   * Persist normalized signals for a run. Idempotent on signal.id.
   * Signals with duplicate IDs are silently skipped (ON CONFLICT DO NOTHING).
   */
  saveSignals(signals: DiscoverySignal[]): Promise<void>;

  /**
   * Persist clusters. Idempotent on cluster.id.
   */
  saveClusters(clusters: DiscoveryCluster[]): Promise<void>;

  /**
   * Persist opportunities. Idempotent on opportunity.id.
   */
  saveOpportunities(opportunities: DiscoveryOpportunity[]): Promise<void>;

  // ── Read ────────────────────────────────────────────────────────────────────

  /**
   * Fetch a full run summary by runId, scoped to clientId.
   * Returns null if the run does not exist OR belongs to a different client.
   */
  getRunById(runId: string, clientId: string): Promise<DiscoveryRunSummary | null>;

  /**
   * List recent run summaries for a client (lightweight — no child records).
   * Ordered by createdAt desc.
   */
  listRunsByClient(clientId: string, limit?: number): Promise<DiscoveryRunSummary[]>;

  /**
   * Fetch all signals for a run, tenant-scoped.
   */
  getSignalsForRun(runId: string, clientId: string): Promise<DiscoverySignal[]>;

  /**
   * Fetch all clusters for a run, tenant-scoped.
   */
  getClustersForRun(runId: string, clientId: string): Promise<DiscoveryCluster[]>;

  /**
   * Fetch all opportunities for a run, tenant-scoped.
   */
  getOpportunitiesForRun(runId: string, clientId: string): Promise<DiscoveryOpportunity[]>;
}

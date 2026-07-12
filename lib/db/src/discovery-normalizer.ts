/**
 * Phase C2 — Signal Normalizer
 *
 * Converts raw provider results into canonical DiscoverySignal objects.
 *
 * CRITICAL RULES:
 *   - Deterministic: same input always produces the same output.
 *   - NEVER fabricate: null volume/difficulty stays null through normalization.
 *   - clientId is required on every signal — enforces tenant isolation.
 *   - normalizedValue is lowercase, trimmed, special-chars stripped.
 *   - Signal ID is derived from (clientId + source + normalizedValue) — stable.
 *
 * NOTE: "gpt_simulated" volumes from POST /ai/keywords are fabricated at source
 * (GPT invents plausible-sounding monthly volumes). The normalizer carries those
 * values through as-is but they must NEVER be used as ground-truth volume data.
 * The evidenceStrength for gpt_simulated is capped at 40/100 to reflect this.
 */

import type {
  DiscoverySignal, ProviderSource,
  GeographicScope,
} from "./discovery-types";
import type {
  RawKeywordResult, RawPAAResult, RawRedditResult,
  RawAIProbeResult, AISearchPlatform,
} from "./discovery-providers";

// ── Evidence strength by source quality tier ───────────────────────────────────

const EVIDENCE_STRENGTH: Record<ProviderSource, number> = {
  dataforseo:     90, // real SERP — most reliable
  serp_api:       90, // real SERP — alternative
  google_trends:  65, // relative interest, not absolute volume
  llm_probe:      65, // boolean cite/no-cite — directionally useful
  review_analysis: 50,
  test_fixture:   50,
  reddit_api:     40, // engagement proxy, not search demand
  gpt_simulated:  40, // fabricated volumes — do not treat as real data
};

function evidenceStrengthFor(source: ProviderSource): number {
  return EVIDENCE_STRENGTH[source] ?? 50;
}

// ── Text normalization ─────────────────────────────────────────────────────────

/**
 * Normalize a raw text value for deduplication and stable comparison.
 *
 * Steps:
 *   1. Lowercase
 *   2. Trim leading/trailing whitespace
 *   3. Remove characters that are not word chars, hyphens, or spaces
 *   4. Collapse multiple spaces to one
 *
 * Deterministic for any given input string.
 */
export function normalizeText(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Deterministic signal ID ────────────────────────────────────────────────────

/**
 * Derive a stable, deterministic signal ID from its identity triple.
 *
 * Format: "sig::{clientId}::{source}::{normalizedValue}"
 *
 * Guarantees:
 *   - Unique for (clientId × source × normalizedValue)
 *   - The same triple always produces the same ID
 *   - clientId is embedded: signals from different tenants cannot share an ID
 *
 * No crypto / no UUID — simple string concatenation is sufficient and fast.
 */
export function deriveSignalId(
  clientId: string,
  source: ProviderSource,
  normalizedValue: string,
): string {
  return `sig::${clientId}::${source}::${normalizedValue}`;
}

// ── Geographic scope inference ─────────────────────────────────────────────────

/** Common local intent keywords and location terms for the BB&B service area. */
const LOCAL_INDICATORS = [
  "near me", "near by", "nearby", "local", "my area", "my city", "my town",
  " al ", "foley", "daphne", "gulf shores", "orange beach", "fairhope",
  "mobile", "loxley", "summerdale", "spanish fort", "in al", "baldwin",
];

/**
 * Heuristic: infer geographic scope from the normalized signal value.
 * "local" if the text contains location-like terms; "national" otherwise.
 *
 * In Phase C7+, real SERP data will supply an authoritative geographic scope.
 * This is a C2 approximation based on keyword patterns.
 */
export function inferGeographicScope(normalizedValue: string): GeographicScope {
  const padded = ` ${normalizedValue} `;
  if (LOCAL_INDICATORS.some(indicator => padded.includes(indicator))) return "local";
  return "national";
}

// ── Keyword result normalizer ──────────────────────────────────────────────────

export interface NormalizeKeywordInput {
  raw: RawKeywordResult;
  clientId: string;
  source: ProviderSource;
  snapshotId?: string;
  serviceId?: string | null;
  /** Pre-computed from SeasonalityEvaluator. Default 50 (neutral). */
  seasonalRelevance?: number;
  createdAt?: Date;
}

/**
 * Normalize a RawKeywordResult into a canonical DiscoverySignal.
 *
 * volumeEstimate: preserved exactly from raw.volumeMonthly — null if the
 * provider didn't supply it. NEVER substituted with a default or fabricated.
 *
 * For "gpt_simulated" source: the volume arrives already fabricated from GPT.
 * It is carried through for completeness but evidenceStrength reflects the
 * low reliability (40/100). Callers must not treat it as real search volume.
 */
export function normalizeKeywordResult(input: NormalizeKeywordInput): DiscoverySignal {
  const {
    raw, clientId, source,
    snapshotId        = "pending",
    serviceId         = null,
    seasonalRelevance = 50,
    createdAt         = new Date(),
  } = input;

  const normalizedValue = normalizeText(raw.keyword);
  const id              = deriveSignalId(clientId, source, normalizedValue);

  return {
    id,
    snapshotId,
    clientId,
    signalType:       "keyword",
    source,
    rawValue:         raw.keyword,
    normalizedValue,
    serviceId,
    intent:           raw.intent,
    volumeEstimate:   raw.volumeMonthly, // null preserved — NEVER fabricated
    difficultyScore:  raw.difficulty,    // null preserved — NEVER fabricated
    seasonalRelevance,
    geographicScope:  inferGeographicScope(normalizedValue),
    trendDirection:   "unknown",
    competitorRank:   null,
    citationFound:    null,
    evidenceStrength: evidenceStrengthFor(source),
    rawProviderData:  raw.providerRaw,
    createdAt,
  };
}

// ── PAA result normalizer ──────────────────────────────────────────────────────

export interface NormalizePAAInput {
  raw: RawPAAResult;
  clientId: string;
  source: ProviderSource;
  snapshotId?: string;
  serviceId?: string | null;
  seasonalRelevance?: number;
  createdAt?: Date;
}

/**
 * Normalize a RawPAAResult into a canonical DiscoverySignal.
 *
 * PAA signals are always intent=informational.
 * volumeEstimate is null — PAA results do not carry search volume.
 */
export function normalizePAAResult(input: NormalizePAAInput): DiscoverySignal {
  const {
    raw, clientId, source,
    snapshotId        = "pending",
    serviceId         = null,
    seasonalRelevance = 50,
    createdAt         = new Date(),
  } = input;

  const normalizedValue = normalizeText(raw.question);
  const id              = deriveSignalId(clientId, source, normalizedValue);

  return {
    id,
    snapshotId,
    clientId,
    signalType:       "paa",
    source,
    rawValue:         raw.question,
    normalizedValue,
    serviceId,
    intent:           "informational", // PAA questions are always informational intent
    volumeEstimate:   null,            // PAA results carry no search volume
    difficultyScore:  null,
    seasonalRelevance,
    geographicScope:  inferGeographicScope(normalizedValue),
    trendDirection:   "unknown",
    competitorRank:   null,
    citationFound:    null,
    evidenceStrength: evidenceStrengthFor(source),
    rawProviderData:  { ...raw.providerRaw, snippet: raw.snippet, rank: raw.rank },
    createdAt,
  };
}

// ── Reddit result normalizer ───────────────────────────────────────────────────

export interface NormalizeRedditInput {
  raw: RawRedditResult;
  clientId: string;
  source: ProviderSource;
  snapshotId?: string;
  serviceId?: string | null;
  seasonalRelevance?: number;
  createdAt?: Date;
}

/**
 * Normalize a RawRedditResult into a canonical DiscoverySignal.
 *
 * Reddit signals are informational intent by nature.
 * volumeEstimate is null — Reddit score (upvotes) is engagement, not search demand.
 */
export function normalizeRedditResult(input: NormalizeRedditInput): DiscoverySignal {
  const {
    raw, clientId, source,
    snapshotId        = "pending",
    serviceId         = null,
    seasonalRelevance = 50,
    createdAt         = new Date(),
  } = input;

  const normalizedValue = normalizeText(raw.title);
  const id              = deriveSignalId(clientId, source, normalizedValue);

  return {
    id,
    snapshotId,
    clientId,
    signalType:       "reddit_thread",
    source,
    rawValue:         raw.title,
    normalizedValue,
    serviceId,
    intent:           "informational",
    volumeEstimate:   null, // Reddit upvote score ≠ search volume
    difficultyScore:  null,
    seasonalRelevance,
    geographicScope:  inferGeographicScope(normalizedValue),
    trendDirection:   "unknown",
    competitorRank:   null,
    citationFound:    null,
    evidenceStrength: evidenceStrengthFor(source),
    rawProviderData: {
      ...raw.providerRaw,
      score:        raw.score,
      commentCount: raw.commentCount,
      subreddit:    raw.subreddit,
      url:          raw.url,
    },
    createdAt,
  };
}

// ── AI probe result normalizer ─────────────────────────────────────────────────

export interface NormalizeAIProbeInput {
  raw: RawAIProbeResult;
  clientId: string;
  query: string;
  platform: AISearchPlatform;
  snapshotId?: string;
  serviceId?: string | null;
  seasonalRelevance?: number;
  createdAt?: Date;
}

/**
 * Normalize a RawAIProbeResult into a canonical DiscoverySignal.
 *
 * AI probe signals represent citation presence/absence for a target query.
 * They always use source="llm_probe" regardless of which platform was probed.
 * volumeEstimate is null — AI probe results carry no search volume data.
 */
export function normalizeAIProbeResult(input: NormalizeAIProbeInput): DiscoverySignal {
  const {
    raw, clientId, query, platform,
    snapshotId        = "pending",
    serviceId         = null,
    seasonalRelevance = 50,
    createdAt         = new Date(),
  } = input;

  const normalizedValue = normalizeText(query);
  const id              = deriveSignalId(clientId, "llm_probe", normalizedValue);

  return {
    id,
    snapshotId,
    clientId,
    signalType:       "ai_citation",
    source:           "llm_probe",
    rawValue:         query,
    normalizedValue,
    serviceId,
    intent:           "commercial", // AI search probes target commercial queries
    volumeEstimate:   null,         // AI probe = citation check, not search volume
    difficultyScore:  null,
    seasonalRelevance,
    geographicScope:  inferGeographicScope(normalizedValue),
    trendDirection:   "unknown",
    competitorRank:   null,
    citationFound:    raw.isCited,
    evidenceStrength: evidenceStrengthFor("llm_probe"),
    rawProviderData: {
      ...raw.providerRaw,
      platform,
      isCited:          raw.isCited,
      citationRank:     raw.citationRank,
      competitorsCited: raw.competitorsCited,
    },
    createdAt,
  };
}

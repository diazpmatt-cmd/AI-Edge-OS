/**
 * Competitor Observation Types — Phase 5: Provider Intelligence Foundation
 *
 * Type layer for the provider observation framework.
 * Every provider contribution is modeled as a ProviderObservation<T>
 * where T is the category-specific normalized output.
 *
 * Design:
 * - No provider owns canonical competitor data.
 * - Providers contribute observations; the competitors row owns truth.
 * - Every observation carries full attribution + confidence + isMock flag.
 * - Future providers plug in by implementing CompetitorEnrichmentProvider<T>
 *   with the matching ObservationCategory — no UI changes required.
 * - isMock=true is REQUIRED on all mock/demo observations; UI renders a badge.
 */

// ── Category union ────────────────────────────────────────────────────────────

/** The five intelligence categories wired to the expanded competitor card. */
export type ObservationCategory =
  | "website_intel"
  | "local_presence"
  | "reviews"
  | "authority"
  | "ai_visibility";

/** UI display metadata for each category. */
export const OBSERVATION_CATEGORY_META: Record<
  ObservationCategory,
  { label: string; icon: string }
> = {
  website_intel:  { label: "Website Intel",  icon: "🌐" },
  local_presence: { label: "Local Presence", icon: "📍" },
  reviews:        { label: "Reviews",        icon: "⭐" },
  authority:      { label: "Authority",      icon: "🔗" },
  ai_visibility:  { label: "AI Visibility",  icon: "🤖" },
};

// ── Attribution ───────────────────────────────────────────────────────────────

/** Source attribution present on every observation. */
export interface ObservationAttribution {
  providerName:      string;
  providerVersion:   string;
  /** Description of how the data was gathered ("mock", "serp_crawl", etc.). */
  methodology:       string;
  /** Age of the underlying data in days, null when not determinable. */
  dataFreshnessDays: number | null;
}

// ── Generic observation wrapper ───────────────────────────────────────────────

/**
 * Generic provider observation.
 * T is the category-specific normalized payload.
 */
export interface ProviderObservation<T> {
  id:                    string;
  clientId:              string;
  competitorId:          string;
  domain:                string;
  category:              ObservationCategory;
  providerId:            string;
  observedAt:            Date;
  /** Provider confidence in this observation (0–100). */
  confidence:            number;
  /** Primary URL consulted to produce this observation, if applicable. */
  sourceUrl:             string | null;
  rawObservation:        Record<string, unknown>;
  normalizedObservation: T;
  attribution:           ObservationAttribution;
  /** true when produced by a mock provider — never by a live data source. */
  isMock:                boolean;
}

// ── Category-specific normalized payloads ────────────────────────────────────

export interface WebsiteIntelNormalized {
  score:                number;           // 0–100
  pageCount:            number | null;
  hasBlog:              boolean | null;
  hasServicePages:      boolean | null;
  contentFreshnessDays: number | null;
  coreWebVitalsGrade:   "good" | "needs_improvement" | "poor" | null;
  /** Human-readable key signals for UI display. */
  signals:              string[];
}

export interface LocalPresenceNormalized {
  score:                   number;
  gbpVerified:             boolean | null;
  citationCount:           number | null;
  napConsistencyScore:     number | null; // 0–100
  localDirectoriesPresent: string[];
  signals:                 string[];
}

export interface ReviewsNormalized {
  score:                  number;
  reviewCount:            number | null;
  avgRating:              number | null;
  reviewVelocityPerMonth: number | null;
  sentimentScore:         number | null; // 0–100
  platformBreakdown:      Array<{ platform: string; count: number; rating: number | null }>;
  signals:                string[];
}

export interface AuthorityNormalized {
  score:            number;
  domainAuthority:  number | null;
  backlinkCount:    number | null;
  referringDomains: number | null;
  trustFlow:        number | null;
  signals:          string[];
}

export interface AiVisibilityNormalized {
  score:                number;
  appearsInAiAnswers:   boolean | null;
  aiAnswerFrequency:    number | null; // 0–100
  featuredInLocalPacks: boolean | null;
  schemaMarkupPresent:  boolean | null;
  signals:              string[];
}

// ── API / UI summary ─────────────────────────────────────────────────────────

/**
 * Flattened observation shape for API responses and UI rendering.
 * The UI only needs: category, score, signals, mock flag, attribution.
 * Full normalized payload is preserved in `normalized` for detail views.
 */
export interface ProviderObservationSummary {
  category:     ObservationCategory;
  providerId:   string;
  providerName: string;
  observedAt:   string;                   // ISO-8601 string
  confidence:   number;
  sourceUrl:    string | null;
  /** Primary 0–100 score extracted from normalizedObservation.score. */
  score:        number;
  /** 2–5 human-readable insight bullets. */
  signals:      string[];
  isMock:       boolean;
  attribution:  ObservationAttribution;
  /** Complete normalized payload for detail expansion. */
  normalized:   Record<string, unknown>;
}

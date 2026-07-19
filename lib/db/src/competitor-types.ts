/**
 * Competitor Intelligence — canonical type layer.
 *
 * These types are provider-agnostic. Every provider adapter must normalize
 * its output into NormalizedCompetitor before touching the DB.
 *
 * Provider observation → NormalizedCompetitor → competitorsTable (upsert)
 *                                               ↗ competitors owned truth
 */

// ── Normalized competitor (provider output contract) ─────────────────────────

/**
 * Minimal representation produced by every provider adapter.
 * All fields beyond domain + clientId are optional — providers contribute
 * what they know; the repository merges observations into the canonical entity.
 */
export interface NormalizedCompetitor {
  clientId:             string;
  domain:               string;        // normalized bare domain, required

  // Business identity
  businessName?:        string | null;
  website?:             string | null;
  gbpPlaceId?:          string | null;
  primaryCategory?:     string | null;
  categoriesJson?:      string | null; // JSON array
  address?:             string | null;
  city?:                string | null;
  state?:               string | null;
  zip?:                 string | null;
  phone?:               string | null;
  coordinates?:         string | null; // "lat,lng"
  serviceAreasJson?:    string | null; // JSON array
  yearsInBusiness?:     number | null;

  // Reviews
  reviewCount?:         number | null;
  avgRating?:           string | null; // numeric string "4.7"
  reviewVelocity?:      string | null; // numeric string "3.2" reviews/month
  reviewSentimentScore?:number | null;

  // Service & social
  serviceCatalogJson?:  string | null; // JSON array
  socialProfilesJson?:  string | null; // JSON map

  // SERP / visibility
  topKeywordRank?:      number | null;
  lastSeenRank?:        number | null;
  keywordGapCount?:     number;
  estimatedOrganicTraffic?:   number | null;
  estimatedOrganicKeywords?:  number | null;

  // Composite scores (0–100)
  organicVisibilityScore?: number | null;
  paidVisibilityScore?:    number | null;
  contentVelocityScore?:   number | null;
  localPresenceScore?:     number | null;
  gbpHealthScore?:         number | null;
  aiVisibilityScore?:      number | null;
  citationScore?:          number | null;
  opportunityScore?:       number;
  threatLevel?:            ThreatLevel | null;

  // Authority
  domainAuthority?:     number | null;
  backlinkCount?:       number | null;

  // Visual
  primaryPhotoUrl?:     string | null;
  logoUrl?:             string | null;

  // Provenance
  discoverySource?:     DiscoverySource;
  discoveredProvider?:  string;        // single provider ID contributing this observation
  providerMetadata?:    Record<string, unknown> | null;
  confidenceScore?:     number;
  canonicalStatus?:     CanonicalStatus;
}

// ── Branded string unions ─────────────────────────────────────────────────────

export type ThreatLevel =
  | "low"
  | "medium"
  | "high"
  | "critical";

export type DiscoverySource =
  | "serp_organic"
  | "gbp_places"
  | "manual"
  | "imported"
  | "backlink_source";

export type CanonicalStatus =
  | "active"
  | "merged"
  | "inactive"
  | "suppressed";

// ── Competitor profile (read model) ─────────────────────────────────────────

/**
 * Enriched competitor profile returned to the dashboard.
 * Extends the DB row with parsed JSON fields and derived display values.
 */
export interface CompetitorProfile {
  id:                   string;
  clientId:             string;
  domain:               string;
  businessName:         string;           // never null in UI layer — falls back to domain
  website:              string | null;
  primaryCategory:      string | null;
  categories:           string[];         // parsed from categoriesJson
  address:              string | null;
  city:                 string | null;
  state:                string | null;
  phone:                string | null;
  serviceAreas:         string[];         // parsed from serviceAreasJson

  // Reviews
  reviewCount:          number | null;
  avgRating:            number | null;
  reviewVelocity:       number | null;
  reviewSentimentScore: number | null;

  // Services & social
  serviceCatalog:       ServiceEntry[];   // parsed from serviceCatalogJson
  socialProfiles:       Record<string, string>; // parsed from socialProfilesJson

  // SERP
  topKeywordRank:       number | null;
  lastSeenRank:         number | null;
  keywordGapCount:      number;

  // Scores
  organicVisibilityScore: number | null;
  localPresenceScore:     number | null;
  gbpHealthScore:         number | null;
  aiVisibilityScore:      number | null;
  citationScore:          number | null;
  domainAuthority:        number | null;
  opportunityScore:       number;
  confidenceScore:        number;
  threatLevel:            ThreatLevel | null;

  // Provenance
  discoverySource:      DiscoverySource;
  discoveredProviders:  string[];         // parsed from discoveredProvidersJson
  canonicalStatus:      CanonicalStatus;

  // Timestamps
  firstSeenAt:          Date;
  lastSeenAt:           Date;
  lastCrawledAt:        Date | null;
  updatedAt:            Date;

  // Visual
  primaryPhotoUrl:      string | null;
  logoUrl:              string | null;
}

export interface ServiceEntry {
  name:         string;
  description?: string;
  price?:       string;
}

// ── Provider adapter interface ────────────────────────────────────────────────

/**
 * Every provider that contributes competitor data must implement this interface.
 *
 * Rules:
 * - No provider owns the data model.
 * - Providers return NormalizedCompetitor[]; the repository merges into truth.
 * - Provider failures are non-fatal — other providers continue independently.
 * - discoveredProvider must be set on every returned entity so the repository
 *   can update discoveredProvidersJson and providerMetadataJson correctly.
 */
export interface CompetitorProviderAdapter {
  /** Unique identifier for this provider, e.g. "dataforseo_serp". */
  readonly providerId: string;

  /** Human-readable display name for diagnostics. */
  readonly displayName: string;

  /**
   * Whether this provider is currently active and should be called.
   * Inactive providers are registered but skipped during discovery.
   */
  readonly active: boolean;

  /**
   * Discover competitors for a given client.
   * Returns an empty array on failure — never throws.
   */
  discover(input: CompetitorDiscoveryInput): Promise<NormalizedCompetitor[]>;
}

export interface CompetitorDiscoveryInput {
  clientId:     string;
  domain:       string;     // client's own domain
  serviceAreas: string[];   // client's service areas for geographic filtering
  maxResults?:  number;     // cap on results per provider (default: 20)
}

// ── Dashboard aggregates ──────────────────────────────────────────────────────

export interface CompetitorDashboardSummary {
  clientId:           string;
  totalCompetitors:   number;
  criticalCount:      number;
  highCount:          number;
  mediumCount:        number;
  lowCount:           number;
  topByGapCount:      CompetitorProfile[];      // top 5 by keyword_gap_count
  topByThreat:        CompetitorProfile[];      // top 5 by threat_level + opportunity_score
  avgRatingLeader:    CompetitorProfile | null; // highest avg_rating
  reviewVelocityLeader: CompetitorProfile | null;
  newestCompetitor:   CompetitorProfile | null; // most recently first_seen
  lastUpdatedAt:      Date | null;
}

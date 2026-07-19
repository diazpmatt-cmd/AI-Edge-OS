/**
 * Canonical Competitor Entity Schema
 *
 * Design principles:
 * - ONE row per (client_id, domain) — the UNIQUE constraint enforces this.
 * - Providers contribute observations; this table owns the truth.
 * - All authority, local presence, GBP, AI visibility, reviews, citations,
 *   social profiles, and provider metadata fields are nullable so future
 *   engines can populate them without schema redesign.
 * - No FK constraints (consistent with discovery schema policy for portability).
 * - clientId is on every predicate — tenant isolation never relies on
 *   globally-unique IDs alone.
 */

import {
  pgTable, uuid, text, integer, numeric, boolean,
  timestamp, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";

export const competitorsTable = pgTable(
  "competitors",
  {
    // ── Identity ─────────────────────────────────────────────────────────────
    id:                   uuid("id").primaryKey().defaultRandom(),
    clientId:             text("client_id").notNull(),

    /** Normalized bare domain, e.g. "arrowexterminators.com". Primary key for dedup. */
    domain:               text("domain").notNull(),

    /** Best-known business name extracted from SERP titles or GBP data. */
    businessName:         text("business_name"),

    /** Full canonical URL, e.g. "https://arrowexterminators.com". */
    website:              text("website"),

    /** Google Place ID — populated by GBP engine (Phase 6). */
    gbpPlaceId:           text("gbp_place_id"),

    /** Primary GBP/Google category, e.g. "Pest Control Service". */
    primaryCategory:      text("primary_category"),

    /** JSON array of secondary category strings. */
    categoriesJson:       text("categories_json"),

    // ── Contact & Location ───────────────────────────────────────────────────
    address:              text("address"),
    city:                 text("city"),
    state:                text("state"),
    zip:                  text("zip"),
    phone:                text("phone"),
    coordinates:          text("coordinates"),           // "lat,lng" string

    /** JSON array of city/region strings this competitor serves. */
    serviceAreasJson:     text("service_areas_json"),

    // ── Review Signals ───────────────────────────────────────────────────────
    reviewCount:          integer("review_count"),
    avgRating:            numeric("avg_rating", { precision: 3, scale: 1 }),

    /** Reviews-per-month over trailing 90 days. */
    reviewVelocity:       numeric("review_velocity", { precision: 6, scale: 2 }),

    /** Sentiment score 0–100 (positive minus negative, normalized). */
    reviewSentimentScore: integer("review_sentiment_score"),

    /** Years the business has been operating (GBP or manual). */
    yearsInBusiness:      integer("years_in_business"),

    // ── Service & Social Profiles ────────────────────────────────────────────

    /** JSON array of service objects: [{ name, description, price }]. */
    serviceCatalogJson:   text("service_catalog_json"),

    /** JSON map of platform → profile URL: { facebook, yelp, nextdoor, ... }. */
    socialProfilesJson:   text("social_profiles_json"),

    // ── Visibility & SERP Metrics ────────────────────────────────────────────

    /** Best (lowest) SERP rank seen across all discovery signals for this client. */
    topKeywordRank:       integer("top_keyword_rank"),

    /** Best rank in the most recent discovery run. */
    lastSeenRank:         integer("last_seen_rank"),

    /** Number of keyword gaps in the most recent discovery run that cite this domain. */
    keywordGapCount:      integer("keyword_gap_count").notNull().default(0),

    /** Estimated monthly organic traffic (DataForSEO or future provider). */
    estimatedOrganicTraffic: integer("estimated_organic_traffic"),

    /** Estimated number of organic keywords (DataForSEO or future provider). */
    estimatedOrganicKeywords: integer("estimated_organic_keywords"),

    // ── Composite Scores (0–100) ─────────────────────────────────────────────

    /** Organic SERP visibility score (0–100). */
    organicVisibilityScore: integer("organic_visibility_score"),

    /** Paid/PPC visibility score (0–100). */
    paidVisibilityScore:    integer("paid_visibility_score"),

    /** Content publishing velocity score (0–100). */
    contentVelocityScore:   integer("content_velocity_score"),

    /** Cross-engine local presence score (0–100). */
    localPresenceScore:     integer("local_presence_score"),

    /** GBP audit health score (0–100) from gbp_audit_snapshots. */
    gbpHealthScore:         integer("gbp_health_score"),

    /** AI search visibility score (0–100) from ai_visibility_audits. */
    aiVisibilityScore:      integer("ai_visibility_score"),

    /** Authority & backlink score (0–100) from backlink engine. */
    citationScore:          integer("citation_score"),

    /** Overall competitor threat level: low | medium | high | critical. */
    threatLevel:            text("threat_level"),

    /** Composite opportunity score (0–100) — higher = more actionable gap. */
    opportunityScore:       integer("opportunity_score").notNull().default(0),

    // ── Authority & Backlink Metrics ─────────────────────────────────────────
    domainAuthority:      integer("domain_authority"),
    backlinkCount:        integer("backlink_count"),

    // ── Visual Assets ─────────────────────────────────────────────────────────
    primaryPhotoUrl:      text("primary_photo_url"),
    logoUrl:              text("logo_url"),

    // ── Provenance & Provider Metadata ───────────────────────────────────────

    /**
     * How this competitor was first discovered.
     * Values: serp_organic | gbp_places | manual | imported | backlink_source
     */
    discoverySource:      text("discovery_source").notNull().default("serp_organic"),

    /**
     * JSON array of provider IDs that have contributed to this entity.
     * e.g. ["dataforseo_serp", "gbp_places", "backlink_engine"]
     */
    discoveredProvidersJson: text("discovered_providers_json"),

    /**
     * JSON object keyed by provider ID holding provider-specific raw metadata.
     * e.g. { dataforseo_serp: { lastSignalId, lastSnapshotId }, gbp: { placeId } }
     */
    providerMetadataJson: text("provider_metadata_json"),

    /**
     * JSON array of domains that were merged INTO this canonical entity.
     * e.g. ["www.arrowexterminators.com", "arrowext.com"]
     */
    mergedFromDomainsJson: text("merged_from_domains_json"),

    /**
     * Canonical status of this entity.
     * Values: active | merged | inactive | suppressed
     */
    canonicalStatus:      text("canonical_status").notNull().default("active"),

    /**
     * Confidence in the enriched data (0–100).
     * Low confidence = only SERP domain seen. High = GBP + SERP + authority confirmed.
     */
    confidenceScore:      integer("confidence_score").notNull().default(10),

    // ── Timestamps ───────────────────────────────────────────────────────────
    firstSeenAt:          timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt:           timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastCrawledAt:        timestamp("last_crawled_at", { withTimezone: true }),
    createdAt:            timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:            timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ([
    uniqueIndex("competitors_client_domain_uniq").on(table.clientId, table.domain),
    index("competitors_client_id_idx").on(table.clientId),
    index("competitors_threat_level_idx").on(table.clientId, table.threatLevel),
    index("competitors_last_seen_idx").on(table.clientId, table.lastSeenAt),
  ]),
);

export type Competitor    = typeof competitorsTable.$inferSelect;
export type InsertCompetitor = typeof competitorsTable.$inferInsert;

/**
 * Competitor Repository
 *
 * DrizzleCompetitorRepository — canonical CRUD + upsert layer for competitor entities.
 *
 * Design:
 * - upsertMany() is the primary write path. Called by the competitor discovery
 *   pipeline after extractCompetitorsFromSignals() produces NormalizedCompetitor[].
 * - On conflict (client_id, domain): enrichment fields update only when
 *   the incoming value is non-null (never overwrites with null).
 * - Monotonic fields: keyword_gap_count from caller is authoritative for latest run;
 *   top_keyword_rank only updates when the new rank is lower (better).
 * - Tenant isolation: every query MUST include clientId in WHERE clause.
 */

import { and, eq, sql, desc } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "./schema";
import { competitorsTable, type Competitor, type InsertCompetitor } from "./schema/competitors";
import type {
  NormalizedCompetitor,
  CompetitorProfile,
  CompetitorDashboardSummary,
  ThreatLevel,
  DiscoverySource,
  CanonicalStatus,
} from "./competitor-types";
import {
  deriveThreatLevel,
  deriveOpportunityScore,
} from "./competitor-extractor";

type DB = NodePgDatabase<typeof schema>;

// ── Row → Profile mapper ──────────────────────────────────────────────────────

function rowToProfile(row: Competitor): CompetitorProfile {
  const parseJson = <T>(v: string | null | undefined, fallback: T): T => {
    if (!v) return fallback;
    try { return JSON.parse(v) as T; } catch { return fallback; }
  };

  return {
    id:                   row.id,
    clientId:             row.clientId,
    domain:               row.domain,
    businessName:         row.businessName ?? row.domain,
    website:              row.website ?? null,
    primaryCategory:      row.primaryCategory ?? null,
    categories:           parseJson<string[]>(row.categoriesJson, []),
    address:              row.address ?? null,
    city:                 row.city ?? null,
    state:                row.state ?? null,
    phone:                row.phone ?? null,
    serviceAreas:         parseJson<string[]>(row.serviceAreasJson, []),

    reviewCount:          row.reviewCount ?? null,
    avgRating:            row.avgRating != null ? parseFloat(String(row.avgRating)) : null,
    reviewVelocity:       row.reviewVelocity != null ? parseFloat(String(row.reviewVelocity)) : null,
    reviewSentimentScore: row.reviewSentimentScore ?? null,

    serviceCatalog:       parseJson(row.serviceCatalogJson, []),
    socialProfiles:       parseJson<Record<string, string>>(row.socialProfilesJson, {}),

    topKeywordRank:       row.topKeywordRank ?? null,
    lastSeenRank:         row.lastSeenRank ?? null,
    keywordGapCount:      row.keywordGapCount,

    organicVisibilityScore: row.organicVisibilityScore ?? null,
    localPresenceScore:     row.localPresenceScore ?? null,
    gbpHealthScore:         row.gbpHealthScore ?? null,
    aiVisibilityScore:      row.aiVisibilityScore ?? null,
    citationScore:          row.citationScore ?? null,
    domainAuthority:        row.domainAuthority ?? null,
    opportunityScore:       row.opportunityScore,
    confidenceScore:        row.confidenceScore,
    threatLevel:            (row.threatLevel as ThreatLevel) ?? null,

    discoverySource:      (row.discoverySource as DiscoverySource) ?? "serp_organic",
    discoveredProviders:  parseJson<string[]>(row.discoveredProvidersJson, []),
    canonicalStatus:      (row.canonicalStatus as CanonicalStatus) ?? "active",

    firstSeenAt:          row.firstSeenAt,
    lastSeenAt:           row.lastSeenAt,
    lastCrawledAt:        row.lastCrawledAt ?? null,
    updatedAt:            row.updatedAt,

    primaryPhotoUrl:      row.primaryPhotoUrl ?? null,
    logoUrl:              row.logoUrl ?? null,
  };
}

// ── Repository ────────────────────────────────────────────────────────────────

export class DrizzleCompetitorRepository {
  constructor(private readonly db: DB) {}

  /**
   * Upsert a batch of NormalizedCompetitor observations.
   *
   * Conflict key: (client_id, domain).
   * - Enrichment scalars: COALESCE(incoming, existing) — never null-overwrites.
   * - keyword_gap_count: caller is authoritative (latest run value).
   * - top_keyword_rank: LEAST(existing, incoming) — keeps the best (lowest) rank.
   * - discoveredProvidersJson / providerMetadataJson: JSON merge (append only).
   * - opportunityScore + threatLevel: always recomputed.
   * - lastSeenAt + updatedAt: always bumped.
   */
  async upsertMany(entities: NormalizedCompetitor[]): Promise<Competitor[]> {
    if (entities.length === 0) return [];

    const rows: InsertCompetitor[] = entities.map(e => {
      const gapCount = e.keywordGapCount ?? 0;
      const threat   = deriveThreatLevel(e.topKeywordRank, gapCount);
      const oppScore = deriveOpportunityScore(e.topKeywordRank, gapCount);

      const providers: string[] = e.discoveredProvider ? [e.discoveredProvider] : [];
      const provMeta: Record<string, unknown> = e.discoveredProvider && e.providerMetadata
        ? { [e.discoveredProvider]: e.providerMetadata }
        : {};

      return {
        clientId:             e.clientId,
        domain:               e.domain,
        businessName:         e.businessName ?? null,
        website:              e.website ?? null,
        gbpPlaceId:           e.gbpPlaceId ?? null,
        primaryCategory:      e.primaryCategory ?? null,
        categoriesJson:       e.categoriesJson ?? null,
        address:              e.address ?? null,
        city:                 e.city ?? null,
        state:                e.state ?? null,
        zip:                  e.zip ?? null,
        phone:                e.phone ?? null,
        coordinates:          e.coordinates ?? null,
        serviceAreasJson:     e.serviceAreasJson ?? null,
        yearsInBusiness:      e.yearsInBusiness ?? null,
        reviewCount:          e.reviewCount ?? null,
        avgRating:            e.avgRating ?? null,
        reviewVelocity:       e.reviewVelocity ?? null,
        reviewSentimentScore: e.reviewSentimentScore ?? null,
        serviceCatalogJson:   e.serviceCatalogJson ?? null,
        socialProfilesJson:   e.socialProfilesJson ?? null,
        topKeywordRank:       e.topKeywordRank ?? null,
        lastSeenRank:         e.lastSeenRank ?? null,
        keywordGapCount:      gapCount,
        estimatedOrganicTraffic:  e.estimatedOrganicTraffic ?? null,
        estimatedOrganicKeywords: e.estimatedOrganicKeywords ?? null,
        organicVisibilityScore:   e.organicVisibilityScore ?? null,
        paidVisibilityScore:      e.paidVisibilityScore ?? null,
        contentVelocityScore:     e.contentVelocityScore ?? null,
        localPresenceScore:       e.localPresenceScore ?? null,
        gbpHealthScore:           e.gbpHealthScore ?? null,
        aiVisibilityScore:        e.aiVisibilityScore ?? null,
        citationScore:            e.citationScore ?? null,
        opportunityScore:         oppScore,
        threatLevel:              threat,
        domainAuthority:          e.domainAuthority ?? null,
        backlinkCount:            e.backlinkCount ?? null,
        primaryPhotoUrl:          e.primaryPhotoUrl ?? null,
        logoUrl:                  e.logoUrl ?? null,
        discoverySource:          e.discoverySource ?? "serp_organic",
        discoveredProvidersJson:  JSON.stringify(providers),
        providerMetadataJson:     JSON.stringify(provMeta),
        mergedFromDomainsJson:    null,
        canonicalStatus:          e.canonicalStatus ?? "active",
        confidenceScore:          e.confidenceScore ?? 10,
        firstSeenAt:              new Date(),
        lastSeenAt:               new Date(),
      };
    });

    const result = await this.db
      .insert(competitorsTable)
      .values(rows)
      .onConflictDoUpdate({
        target: [competitorsTable.clientId, competitorsTable.domain],
        set: {
          // Enrichment scalars: only update when incoming is non-null
          businessName:    sql`COALESCE(EXCLUDED.business_name, ${competitorsTable.businessName})`,
          website:         sql`COALESCE(EXCLUDED.website, ${competitorsTable.website})`,
          gbpPlaceId:      sql`COALESCE(EXCLUDED.gbp_place_id, ${competitorsTable.gbpPlaceId})`,
          primaryCategory: sql`COALESCE(EXCLUDED.primary_category, ${competitorsTable.primaryCategory})`,
          address:         sql`COALESCE(EXCLUDED.address, ${competitorsTable.address})`,
          city:            sql`COALESCE(EXCLUDED.city, ${competitorsTable.city})`,
          phone:           sql`COALESCE(EXCLUDED.phone, ${competitorsTable.phone})`,

          reviewCount:          sql`COALESCE(EXCLUDED.review_count, ${competitorsTable.reviewCount})`,
          avgRating:            sql`COALESCE(EXCLUDED.avg_rating, ${competitorsTable.avgRating})`,
          reviewVelocity:       sql`COALESCE(EXCLUDED.review_velocity, ${competitorsTable.reviewVelocity})`,
          reviewSentimentScore: sql`COALESCE(EXCLUDED.review_sentiment_score, ${competitorsTable.reviewSentimentScore})`,

          domainAuthority: sql`COALESCE(EXCLUDED.domain_authority, ${competitorsTable.domainAuthority})`,

          // Scores enriched only
          organicVisibilityScore: sql`COALESCE(EXCLUDED.organic_visibility_score, ${competitorsTable.organicVisibilityScore})`,
          localPresenceScore:     sql`COALESCE(EXCLUDED.local_presence_score, ${competitorsTable.localPresenceScore})`,
          gbpHealthScore:         sql`COALESCE(EXCLUDED.gbp_health_score, ${competitorsTable.gbpHealthScore})`,
          aiVisibilityScore:      sql`COALESCE(EXCLUDED.ai_visibility_score, ${competitorsTable.aiVisibilityScore})`,
          citationScore:          sql`COALESCE(EXCLUDED.citation_score, ${competitorsTable.citationScore})`,

          // Volatile fields: always update with latest caller data
          keywordGapCount:  sql`EXCLUDED.keyword_gap_count`,
          lastSeenRank:     sql`COALESCE(EXCLUDED.last_seen_rank, ${competitorsTable.lastSeenRank})`,
          opportunityScore: sql`EXCLUDED.opportunity_score`,
          threatLevel:      sql`EXCLUDED.threat_level`,

          // Best (lowest) rank wins
          topKeywordRank: sql`
            CASE
              WHEN ${competitorsTable.topKeywordRank} IS NULL THEN EXCLUDED.top_keyword_rank
              WHEN EXCLUDED.top_keyword_rank IS NULL THEN ${competitorsTable.topKeywordRank}
              ELSE LEAST(${competitorsTable.topKeywordRank}, EXCLUDED.top_keyword_rank)
            END`,

          // Provider arrays: merge (append new providers, no duplicates)
          discoveredProvidersJson: sql`
            (SELECT json_agg(DISTINCT val)::text
             FROM (
               SELECT json_array_elements_text(
                 COALESCE(${competitorsTable.discoveredProvidersJson}::json, '[]'::json)
               ) AS val
               UNION
               SELECT json_array_elements_text(
                 COALESCE(EXCLUDED.discovered_providers_json::json, '[]'::json)
               ) AS val
             ) t
            )`,

          // Provider metadata: merge objects (incoming keys win)
          providerMetadataJson: sql`
            (COALESCE(${competitorsTable.providerMetadataJson}::jsonb, '{}'::jsonb)
             || COALESCE(EXCLUDED.provider_metadata_json::jsonb, '{}'::jsonb))::text`,

          // Timestamps
          lastSeenAt: sql`EXCLUDED.last_seen_at`,
          updatedAt:  sql`NOW()`,
        },
      })
      .returning();

    return result;
  }

  // ── Read ─────────────────────────────────────────────────────────────────────

  async list(
    clientId: string,
    options: {
      status?:  CanonicalStatus;
      limit?:   number;
      orderBy?: "opportunityScore" | "keywordGapCount" | "lastSeenAt";
    } = {},
  ): Promise<CompetitorProfile[]> {
    const { status = "active", limit = 50, orderBy = "opportunityScore" } = options;

    const orderCol =
      orderBy === "keywordGapCount" ? desc(competitorsTable.keywordGapCount) :
      orderBy === "lastSeenAt"      ? desc(competitorsTable.lastSeenAt)      :
                                      desc(competitorsTable.opportunityScore);

    const rows = await this.db
      .select()
      .from(competitorsTable)
      .where(and(
        eq(competitorsTable.clientId, clientId),
        eq(competitorsTable.canonicalStatus, status),
      ))
      .orderBy(orderCol)
      .limit(limit);

    return rows.map(rowToProfile);
  }

  async getByDomain(clientId: string, domain: string): Promise<CompetitorProfile | null> {
    const [row] = await this.db
      .select()
      .from(competitorsTable)
      .where(and(
        eq(competitorsTable.clientId, clientId),
        eq(competitorsTable.domain, domain),
      ))
      .limit(1);

    return row ? rowToProfile(row) : null;
  }

  async getById(clientId: string, id: string): Promise<CompetitorProfile | null> {
    const [row] = await this.db
      .select()
      .from(competitorsTable)
      .where(and(
        eq(competitorsTable.clientId, clientId),
        eq(competitorsTable.id, id),
      ))
      .limit(1);

    return row ? rowToProfile(row) : null;
  }

  async getDashboardSummary(clientId: string): Promise<CompetitorDashboardSummary> {
    const all = await this.list(clientId, { limit: 200, orderBy: "opportunityScore" });

    const byThreat = (level: ThreatLevel) => all.filter(c => c.threatLevel === level).length;

    const topByGapCount = [...all]
      .sort((a, b) => b.keywordGapCount - a.keywordGapCount)
      .slice(0, 5);

    const topByThreat = all
      .filter(c => c.threatLevel === "critical" || c.threatLevel === "high")
      .slice(0, 5);

    const withRatings = all.filter(c => c.avgRating != null);
    const avgRatingLeader = withRatings.length > 0
      ? withRatings.reduce((best, c) => (c.avgRating! > best.avgRating! ? c : best))
      : null;

    const withVelocity = all.filter(c => c.reviewVelocity != null);
    const reviewVelocityLeader = withVelocity.length > 0
      ? withVelocity.reduce((best, c) => (c.reviewVelocity! > best.reviewVelocity! ? c : best))
      : null;

    const newestCompetitor = all.length > 0
      ? [...all].sort((a, b) => b.firstSeenAt.getTime() - a.firstSeenAt.getTime())[0]
      : null;

    const lastUpdatedAt = all.length > 0
      ? new Date(Math.max(...all.map(c => c.updatedAt.getTime())))
      : null;

    return {
      clientId,
      totalCompetitors:     all.length,
      criticalCount:        byThreat("critical"),
      highCount:            byThreat("high"),
      mediumCount:          byThreat("medium"),
      lowCount:             byThreat("low"),
      topByGapCount,
      topByThreat,
      avgRatingLeader,
      reviewVelocityLeader,
      newestCompetitor,
      lastUpdatedAt,
    };
  }

  // ── Score write-back ─────────────────────────────────────────────────────────

  /**
   * Persist externally-derived scores onto a canonical competitor row.
   *
   * Only the supplied keys are written — undefined keys are skipped entirely.
   * Nullable score fields accept null to explicitly clear a stale score.
   * `confidenceScore` is non-nullable (Postgres NOT NULL) and is therefore
   * only accepted as a number; undefined means "do not change".
   *
   * Tenant isolation: query is always scoped to (client_id, domain).
   *
   * Confidence score formula (for callers that compute it):
   *   Base:           10   SERP signal confirmed the domain exists
   *   Multi-signal:  +10   keywordGapCount ≥ 3 (3+ keywords confirm)
   *                  +5    keywordGapCount = 2  (2 keywords)
   *   SERP position: +5    topKeywordRank ≤ 5  (top-5 presence)
   *   Business name: +10   name was extracted, not falling back to domain
   *   Location data: +5    city or state was populated from signal
   *   Category:      +5    primaryCategory was populated
   *   Cap: 70
   */
  async updateScores(
    clientId: string,
    domain: string,
    scores: {
      citationScore?:      number | null;
      domainAuthority?:    number | null;
      backlinkCount?:      number | null;
      aiVisibilityScore?:  number | null;
      localPresenceScore?: number | null;
      gbpHealthScore?:     number | null;
      confidenceScore?:    number;
    },
  ): Promise<void> {
    // Build a type-safe partial SET using the Drizzle InsertCompetitor type.
    // Only supplied keys are included — undefined means "do not touch".
    const patch: Partial<InsertCompetitor> = { updatedAt: new Date() };

    if ("citationScore"      in scores) patch.citationScore      = scores.citationScore      ?? null;
    if ("domainAuthority"    in scores) patch.domainAuthority    = scores.domainAuthority    ?? null;
    if ("backlinkCount"      in scores) patch.backlinkCount      = scores.backlinkCount      ?? null;
    if ("aiVisibilityScore"  in scores) patch.aiVisibilityScore  = scores.aiVisibilityScore  ?? null;
    if ("localPresenceScore" in scores) patch.localPresenceScore = scores.localPresenceScore ?? null;
    if ("gbpHealthScore"     in scores) patch.gbpHealthScore     = scores.gbpHealthScore     ?? null;
    if ("confidenceScore" in scores && scores.confidenceScore !== undefined) {
      patch.confidenceScore = scores.confidenceScore;
    }

    if (Object.keys(patch).length <= 1) return; // nothing to update beyond updatedAt

    await this.db
      .update(competitorsTable)
      .set(patch)
      .where(and(
        eq(competitorsTable.clientId, clientId),
        eq(competitorsTable.domain, domain),
      ));
  }

  // ── Write helpers ─────────────────────────────────────────────────────────────

  async suppress(clientId: string, domain: string): Promise<void> {
    await this.db
      .update(competitorsTable)
      .set({ canonicalStatus: "suppressed", updatedAt: new Date() })
      .where(and(
        eq(competitorsTable.clientId, clientId),
        eq(competitorsTable.domain, domain),
      ));
  }

  async markMerged(
    clientId: string,
    survivingDomain: string,
    mergedDomains: string[],
  ): Promise<void> {
    if (mergedDomains.length > 0) {
      // Mark merged-away entities using raw SQL IN to avoid inArray dependency
      const placeholders = mergedDomains.map((_, i) => `$${i + 3}`).join(", ");
      // This is intentionally a raw pool operation delegated to caller context.
      // Repository update per-domain as fallback (correct but N queries):
      for (const d of mergedDomains) {
        await this.db
          .update(competitorsTable)
          .set({ canonicalStatus: "merged", updatedAt: new Date() })
          .where(and(
            eq(competitorsTable.clientId, clientId),
            eq(competitorsTable.domain, d),
          ));
      }
      void placeholders; // suppress unused warning
    }

    await this.db
      .update(competitorsTable)
      .set({
        mergedFromDomainsJson: JSON.stringify(mergedDomains),
        updatedAt: new Date(),
      })
      .where(and(
        eq(competitorsTable.clientId, clientId),
        eq(competitorsTable.domain, survivingDomain),
      ));
  }
}

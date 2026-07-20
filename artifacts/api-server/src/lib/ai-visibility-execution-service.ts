/**
 * AiVisibilityExecutionService — C9R-2 canonical execution path.
 *
 * Collects canonical source data for all six C8R-5 adapter inputs,
 * invokes composeAiVisibilityReadModel(), and persists the result.
 *
 * The route calls execute({ clientId, userId }) and receives an
 * AiVisibilityReadModel ready to serialise as JSON.
 *
 * Scope resolution (service IDs + geographies) is performed internally
 * so the route stays thin. prohibitedPhrases defaults to [] for V1.
 */

import {
  db as defaultDb,
  pool as defaultPool,
  composeAiVisibilityReadModel,
  adaptLocalPresenceSources,
  adaptDiscoverySources,
  adaptBacklinkSources,
  adaptContentSources,
  adaptConnectedGoogle,
  adaptAiQuerySources,
  adaptReviewImportResult,
  localPresenceProfilesTable,
  localPresenceChannelsTable,
  discoveryOpportunitiesTable,
  socialPostsTable,
  socialConnectionsTable,
  type AiVisibilityReadModel,
  type AiVisibilityAuthorizedScope,
  type LocalPresenceProfile,
  type LocalPresenceChannel,
  type ConnectedGoogleSummary,
  type DiscoveryOpportunityObservation,
  type BacklinkOpportunityObservation,
  type ContentPostObservation,
  type SocialPost,
  type BacklinkOpportunity,
  type BacklinkWorkflow,
  type BacklinkEvidenceRecord,
  type BacklinkOpportunityCategory,
  type DiscoveryOpportunity,
} from "@workspace/db";
import { eq, and, desc, notInArray } from "drizzle-orm";
import { AiQueryScanService } from "./ai-query-scan-service.js";
import { GbpReviewSummaryImporter } from "./gbp-review-summary-importer.js";

type Pool     = typeof defaultPool;
type Db       = typeof defaultDb;

// ── Public contracts ──────────────────────────────────────────────────────────

export interface AiVisibilityExecuteInput {
  /** UUID from the clients table (NOT the slug). */
  clientId: string;
  /** Clerk userId — used to query social_posts and social_connections. */
  userId:   string;
}

export interface AiVisibilityRunRecord {
  id:                   string;
  clientId:             string;
  generatedAt:          string;
  recommendationCount:  number;
  rejectedCount:        number;
  availableSourceCount: number;
}

// ── Minimal PlatformDelivery shape needed by adapters ─────────────────────────
// Platform deliveries are queried via raw SQL because the Drizzle table is not
// currently re-exported from @workspace/db. Only the fields consumed by
// adaptContentSources / projectContentLifecycle are included.

interface MinimalPlatformDelivery {
  id:            string;
  postId:        string;
  platform:      string;
  status:        string;
  attemptNumber: number;
  updatedAt:     Date;
  createdAt:     Date;
}

// ── Pure helper: build authorised scope from profile + service IDs ─────────────

export function buildAuthorizedScope(
  clientId:   string,
  serviceIds: readonly string[],
  profile:    LocalPresenceProfile | null,
): AiVisibilityAuthorizedScope {
  const geographies: string[] = [];

  // Prefer service areas JSON over city/state fallback.
  if (profile?.serviceAreasJson) {
    try {
      const parsed = JSON.parse(profile.serviceAreasJson);
      if (Array.isArray(parsed)) {
        geographies.push(...parsed.filter((g): g is string => typeof g === "string" && g.length > 0));
      }
    } catch { /* ignore malformed JSON */ }
  }

  if (!geographies.length && profile?.city && profile?.state) {
    geographies.push(`${profile.city}, ${profile.state}`);
  }

  // Guarantee at least one value so geography-bearing observations are not
  // uniformly rejected. "unspecified" is a valid normalised geography token.
  if (!geographies.length) geographies.push("unspecified");

  return {
    clientId,
    activeServiceIds:     Object.freeze([...serviceIds]),
    authorizedGeographies: Object.freeze(geographies),
    prohibitedPhrases:    Object.freeze([] as string[]),
  };
}

// ── Pure helper: derive primary geography string ───────────────────────────────

export function derivePrimaryGeography(scope: AiVisibilityAuthorizedScope): string {
  return scope.authorizedGeographies[0] ?? "unspecified";
}

// ── Execution service ─────────────────────────────────────────────────────────

export class AiVisibilityExecutionService {
  constructor(
    private readonly pool: Pool = defaultPool,
    private readonly db:   Db   = defaultDb,
  ) {}

  // ── execute ─────────────────────────────────────────────────────────────────

  async execute(input: AiVisibilityExecuteInput): Promise<AiVisibilityReadModel> {
    const { clientId, userId } = input;
    const generatedAt = new Date();

    // ── 1. Resolve service IDs from client_services table ─────────────────────
    const serviceIds = await this.queryActiveServiceIds(clientId);

    // ── 2. Query local presence sources (profile + channels) ──────────────────
    const [profiles, channels] = await Promise.all([
      this.db.select().from(localPresenceProfilesTable)
        .where(eq(localPresenceProfilesTable.clientId, clientId))
        .limit(1),
      this.db.select().from(localPresenceChannelsTable)
        .where(eq(localPresenceChannelsTable.clientId, clientId)),
    ]);
    const profile  = profiles[0] ?? null;
    const scope    = buildAuthorizedScope(clientId, serviceIds, profile);
    const geography = derivePrimaryGeography(scope);

    // ── 3. Parallel canonical queries ─────────────────────────────────────────
    const aiQuerySvc    = new AiQueryScanService(this.pool, this.db);
    const reviewImporter = new GbpReviewSummaryImporter(this.pool, this.db);
    const [discoveryItems, backlinkItems, contentItems, googleConn, aiQueryData, reviewImport] = await Promise.all([
      this.queryDiscoveryObservations(clientId, geography),
      this.queryBacklinkObservations(clientId, geography),
      this.queryContentObservations(userId, clientId, geography),
      this.queryGoogleConnection(userId, clientId, geography),
      aiQuerySvc.getLatestScan(clientId),
      reviewImporter.importForClient({ clientId, userId, geography }),
    ]);

    // ── 4. Run all seven adapters ──────────────────────────────────────────────
    const lpResult      = adaptLocalPresenceSources({ trustedClientId: clientId, profile, channels, geography, observedAt: generatedAt });
    const discResult    = adaptDiscoverySources(discoveryItems);
    const blResult      = adaptBacklinkSources(backlinkItems);
    const contentResult = adaptContentSources(contentItems);
    const reviewResult  = adaptReviewImportResult(reviewImport);
    const googleResult  = adaptConnectedGoogle(googleConn);
    const aiQueryResult = adaptAiQuerySources({
      scan:        aiQueryData.scan,
      results:     aiQueryData.results,
      geography,
      clientId,
      observedAt:  generatedAt,
    });

    const observations = [
      ...lpResult.observations,
      ...discResult.observations,
      ...blResult.observations,
      ...contentResult.observations,
      ...reviewResult.observations,
      ...googleResult.observations,
      ...aiQueryResult.observations,
    ];
    const coverage = [
      ...lpResult.coverage,
      ...discResult.coverage,
      ...blResult.coverage,
      ...contentResult.coverage,
      ...reviewResult.coverage,
      ...googleResult.coverage,
      ...aiQueryResult.coverage,
    ];

    // ── 5. Compose ────────────────────────────────────────────────────────────
    const model = composeAiVisibilityReadModel({ scope, observations, coverage, generatedAt });

    // ── 6. Persist (fire-and-forget — never fails the response) ───────────────
    this.persistResult(clientId, model, generatedAt).catch(err =>
      console.error("[ai-visibility] persist error:", err),
    );

    return model;
  }

  // ── listHistory ──────────────────────────────────────────────────────────────

  async listHistory(clientId: string, limit = 20): Promise<AiVisibilityRunRecord[]> {
    const safeLimit = Math.min(100, Math.max(1, limit));
    try {
      const { rows } = await this.pool.query<{
        id: string;
        client_id: string;
        generated_at: Date;
        recommendation_count: number;
        rejected_count: number;
        available_source_count: number;
      }>(
        `SELECT id, client_id, generated_at, recommendation_count, rejected_count, available_source_count
         FROM ai_visibility_run_results
         WHERE client_id = $1
         ORDER BY generated_at DESC
         LIMIT $2`,
        [clientId, safeLimit],
      );
      return rows.map(r => ({
        id:                   r.id,
        clientId:             r.client_id,
        generatedAt:          r.generated_at instanceof Date ? r.generated_at.toISOString() : String(r.generated_at),
        recommendationCount:  Number(r.recommendation_count),
        rejectedCount:        Number(r.rejected_count),
        availableSourceCount: Number(r.available_source_count),
      }));
    } catch (err: any) {
      if (err?.code === "42P01") return []; // table not yet migrated
      throw err;
    }
  }

  // ── Private: persist result ──────────────────────────────────────────────────

  private async persistResult(
    clientId: string,
    model: AiVisibilityReadModel,
    generatedAt: Date,
  ): Promise<void> {
    const availableSourceCount = model.coverage.filter(c => c.status === "available").length;
    await this.pool.query(
      `INSERT INTO ai_visibility_run_results
         (client_id, generated_at, result_json, recommendation_count, rejected_count, available_source_count)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        clientId,
        generatedAt,
        JSON.stringify(model),
        model.recommendations.length,
        model.rejected.length,
        availableSourceCount,
      ],
    );
  }

  // ── Private: service ID resolution ──────────────────────────────────────────

  private async queryActiveServiceIds(clientId: string): Promise<string[]> {
    try {
      const { rows } = await this.pool.query<{ service_id: string }>(
        `SELECT service_id FROM client_services WHERE client_id = $1 AND is_active = TRUE`,
        [clientId],
      );
      return rows.map(r => r.service_id);
    } catch (err: any) {
      if (err?.code === "42P01") return [];
      console.warn("[ai-visibility] service ID query warning:", err?.message);
      return [];
    }
  }

  // ── Private: discovery observations ─────────────────────────────────────────

  private async queryDiscoveryObservations(
    clientId: string,
    geography: string,
  ): Promise<DiscoveryOpportunityObservation[]> {
    try {
      const rows = await this.db
        .select()
        .from(discoveryOpportunitiesTable)
        .where(and(
          eq(discoveryOpportunitiesTable.clientId, clientId),
          notInArray(discoveryOpportunitiesTable.status, ["complete", "suppressed"]),
        ))
        .orderBy(desc(discoveryOpportunitiesTable.createdAt))
        .limit(50);

      return rows.map(row => ({
        // Cast is safe: Drizzle returns the same shape as DiscoveryOpportunity;
        // scoreCard is jsonb so it deserialises to the correct object graph.
        opportunity: row as unknown as DiscoveryOpportunity,
        geography,
      }));
    } catch (err: any) {
      if (err?.code === "42P01") return [];
      console.warn("[ai-visibility] discovery query warning:", err?.message);
      return [];
    }
  }

  // ── Private: backlink observations ──────────────────────────────────────────

  private async queryBacklinkObservations(
    clientId: string,
    geography: string,
  ): Promise<BacklinkOpportunityObservation[]> {
    try {
      const { rows: oppRows } = await this.pool.query<{
        id: string; client_id: string; prospect_id: string; category: string;
        service_id: string | null; potential_value: number; attainability: number;
        rationale: string; recommended_action: string; evidence_ids: string[] | null;
        created_at: Date; updated_at: Date;
        wf_id: string; wf_status: string; wf_owner_id: string | null;
        wf_next_action: string | null; wf_due_at: Date | null;
        wf_outcome_summary: string | null; wf_version: number;
        wf_created_at: Date; wf_updated_at: Date; wf_completed_at: Date | null;
      }>(
        `SELECT
           bo.id, bo.client_id, bo.prospect_id, bo.category, bo.service_id,
           bo.potential_value, bo.attainability, bo.rationale, bo.recommended_action,
           bo.evidence_ids, bo.created_at, bo.updated_at,
           bw.id           AS wf_id,
           bw.status       AS wf_status,
           bw.owner_id     AS wf_owner_id,
           bw.next_action  AS wf_next_action,
           bw.due_at       AS wf_due_at,
           bw.outcome_summary AS wf_outcome_summary,
           bw.version      AS wf_version,
           bw.created_at   AS wf_created_at,
           bw.updated_at   AS wf_updated_at,
           bw.completed_at AS wf_completed_at
         FROM backlink_opportunities bo
         JOIN backlink_workflows bw
           ON bw.opportunity_id = bo.id AND bw.client_id = bo.client_id
         WHERE bo.client_id = $1
         ORDER BY bo.updated_at DESC
         LIMIT 50`,
        [clientId],
      );

      if (!oppRows.length) return [];

      // Collect all evidence IDs across all opportunities in one batch query.
      const allEvidenceIds = [...new Set(oppRows.flatMap(r => Array.isArray(r.evidence_ids) ? r.evidence_ids : []))];
      const evidenceByOppId = new Map<string, BacklinkEvidenceRecord[]>();
      oppRows.forEach(r => evidenceByOppId.set(r.id, []));

      if (allEvidenceIds.length > 0) {
        const { rows: evRows } = await this.pool.query<{
          id: string; client_id: string; prospect_id: string;
          source_domain: string; source_url: string; target_url: string | null;
          competitor_url: string | null; category: string; service_id: string | null;
          providers: string[]; discovered_at: Date; freshness_days: number;
          local_relevance: number; service_relevance: number;
          competitor_frequency: number; relationship_accessibility: number;
          editorial_requirements: number; estimated_effort: number;
          authority: number; created_at: Date;
        }>(
          `SELECT id, client_id, prospect_id, source_domain, source_url, target_url,
                  competitor_url, category, service_id, providers,
                  discovered_at, freshness_days, local_relevance, service_relevance,
                  competitor_frequency, relationship_accessibility, editorial_requirements,
                  estimated_effort, authority, created_at
           FROM backlink_evidence
           WHERE id = ANY($1) AND client_id = $2`,
          [allEvidenceIds, clientId],
        );

        // Build a map from evidenceId to record, then attach to each opportunity.
        const evMap = new Map<string, BacklinkEvidenceRecord>();
        for (const ev of evRows) {
          evMap.set(ev.id, {
            id: ev.id, clientId: ev.client_id, prospectId: ev.prospect_id,
            sourceDomain: ev.source_domain, sourceUrl: ev.source_url,
            targetUrl: ev.target_url, competitorUrl: ev.competitor_url,
            category: ev.category as BacklinkEvidenceRecord["category"],
            serviceId: ev.service_id,
            providers: Object.freeze(Array.isArray(ev.providers) ? ev.providers : []),
            discoveredAt: new Date(ev.discovered_at),
            freshnessDays: Number(ev.freshness_days),
            localRelevance: Number(ev.local_relevance),
            serviceRelevance: Number(ev.service_relevance),
            competitorFrequency: Number(ev.competitor_frequency),
            relationshipAccessibility: Number(ev.relationship_accessibility),
            editorialRequirements: Number(ev.editorial_requirements),
            estimatedEffort: Number(ev.estimated_effort),
            authority: Number(ev.authority),
            createdAt: new Date(ev.created_at),
          });
        }
        for (const r of oppRows) {
          const ids = Array.isArray(r.evidence_ids) ? r.evidence_ids : [];
          evidenceByOppId.set(r.id, ids.map(eid => evMap.get(eid)).filter((e): e is BacklinkEvidenceRecord => !!e));
        }
      }

      return oppRows.map(r => {
        const opportunity: BacklinkOpportunity = {
          id: r.id, clientId: r.client_id, prospectId: r.prospect_id,
          category: r.category as BacklinkOpportunityCategory,
          serviceId: r.service_id,
          potentialValue: Number(r.potential_value),
          attainability: Number(r.attainability),
          rationale: r.rationale, recommendedAction: r.recommended_action,
          evidenceIds: Object.freeze(Array.isArray(r.evidence_ids) ? [...r.evidence_ids] : []),
          createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at),
        };
        const workflow: BacklinkWorkflow = {
          id: r.wf_id, clientId: r.client_id, opportunityId: r.id,
          status: r.wf_status as BacklinkWorkflow["status"],
          ownerId: r.wf_owner_id, nextAction: r.wf_next_action,
          dueAt: r.wf_due_at ? new Date(r.wf_due_at) : null,
          outcomeSummary: r.wf_outcome_summary,
          version: Number(r.wf_version),
          createdAt: new Date(r.wf_created_at), updatedAt: new Date(r.wf_updated_at),
          completedAt: r.wf_completed_at ? new Date(r.wf_completed_at) : null,
        };
        return { opportunity, workflow, evidence: Object.freeze(evidenceByOppId.get(r.id) ?? []), geography };
      });
    } catch (err: any) {
      if (err?.code === "42P01") return [];
      console.warn("[ai-visibility] backlink query warning:", err?.message);
      return [];
    }
  }

  // ── Private: content observations ───────────────────────────────────────────

  private async queryContentObservations(
    userId: string,
    clientId: string,
    geography: string,
  ): Promise<ContentPostObservation[]> {
    try {
      const posts = await this.db
        .select()
        .from(socialPostsTable)
        .where(eq(socialPostsTable.userId, userId))
        .orderBy(desc(socialPostsTable.updatedAt))
        .limit(100);

      if (!posts.length) return [];

      const postIds = posts.map(p => p.id);
      const { rows: deliveryRows } = await this.pool.query<{
        id: string; post_id: string; platform: string; status: string;
        attempt_number: number; updated_at: Date; created_at: Date;
      }>(
        `SELECT id, post_id, platform, status, attempt_number, updated_at, created_at
         FROM platform_deliveries
         WHERE post_id = ANY($1)
         ORDER BY attempt_number DESC, updated_at DESC`,
        [postIds],
      );

      const deliveries: MinimalPlatformDelivery[] = deliveryRows.map(r => ({
        id: r.id, postId: r.post_id, platform: r.platform, status: r.status,
        attemptNumber: Number(r.attempt_number),
        updatedAt: new Date(r.updated_at), createdAt: new Date(r.created_at),
      }));

      return posts.map(post => ({
        clientId,
        tenantUserId: userId,
        geography,
        post: post as SocialPost,
        deliveries: Object.freeze(deliveries.filter(d => d.postId === post.id)) as any,
      }));
    } catch (err: any) {
      if (err?.code === "42P01") return [];
      console.warn("[ai-visibility] content query warning:", err?.message);
      return [];
    }
  }

  // ── Private: Google connection summary ──────────────────────────────────────

  private async queryGoogleConnection(
    userId: string,
    clientId: string,
    geography: string,
  ): Promise<ConnectedGoogleSummary> {
    try {
      const [conn] = await this.db
        .select()
        .from(socialConnectionsTable)
        .where(and(
          eq(socialConnectionsTable.userId, userId),
          eq(socialConnectionsTable.provider, "google_business"),
        ))
        .limit(1);

      return {
        clientId,
        connectionId: conn?.id ?? `no-google-connection::${clientId}`,
        geography,
        observedAt: conn?.updatedAt ?? new Date(),
        businessProfile: conn ? "connected" : "not_connected",
        searchConsole: "not_implemented",
        analytics:     "not_implemented",
      };
    } catch (err: any) {
      console.warn("[ai-visibility] google connection query warning:", err?.message);
      return {
        clientId,
        connectionId: `no-google-connection::${clientId}`,
        geography,
        observedAt: new Date(),
        businessProfile: "not_connected",
        searchConsole:   "not_implemented",
        analytics:       "not_implemented",
      };
    }
  }
}


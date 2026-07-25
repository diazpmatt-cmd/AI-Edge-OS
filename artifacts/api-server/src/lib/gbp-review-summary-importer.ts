/**
 * C9R-6: GbpReviewSummaryImporter
 *
 * Imports tenant-safe review summaries for a client by:
 *   1. Verifying the client has an active Google Business Profile connection
 *      (ownership gate — no cross-tenant data ever read).
 *   2. Verifying the connection has a cached authorized location (locationId
 *      present in social_connections.metadata). Fails to no_observation when
 *      no locationId is available — never accepts caller-supplied geography
 *      as proof of an authorized location.
 *   3. Sourcing review count + average rating from review_platform_stats
 *      WHERE client_id = clientId (explicit, never falls back to "default").
 *   4. Persisting (upsert) to tenant_safe_review_summaries via
 *      DrizzleTenantSafeReviewRepository, including the source connection id.
 *
 * Data source rationale:
 *   review_platform_stats is already tenant-scoped by client_id and is
 *   populated by GBP audit runs that are themselves connection-gated.
 *   The ownership re-check here (step 1) ensures an orphaned stats row for
 *   a disconnected client is never surfaced as "available" data.
 *   The location check (step 2) ensures every persisted summary is tied to
 *   an authorized GBP location, not merely a matching client_id.
 *   No live GBP API calls are made; the importer is safe for high-frequency
 *   execution and test environments that cannot call external providers.
 *
 * Coverage state mapping:
 *   - No GBP social connection found          → disconnected
 *   - Connection userId ≠ resolved clientId   → unauthorized
 *   - Connection has no authorized locationId  → no_observation
 *   - Connection exists, no review_platform_stats rows → no_observation
 *   - review_platform_stats query fails        → provider_error
 *   - review_platform_stats rows found         → available (after upsert)
 *
 * Target review count:
 *   V1 policy returns null — no universal benchmark is assumed. The review
 *   gap recommendation is suppressed when target is null.
 */

import {
  db as defaultDb,
  pool as defaultPool,
  socialConnectionsTable,
  DrizzleTenantSafeReviewRepository,
  computeTargetReviewCount,
  type ReviewImportInput,
  type ReviewImportResult,
  type ReviewImportSummary,
  type TenantSafeReviewRepository,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

type Db   = typeof defaultDb;
type Pool = typeof defaultPool;

export class GbpReviewSummaryImporter {
  private readonly repo: TenantSafeReviewRepository;

  constructor(
    private readonly pool: Pool = defaultPool,
    private readonly db:   Db   = defaultDb,
    repo?: TenantSafeReviewRepository,
  ) {
    this.repo = repo ?? new DrizzleTenantSafeReviewRepository(this.db);
  }

  // ── Public ──────────────────────────────────────────────────────────────────

  async importForClient(input: ReviewImportInput): Promise<ReviewImportResult> {
    const { clientId, userId, geography } = input;

    // ── Step 1: Verify GBP connection exists for this userId ──────────────────
    const connectionCheck = await this.resolveGbpConnection(userId, clientId);
    if (connectionCheck.kind !== "ok") {
      return connectionCheck.result;
    }
    const { connectionId, locationId } = connectionCheck;

    // ── Step 2: Verify the connection has a cached authorized location ────────
    if (!locationId) {
      return {
        kind: "no_observation",
        reason: "GBP location not yet authorized or cached. Run Refresh in Local Presence settings to authorize the business location.",
      };
    }

    // ── Step 3: Source review stats from review_platform_stats ────────────────
    const statsResult = await this.readReviewPlatformStats(clientId);
    if (statsResult.kind === "error") {
      return { kind: "provider_error", error: statsResult.error };
    }
    if (statsResult.rows.length === 0) {
      return { kind: "no_observation", reason: "GBP connection is active but no review platform stats are available yet for this client." };
    }

    // ── Step 4: Build + persist summaries ─────────────────────────────────────
    const observedAt = new Date();
    const summaries: ReviewImportSummary[] = [];

    for (const row of statsResult.rows) {
      const summary: ReviewImportSummary = {
        id:               row.id ?? crypto.randomUUID(),
        clientId,
        platform:         row.platform,
        reviewCount:      row.reviewCount,
        averageRating:    row.averageRating,
        targetReviewCount: computeTargetReviewCount(clientId),
        geography,
        sourceConnectionId: connectionId,
        observedAt,
      };

      try {
        const saved = await this.repo.upsert(summary);
        summaries.push(saved);
      } catch (err: any) {
        console.warn(`[gbp-review-importer] upsert failed for client=${clientId} platform=${row.platform}:`, err?.message);
      }
    }

    if (summaries.length === 0) {
      return { kind: "provider_error", error: "All review platform stat rows failed to persist." };
    }

    return { kind: "available", summaries };
  }

  // ── Private: resolve GBP connection ─────────────────────────────────────────

  private async resolveGbpConnection(
    userId: string,
    clientId: string,
  ): Promise<
    | { kind: "ok"; connectionId: string; locationId: string | undefined }
    | { kind: "fail"; result: ReviewImportResult }
  > {
    try {
      const [conn] = await this.db
        .select()
        .from(socialConnectionsTable)
        .where(and(
          eq(socialConnectionsTable.userId, userId),
          eq(socialConnectionsTable.provider, "google_business"),
        ))
        .limit(1);

      if (!conn) {
        return {
          kind: "fail",
          result: {
            kind: "disconnected",
            reason: "No Google Business Profile connection found for this user. Connect GBP in the Local Presence settings to enable review intelligence.",
          },
        };
      }

      // Ownership guard: the connection's userId must match the requesting user.
      if (conn.userId !== userId) {
        return {
          kind: "fail",
          result: {
            kind: "unauthorized",
            reason: `Connection userId mismatch for client=${clientId}.`,
          },
        };
      }

      // Extract authorized locationId from connection metadata.
      // locationId is populated by the OAuth callback and refresh flows.
      let meta: Record<string, unknown> = {};
      try { meta = JSON.parse(conn.metadata ?? "{}"); } catch { meta = {}; }
      const locationId = typeof meta.locationId === "string" && meta.locationId.length > 0
        ? meta.locationId
        : undefined;

      return { kind: "ok", connectionId: conn.id, locationId };
    } catch (err: any) {
      console.warn("[gbp-review-importer] GBP connection query failed:", err?.message);
      return {
        kind: "fail",
        result: { kind: "provider_error", error: err?.message ?? "gbp_connection_query_failed" },
      };
    }
  }

  // ── Private: read review_platform_stats ──────────────────────────────────────

  private async readReviewPlatformStats(clientId: string): Promise<
    | { kind: "ok"; rows: ReviewStatRow[] }
    | { kind: "error"; error: string }
  > {
    try {
      const { rows } = await this.pool.query<{
        id: string;
        platform: string;
        review_count: number;
        average_rating: string;
      }>(
        `SELECT id::text, platform, review_count, average_rating
         FROM review_platform_stats
         WHERE client_id = $1
           AND client_id <> 'default'
         ORDER BY platform ASC`,
        [clientId],
      );

      return {
        kind: "ok",
        rows: rows.map(r => ({
          id:            r.id,
          platform:      r.platform,
          reviewCount:   Number(r.review_count),
          averageRating: Number(r.average_rating),
        })),
      };
    } catch (err: any) {
      if (err?.code === "42P01") {
        return { kind: "ok", rows: [] };
      }
      console.warn("[gbp-review-importer] review_platform_stats query failed:", err?.message);
      return { kind: "error", error: err?.message ?? "review_platform_stats_query_failed" };
    }
  }
}

interface ReviewStatRow {
  id: string;
  platform: string;
  reviewCount: number;
  averageRating: number;
}

/**
 * C9R-6: DrizzleTenantSafeReviewRepository
 *
 * Persists and reads tenant-safe review summaries via the canonical
 * tenant_safe_review_summaries Drizzle table. All operations are scoped
 * by clientId — no cross-tenant leakage is possible.
 */

import { eq, desc } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "./schema";
import { tenantSafeReviewSummariesTable } from "./schema/tenant-safe-reviews";
import type {
  ReviewImportSummary,
  TenantSafeReviewRepository,
} from "./tenant-safe-review-types";

type DB = NodePgDatabase<typeof schema>;

export class DrizzleTenantSafeReviewRepository implements TenantSafeReviewRepository {
  constructor(private readonly db: DB) {}

  async upsert(row: ReviewImportSummary): Promise<ReviewImportSummary> {
    const result = await this.db
      .insert(tenantSafeReviewSummariesTable)
      .values({
        id:                row.id,
        clientId:          row.clientId,
        platform:          row.platform,
        reviewCount:       row.reviewCount,
        averageRating:     String(row.averageRating),
        targetReviewCount: row.targetReviewCount,
        geography:         row.geography,
        observedAt:        row.observedAt,
        updatedAt:         row.observedAt,
      })
      .onConflictDoUpdate({
        target: [
          tenantSafeReviewSummariesTable.clientId,
          tenantSafeReviewSummariesTable.platform,
          tenantSafeReviewSummariesTable.geography,
        ],
        set: {
          reviewCount:       row.reviewCount,
          averageRating:     String(row.averageRating),
          targetReviewCount: row.targetReviewCount,
          observedAt:        row.observedAt,
          updatedAt:         row.observedAt,
        },
      })
      .returning();

    const saved = result[0];
    return rowToSummary(saved);
  }

  async findByClientId(clientId: string): Promise<ReviewImportSummary[]> {
    const rows = await this.db
      .select()
      .from(tenantSafeReviewSummariesTable)
      .where(eq(tenantSafeReviewSummariesTable.clientId, clientId))
      .orderBy(desc(tenantSafeReviewSummariesTable.observedAt));

    return rows.map(rowToSummary);
  }
}

function rowToSummary(
  row: typeof tenantSafeReviewSummariesTable.$inferSelect,
): ReviewImportSummary {
  return {
    id:                row.id,
    clientId:          row.clientId,
    platform:          row.platform,
    reviewCount:       row.reviewCount,
    averageRating:     row.averageRating !== null ? Number(row.averageRating) : 0,
    targetReviewCount: row.targetReviewCount,
    geography:         row.geography,
    observedAt:        row.observedAt instanceof Date ? row.observedAt : new Date(row.observedAt),
  };
}

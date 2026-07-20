import { pgTable, text, integer, numeric, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * C9R-6: Canonical tenant-safe review summaries.
 *
 * One row per (client_id, platform, geography). Populated by the GBP Review
 * Summary Importer after verifying GBP connection ownership. Never stores raw
 * review text, access tokens, or cross-tenant data.
 *
 * Idempotent upsert key: (client_id, platform, geography).
 */
export const tenantSafeReviewSummariesTable = pgTable("tenant_safe_review_summaries", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  clientId:           text("client_id").notNull(),
  platform:           text("platform").notNull(),
  reviewCount:        integer("review_count").notNull(),
  averageRating:      numeric("average_rating", { precision: 3, scale: 2 }),
  targetReviewCount:  integer("target_review_count").notNull(),
  geography:          text("geography").notNull(),
  sourceConnectionId: text("source_connection_id"),
  observedAt:         timestamp("observed_at", { withTimezone: true }).notNull(),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("tsrs_client_platform_geo_uniq").on(t.clientId, t.platform, t.geography),
]);

export type TenantSafeReviewSummaryRow = typeof tenantSafeReviewSummariesTable.$inferSelect;
export type TenantSafeReviewSummaryInsert = typeof tenantSafeReviewSummariesTable.$inferInsert;

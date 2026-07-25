import { pgTable, text, integer, numeric, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

/**
 * C9R-6: Canonical tenant-safe review summaries.
 *
 * One row per (client_id, platform, geography). Populated by the GBP Review
 * Summary Importer after verifying GBP connection ownership and confirming
 * the connection has a cached authorized location (locationId present in
 * social_connections.metadata).
 *
 * Never stores raw review text, access tokens, or cross-tenant data.
 *
 * Idempotent upsert key: (client_id, platform, geography).
 * FK: client_id → clients.id ON DELETE CASCADE.
 *
 * target_review_count is nullable: null means no defensible target is
 * available for this tenant in V1. Recommendations depending on the review
 * gap are not generated when target is null.
 */
export const tenantSafeReviewSummariesTable = pgTable("tenant_safe_review_summaries", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  clientId:           uuid("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  platform:           text("platform").notNull(),
  reviewCount:        integer("review_count").notNull(),
  averageRating:      numeric("average_rating", { precision: 3, scale: 2 }),
  targetReviewCount:  integer("target_review_count"),
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

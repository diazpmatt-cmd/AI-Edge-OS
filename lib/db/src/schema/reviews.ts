import { pgTable, serial, text, integer, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reviewRequestsTable = pgTable("review_requests", {
  id:           serial("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  contact:      text("contact").notNull(),
  contactType:  text("contact_type").notNull(),
  platform:     text("platform").notNull().default("google"),
  templateId:   text("template_id"),
  sentAt:       timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  status:       text("status").notNull().default("sent"),
  notes:        text("notes"),
});

export const reviewPlatformStatsTable = pgTable("review_platform_stats", {
  id:            serial("id").primaryKey(),
  clientId:      text("client_id").notNull().default("default"),
  platform:      text("platform").notNull(),
  reviewCount:   integer("review_count").notNull().default(0),
  averageRating: numeric("average_rating", { precision: 3, scale: 2 }).notNull().default("0.00"),
  lastUpdated:   timestamp("last_updated", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("rps_client_platform_uniq").on(t.clientId, t.platform),
]);

export const insertReviewRequestSchema = createInsertSchema(reviewRequestsTable).omit({ id: true, sentAt: true });
export type InsertReviewRequest = z.infer<typeof insertReviewRequestSchema>;
export type ReviewRequest = typeof reviewRequestsTable.$inferSelect;
export type ReviewPlatformStat = typeof reviewPlatformStatsTable.$inferSelect;

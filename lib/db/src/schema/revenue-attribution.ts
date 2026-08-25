import { check, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const revenueAttributionTable = pgTable("revenue_attribution", {
  id:               uuid("id").primaryKey().defaultRandom(),
  leadId:           text("lead_id"),
  clientId:         text("client_id").notNull(),
  customerName:     text("customer_name").notNull(),
  phone:            text("phone"),
  leadSource:       text("lead_source").notNull(),
  status:           text("status").notNull().default("pending"),
  revenue:          numeric("revenue", { precision: 10, scale: 2 }),
  serviceType:      text("service_type"),
  notes:            text("notes"),
  gorilladeskJobId: text("gorilladesk_job_id"),
  matchedAt:        timestamp("matched_at", { withTimezone: true }),
  matchMethod:      text("match_method"),
  matchConfidence:  integer("match_confidence"),
  evidenceSource:   text("evidence_source"),
  evidenceObservedAt: timestamp("evidence_observed_at", { withTimezone: true }),
  evidenceCustomerId: text("evidence_customer_id"),
  verifiedAt:       timestamp("verified_at", { withTimezone: true }),
  verifiedByUserId: text("verified_by_user_id"),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  check("revenue_attribution_match_confidence_bounds", sql`${table.matchConfidence} IS NULL OR (${table.matchConfidence} >= 0 AND ${table.matchConfidence} <= 100)`),
]);

export type RevenueAttribution       = typeof revenueAttributionTable.$inferSelect;
export type InsertRevenueAttribution = typeof revenueAttributionTable.$inferInsert;

import { pgTable, text, timestamp, uuid, numeric } from "drizzle-orm/pg-core";

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
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type RevenueAttribution       = typeof revenueAttributionTable.$inferSelect;
export type InsertRevenueAttribution = typeof revenueAttributionTable.$inferInsert;

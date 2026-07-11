import { pgTable, text, boolean, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Canonical client identity table — Phase B1.
 *
 * One row per tenant (user_id). Stores durable business metadata that
 * does NOT change with content configuration. Content scheduling config
 * lives in auto_content_settings and is joined by the resolver.
 *
 * SAFETY RULES:
 * - user_id is the tenant identifier (Clerk userId). UNIQUE — one client per user.
 * - slug is a stable human-readable identifier. UNIQUE across all clients.
 * - is_active = false clients must be rejected at the resolver layer before
 *   any content context is built.
 * - This table is bootstrapped via raw SQL in client-resolver.ts (drizzle-kit
 *   push is blocked by a pre-existing constraint conflict in this DB).
 */
export const clientsTable = pgTable("clients", {
  id:            uuid("id").primaryKey().defaultRandom(),
  userId:        text("user_id").notNull().unique(),
  slug:          text("slug").notNull().unique(),
  clientName:    text("client_name").notNull(),
  industry:      text("industry").notNull().default("pest_control"),
  industryLabel: text("industry_label").notNull().default("pest control"),
  region:        text("region").notNull().default(""),
  serviceAreas:  text("service_areas").notNull().default("[]"),
  timezone:      text("timezone").notNull().default("America/Chicago"),
  isActive:      boolean("is_active").notNull().default(true),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/** Inferred DB row type — structurally compatible with the ClientRecord interface in client-context.ts. */
export type ClientRecord = typeof clientsTable.$inferSelect;

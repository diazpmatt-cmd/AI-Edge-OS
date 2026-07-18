/**
 * GBP Optimization Opportunities — Schema
 *
 * DDL ownership (same convention as gbp-audit.ts):
 *   - artifacts/api-server/src/lib/schema-migrate.ts  ← canonical CREATE TABLE
 *   - artifacts/api-server/src/routes/gbp-audit.ts    ← ALTER TABLE guards only
 * Do NOT use drizzle-kit push for this table.
 * When you add a column here, update BOTH files above.
 */

import {
  pgTable, text, integer, boolean, timestamp, uuid,
} from "drizzle-orm/pg-core";

export const gbpOptimizationOpportunitiesTable = pgTable("gbp_optimization_opportunities", {
  id:           uuid("id").primaryKey().defaultRandom(),
  snapshotId:   text("snapshot_id").notNull(),
  clientId:     text("client_id").notNull(),
  checkKey:     text("check_key").notNull(),

  category:     text("category").notNull(),
  title:        text("title").notNull(),
  description:  text("description").notNull(),

  severity:                 text("severity").notNull().default("Medium"),
  priorityScore:            integer("priority_score").notNull().default(0),
  estimatedImpact:          integer("estimated_impact").notNull().default(0),
  implementationDifficulty: text("implementation_difficulty").notNull().default("Moderate"),
  confidence:               integer("confidence").notNull().default(0),

  evidence:                  text("evidence").notNull().default(""),
  recommendedAction:         text("recommended_action").notNull().default(""),
  supportingGoogleGuideline: text("supporting_google_guideline"),

  groupName:      text("group_name").notNull().default("needs_attention"),
  trend:          text("trend"),
  timeEstimate:   text("time_estimate"),
  aiFixAvailable: boolean("ai_fix_available").notNull().default(false),
  checkStatus:    text("check_status").notNull().default("fail"),

  resolved:   boolean("resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GbpOptimizationOpportunity      = typeof gbpOptimizationOpportunitiesTable.$inferSelect;
export type InsertGbpOptimizationOpportunity = typeof gbpOptimizationOpportunitiesTable.$inferInsert;

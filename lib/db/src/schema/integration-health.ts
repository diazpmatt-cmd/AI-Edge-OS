import { pgTable, text, integer, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Integration health history — one row per provider per health check.
// NEVER stores OAuth tokens, refresh tokens, API keys, or secrets.
// Only sanitized status, error codes, and non-sensitive metadata.
export const integrationHealthHistoryTable = pgTable("integration_health_history", {
  id:             uuid("id").primaryKey().defaultRandom(),
  userId:         text("user_id").notNull(),
  provider:       text("provider").notNull(),
  status:         text("status").notNull(),          // "healthy" | "warning" | "failed"
  checkedAt:      timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  lastSuccessAt:  timestamp("last_success_at", { withTimezone: true }),
  responseTimeMs: integer("response_time_ms"),
  errorCode:      text("error_code"),
  errorMessage:   text("error_message"),             // sanitized, max 300 chars, no secrets
  healthScore:    integer("health_score"),            // 100=healthy, 50=warning, 0=failed
  metadata:       jsonb("metadata"),                 // non-sensitive only
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertIntegrationHealthSchema = createInsertSchema(integrationHealthHistoryTable)
  .omit({ id: true, createdAt: true });
export type InsertIntegrationHealth = z.infer<typeof insertIntegrationHealthSchema>;
export type IntegrationHealth = typeof integrationHealthHistoryTable.$inferSelect;

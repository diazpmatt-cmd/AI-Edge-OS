import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const leadAuditEventsTable = pgTable("lead_audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id").notNull(),
  action: text("action").notNull(),
  actorType: text("actor_type").notNull().default("system"),
  actorId: text("actor_id"),
  previousState: jsonb("previous_state"),
  nextState: jsonb("next_state"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  leadCreatedAtIdx: index("lead_audit_events_lead_created_at_idx").on(table.leadId, table.createdAt),
}));

export type LeadAuditEvent = typeof leadAuditEventsTable.$inferSelect;
export type NewLeadAuditEvent = typeof leadAuditEventsTable.$inferInsert;

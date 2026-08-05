import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const customerJourneyEventsTable = pgTable("customer_journey_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull(),
  eventType: text("event_type").notNull(),
  source: text("source").notNull(),
  normalizedPhone: text("normalized_phone"),
  normalizedEmail: text("normalized_email"),
  canonicalRecordType: text("canonical_record_type"),
  canonicalRecordId: text("canonical_record_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CustomerJourneyEvent = typeof customerJourneyEventsTable.$inferSelect;

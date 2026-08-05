import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const communicationEndpointsTable = pgTable("communication_endpoints", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull(),
  clientName: text("client_name").notNull(),
  provider: text("provider").notNull(),
  e164Number: text("e164_number").notNull(),
  purpose: text("purpose").notNull().default("voice_sms"),
  verified: boolean("verified").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, table => ({ providerNumberUnique: uniqueIndex("communication_endpoints_provider_number_uniq").on(table.provider, table.e164Number) }));

export type CommunicationEndpoint = typeof communicationEndpointsTable.$inferSelect;

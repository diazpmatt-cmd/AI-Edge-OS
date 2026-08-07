import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Canonical client-owned discovery/authority configuration.
 *
 * This table stores only the tenant's own research boundary. Competitor truth
 * stays in the canonical competitors table and provider observations stay in
 * their engine-specific evidence tables.
 *
 * Safety rules:
 * - one profile per client_id
 * - discovery is disabled by default
 * - primary_domain is the normalized bare domain owned by the client
 * - primary_city / primary_region map explicitly to provider discovery inputs
 * - geography/service scopes are explicit arrays; scheduled authority work must
 *   fail closed when required scope is missing
 */
export const authorityProfilesTable = pgTable(
  "authority_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: text("client_id").notNull(),
    primaryDomain: text("primary_domain").notNull(),
    primaryWebsite: text("primary_website"),
    primaryCity: text("primary_city"),
    primaryRegion: text("primary_region"),
    geographyJson: jsonb("geography_json").notNull().default([]),
    serviceIdsJson: jsonb("service_ids_json").notNull().default([]),
    discoveryEnabled: boolean("discovery_enabled").notNull().default(false),
    source: text("source").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ([
    uniqueIndex("authority_profiles_client_uniq").on(table.clientId),
    index("authority_profiles_domain_idx").on(table.primaryDomain),
  ]),
);

export type AuthorityProfile = typeof authorityProfilesTable.$inferSelect;
export type InsertAuthorityProfile = typeof authorityProfilesTable.$inferInsert;

import { pgTable, text, boolean, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

/**
 * Per-client service catalog — Phase B2.
 *
 * One row per service per client. A service key is stable across clients (e.g.
 * "bed_bug_inspection") but the record is scoped to a single client_id —
 * the same service_key may appear for different clients without collision.
 *
 * Schema rules:
 * - service_key must be stable; never derive service identity from display_name.
 * - Capability flags default to TRUE; hard-locked services (termites, wildlife)
 *   must be seeded with all flags = FALSE and must never be overridden at runtime.
 * - JSON text columns (supported_audiences, etc.) are always valid JSON arrays.
 * - prompt_rule_prefix stores the service-specific AI prompt header (multi-line
 *   string) or NULL when no special header is needed.
 * - sort_order preserves the canonical ordering used by weekly-plan selection.
 *
 * This table is bootstrapped via raw SQL + TypeScript seed in
 * artifacts/api-server/src/lib/service-registry-loader.ts.
 * drizzle-kit push is blocked by a pre-existing constraint conflict in this DB.
 */
export const clientServicesTable = pgTable("client_services", {
  id:                     uuid("id").primaryKey().defaultRandom(),
  clientId:               uuid("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  serviceKey:             text("service_key").notNull(),
  displayName:            text("display_name").notNull(),
  shortName:              text("short_name"),
  category:               text("category").notNull(),
  description:            text("description").notNull().default(""),
  status:                 text("status").notNull().default("active"),

  // Capability flags
  allowAiGeneration:      boolean("allow_ai_generation").notNull().default(true),
  allowBooking:           boolean("allow_booking").notNull().default(true),
  allowCta:               boolean("allow_cta").notNull().default(true),
  allowPublishing:        boolean("allow_publishing").notNull().default(true),
  allowRecommendation:    boolean("allow_recommendation").notNull().default(true),

  // JSON text arrays
  supportedAudiences:     text("supported_audiences").notNull().default("[]"),
  campaignGoals:          text("campaign_goals").notNull().default("[]"),
  allowedContentAngles:   text("allowed_content_angles").notNull().default("[]"),
  prohibitedClaims:       text("prohibited_claims").notNull().default("[]"),
  differentiators:        text("differentiators").notNull().default("[]"),

  // Selection weights / scheduling
  priority:               integer("priority").notNull().default(5),
  revenueWeight:          integer("revenue_weight").notNull().default(5),
  contentFrequencyWeight: integer("content_frequency_weight").notNull().default(5),
  urgency:                text("urgency").notNull().default("medium"),
  seasonality:            text("seasonality"),

  // AI prompt
  promptRulePrefix:       text("prompt_rule_prefix"),
  notes:                  text("notes").notNull().default(""),
  sortOrder:              integer("sort_order").notNull().default(0),
  isActive:               boolean("is_active").notNull().default(true),

  createdAt:              timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:              timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/**
 * Canonical topic aliases for service matching — Phase B2.
 *
 * Supplements the display-name / service-key matching algorithm with explicit
 * alias records. The algorithm checks service_key and display_name first; this
 * table is for future extensibility and for marking weekly/default eligibility
 * per alias.
 */
export const clientServiceTopicsTable = pgTable("client_service_topics", {
  id:                   uuid("id").primaryKey().defaultRandom(),
  serviceId:            uuid("service_id").notNull().references(() => clientServicesTable.id, { onDelete: "cascade" }),
  alias:                text("alias").notNull(),
  normalizedAlias:      text("normalized_alias").notNull(),
  isPrimary:            boolean("is_primary").notNull().default(false),
  weeklyEligible:       boolean("weekly_eligible").notNull().default(true),
  defaultTopicEligible: boolean("default_topic_eligible").notNull().default(true),
  prohibitedWording:    text("prohibited_wording"),
  preferredWording:     text("preferred_wording"),
  createdAt:            timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Client-level service registry rules — Phase B2.
 *
 * One row per client. Stores the system_business_rules text that is appended
 * to every AI system prompt for this client. For BB&B this is seeded from
 * bbbRegistryProvider.getSystemBusinessRules() to guarantee exact parity.
 */
export const clientRegistryRulesTable = pgTable("client_registry_rules", {
  id:                  uuid("id").primaryKey().defaultRandom(),
  clientId:            uuid("client_id").notNull().unique().references(() => clientsTable.id, { onDelete: "cascade" }),
  systemBusinessRules: text("system_business_rules").notNull().default(""),
  registryVersion:     integer("registry_version").notNull().default(1),
  createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ClientService      = typeof clientServicesTable.$inferSelect;
export type ClientServiceTopic = typeof clientServiceTopicsTable.$inferSelect;
export type ClientRegistryRules = typeof clientRegistryRulesTable.$inferSelect;

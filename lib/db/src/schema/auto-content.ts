import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const autoContentSettingsTable = pgTable("auto_content_settings", {
  id:                  uuid("id").primaryKey().defaultRandom(),
  userId:              text("user_id").notNull().unique(),
  clientName:          text("client_name").notNull().default("Bed Bugs & Beyond"),
  industry:            text("industry"),
  serviceAreas:        text("service_areas").notNull().default("[]"),
  topics:              text("topics").notNull().default("[]"),
  frequency:           text("frequency").notNull().default("every_other_day"),
  postingTimes:        text("posting_times").notNull().default('["08:00","12:00","17:00"]'),
  platforms:           text("platforms").notNull().default('["facebook"]'),
  approvalMode:        text("approval_mode").notNull().default("auto_schedule"),
  ctaText:             text("cta_text").notNull().default("Call Now \u2014 (251) 324-9090"),
  ctaPreference:       text("cta_preference"),
  toneStyle:           text("tone_style"),
  postAngles:          text("post_angles"),
  autoGenerateEnabled: text("auto_generate_enabled"),
  enginePaused:        text("engine_paused"),
  usedCombos:          text("used_combos").notNull().default("[]"),
  lastGeneratedAt:     timestamp("last_generated_at", { withTimezone: true }),
  // V5: Campaign configuration
  nextGenerationAt:    timestamp("next_generation_at", { withTimezone: true }),
  campaignMix:         text("campaign_mix"),       // JSON: {revenue:60,education:25,trust:15}
  selectedAudiences:   text("selected_audiences"), // JSON: string[] of audienceIds
  createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AutoContentSettings = typeof autoContentSettingsTable.$inferSelect;

import { pgTable, text, integer, timestamp, uuid } from "drizzle-orm/pg-core";

export const aiVisibilityAuditsTable = pgTable("ai_visibility_audits", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  clientId:           text("client_id").notNull().default("default"),
  businessName:       text("business_name").notNull().default(""),
  overallScore:       integer("overall_score").notNull().default(0),
  searchScore:        integer("search_score").notNull().default(0),
  mapsScore:          integer("maps_score").notNull().default(0),
  aiSearchScore:      integer("ai_search_score").notNull().default(0),
  authorityScore:     integer("authority_score").notNull().default(0),
  reviewScore:        integer("review_score").notNull().default(0),
  competitorGapScore: integer("competitor_gap_score").notNull().default(0),
  channelsJson:       text("channels_json").notNull().default("[]"),
  competitorsJson:    text("competitors_json").notNull().default("[]"),
  recommendationsJson:text("recommendations_json").notNull().default("[]"),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AiVisibilityAudit = typeof aiVisibilityAuditsTable.$inferSelect;
export type InsertAiVisibilityAudit = typeof aiVisibilityAuditsTable.$inferInsert;

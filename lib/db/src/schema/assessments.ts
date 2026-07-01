import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";

export const assessmentsTable = pgTable("assessments", {
  id:              uuid("id").primaryKey().defaultRandom(),
  businessName:    text("business_name").notNull(),
  industry:        text("industry").notNull(),
  city:            text("city").notNull(),
  state:           text("state").notNull(),
  websiteUrl:      text("website_url"),
  gbpUrl:          text("gbp_url"),
  facebookUrl:     text("facebook_url"),
  instagramUrl:    text("instagram_url"),
  contactName:     text("contact_name").notNull(),
  contactEmail:    text("contact_email").notNull(),
  contactPhone:    text("contact_phone"),
  contactMethod:   text("contact_method"),
  scoreOverall:    integer("score_overall"),
  scoreLeadRecovery:    integer("score_lead_recovery"),
  scoreLocalPresence:   integer("score_local_presence"),
  scoreAiVisibility:    integer("score_ai_visibility"),
  scoreReviewStrength:  integer("score_review_strength"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Assessment = typeof assessmentsTable.$inferSelect;
export type InsertAssessment = typeof assessmentsTable.$inferInsert;

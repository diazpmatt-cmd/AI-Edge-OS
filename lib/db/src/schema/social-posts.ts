import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const socialPostsTable = pgTable("social_posts", {
  id:           uuid("id").primaryKey().defaultRandom(),
  userId:       text("user_id").notNull(),
  clientName:   text("client_name").notNull().default(""),
  platforms:    text("platforms").notNull().default("[]"),
  imageData:    text("image_data"),
  caption:      text("caption").notNull().default(""),
  ctaType:      text("cta_type").notNull().default("none"),
  ctaValue:     text("cta_value"),
  scheduledAt:  timestamp("scheduled_at", { withTimezone: true }),
  status:       text("status").notNull().default("draft"),
  publishedAt:  timestamp("published_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  aiCity:       text("ai_city"),
  aiTopic:      text("ai_topic"),
  aiAngle:      text("ai_angle"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSocialPostSchema = createInsertSchema(socialPostsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSocialPost = z.infer<typeof insertSocialPostSchema>;
export type SocialPost = typeof socialPostsTable.$inferSelect;

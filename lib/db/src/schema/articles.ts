import { pgTable, text, integer, timestamp, uuid, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const articleDraftsTable = pgTable("article_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  keyword: text("keyword").notNull(),
  keywordId: uuid("keyword_id"),
  service: text("service").notNull(),
  project: text("project").notNull(),
  body: text("body").notNull().default(""),
  metaTitle: text("meta_title").notNull().default(""),
  metaDescription: text("meta_description").notNull().default(""),
  slug: text("slug").notNull(),
  status: text("status").notNull().default("scheduled"),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  publishedUrl: text("published_url"),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  verifiedLiveAt: timestamp("verified_live_at", { withTimezone: true }),
  lastStatusCode: integer("last_status_code"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertArticleDraftSchema = createInsertSchema(articleDraftsTable).omit({ createdAt: true, updatedAt: true });
export type InsertArticleDraft = z.infer<typeof insertArticleDraftSchema>;
export type ArticleDraft = typeof articleDraftsTable.$inferSelect;

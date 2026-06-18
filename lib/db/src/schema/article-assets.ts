import { pgTable, text, timestamp, uuid, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const articleAssetsTable = pgTable("article_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  articleId: uuid("article_id").notNull(),
  channel: text("channel").notNull(),
  body: text("body").notNull().default(""),
  status: text("status").notNull().default("draft"),
  publishedUrl: text("published_url"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("article_assets_article_channel").on(t.articleId, t.channel),
]);

export const insertArticleAssetSchema = createInsertSchema(articleAssetsTable).omit({ id: true, updatedAt: true });
export type InsertArticleAsset = z.infer<typeof insertArticleAssetSchema>;
export type ArticleAsset = typeof articleAssetsTable.$inferSelect;

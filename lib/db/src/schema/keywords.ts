import { pgTable, text, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const keywordsTable = pgTable("keywords", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  keyword: text("keyword").notNull(),
  volume: integer("volume").notNull().default(0),
  difficulty: text("difficulty").notNull().default("Medium"),
  intent: text("intent").notNull().default("Local"),
  service: text("service").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertKeywordSchema = createInsertSchema(keywordsTable).omit({ id: true, createdAt: true });
export type InsertKeyword = z.infer<typeof insertKeywordSchema>;
export type Keyword = typeof keywordsTable.$inferSelect;

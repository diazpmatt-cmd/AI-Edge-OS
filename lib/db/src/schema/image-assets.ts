import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const imageAssetsTable = pgTable("image_assets", {
  id:         uuid("id").primaryKey().defaultRandom(),
  userId:     text("user_id").notNull(),
  fileUrl:    text("file_url").notNull(),
  fileName:   text("file_name").notNull(),
  topicTags:  text("topic_tags").notNull().default("[]"),
  cityTags:   text("city_tags").notNull().default("[]"),
  category:   text("category").notNull().default(""),
  uploadDate: timestamp("upload_date", { withTimezone: true }).notNull().defaultNow(),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ImageAsset = typeof imageAssetsTable.$inferSelect;

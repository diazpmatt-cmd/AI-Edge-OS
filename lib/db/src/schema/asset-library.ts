import { pgTable, text, timestamp, uuid, boolean, integer } from "drizzle-orm/pg-core";

// ── assets ────────────────────────────────────────────────────────────────────
export const assetsTable = pgTable("assets", {
  id:           uuid("id").primaryKey().defaultRandom(),
  userId:       text("user_id").notNull(),
  clientId:     text("client_id").notNull().default(""),
  brand:        text("brand").notNull().default(""),
  assetType:    text("asset_type").notNull().default(""),
  name:         text("name").notNull(),
  fileUrl:      text("file_url").notNull().default(""),
  thumbnailUrl: text("thumbnail_url").notNull().default(""),
  mimeType:     text("mime_type").notNull().default(""),
  fileSize:     integer("file_size").notNull().default(0),
  tags:         text("tags").notNull().default("[]"),
  isFavorite:   boolean("is_favorite").notNull().default(false),
  sourceModule: text("source_module").notNull().default(""),
  metadata:     text("metadata").notNull().default("{}"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Asset = typeof assetsTable.$inferSelect;
export type NewAsset = typeof assetsTable.$inferInsert;

// ── asset_collections ─────────────────────────────────────────────────────────
export const assetCollectionsTable = pgTable("asset_collections", {
  id:          uuid("id").primaryKey().defaultRandom(),
  userId:      text("user_id").notNull(),
  clientId:    text("client_id").notNull().default(""),
  name:        text("name").notNull(),
  description: text("description").notNull().default(""),
  brand:       text("brand").notNull().default(""),
  coverUrl:    text("cover_url").notNull().default(""),
  metadata:    text("metadata").notNull().default("{}"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AssetCollection = typeof assetCollectionsTable.$inferSelect;
export type NewAssetCollection = typeof assetCollectionsTable.$inferInsert;

// ── asset_collection_items ────────────────────────────────────────────────────
export const assetCollectionItemsTable = pgTable("asset_collection_items", {
  id:           uuid("id").primaryKey().defaultRandom(),
  collectionId: uuid("collection_id").notNull(),
  assetId:      uuid("asset_id").notNull(),
  sortOrder:    integer("sort_order").notNull().default(0),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AssetCollectionItem = typeof assetCollectionItemsTable.$inferSelect;

// ── asset_tags ────────────────────────────────────────────────────────────────
export const assetTagsTable = pgTable("asset_tags", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    text("user_id").notNull(),
  tag:       text("tag").notNull(),
  color:     text("color").notNull().default("#00AEEF"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AssetTag = typeof assetTagsTable.$inferSelect;

// ── asset_usage_events ────────────────────────────────────────────────────────
export const assetUsageEventsTable = pgTable("asset_usage_events", {
  id:          uuid("id").primaryKey().defaultRandom(),
  userId:      text("user_id").notNull(),
  assetId:     uuid("asset_id").notNull().default("00000000-0000-0000-0000-000000000000"),
  assetType:   text("asset_type").notNull().default(""),
  eventType:   text("event_type").notNull().default(""),
  sourceModule: text("source_module").notNull().default(""),
  metadata:    text("metadata").notNull().default("{}"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AssetUsageEvent = typeof assetUsageEventsTable.$inferSelect;

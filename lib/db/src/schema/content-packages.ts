import { pgTable, text, timestamp, uuid, unique } from "drizzle-orm/pg-core";

export const contentPackagesTable = pgTable("content_packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  businessName: text("business_name").notNull(),
  service: text("service").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  keyword: text("keyword").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const contentAssetsTable = pgTable("content_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  packageId: uuid("package_id").notNull().references(() => contentPackagesTable.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  label: text("label").notNull().default(""),
  body: text("body").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("content_assets_pkg_channel").on(t.packageId, t.channel),
]);

export const socialConnectionsTable = pgTable("social_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  provider: text("provider").notNull(),
  accountName: text("account_name"),
  accountId: text("account_id"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("social_connections_user_provider").on(t.userId, t.provider),
]);

export type ContentPackage = typeof contentPackagesTable.$inferSelect;
export type ContentAsset = typeof contentAssetsTable.$inferSelect;
export type SocialConnection = typeof socialConnectionsTable.$inferSelect;

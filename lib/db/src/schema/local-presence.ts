import { pgTable, text, integer, timestamp, uuid, unique } from "drizzle-orm/pg-core";

export const localPresenceProfilesTable = pgTable("local_presence_profiles", {
  id:             uuid("id").primaryKey().defaultRandom(),
  clientId:       text("client_id").notNull().unique(),
  businessName:   text("business_name").notNull().default(""),
  phone:          text("phone"),
  website:        text("website"),
  address:        text("address"),
  city:           text("city"),
  state:          text("state"),
  zip:            text("zip"),
  napJson:        text("nap_json"),
  description:       text("description"),
  categoriesJson:    text("categories_json"),
  hoursJson:         text("hours_json"),
  serviceAreasJson:  text("service_areas_json"),
  attributesJson:    text("attributes_json"),
  photosJson:        text("photos_json"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const localPresenceChannelsTable = pgTable("local_presence_channels", {
  id:                  uuid("id").primaryKey().defaultRandom(),
  clientId:            text("client_id").notNull(),
  channelName:         text("channel_name").notNull(),
  status:              text("status").notNull().default("not_started"),
  score:               integer("score").notNull().default(0),
  listingUrl:          text("listing_url"),
  verificationStatus:  text("verification_status"),
  recommendedAction:   text("recommended_action"),
  metadataJson:        text("metadata_json"),
  completenessScore:   integer("completeness_score").notNull().default(0),
  lastSyncAt:          timestamp("last_sync_at", { withTimezone: true }),
  providerId:          text("provider_id"),
  nextSyncAt:          timestamp("next_sync_at", { withTimezone: true }),
  healthScore:         integer("health_score").notNull().default(0),
  issuesJson:          text("issues_json"),
  createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  clientChannelUniq: unique().on(t.clientId, t.channelName),
}));

export type LocalPresenceProfile = typeof localPresenceProfilesTable.$inferSelect;
export type LocalPresenceChannel = typeof localPresenceChannelsTable.$inferSelect;

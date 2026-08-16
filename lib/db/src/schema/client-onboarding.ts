import { pgTable, text, boolean, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientOnboardingTable = pgTable("client_onboarding", {
  id:                  uuid("id").primaryKey().defaultRandom(),
  createdByUserId:     text("created_by_user_id"),
  provisionedClientId:  uuid("provisioned_client_id"),
  provisionedAt:        timestamp("provisioned_at", { withTimezone: true }),
  businessName:        text("business_name").notNull(),
  industry:            text("industry").notNull().default(""),
  website:             text("website").default(""),
  mainPhone:           text("main_phone").notNull().default(""),
  forwardingPhone:     text("forwarding_phone").default(""),
  email:               text("email").default(""),
  city:                text("city").default(""),
  state:               text("state").default(""),
  zip:                 text("zip").default(""),
  serviceRadius:       text("service_radius").default(""),
  businessHours:       text("business_hours").default("Mon–Fri 8am–6pm"),
  emergencyService:    boolean("emergency_service").default(false),
  appointmentRequired: boolean("appointment_required").default(false),
  services:            text("services").default(""),
  logoUrl:             text("logo_url").default(""),
  primaryColor:        text("primary_color").default("#00AEEF"),
  secondaryColor:      text("secondary_color").default("#C0C0C0"),
  brandTone:           text("brand_tone").default("professional"),
  modulesEnabled:      text("modules_enabled").default("[]"),
  status:              text("status").notNull().default("draft"),
  createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertClientOnboardingSchema = createInsertSchema(clientOnboardingTable).omit({
  id: true, provisionedClientId: true, provisionedAt: true, createdAt: true, updatedAt: true,
});
export type InsertClientOnboarding = z.infer<typeof insertClientOnboardingSchema>;
export type ClientOnboarding = typeof clientOnboardingTable.$inferSelect;

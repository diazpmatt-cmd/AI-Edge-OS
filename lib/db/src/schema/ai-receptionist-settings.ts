import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const aiReceptionistSettingsTable = pgTable("ai_receptionist_settings", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  clientId:           text("client_id").notNull().unique(),
  businessName:       text("business_name").notNull().default("My Business"),
  transferPhone:      text("transfer_phone").notNull().default(""),
  greetingScript:     text("greeting_script"),
  callbackMessage:    text("callback_message"),
  voicemailMessage:   text("voicemail_message"),
  textRoutingMessage: text("text_routing_message"),
  customGreetingUrl:  text("custom_greeting_url"),
  voiceStyle:         text("voice_style").notNull().default("Polly.Joanna"),
  businessHoursJson:  text("business_hours_json"),
  afterHoursMode:     text("after_hours_mode").notNull().default("voicemail"),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AiReceptionistSettings       = typeof aiReceptionistSettingsTable.$inferSelect;
export type InsertAiReceptionistSettings = typeof aiReceptionistSettingsTable.$inferInsert;

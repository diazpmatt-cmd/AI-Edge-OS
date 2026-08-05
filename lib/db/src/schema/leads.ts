import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const leadsTable = pgTable("leads", {
  id:           uuid("id").primaryKey().defaultRandom(),
  clientId:     uuid("client_id"),
  clientName:   text("client_name").notNull().default(""),
  source:       text("source").notNull().default("telnyx"),
  phone:        text("phone").notNull().default(""),
  customerName: text("customer_name"),
  message:      text("message"),
  eventType:    text("event_type").notNull().default("sms"),
  status:       text("status").notNull().default("new"),
  notes:        text("notes"),
  service:      text("service"),
  location:     text("location"),
  urgency:      text("urgency").notNull().default("normal"),
  sourceMessageId: text("source_message_id"),
  draftResponse:   text("draft_response"),
  responseStatus:  text("response_status").notNull().default("pending"),
  receivedAt:      timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  lastFollowUpAt:  timestamp("last_follow_up_at", { withTimezone: true }),
  outcome:         text("outcome"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLeadSchema = createInsertSchema(leadsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;

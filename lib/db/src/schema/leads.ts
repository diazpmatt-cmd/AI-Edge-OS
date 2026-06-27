import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const leadsTable = pgTable("leads", {
  id:           uuid("id").primaryKey().defaultRandom(),
  clientName:   text("client_name").notNull().default(""),
  source:       text("source").notNull().default("telnyx"),
  phone:        text("phone").notNull().default(""),
  customerName: text("customer_name"),
  message:      text("message"),
  eventType:    text("event_type").notNull().default("sms"),
  status:       text("status").notNull().default("new"),
  notes:        text("notes"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLeadSchema = createInsertSchema(leadsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;

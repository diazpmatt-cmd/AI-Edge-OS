import { pgTable, text, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const callsTable = pgTable("calls", {
  id:            uuid("id").primaryKey().defaultRandom(),
  clientId:      uuid("client_id"),
  callSid:       text("call_sid"),
  callerNumber:  text("caller_number").notNull().default(""),
  calledNumber:  text("called_number").notNull().default(""),
  callType:      text("call_type").notNull().default("incoming"),
  digitsPressed: text("digits_pressed"),
  durationSecs:  integer("duration_secs"),
  outcome:       text("outcome").notNull().default("pending"),
  recordingUrl:  text("recording_url"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCallSchema = createInsertSchema(callsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCall = z.infer<typeof insertCallSchema>;
export type Call = typeof callsTable.$inferSelect;

import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const smsConversationsTable = pgTable("sms_conversations", {
  id:             uuid("id").primaryKey().defaultRandom(),
  customerNumber: text("customer_number").notNull().default(""),
  direction:      text("direction").notNull().default("inbound"),
  message:        text("message").notNull().default(""),
  messageId:      text("message_id"),
  status:         text("status").notNull().default("received"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSmsConversationSchema = createInsertSchema(smsConversationsTable).omit({ id: true, createdAt: true });
export type InsertSmsConversation = z.infer<typeof insertSmsConversationSchema>;
export type SmsConversation = typeof smsConversationsTable.$inferSelect;

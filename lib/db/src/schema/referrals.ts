import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const referralProgramsTable = pgTable("referral_programs", {
  id:            serial("id").primaryKey(),
  clientId:      text("client_id").notNull(),
  name:          text("name").notNull(),
  description:   text("description"),
  rewardType:    text("reward_type").notNull().default("credit"),
  rewardValue:   numeric("reward_value", { precision: 10, scale: 2 }).notNull().default("25"),
  status:        text("status").notNull().default("active"),
  referralCode:  text("referral_code").unique(),
  promoMessage:  text("promo_message"),
  maxUses:       integer("max_uses"),
  usesCount:     integer("uses_count").notNull().default(0),
  expiresAt:     timestamp("expires_at", { withTimezone: true }),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const referralsTable = pgTable("referrals", {
  id:            serial("id").primaryKey(),
  programId:     integer("program_id"),
  clientId:      text("client_id").notNull(),
  referrerName:  text("referrer_name").notNull(),
  referrerEmail: text("referrer_email"),
  referrerPhone: text("referrer_phone"),
  referredName:  text("referred_name"),
  referredEmail: text("referred_email"),
  referredPhone: text("referred_phone"),
  status:        text("status").notNull().default("pending"),
  rewardAmount:  numeric("reward_amount", { precision: 10, scale: 2 }),
  source:        text("source").notNull().default("manual"),
  referralCode:  text("referral_code"),
  notes:         text("notes"),
  convertedAt:   timestamp("converted_at", { withTimezone: true }),
  paidAt:        timestamp("paid_at", { withTimezone: true }),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertReferralProgramSchema = createInsertSchema(referralProgramsTable).omit({ id: true, createdAt: true, updatedAt: true, usesCount: true });
export type InsertReferralProgram = z.infer<typeof insertReferralProgramSchema>;
export type ReferralProgram = typeof referralProgramsTable.$inferSelect;

export const insertReferralSchema = createInsertSchema(referralsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referralsTable.$inferSelect;

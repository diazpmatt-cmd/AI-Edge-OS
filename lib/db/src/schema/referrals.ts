import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  text,
  numeric,
  integer,
  timestamp,
  uuid,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
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

export const referralInvitationTemplatesTable = pgTable(
  "referral_invitation_templates",
  {
    id: serial("id").primaryKey(),
    clientId: text("client_id").notNull(),
    name: text("name").notNull(),
    channel: text("channel").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    followUpBody: text("follow_up_body"),
    followUpDelayDays: integer("follow_up_delay_days").notNull().default(3),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("referral_invitation_template_tenant_name_channel").on(
      table.clientId,
      table.name,
      table.channel,
    ),
    check(
      "referral_invitation_template_channel_check",
      sql`${table.channel} IN ('sms', 'email')`,
    ),
    check(
      "referral_invitation_template_status_check",
      sql`${table.status} IN ('active', 'archived')`,
    ),
    check(
      "referral_invitation_template_delay_check",
      sql`${table.followUpDelayDays} BETWEEN 1 AND 30`,
    ),
  ],
);

export const referralInvitationsTable = pgTable(
  "referral_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: text("client_id").notNull(),
    programId: integer("program_id")
      .notNull()
      .references(() => referralProgramsTable.id),
    templateId: integer("template_id").references(
      () => referralInvitationTemplatesTable.id,
    ),
    channel: text("channel").notNull(),
    recipientName: text("recipient_name").notNull(),
    recipientDestination: text("recipient_destination").notNull(),
    subject: text("subject"),
    initialMessage: text("initial_message").notNull(),
    followUpMessage: text("follow_up_message"),
    followUpDelayDays: integer("follow_up_delay_days").notNull().default(3),
    status: text("status").notNull().default("draft"),
    deliveryState: text("delivery_state").notNull().default("not_dispatched"),
    sequenceStep: integer("sequence_step").notNull().default(0),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    consentSource: text("consent_source").notNull(),
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdByUserId: text("created_by_user_id").notNull(),
    approvedByUserId: text("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    suppressionReason: text("suppression_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("referral_invitation_tenant_idempotency").on(
      table.clientId,
      table.idempotencyKey,
    ),
    check(
      "referral_invitation_channel_check",
      sql`${table.channel} IN ('sms', 'email')`,
    ),
    check(
      "referral_invitation_status_check",
      sql`${table.status} IN ('draft', 'approved', 'cancelled', 'suppressed')`,
    ),
    check(
      "referral_invitation_delivery_state_check",
      sql`${table.deliveryState} = 'not_dispatched'`,
    ),
    check(
      "referral_invitation_sequence_step_check",
      sql`${table.sequenceStep} = 0`,
    ),
    check(
      "referral_invitation_delay_check",
      sql`${table.followUpDelayDays} BETWEEN 1 AND 30`,
    ),
  ],
);

export const referralContactPreferencesTable = pgTable(
  "referral_contact_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: text("client_id").notNull(),
    channel: text("channel").notNull(),
    destination: text("destination").notNull(),
    status: text("status").notNull(),
    consentSource: text("consent_source"),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("referral_contact_preference_tenant_channel_destination").on(
      table.clientId,
      table.channel,
      table.destination,
    ),
    check(
      "referral_contact_preference_channel_check",
      sql`${table.channel} IN ('sms', 'email')`,
    ),
    check(
      "referral_contact_preference_status_check",
      sql`${table.status} IN ('opted_in', 'opted_out')`,
    ),
  ],
);

export const insertReferralProgramSchema = createInsertSchema(referralProgramsTable).omit({ id: true, createdAt: true, updatedAt: true, usesCount: true });
export type InsertReferralProgram = z.infer<typeof insertReferralProgramSchema>;
export type ReferralProgram = typeof referralProgramsTable.$inferSelect;

export const insertReferralSchema = createInsertSchema(referralsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referralsTable.$inferSelect;

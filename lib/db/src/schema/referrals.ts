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
  jsonb,
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

export const referralDeliveryAttemptsTable = pgTable(
  "referral_delivery_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: text("client_id").notNull(),
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => referralInvitationsTable.id),
    channel: text("channel").notNull(),
    recipientDestination: text("recipient_destination").notNull(),
    sequenceStep: integer("sequence_step").notNull().default(0),
    requestedMode: text("requested_mode").notNull(),
    status: text("status").notNull(),
    provider: text("provider"),
    providerMessageId: text("provider_message_id"),
    failureCode: text("failure_code"),
    idempotencyKey: text("idempotency_key").notNull(),
    requestedByUserId: text("requested_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("referral_delivery_attempt_tenant_idempotency").on(
      table.clientId,
      table.idempotencyKey,
    ),
    check(
      "referral_delivery_attempt_channel_check",
      sql`${table.channel} IN ('sms', 'email')`,
    ),
    check(
      "referral_delivery_attempt_mode_check",
      sql`${table.requestedMode} IN ('dry_run', 'live')`,
    ),
    check(
      "referral_delivery_attempt_status_check",
      sql`${table.status} IN ('simulated', 'dispatching', 'delivered', 'failed', 'blocked')`,
    ),
    check(
      "referral_delivery_attempt_sequence_step_check",
      sql`${table.sequenceStep} = 0`,
    ),
  ],
);

export const referralRewardLedgerTable = pgTable(
  "referral_reward_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: text("client_id").notNull(),
    referralId: integer("referral_id")
      .notNull()
      .references(() => referralsTable.id),
    programId: integer("program_id").references(() => referralProgramsTable.id),
    rewardType: text("reward_type").notNull(),
    rewardAmount: numeric("reward_amount", {
      precision: 10,
      scale: 2,
    }).notNull(),
    status: text("status").notNull().default("pending_review"),
    approvalIdempotencyKey: text("approval_idempotency_key"),
    approvedByUserId: text("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    fulfillmentIdempotencyKey: text("fulfillment_idempotency_key"),
    fulfillmentMethod: text("fulfillment_method"),
    fulfillmentReference: text("fulfillment_reference"),
    fulfillmentNote: text("fulfillment_note"),
    fulfilledByUserId: text("fulfilled_by_user_id"),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("referral_reward_ledger_tenant_referral").on(
      table.clientId,
      table.referralId,
    ),
    uniqueIndex("referral_reward_ledger_approval_idempotency").on(
      table.clientId,
      table.approvalIdempotencyKey,
    ),
    uniqueIndex("referral_reward_ledger_fulfillment_idempotency").on(
      table.clientId,
      table.fulfillmentIdempotencyKey,
    ),
    check(
      "referral_reward_ledger_status_check",
      sql`${table.status} IN ('pending_review', 'approved', 'fulfilled', 'rejected')`,
    ),
    check(
      "referral_reward_ledger_amount_check",
      sql`${table.rewardAmount} >= 0`,
    ),
  ],
);

export const referralFraudReviewsTable = pgTable(
  "referral_fraud_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: text("client_id").notNull(),
    referralId: integer("referral_id")
      .notNull()
      .references(() => referralsTable.id),
    status: text("status").notNull().default("open"),
    riskScore: integer("risk_score").notNull().default(0),
    reasons: jsonb("reasons").notNull().default([]),
    evidence: jsonb("evidence").notNull().default({}),
    fingerprintEvaluation: text("fingerprint_evaluation")
      .notNull()
      .default("not_available"),
    version: integer("version").notNull().default(0),
    reviewedByUserId: text("reviewed_by_user_id"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    decisionIdempotencyKey: text("decision_idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("referral_fraud_review_tenant_referral").on(
      table.clientId,
      table.referralId,
    ),
    uniqueIndex("referral_fraud_review_tenant_decision_idempotency").on(
      table.clientId,
      table.decisionIdempotencyKey,
    ),
    check(
      "referral_fraud_review_status_check",
      sql`${table.status} IN ('open', 'held', 'cleared', 'rejected')`,
    ),
    check(
      "referral_fraud_review_score_check",
      sql`${table.riskScore} BETWEEN 0 AND 100`,
    ),
    check(
      "referral_fraud_review_fingerprint_check",
      sql`${table.fingerprintEvaluation} IN ('evaluated', 'not_available')`,
    ),
  ],
);

export const referralFraudReviewEventsTable = pgTable(
  "referral_fraud_review_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: text("client_id").notNull(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => referralFraudReviewsTable.id),
    referralId: integer("referral_id")
      .notNull()
      .references(() => referralsTable.id),
    previousStatus: text("previous_status").notNull(),
    newStatus: text("new_status").notNull(),
    note: text("note").notNull(),
    actorUserId: text("actor_user_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("referral_fraud_event_tenant_idempotency").on(
      table.clientId,
      table.idempotencyKey,
    ),
    check(
      "referral_fraud_event_previous_status_check",
      sql`${table.previousStatus} IN ('open', 'held', 'cleared', 'rejected')`,
    ),
    check(
      "referral_fraud_event_new_status_check",
      sql`${table.newStatus} IN ('held', 'cleared', 'rejected')`,
    ),
  ],
);

export const referralCrmAttributionsTable = pgTable(
  "referral_crm_attributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: text("client_id").notNull(),
    referralId: integer("referral_id")
      .notNull()
      .references(() => referralsTable.id),
    sourceSystem: text("source_system").notNull().default("gorilladesk_sync"),
    customerExternalId: text("customer_external_id").notNull(),
    status: text("status").notNull().default("proposed"),
    confidence: integer("confidence").notNull(),
    reasons: jsonb("reasons").notNull().default(sql`'[]'::jsonb`),
    measuredRevenue: numeric("measured_revenue", { precision: 12, scale: 2 }),
    decidedByUserId: text("decided_by_user_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionIdempotencyKey: text("decision_idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("referral_crm_attribution_tenant_candidate").on(
      table.clientId,
      table.referralId,
      table.customerExternalId,
    ),
    uniqueIndex("referral_crm_attribution_tenant_decision").on(
      table.clientId,
      table.decisionIdempotencyKey,
    ),
    check(
      "referral_crm_attribution_status_check",
      sql`${table.status} IN ('proposed', 'confirmed', 'rejected')`,
    ),
    check(
      "referral_crm_attribution_confidence_check",
      sql`${table.confidence} BETWEEN 0 AND 100`,
    ),
  ],
);

export const insertReferralProgramSchema = createInsertSchema(referralProgramsTable).omit({ id: true, createdAt: true, updatedAt: true, usesCount: true });
export type InsertReferralProgram = z.infer<typeof insertReferralProgramSchema>;
export type ReferralProgram = typeof referralProgramsTable.$inferSelect;

export const insertReferralSchema = createInsertSchema(referralsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referralsTable.$inferSelect;
export type ReferralCrmAttribution = typeof referralCrmAttributionsTable.$inferSelect;

/**
 * Phase C7 — Discovery Schedule Schema
 *
 * Three new tables:
 *   discovery_schedules              — tenant-scoped schedule configuration
 *   discovery_schedule_occurrences   — append-only occurrence + claim record
 *   discovery_scheduler_leadership   — singleton leadership lease (multi-instance safety)
 *
 * All bootstrap uses CREATE TABLE IF NOT EXISTS (safe to call repeatedly).
 * No FK constraints — same policy as C3/C6 tables.
 * Tenant isolation enforced in every query predicate (never implicit).
 */

import { pgTable, text, integer, numeric, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";

// ── discovery_schedules ────────────────────────────────────────────────────────
//
// One row per tenant-scoped recurring discovery schedule.
//
// Indexes:
//   idx_discovery_schedules_client      — tenant scoping (all list queries)
//   idx_discovery_schedules_next_run    — due-schedule polling (WHERE next_run_at <= now)
//   idx_discovery_schedules_status      — filter active schedules efficiently
//
// Unique constraint:
//   (client_id, name) — prevents duplicate schedule names within a tenant

export const discoverySchedulesTable = pgTable("discovery_schedules", {
  id:                  text("id").primaryKey(),
  clientId:            text("client_id").notNull(),
  name:                text("name").notNull(),
  status:              text("status").notNull().default("active"),
  executionMode:       text("execution_mode").notNull().default("dry"),
  cronExpr:            text("cron_expr").notNull(),
  timezone:            text("timezone").notNull().default("UTC"),
  nextRunAt:           timestamp("next_run_at", { withTimezone: true }),
  lastRunAt:           timestamp("last_run_at", { withTimezone: true }),
  lastSuccessAt:       timestamp("last_success_at", { withTimezone: true }),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  maxCostPerRunUsd:    numeric("max_cost_per_run_usd", { precision: 10, scale: 4 }).notNull().default("1.0000"),
  maxRequestsPerRun:   integer("max_requests_per_run").notNull().default(50),
  catchUpPolicy:       text("catch_up_policy").notNull().default("skip_missed"),
  maxCatchUpCount:     integer("max_catch_up_count").notNull().default(3),
  overlapPolicy:       text("overlap_policy").notNull().default("skip"),
  pauseReason:         text("pause_reason"),
  contextSnapshot:     jsonb("context_snapshot"),
  providerPolicy:      jsonb("provider_policy"),
  createdBy:           text("created_by"),
  updatedBy:           text("updated_by"),
  createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  version:             integer("version").notNull().default(1),
});

export type DiscoveryScheduleRow = typeof discoverySchedulesTable.$inferSelect;
export type DiscoveryScheduleInsert = typeof discoverySchedulesTable.$inferInsert;

// ── discovery_schedule_occurrences ────────────────────────────────────────────
//
// One row per scheduled occurrence (intended run slot).
// Created when the scheduler claims a due schedule and when catch-up generates
// missed occurrences. Terminal state rows are retained for audit history.
//
// Claim model:
//   A dispatcher claims an occurrence by setting claimed_by / claim_expires_at.
//   If the dispatcher crashes, claim_expires_at expires and another dispatcher
//   can recover the occurrence (re-insert the claim row or UPDATE).
//
//   The UNIQUE(schedule_id, intended_at) constraint ensures only one row per
//   (schedule, occurrence-time). First INSERT wins — concurrent dispatchers lose
//   gracefully (INSERT ON CONFLICT DO NOTHING).
//
// Indexes:
//   idx_sched_occ_schedule             — by schedule for history queries
//   idx_sched_occ_client               — tenant isolation
//   idx_sched_occ_status               — find pending/running occurrences
//   idx_sched_occ_claim_expiry         — stale claim recovery
//   UNIQUE(schedule_id, intended_at)   — duplicate prevention

export const discoveryScheduleOccurrencesTable = pgTable(
  "discovery_schedule_occurrences",
  {
    id:                    text("id").primaryKey(),
    scheduleId:            text("schedule_id").notNull(),
    clientId:              text("client_id").notNull(),
    intendedAt:            timestamp("intended_at", { withTimezone: true }).notNull(),
    status:                text("status").notNull().default("pending"),
    runId:                 text("run_id"),
    idempotencyKey:        text("idempotency_key"),
    catchUpReason:         text("catch_up_reason"),
    overlapPolicyApplied:  text("overlap_policy_applied"),
    skipReason:            text("skip_reason"),
    claimedBy:             text("claimed_by"),
    claimedAt:             timestamp("claimed_at", { withTimezone: true }),
    claimExpiresAt:        timestamp("claim_expires_at", { withTimezone: true }),
    dispatchCorrelationId: text("dispatch_correlation_id"),
    scheduleVersion:       integer("schedule_version"),
    createdAt:             timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:             timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export type DiscoveryScheduleOccurrenceRow = typeof discoveryScheduleOccurrencesTable.$inferSelect;
export type DiscoveryScheduleOccurrenceInsert = typeof discoveryScheduleOccurrencesTable.$inferInsert;

// ── discovery_scheduler_leadership ────────────────────────────────────────────
//
// Single-row leadership lease for the discovery scheduler.
// leader_id is always the constant "discovery_scheduler".
//
// Acquisition:
//   INSERT INTO discovery_scheduler_leadership (leader_id, owner_id, expires_at, ...)
//   ON CONFLICT (leader_id) DO NOTHING — if already owned.
//   Then SELECT to confirm ownership. If expires_at < now(), UPDATE to take over.
//
// This pattern is safe under concurrent API-server instances:
//   - The ON CONFLICT DO NOTHING serializes concurrent inserts via the PK.
//   - Expired leases can be taken over atomically via
//     UPDATE WHERE expires_at < now() AND released_at IS NULL.
//
// Separation from C6 execution leases:
//   This table governs scheduler-loop leadership only.
//   Individual run execution leases remain in discovery_run_leases (C6).
//
// Indexes:
//   idx_scheduler_leadership_expiry    — expiry detection for takeover

export const discoverySchedulerLeadershipTable = pgTable("discovery_scheduler_leadership", {
  leaderId:   text("leader_id").primaryKey(),
  ownerId:    text("owner_id").notNull(),
  acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt:  timestamp("expires_at", { withTimezone: true }).notNull(),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  hostInfo:   text("host_info"),
});

export type DiscoverySchedulerLeadershipRow = typeof discoverySchedulerLeadershipTable.$inferSelect;
export type DiscoverySchedulerLeadershipInsert = typeof discoverySchedulerLeadershipTable.$inferInsert;

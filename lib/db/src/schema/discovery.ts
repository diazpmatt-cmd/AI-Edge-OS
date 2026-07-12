/**
 * Phase C3 — Discovery Persistence Schema
 * Phase C6 — Lifecycle Governance Schema Extension
 *
 * Tables:
 *   C3: discovery_snapshots, discovery_signals, discovery_clusters, discovery_opportunities
 *   C6: discovery_run_transitions, discovery_run_leases, discovery_idempotency,
 *       discovery_diagnostics, discovery_audit
 *
 * Design decisions:
 * - Text PKs (not UUIDs) for discovery_signals, discovery_clusters,
 *   discovery_opportunities — IDs are deterministic strings from Phase C2.
 *   ON CONFLICT DO NOTHING on these PKs is the idempotency guarantee.
 * - discovery_snapshots uses text PK = runId ("run::{clientId}::{weekLabel}").
 *   UNIQUE INDEX on (client_id, week_label) enforces one snapshot per tenant-week.
 * - jsonb columns store arrays and nested objects (signal_ids, score_card, etc.).
 *   Drizzle handles JSON serialization automatically; Zod validates on read.
 * - clientId is included on EVERY table and EVERY predicate — tenant isolation
 *   does not rely exclusively on globally-unique IDs.
 * - No FK constraints (drizzle-kit push is blocked by a pre-existing constraint
 *   conflict; tables are bootstrapped via bootstrapDiscoveryTables() raw SQL).
 * - C6 columns on discovery_snapshots are added via ALTER TABLE IF NOT EXISTS
 *   in bootstrapC6Tables() — backward-safe for existing rows.
 *
 * NOTE: drizzle-kit push is NOT used for this schema.
 * Tables are created via bootstrapDiscoveryTables(pool) and bootstrapC6Tables(pool)
 * in lib/db/src/discovery-drizzle-repository.ts and discovery-c6-repository.ts.
 */

import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

// ── discovery_snapshots ────────────────────────────────────────────────────────
// One row per client per week. Header record for a complete discovery run.

export const discoverySnapshotsTable = pgTable("discovery_snapshots", {
  /** Deterministic: "run::{clientId}::{weekLabel}" */
  id:                        text("id").primaryKey(),
  clientId:                  text("client_id").notNull(),
  weekLabel:                 text("week_label").notNull(),
  status:                    text("status").notNull().default("running"),
  /** JSON string[]: provider names that were attempted. */
  providersRun:              jsonb("providers_run").notNull().default([]),
  /** JSON ProviderFailure[]: failures recorded during the run. */
  providerFailures:          jsonb("provider_failures").notNull().default([]),
  signalsReceived:           integer("signals_received").notNull().default(0),
  signalsAccepted:           integer("signals_accepted").notNull().default(0),
  signalsBlocked:            integer("signals_blocked").notNull().default(0),
  clusterCount:              integer("cluster_count").notNull().default(0),
  opportunityCount:          integer("opportunity_count").notNull().default(0),
  highPriorityOpportunityCount: integer("high_priority_opportunity_count").notNull().default(0),
  topOpportunityScore:       integer("top_opportunity_score").notNull().default(0),
  runDurationMs:             integer("run_duration_ms").notNull().default(0),
  createdAt:                 timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt:               timestamp("completed_at", { withTimezone: true }),
  // ── C6 additions (added via ALTER TABLE in bootstrapC6Tables) ──────────────
  /** Correlation ID for the request/session that created this run. */
  correlationId:             text("correlation_id"),
  /** Timestamp when cancellation completed (distinct from cancel_requested). */
  cancelledAt:               timestamp("cancelled_at", { withTimezone: true }),
  /** JSON ProgressSnapshot — updated at stage boundaries. */
  progress:                  jsonb("progress"),
  /** Idempotency key supplied by the caller (for replay lookup). */
  idempotencyKey:            text("idempotency_key"),
});

export type DiscoverySnapshotRow = typeof discoverySnapshotsTable.$inferSelect;
export type InsertDiscoverySnapshot = typeof discoverySnapshotsTable.$inferInsert;

// ── discovery_signals ──────────────────────────────────────────────────────────
// Raw research unit. One row per finding, regardless of source.

export const discoverySignalsTable = pgTable("discovery_signals", {
  /** Deterministic: "sig::{clientId}::{source}::{normalizedValue}" */
  id:               text("id").primaryKey(),
  snapshotId:       text("snapshot_id").notNull(),
  clientId:         text("client_id").notNull(),
  signalType:       text("signal_type").notNull(),
  source:           text("source").notNull(),
  rawValue:         text("raw_value").notNull(),
  normalizedValue:  text("normalized_value").notNull(),
  serviceId:        text("service_id"),
  intent:           text("intent").notNull(),
  volumeEstimate:   integer("volume_estimate"),
  difficultyScore:  integer("difficulty_score"),
  seasonalRelevance:integer("seasonal_relevance").notNull().default(0),
  geographicScope:  text("geographic_scope").notNull().default("local"),
  trendDirection:   text("trend_direction").notNull().default("unknown"),
  competitorRank:   integer("competitor_rank"),
  citationFound:    boolean("citation_found"),
  evidenceStrength: integer("evidence_strength").notNull().default(50),
  /** Full provider response preserved for auditability. */
  rawProviderData:  jsonb("raw_provider_data").notNull().default({}),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DiscoverySignalRow = typeof discoverySignalsTable.$inferSelect;
export type InsertDiscoverySignal = typeof discoverySignalsTable.$inferInsert;

// ── discovery_clusters ─────────────────────────────────────────────────────────
// Semantic groupings of related signals. Each cluster is one potential topic.

export const discoveryClustersTable = pgTable("discovery_clusters", {
  /** Deterministic: "{clientId}::{serviceId||'general'}::{intent}" */
  id:               text("id").primaryKey(),
  snapshotId:       text("snapshot_id").notNull(),
  clientId:         text("client_id").notNull(),
  clusterName:      text("cluster_name").notNull(),
  primaryServiceId: text("primary_service_id"),
  intent:           text("intent").notNull(),
  /** JSON string[]: member discovery_signals.id values. */
  signalIds:        jsonb("signal_ids").notNull().default([]),
  signalCount:      integer("signal_count").notNull().default(0),
  totalVolume:      integer("total_volume").notNull().default(0),
  opportunityScore: integer("opportunity_score").notNull().default(0),
  contentAngle:     text("content_angle").notNull().default(""),
  seasonalWindow:   text("seasonal_window"),
  isActive:         boolean("is_active").notNull().default(true),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DiscoveryClusterRow = typeof discoveryClustersTable.$inferSelect;
export type InsertDiscoveryCluster = typeof discoveryClustersTable.$inferInsert;

// ── discovery_opportunities ────────────────────────────────────────────────────
// Scored, ranked action items ready for assignment to a downstream engine.

export const discoveryOpportunitiesTable = pgTable("discovery_opportunities", {
  /** Derived from cluster id: "opp::{clusterId}". */
  id:               text("id").primaryKey(),
  snapshotId:       text("snapshot_id").notNull(),
  clientId:         text("client_id").notNull(),
  opportunityType:  text("opportunity_type").notNull(),
  title:            text("title").notNull(),
  description:      text("description").notNull(),
  targetEngine:     text("target_engine").notNull(),
  clusterId:        text("cluster_id"),
  serviceId:        text("service_id"),
  /** Full OpportunityScoreCard — validated via Zod on read. */
  scoreCard:        jsonb("score_card").notNull().default({}),
  compositeScore:   integer("composite_score").notNull().default(0),
  priority:         text("priority").notNull().default("medium"),
  status:           text("status").notNull().default("pending"),
  assignedAt:       timestamp("assigned_at", { withTimezone: true }),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DiscoveryOpportunityRow = typeof discoveryOpportunitiesTable.$inferSelect;
export type InsertDiscoveryOpportunity = typeof discoveryOpportunitiesTable.$inferInsert;

// ── C6: discovery_run_transitions ──────────────────────────────────────────────
// Append-only FSM transition history for every discovery run state change.

export const discoveryRunTransitionsTable = pgTable("discovery_run_transitions", {
  /** Deterministic: "trans::{runId}::{seq}" */
  id:            text("id").primaryKey(),
  runId:         text("run_id").notNull(),
  clientId:      text("client_id").notNull(),
  seq:           integer("seq").notNull(),
  fromState:     text("from_state").notNull(),
  toState:       text("to_state").notNull(),
  reasonCode:    text("reason_code").notNull(),
  message:       text("message").notNull(),
  actorType:     text("actor_type").notNull(),
  actorId:       text("actor_id"),
  correlationId: text("correlation_id"),
  /** JSON — sanitized, no credentials. */
  metadata:      jsonb("metadata").notNull().default({}),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DiscoveryRunTransitionRow = typeof discoveryRunTransitionsTable.$inferSelect;

// ── C6: discovery_run_leases ───────────────────────────────────────────────────
// One row per run; prevents duplicate execution.

export const discoveryRunLeasesTable = pgTable("discovery_run_leases", {
  /** FK → discovery_snapshots.id (run_id is the PK — one lease per run). */
  runId:        text("run_id").primaryKey(),
  clientId:     text("client_id").notNull(),
  /** "owner::{correlationId}" */
  ownerId:      text("owner_id").notNull(),
  acquiredAt:   timestamp("acquired_at",  { withTimezone: true }).notNull(),
  expiresAt:    timestamp("expires_at",   { withTimezone: true }).notNull(),
  renewedAt:    timestamp("renewed_at",   { withTimezone: true }),
  releasedAt:   timestamp("released_at",  { withTimezone: true }),
});

export type DiscoveryRunLeaseRow = typeof discoveryRunLeasesTable.$inferSelect;

// ── C6: discovery_idempotency ──────────────────────────────────────────────────
// One record per caller-supplied idempotency key. Enables replay.

export const discoveryIdempotencyTable = pgTable("discovery_idempotency", {
  /**
   * Deterministic:
   *   "idem::{clientId}::{operation}::{dry|live}::{key}"
   */
  id:                 text("id").primaryKey(),
  clientId:           text("client_id").notNull(),
  idempotencyKey:     text("idempotency_key").notNull(),
  operation:          text("operation").notNull(),
  requestFingerprint: text("request_fingerprint").notNull(),
  /** FK → discovery_snapshots.id (null for dry-run). */
  runId:              text("run_id"),
  isDryRun:           boolean("is_dry_run").notNull().default(false),
  responseStatus:     integer("response_status"),
  /** JSON — safe subset of original response; no credentials. */
  responseBody:       jsonb("response_body"),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt:          timestamp("expires_at",  { withTimezone: true }).notNull(),
});

export type DiscoveryIdempotencyRow = typeof discoveryIdempotencyTable.$inferSelect;

// ── C6: discovery_diagnostics ─────────────────────────────────────────────────
// Append-only structured diagnostic events per run.

export const discoveryDiagnosticsTable = pgTable("discovery_diagnostics", {
  /** Deterministic: "diag::{runId}::{seq}" */
  id:            text("id").primaryKey(),
  runId:         text("run_id").notNull(),
  clientId:      text("client_id").notNull(),
  seq:           integer("seq").notNull(),
  severity:      text("severity").notNull(),
  code:          text("code").notNull(),
  message:       text("message").notNull(),
  stage:         text("stage"),
  provider:      text("provider"),
  capability:    text("capability"),
  retryable:     boolean("retryable"),
  correlationId: text("correlation_id"),
  /** JSON — sanitized metadata; no credentials. */
  metadata:      jsonb("metadata").notNull().default({}),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DiscoveryDiagnosticRow = typeof discoveryDiagnosticsTable.$inferSelect;

// ── C6: discovery_audit ───────────────────────────────────────────────────────
// Append-only, tenant-scoped audit trail for governance actions.

export const discoveryAuditTable = pgTable("discovery_audit", {
  /** Deterministic: "audit::{clientId}::{action}::{correlationFragment}" */
  id:            text("id").primaryKey(),
  clientId:      text("client_id").notNull(),
  /** FK → discovery_snapshots.id (null for pre-run actions). */
  runId:         text("run_id"),
  action:        text("action").notNull(),
  actorType:     text("actor_type").notNull(),
  actorId:       text("actor_id"),
  correlationId: text("correlation_id"),
  /** JSON — sanitized; no credentials, no provider payloads. */
  metadata:      jsonb("metadata").notNull().default({}),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DiscoveryAuditRow = typeof discoveryAuditTable.$inferSelect;

import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Measurement-owned inventory scan receipts.
 *
 * These rows are intentionally separate from backlink_ingestion_runs, which
 * belongs to Authority opportunity discovery. A successful Authority run is
 * not proof of a complete client backlink inventory.
 */
export const backlinkInventoryRunsTable = pgTable("backlink_inventory_runs", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  runId: text("run_id").notNull(),
  providerId: text("provider_id").notNull(),
  providerRevision: text("provider_revision").notNull(),
  status: text("status").notNull(),
  completeness: text("completeness").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  inputFingerprint: text("input_fingerprint").notNull(),
  observedCount: integer("observed_count").notNull(),
  absenceEvaluationApplied: boolean("absence_evaluation_applied").notNull(),
  activeBacklinkCount: integer("active_backlink_count").notNull(),
  referringDomainCount: integer("referring_domain_count").notNull(),
  newCount: integer("new_count").notNull(),
  lostCount: integer("lost_count").notNull(),
  restoredCount: integer("restored_count").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique("uq_backlink_inventory_runs_id_client").on(table.id, table.clientId),
  uniqueIndex("uq_backlink_inventory_runs_client_run").on(table.clientId, table.runId),
  index("idx_backlink_inventory_runs_client_completed").on(table.clientId, table.completedAt.desc(), table.runId),
  check("ck_backlink_inventory_run_status", sql`${table.status} IN ('succeeded','failed')`),
  check("ck_backlink_inventory_run_completeness", sql`${table.completeness} IN ('complete','incomplete')`),
  check("ck_backlink_inventory_run_fingerprint", sql`${table.inputFingerprint} ~ '^[0-9a-f]{64}$'`),
  check("ck_backlink_inventory_run_provider", sql`char_length(${table.providerId}) BETWEEN 1 AND 100 AND char_length(${table.providerRevision}) BETWEEN 1 AND 100`),
  check("ck_backlink_inventory_run_nonnegative", sql`
    ${table.observedCount} >= 0 AND
    ${table.activeBacklinkCount} >= 0 AND
    ${table.referringDomainCount} >= 0 AND
    ${table.newCount} >= 0 AND
    ${table.lostCount} >= 0 AND
    ${table.restoredCount} >= 0`),
  check("ck_backlink_inventory_absence_truth", sql`
    (${table.status} = 'failed' AND ${table.absenceEvaluationApplied} = FALSE) OR
    (${table.status} = 'succeeded' AND ${table.completeness} = 'incomplete' AND ${table.absenceEvaluationApplied} = FALSE) OR
    (${table.status} = 'succeeded' AND ${table.completeness} = 'complete' AND ${table.absenceEvaluationApplied} = TRUE)`),
]);

/** Current authoritative state for client backlinks observed by complete/incomplete inventory scans. */
export const observedBacklinksTable = pgTable("observed_backlinks", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceDomain: text("source_domain").notNull(),
  targetUrl: text("target_url").notNull(),
  status: text("status").notNull(),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
  firstSeenRunId: text("first_seen_run_id").notNull(),
  firstSeenProviderId: text("first_seen_provider_id").notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  lastSeenRunId: text("last_seen_run_id").notNull(),
  lastSeenProviderId: text("last_seen_provider_id").notNull(),
  consecutiveSuccessfulMisses: integer("consecutive_successful_misses").notNull().default(0),
  lastLostAt: timestamp("last_lost_at", { withTimezone: true }),
  lastLostRunId: text("last_lost_run_id"),
  reacquiredCount: integer("reacquired_count").notNull().default(0),
  lastReacquiredAt: timestamp("last_reacquired_at", { withTimezone: true }),
  lastEvaluatedRunId: text("last_evaluated_run_id"),
  lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique("uq_observed_backlinks_id_client").on(table.id, table.clientId),
  index("idx_observed_backlinks_client_status").on(table.clientId, table.status, table.sourceDomain),
  index("idx_observed_backlinks_client_domain").on(table.clientId, table.sourceDomain, table.id),
  check("ck_observed_backlink_status", sql`${table.status} IN ('active','lost')`),
  check("ck_observed_backlink_misses", sql`${table.consecutiveSuccessfulMisses} >= 0`),
  check("ck_observed_backlink_reacquired", sql`${table.reacquiredCount} >= 0`),
  check("ck_observed_backlink_loss_pair", sql`(${table.lastLostAt} IS NULL) = (${table.lastLostRunId} IS NULL)`),
  check("ck_observed_backlink_evaluated_pair", sql`(${table.lastEvaluatedAt} IS NULL) = (${table.lastEvaluatedRunId} IS NULL)`),
]);

/** Immutable lifecycle evidence used to derive period new/lost/restored counts. */
export const observedBacklinkTransitionsTable = pgTable("observed_backlink_transitions", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  runId: text("run_id").notNull(),
  providerId: text("provider_id").notNull(),
  type: text("type").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceDomain: text("source_domain").notNull(),
  targetUrl: text("target_url").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull(),
  consecutiveSuccessfulMisses: integer("consecutive_successful_misses").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique("uq_observed_backlink_transitions_id_client").on(table.id, table.clientId),
  index("idx_observed_backlink_transitions_client_at").on(table.clientId, table.at.desc(), table.id),
  index("idx_observed_backlink_transitions_client_type").on(table.clientId, table.type, table.at.desc()),
  check("ck_observed_backlink_transition_type", sql`${table.type} IN ('new','still_observed','possibly_missing','lost','restored')`),
  check("ck_observed_backlink_transition_misses", sql`${table.consecutiveSuccessfulMisses} >= 0`),
]);

export type BacklinkInventoryRunRow = typeof backlinkInventoryRunsTable.$inferSelect;
export type ObservedBacklinkRow = typeof observedBacklinksTable.$inferSelect;
export type ObservedBacklinkTransitionRow = typeof observedBacklinkTransitionsTable.$inferSelect;

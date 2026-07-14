import type {
  ApprovalRecord,
  AuditEvent,
  AuthorizationCategory,
  CompletionReportInput,
  MilestoneRecord,
  TaskSpecification,
  TrustedDevelopmentActor,
} from "@workspace/development-control";
import type {
  GitHubApprovalBinding,
  GitHubDiagnostic,
  GitHubReconciliationSummary,
} from "@workspace/development-control-github";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const developmentTasksTable = pgTable(
  "development_tasks",
  {
    taskId: text("task_id").primaryKey(),
    activeRevision: integer("active_revision").notNull(),
    specificationHash: text("specification_hash").notNull(),
    state: text("state").notNull(),
    version: integer("version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("ck_development_tasks_revision", sql`${table.activeRevision} > 0`),
    check("ck_development_tasks_version", sql`${table.version} > 0`),
    check(
      "ck_development_tasks_hash",
      sql`${table.specificationHash} ~ '^spec_[0-9a-f]{64}$'`,
    ),
    check(
      "ck_development_tasks_state",
      sql`${table.state} IN ('proposed','approved','claimed','in_progress','review_requested','verified','completed','blocked','rejected','cancelled')`,
    ),
    index("idx_development_tasks_state_updated").on(
      table.state,
      table.updatedAt,
      table.taskId,
    ),
  ],
);

export const developmentTaskSpecificationsTable = pgTable(
  "development_task_specifications",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => developmentTasksTable.taskId, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    specificationHash: text("specification_hash").notNull(),
    expectedOriginMainSha: text("expected_origin_main_sha").notNull(),
    specification: jsonb("specification").$type<TaskSpecification>().notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.revision] }),
    uniqueIndex("uq_development_specification_hash").on(
      table.taskId,
      table.specificationHash,
    ),
    check("ck_development_spec_revision", sql`${table.revision} > 0`),
    check(
      "ck_development_spec_hash",
      sql`${table.specificationHash} ~ '^spec_[0-9a-f]{64}$'`,
    ),
    check(
      "ck_development_spec_sha",
      sql`${table.expectedOriginMainSha} ~ '^[0-9a-f]{40}$'`,
    ),
    check(
      "ck_development_spec_bound",
      sql`octet_length(${table.specification}::text) <= 131072`,
    ),
  ],
);

export const developmentActorIdentitiesTable = pgTable(
  "development_actor_identities",
  {
    actorId: text("actor_id").primaryKey(),
    displayName: text("display_name").notNull(),
    actorType: text("actor_type").notNull(),
    verified: boolean("verified").notNull(),
    actorSnapshot: jsonb("actor_snapshot")
      .$type<TrustedDevelopmentActor>()
      .notNull(),
    firstObservedAt: timestamp("first_observed_at", {
      withTimezone: true,
    }).notNull(),
    lastObservedAt: timestamp("last_observed_at", {
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    check(
      "ck_development_actor_type",
      sql`${table.actorType} IN ('human_authority','architect_reviewer','codex_implementer','bounded_sub_agent','read_only_automation')`,
    ),
    check(
      "ck_development_actor_id_bound",
      sql`char_length(${table.actorId}) BETWEEN 1 AND 200`,
    ),
    check(
      "ck_development_actor_name_bound",
      sql`char_length(${table.displayName}) BETWEEN 1 AND 200`,
    ),
    check(
      "ck_development_actor_snapshot_bound",
      sql`octet_length(${table.actorSnapshot}::text) <= 4096`,
    ),
  ],
);

export const developmentAuthorizationDecisionsTable = pgTable(
  "development_authorization_decisions",
  {
    approvalId: text("approval_id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => developmentTasksTable.taskId, { onDelete: "cascade" }),
    decisionSequence: integer("decision_sequence").notNull(),
    specificationRevision: integer("specification_revision").notNull(),
    specificationHash: text("specification_hash").notNull(),
    expectedGitSha: text("expected_git_sha").notNull(),
    categories: jsonb("categories")
      .$type<readonly AuthorizationCategory[]>()
      .notNull(),
    decidingActorId: text("deciding_actor_id")
      .notNull()
      .references(() => developmentActorIdentitiesTable.actorId),
    decidingActor: jsonb("deciding_actor")
      .$type<TrustedDevelopmentActor>()
      .notNull(),
    decision: text("decision").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    constraints: jsonb("constraints").$type<readonly string[]>().notNull(),
    rationale: text("rationale").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    record: jsonb("record").$type<ApprovalRecord>().notNull(),
  },
  (table) => [
    uniqueIndex("uq_development_approval_task_sequence").on(
      table.taskId,
      table.decisionSequence,
    ),
    index("idx_development_approval_task_category_time").on(
      table.taskId,
      table.decidedAt,
      table.approvalId,
    ),
    check(
      "ck_development_approval_id",
      sql`${table.approvalId} ~ '^approval_[0-9a-f]{64}$'`,
    ),
    check(
      "ck_development_approval_decision",
      sql`${table.decision} IN ('proposed','approved','rejected','revoked','expired')`,
    ),
    check(
      "ck_development_approval_sha",
      sql`${table.expectedGitSha} ~ '^[0-9a-f]{40}$'`,
    ),
    check(
      "ck_development_approval_categories",
      sql`jsonb_typeof(${table.categories}) = 'array' AND jsonb_array_length(${table.categories}) BETWEEN 1 AND 10`,
    ),
    check(
      "ck_development_approval_bounds",
      sql`char_length(${table.rationale}) BETWEEN 1 AND 1000 AND octet_length(${table.record}::text) <= 32768`,
    ),
  ],
);

export const developmentTaskClaimsTable = pgTable(
  "development_task_claims",
  {
    taskId: text("task_id")
      .primaryKey()
      .references(() => developmentTasksTable.taskId, { onDelete: "cascade" }),
    ownerActorId: text("owner_actor_id")
      .notNull()
      .references(() => developmentActorIdentitiesTable.actorId),
    ownerSnapshot: jsonb("owner_snapshot")
      .$type<TrustedDevelopmentActor>()
      .notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    leaseVersion: integer("lease_version").notNull(),
  },
  (table) => [
    index("idx_development_claim_expiry").on(table.expiresAt, table.taskId),
    check("ck_development_claim_version", sql`${table.leaseVersion} > 0`),
    check(
      "ck_development_claim_chronology",
      sql`${table.expiresAt} > ${table.claimedAt}`,
    ),
    check(
      "ck_development_claim_owner_bound",
      sql`octet_length(${table.ownerSnapshot}::text) <= 4096`,
    ),
  ],
);

export const developmentAuditEventsTable = pgTable(
  "development_audit_events",
  {
    eventId: text("event_id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => developmentTasksTable.taskId, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    priorState: text("prior_state"),
    newState: text("new_state").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => developmentActorIdentitiesTable.actorId),
    actorSnapshot: jsonb("actor_snapshot")
      .$type<TrustedDevelopmentActor>()
      .notNull(),
    reasonCode: text("reason_code").notNull(),
    expectedGitSha: text("expected_git_sha"),
    observedGitSha: text("observed_git_sha"),
    specificationRevision: integer("specification_revision").notNull(),
    specificationHash: text("specification_hash").notNull(),
    correlationKey: text("correlation_key").notNull(),
    metadata: jsonb("metadata")
      .$type<AuditEvent["metadata"]>()
      .notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    event: jsonb("event").$type<AuditEvent>().notNull(),
  },
  (table) => [
    uniqueIndex("uq_development_event_task_sequence").on(
      table.taskId,
      table.sequence,
    ),
    index("idx_development_event_task_time").on(
      table.taskId,
      table.occurredAt,
      table.eventId,
    ),
    check(
      "ck_development_event_id",
      sql`${table.eventId} ~ '^event_[0-9a-f]{64}$'`,
    ),
    check("ck_development_event_sequence", sql`${table.sequence} > 0`),
    check(
      "ck_development_event_bounds",
      sql`char_length(${table.reasonCode}) BETWEEN 1 AND 200 AND char_length(${table.correlationKey}) BETWEEN 1 AND 200 AND octet_length(${table.metadata}::text) <= 16384 AND octet_length(${table.event}::text) <= 32768`,
    ),
  ],
);

export const developmentMilestonesTable = pgTable(
  "development_milestones",
  {
    milestoneId: text("milestone_id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => developmentTasksTable.taskId, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    evidence: text("evidence"),
    verifiedByActorId: text("verified_by_actor_id").references(
      () => developmentActorIdentitiesTable.actorId,
    ),
    record: jsonb("record").$type<MilestoneRecord>().notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    current: boolean("current").notNull(),
  },
  (table) => [
    uniqueIndex("uq_development_milestone_current")
      .on(table.taskId, table.kind)
      .where(sql`${table.current} = true`),
    index("idx_development_milestone_history").on(
      table.taskId,
      table.kind,
      table.recordedAt,
      table.milestoneId,
    ),
    check(
      "ck_development_milestone_kind",
      sql`${table.kind} IN ('committed','pushed','pull_request_opened','merged','deployed')`,
    ),
    check(
      "ck_development_milestone_status",
      sql`${table.status} IN ('verified','not_verified','not_applicable')`,
    ),
    check(
      "ck_development_milestone_evidence",
      sql`(${table.status} = 'verified' AND ${table.evidence} IS NOT NULL AND char_length(${table.evidence}) BETWEEN 1 AND 500) OR (${table.status} <> 'verified' AND ${table.evidence} IS NULL)`,
    ),
  ],
);

export const developmentCompletionReportsTable = pgTable(
  "development_completion_reports",
  {
    reportId: text("report_id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => developmentTasksTable.taskId, { onDelete: "cascade" }),
    specificationRevision: integer("specification_revision").notNull(),
    specificationHash: text("specification_hash").notNull(),
    submittedByActorId: text("submitted_by_actor_id")
      .notNull()
      .references(() => developmentActorIdentitiesTable.actorId),
    submittedBy: jsonb("submitted_by")
      .$type<TrustedDevelopmentActor>()
      .notNull(),
    report: jsonb("report").$type<CompletionReportInput>().notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
    current: boolean("current").notNull(),
  },
  (table) => [
    uniqueIndex("uq_development_report_current")
      .on(table.taskId)
      .where(sql`${table.current} = true`),
    index("idx_development_report_history").on(
      table.taskId,
      table.submittedAt,
      table.reportId,
    ),
    check(
      "ck_development_report_hash",
      sql`${table.specificationHash} ~ '^spec_[0-9a-f]{64}$'`,
    ),
    check(
      "ck_development_report_bound",
      sql`octet_length(${table.report}::text) <= 65536`,
    ),
  ],
);

export const developmentIdempotencyRecordsTable = pgTable(
  "development_idempotency_records",
  {
    operation: text("operation").notNull(),
    taskId: text("task_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    result: jsonb("result").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.operation, table.taskId, table.idempotencyKey],
    }),
    index("idx_development_idempotency_created").on(
      table.createdAt,
      table.operation,
      table.taskId,
    ),
    check(
      "ck_development_idempotency_operation",
      sql`char_length(${table.operation}) BETWEEN 1 AND 100`,
    ),
    check(
      "ck_development_idempotency_key",
      sql`char_length(${table.idempotencyKey}) BETWEEN 1 AND 200`,
    ),
    check(
      "ck_development_idempotency_fingerprint",
      sql`${table.requestFingerprint} ~ '^request_[0-9a-f]{64}$'`,
    ),
    check(
      "ck_development_idempotency_result_bound",
      sql`octet_length(${table.result}::text) <= 131072`,
    ),
  ],
);

export const developmentGitHubIdentitiesTable = pgTable(
  "development_github_identities",
  {
    repositoryId: text("repository_id").notNull(),
    actorId: text("actor_id").notNull(),
    displayLogin: text("display_login").notNull(),
    firstObservedAt: timestamp("first_observed_at", { withTimezone: true }).notNull(),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.repositoryId, table.actorId] }),
    check("ck_development_github_identity_ids", sql`${table.repositoryId} ~ '^[1-9][0-9]{0,19}$' AND ${table.actorId} ~ '^[1-9][0-9]{0,19}$'`),
    check("ck_development_github_identity_login", sql`char_length(${table.displayLogin}) BETWEEN 1 AND 100`),
  ],
);

export const developmentGitHubEvidenceTable = pgTable(
  "development_github_evidence",
  {
    evidenceId: text("evidence_id").primaryKey(),
    fingerprint: text("fingerprint").notNull(),
    repositoryId: text("repository_id").notNull(),
    repositoryName: text("repository_name").notNull(),
    objectType: text("object_type").notNull(),
    objectId: text("object_id").notNull(),
    sourceUrl: text("source_url").notNull(),
    actorId: text("actor_id"),
    actorLogin: text("actor_login"),
    sourceCreatedAt: timestamp("source_created_at", { withTimezone: true }).notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }).notNull(),
    contentHash: text("content_hash").notNull(),
    deleted: boolean("deleted").notNull(),
    approvalBinding: jsonb("approval_binding").$type<GitHubApprovalBinding | null>(),
    headSha: text("head_sha"),
    previousHeadSha: text("previous_head_sha"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_development_github_evidence_fingerprint").on(table.repositoryId, table.fingerprint),
    index("idx_development_github_evidence_object").on(table.repositoryId, table.objectType, table.objectId, table.sourceUpdatedAt),
    check("ck_development_github_evidence_id", sql`${table.evidenceId} ~ '^github_evidence_[0-9a-f]{64}$'`),
    check("ck_development_github_evidence_fingerprint", sql`${table.fingerprint} ~ '^github_observation_[0-9a-f]{64}$'`),
    check("ck_development_github_evidence_content_hash", sql`${table.contentHash} ~ '^content_[0-9a-f]{64}$'`),
    check("ck_development_github_evidence_ids", sql`${table.repositoryId} ~ '^[1-9][0-9]{0,19}$' AND ${table.objectId} ~ '^[1-9][0-9]{0,19}$'`),
    check("ck_development_github_evidence_binding_bound", sql`${table.approvalBinding} IS NULL OR octet_length(${table.approvalBinding}::text) <= 4096`),
  ],
);

export const developmentGitHubReconciliationCursorsTable = pgTable(
  "development_github_reconciliation_cursors",
  {
    repositoryId: text("repository_id").notNull(),
    stream: text("stream").notNull(),
    cursor: text("cursor"),
    etag: text("etag"),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true }),
    retryAt: timestamp("retry_at", { withTimezone: true }),
    version: integer("version").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.repositoryId, table.stream] }),
    index("idx_development_github_cursor_retry").on(table.retryAt, table.repositoryId, table.stream),
    check("ck_development_github_cursor_version", sql`${table.version} > 0`),
    check("ck_development_github_cursor_bounds", sql`char_length(${table.stream}) BETWEEN 1 AND 100 AND (${table.cursor} IS NULL OR char_length(${table.cursor}) <= 500) AND (${table.etag} IS NULL OR char_length(${table.etag}) <= 500)`),
  ],
);

export const developmentGitHubReconciliationRunsTable = pgTable(
  "development_github_reconciliation_runs",
  {
    runId: text("run_id").primaryKey(),
    repositoryId: text("repository_id").notNull(),
    stream: text("stream").notNull(),
    operationKey: text("operation_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    status: text("status").notNull(),
    diagnostics: jsonb("diagnostics").$type<readonly GitHubDiagnostic[]>().notNull(),
    summary: jsonb("summary").$type<GitHubReconciliationSummary>().notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_development_github_run_operation").on(table.operationKey, table.requestFingerprint),
    index("idx_development_github_run_repository").on(table.repositoryId, table.stream, table.recordedAt),
    check("ck_development_github_run_id", sql`${table.runId} ~ '^github_run_[0-9a-f]{64}$'`),
    check("ck_development_github_request_fingerprint", sql`${table.requestFingerprint} ~ '^github_request_[0-9a-f]{64}$'`),
    check("ck_development_github_run_status", sql`${table.status} IN ('succeeded','not_modified','rate_limited','unavailable')`),
    check("ck_development_github_run_bounds", sql`octet_length(${table.diagnostics}::text) <= 32768 AND octet_length(${table.summary}::text) <= 65536`),
  ],
);

export const developmentBridgeRequestLedgerTable = pgTable(
  "development_bridge_request_ledger",
  {
    requestFingerprintHash: text("request_fingerprint_hash").primaryKey(),
    principalReferenceHash: text("principal_reference_hash").notNull(),
    tokenIdHash: text("token_id_hash").notNull(),
    nonceHash: text("nonce_hash").notNull(),
    idempotencyKeyHash: text("idempotency_key_hash").notNull(),
    correlationReference: text("correlation_reference").notNull(),
    operation: text("operation").notNull(),
    outcome: text("outcome").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_development_bridge_request_idempotency").on(
      table.principalReferenceHash,
      table.idempotencyKeyHash,
    ),
    uniqueIndex("uq_development_bridge_request_nonce").on(
      table.principalReferenceHash,
      table.nonceHash,
    ),
    index("idx_development_bridge_request_expiry").on(
      table.expiresAt,
      table.requestFingerprintHash,
    ),
    check(
      "ck_development_bridge_request_hashes",
      sql`${table.requestFingerprintHash} ~ '^bridge_request_hash_[0-9a-f]{64}$' AND ${table.principalReferenceHash} ~ '^bridge_principal_hash_[0-9a-f]{64}$' AND ${table.tokenIdHash} ~ '^bridge_token_hash_[0-9a-f]{64}$' AND ${table.nonceHash} ~ '^bridge_nonce_hash_[0-9a-f]{64}$' AND ${table.idempotencyKeyHash} ~ '^bridge_idempotency_hash_[0-9a-f]{64}$'`,
    ),
    check(
      "ck_development_bridge_request_bounds",
      sql`char_length(${table.correlationReference}) BETWEEN 1 AND 200 AND char_length(${table.operation}) BETWEEN 1 AND 100`,
    ),
    check(
      "ck_development_bridge_request_outcome",
      sql`${table.outcome} IN ('claimed','allowed','denied','failed')`,
    ),
    check(
      "ck_development_bridge_request_expiry_order",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

export const developmentBridgeRateLimitsTable = pgTable(
  "development_bridge_rate_limits",
  {
    principalReferenceHash: text("principal_reference_hash").notNull(),
    windowStartedAt: timestamp("window_started_at", {
      withTimezone: true,
    }).notNull(),
    requestCount: integer("request_count").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.principalReferenceHash, table.windowStartedAt],
    }),
    index("idx_development_bridge_rate_limit_expiry").on(
      table.expiresAt,
      table.principalReferenceHash,
    ),
    check(
      "ck_development_bridge_rate_limit_principal",
      sql`${table.principalReferenceHash} ~ '^bridge_principal_hash_[0-9a-f]{64}$'`,
    ),
    check(
      "ck_development_bridge_rate_limit_count",
      sql`${table.requestCount} > 0 AND ${table.requestCount} <= 1000`,
    ),
    check(
      "ck_development_bridge_rate_limit_expiry_order",
      sql`${table.expiresAt} > ${table.windowStartedAt}`,
    ),
  ],
);

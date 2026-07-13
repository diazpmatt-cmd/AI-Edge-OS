import { check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const backlinkProspectsTable = pgTable("backlink_prospects", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull(), prospectType: text("prospect_type").notNull(),
  domain: text("domain").notNull(), pageUrl: text("page_url"), displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("uq_backlink_prospects_id_client").on(table.id, table.clientId),
  uniqueIndex("uq_backlink_prospects_client_domain_page").on(table.clientId, table.domain, sql`COALESCE(${table.pageUrl}, '')`),
  index("idx_backlink_prospects_client_domain").on(table.clientId, table.domain),
  check("ck_backlink_prospect_type", sql`${table.prospectType} IN ('domain','page','directory','organization','partnership','other')`),
]);

export const backlinkEvidenceTable = pgTable("backlink_evidence", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull(), prospectId: text("prospect_id").notNull(),
  sourceDomain: text("source_domain").notNull(), sourceUrl: text("source_url").notNull(), targetUrl: text("target_url"), competitorUrl: text("competitor_url"),
  category: text("category").notNull(), serviceId: text("service_id"), providers: jsonb("providers").notNull().default([]),
  providerMetadata: jsonb("provider_metadata").notNull().default({}), discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull(),
  freshnessDays: integer("freshness_days").notNull(), localRelevance: integer("local_relevance").notNull(), serviceRelevance: integer("service_relevance").notNull(),
  competitorFrequency: integer("competitor_frequency").notNull(), relationshipAccessibility: integer("relationship_accessibility").notNull(),
  editorialRequirements: integer("editorial_requirements").notNull(), estimatedEffort: integer("estimated_effort").notNull(), authority: integer("authority").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("uq_backlink_evidence_id_client").on(table.id, table.clientId),
  index("idx_backlink_evidence_prospect_client").on(table.prospectId, table.clientId, table.discoveredAt),
  foreignKey({ name: "fk_backlink_evidence_prospect_tenant", columns: [table.prospectId, table.clientId], foreignColumns: [backlinkProspectsTable.id, backlinkProspectsTable.clientId] }),
]);

export const backlinkOpportunitiesTable = pgTable("backlink_opportunities", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull(), prospectId: text("prospect_id").notNull(), category: text("category").notNull(),
  serviceId: text("service_id"), potentialValue: integer("potential_value").notNull(), attainability: integer("attainability").notNull(),
  rationale: text("rationale").notNull(), recommendedAction: text("recommended_action").notNull(), evidenceIds: jsonb("evidence_ids").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("uq_backlink_opportunities_id_client").on(table.id, table.clientId),
  uniqueIndex("uq_backlink_opportunities_client_prospect_category_service").on(table.clientId, table.prospectId, table.category, table.serviceId),
  index("idx_backlink_opportunities_client_rank").on(table.clientId, table.attainability, table.potentialValue, table.id),
  index("idx_backlink_opportunities_client_category").on(table.clientId, table.category),
  foreignKey({ name: "fk_backlink_opportunity_prospect_tenant", columns: [table.prospectId, table.clientId], foreignColumns: [backlinkProspectsTable.id, backlinkProspectsTable.clientId] }),
  check("ck_backlink_opportunity_potential", sql`${table.potentialValue} BETWEEN 0 AND 100`),
  check("ck_backlink_opportunity_attainability", sql`${table.attainability} BETWEEN 0 AND 100`),
  check("ck_backlink_opportunity_rationale_length", sql`char_length(${table.rationale}) <= 2000`),
  check("ck_backlink_opportunity_action_length", sql`char_length(${table.recommendedAction}) <= 1000`),
]);

export const backlinkWorkflowsTable = pgTable("backlink_workflows", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull(), opportunityId: text("opportunity_id").notNull(), status: text("status").notNull().default("discovered"),
  ownerId: text("owner_id"), nextAction: text("next_action"), dueAt: timestamp("due_at", { withTimezone: true }), outcomeSummary: text("outcome_summary"),
  version: integer("version").notNull().default(1), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(), completedAt: timestamp("completed_at", { withTimezone: true }),
}, table => [
  uniqueIndex("uq_backlink_workflows_id_client").on(table.id, table.clientId),
  uniqueIndex("uq_backlink_workflows_opportunity_client").on(table.opportunityId, table.clientId),
  index("idx_backlink_workflows_client_status").on(table.clientId, table.status, table.opportunityId),
  foreignKey({ name: "fk_backlink_workflow_opportunity_tenant", columns: [table.opportunityId, table.clientId], foreignColumns: [backlinkOpportunitiesTable.id, backlinkOpportunitiesTable.clientId] }),
  check("ck_backlink_workflow_status", sql`${table.status} IN ('discovered','reviewing','approved','pursuing','won','rejected','expired')`),
  check("ck_backlink_workflow_owner_length", sql`${table.ownerId} IS NULL OR char_length(${table.ownerId}) <= 200`),
  check("ck_backlink_workflow_action_length", sql`${table.nextAction} IS NULL OR char_length(${table.nextAction}) <= 1000`),
  check("ck_backlink_workflow_outcome_length", sql`${table.outcomeSummary} IS NULL OR char_length(${table.outcomeSummary}) <= 2000`),
]);

export const backlinkWorkflowEventsTable = pgTable("backlink_workflow_events", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull(), workflowId: text("workflow_id").notNull(), opportunityId: text("opportunity_id").notNull(),
  sequence: integer("sequence").notNull(), fromStatus: text("from_status"), toStatus: text("to_status").notNull(), actorId: text("actor_id"), reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("uq_backlink_workflow_events_id_client").on(table.id, table.clientId),
  uniqueIndex("uq_backlink_workflow_events_workflow_sequence").on(table.workflowId, table.clientId, table.sequence),
  index("idx_backlink_workflow_events_opportunity_client").on(table.opportunityId, table.clientId, table.sequence),
  foreignKey({ name: "fk_backlink_event_workflow_tenant", columns: [table.workflowId, table.clientId], foreignColumns: [backlinkWorkflowsTable.id, backlinkWorkflowsTable.clientId] }),
  foreignKey({ name: "fk_backlink_event_opportunity_tenant", columns: [table.opportunityId, table.clientId], foreignColumns: [backlinkOpportunitiesTable.id, backlinkOpportunitiesTable.clientId] }),
  check("ck_backlink_event_to_status", sql`${table.toStatus} IN ('discovered','reviewing','approved','pursuing','won','rejected','expired')`),
  check("ck_backlink_event_from_status", sql`${table.fromStatus} IS NULL OR ${table.fromStatus} IN ('discovered','reviewing','approved','pursuing','won','rejected','expired')`),
  check("ck_backlink_event_reason_length", sql`${table.reason} IS NULL OR char_length(${table.reason}) <= 1000`),
]);

export const backlinkIngestionRunsTable = pgTable("backlink_ingestion_runs", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull(), providerId: text("provider_id").notNull(),
  providerRevision: text("provider_revision").notNull(), mode: text("mode").notNull(), status: text("status").notNull(),
  capabilities: jsonb("capabilities").notNull().default([]), inputFingerprint: text("input_fingerprint").notNull(),
  attemptCount: integer("attempt_count").notNull().default(1), startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  attemptStartedAt: timestamp("attempt_started_at", { withTimezone: true }).notNull(), completedAt: timestamp("completed_at", { withTimezone: true }),
  observedCount: integer("observed_count"), acceptedCount: integer("accepted_count"), rejectedCount: integer("rejected_count"),
  mergedEvidenceCount: integer("merged_evidence_count"), prospectCount: integer("prospect_count"), evidenceCount: integer("evidence_count"),
  opportunityCount: integer("opportunity_count"), workflowCount: integer("workflow_count"), resultSummary: jsonb("result_summary"),
  failureStage: text("failure_stage"), failureCode: text("failure_code"),
}, table => [
  uniqueIndex("uq_backlink_ingestion_runs_id_client").on(table.id, table.clientId),
  uniqueIndex("uq_backlink_ingestion_runs_identity").on(table.clientId, table.providerId, table.providerRevision, table.mode, table.inputFingerprint),
  index("idx_backlink_ingestion_runs_client_started").on(table.clientId, table.startedAt.desc(), table.id),
  index("idx_backlink_ingestion_runs_client_status").on(table.clientId, table.status, table.startedAt),
  check("ck_backlink_ingestion_provider_id", sql`char_length(${table.providerId}) BETWEEN 1 AND 100`),
  check("ck_backlink_ingestion_provider_revision", sql`char_length(${table.providerRevision}) BETWEEN 1 AND 100`),
  check("ck_backlink_ingestion_mode", sql`${table.mode} = 'manual'`),
  check("ck_backlink_ingestion_status", sql`${table.status} IN ('running','succeeded','failed')`),
  check("ck_backlink_ingestion_capabilities", sql`jsonb_typeof(${table.capabilities}) = 'array' AND jsonb_array_length(${table.capabilities}) <= 8 AND
    ${table.capabilities} <@ '["referring_domains","link_intersections","brand_mentions","broken_links","authority_metrics","resource_page_discovery","citation_directory_discovery","partnership_organization_discovery"]'::jsonb`),
  check("ck_backlink_ingestion_result_summary_bound", sql`${table.resultSummary} IS NULL OR (
    jsonb_typeof(${table.resultSummary}) = 'object' AND octet_length(${table.resultSummary}::text) <= 65536 AND
    ${table.resultSummary} ?& ARRAY['observed','accepted','rejected','mergedEvidence','prospectCount','evidenceCount','opportunityCount','workflowCount','prospectIds','evidenceIds','opportunityIds','workflowIds'] AND
    (${table.resultSummary} - ARRAY['observed','accepted','rejected','mergedEvidence','prospectCount','evidenceCount','opportunityCount','workflowCount','prospectIds','evidenceIds','opportunityIds','workflowIds']) = '{}'::jsonb AND
    (${table.resultSummary}->>'observed') ~ '^\d+$' AND (${table.resultSummary}->>'accepted') ~ '^\d+$' AND (${table.resultSummary}->>'rejected') ~ '^\d+$' AND
    (${table.resultSummary}->>'mergedEvidence') ~ '^\d+$' AND (${table.resultSummary}->>'prospectCount') ~ '^\d+$' AND (${table.resultSummary}->>'evidenceCount') ~ '^\d+$' AND
    (${table.resultSummary}->>'opportunityCount') ~ '^\d+$' AND (${table.resultSummary}->>'workflowCount') ~ '^\d+$' AND
    jsonb_typeof(${table.resultSummary}->'prospectIds') = 'array' AND jsonb_array_length(${table.resultSummary}->'prospectIds') <= 100 AND
    jsonb_typeof(${table.resultSummary}->'evidenceIds') = 'array' AND jsonb_array_length(${table.resultSummary}->'evidenceIds') <= 100 AND
    jsonb_typeof(${table.resultSummary}->'opportunityIds') = 'array' AND jsonb_array_length(${table.resultSummary}->'opportunityIds') <= 100 AND
    jsonb_typeof(${table.resultSummary}->'workflowIds') = 'array' AND jsonb_array_length(${table.resultSummary}->'workflowIds') <= 100 AND
    NOT jsonb_path_exists(${table.resultSummary}, '$.prospectIds[*] ? (@.type() != "string")') AND
    NOT jsonb_path_exists(${table.resultSummary}, '$.evidenceIds[*] ? (@.type() != "string")') AND
    NOT jsonb_path_exists(${table.resultSummary}, '$.opportunityIds[*] ? (@.type() != "string")') AND
    NOT jsonb_path_exists(${table.resultSummary}, '$.workflowIds[*] ? (@.type() != "string")') AND
    (${table.resultSummary}->>'prospectCount')::integer = jsonb_array_length(${table.resultSummary}->'prospectIds') AND
    (${table.resultSummary}->>'evidenceCount')::integer = jsonb_array_length(${table.resultSummary}->'evidenceIds') AND
    (${table.resultSummary}->>'opportunityCount')::integer = jsonb_array_length(${table.resultSummary}->'opportunityIds') AND
    (${table.resultSummary}->>'workflowCount')::integer = jsonb_array_length(${table.resultSummary}->'workflowIds'))`),
  check("ck_backlink_ingestion_fingerprint", sql`${table.inputFingerprint} ~ '^[0-9a-f]{64}$'`),
  check("ck_backlink_ingestion_attempt", sql`${table.attemptCount} > 0`),
  check("ck_backlink_ingestion_failure_stage", sql`${table.failureStage} IS NULL OR ${table.failureStage} IN ('provider','preparation','prospect','evidence','opportunity','workflow','initial_event','finalization')`),
  check("ck_backlink_ingestion_failure_code", sql`${table.failureCode} IS NULL OR ${table.failureCode} IN ('provider_failed','validation_failed','persistence_failed','finalization_failed')`),
  check("ck_backlink_ingestion_nonnegative_counts", sql`
    (${table.observedCount} IS NULL OR ${table.observedCount} >= 0) AND
    (${table.acceptedCount} IS NULL OR ${table.acceptedCount} >= 0) AND
    (${table.rejectedCount} IS NULL OR ${table.rejectedCount} >= 0) AND
    (${table.mergedEvidenceCount} IS NULL OR ${table.mergedEvidenceCount} >= 0) AND
    (${table.prospectCount} IS NULL OR ${table.prospectCount} >= 0) AND
    (${table.evidenceCount} IS NULL OR ${table.evidenceCount} >= 0) AND
    (${table.opportunityCount} IS NULL OR ${table.opportunityCount} >= 0) AND
    (${table.workflowCount} IS NULL OR ${table.workflowCount} >= 0)`),
  check("ck_backlink_ingestion_terminal_time", sql`(${table.status} = 'running' AND ${table.completedAt} IS NULL) OR (${table.status} IN ('succeeded','failed') AND ${table.completedAt} IS NOT NULL)`),
  check("ck_backlink_ingestion_timestamps", sql`${table.attemptStartedAt} >= ${table.startedAt} AND (${table.completedAt} IS NULL OR ${table.completedAt} >= ${table.attemptStartedAt})`),
  check("ck_backlink_ingestion_failure", sql`(${table.status} = 'failed' AND ${table.failureStage} IS NOT NULL AND ${table.failureCode} IS NOT NULL) OR (${table.status} <> 'failed' AND ${table.failureStage} IS NULL AND ${table.failureCode} IS NULL)`),
  check("ck_backlink_ingestion_result_counts", sql`(${table.status} = 'succeeded' AND ${table.prospectCount} IS NOT NULL AND ${table.evidenceCount} IS NOT NULL AND ${table.opportunityCount} IS NOT NULL AND ${table.workflowCount} IS NOT NULL AND ${table.resultSummary} IS NOT NULL) OR (${table.status} <> 'succeeded' AND ${table.prospectCount} IS NULL AND ${table.evidenceCount} IS NULL AND ${table.opportunityCount} IS NULL AND ${table.workflowCount} IS NULL AND ${table.resultSummary} IS NULL)`),
]);

export type BacklinkProspectRow = typeof backlinkProspectsTable.$inferSelect;
export type BacklinkEvidenceRow = typeof backlinkEvidenceTable.$inferSelect;
export type BacklinkOpportunityRow = typeof backlinkOpportunitiesTable.$inferSelect;
export type BacklinkWorkflowRow = typeof backlinkWorkflowsTable.$inferSelect;
export type BacklinkWorkflowEventRow = typeof backlinkWorkflowEventsTable.$inferSelect;
export type BacklinkIngestionRunRow = typeof backlinkIngestionRunsTable.$inferSelect;

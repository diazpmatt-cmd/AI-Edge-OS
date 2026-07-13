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

export type BacklinkProspectRow = typeof backlinkProspectsTable.$inferSelect;
export type BacklinkEvidenceRow = typeof backlinkEvidenceTable.$inferSelect;
export type BacklinkOpportunityRow = typeof backlinkOpportunitiesTable.$inferSelect;
export type BacklinkWorkflowRow = typeof backlinkWorkflowsTable.$inferSelect;
export type BacklinkWorkflowEventRow = typeof backlinkWorkflowEventsTable.$inferSelect;

import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  backlinkOpportunitiesTable,
  backlinkWorkflowsTable,
} from "./backlinks";

export const authorityOutreachDraftsTable = pgTable("authority_outreach_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: text("client_id").notNull(),
  opportunityId: text("opportunity_id").notNull(),
  workflowId: text("workflow_id").notNull(),
  status: text("status").notNull().default("draft"),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  provenance: jsonb("provenance").notNull().default({}),
  generatedBy: text("generated_by").notNull().default("deterministic_template_v1"),
  version: integer("version").notNull().default(1),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: text("approved_by"),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique("uq_authority_outreach_drafts_id_client").on(table.id, table.clientId),
  uniqueIndex("uq_authority_outreach_drafts_opportunity_client").on(table.opportunityId, table.clientId),
  index("idx_authority_outreach_drafts_client_status").on(table.clientId, table.status, table.updatedAt),
  foreignKey({
    name: "fk_authority_outreach_draft_opportunity_tenant",
    columns: [table.opportunityId, table.clientId],
    foreignColumns: [backlinkOpportunitiesTable.id, backlinkOpportunitiesTable.clientId],
  }),
  foreignKey({
    name: "fk_authority_outreach_draft_workflow_tenant",
    columns: [table.workflowId, table.clientId],
    foreignColumns: [backlinkWorkflowsTable.id, backlinkWorkflowsTable.clientId],
  }),
  check("ck_authority_outreach_draft_status", sql`${table.status} IN ('draft','approved','rejected')`),
  check("ck_authority_outreach_draft_subject", sql`char_length(${table.subject}) BETWEEN 1 AND 300`),
  check("ck_authority_outreach_draft_body", sql`char_length(${table.body}) BETWEEN 1 AND 8000`),
  check("ck_authority_outreach_draft_version", sql`${table.version} > 0`),
  check("ck_authority_outreach_draft_provenance", sql`jsonb_typeof(${table.provenance}) = 'object' AND octet_length(${table.provenance}::text) <= 65536`),
  check("ck_authority_outreach_draft_approval_pair", sql`(${table.status} = 'approved' AND ${table.approvedAt} IS NOT NULL AND ${table.approvedBy} IS NOT NULL) OR (${table.status} <> 'approved' AND ${table.approvedAt} IS NULL AND ${table.approvedBy} IS NULL)`),
]);

export const authorityOutreachDraftVersionsTable = pgTable("authority_outreach_draft_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  draftId: uuid("draft_id").notNull(),
  clientId: text("client_id").notNull(),
  opportunityId: text("opportunity_id").notNull(),
  workflowId: text("workflow_id").notNull(),
  version: integer("version").notNull(),
  action: text("action").notNull(),
  status: text("status").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  provenance: jsonb("provenance").notNull().default({}),
  generatedBy: text("generated_by").notNull(),
  actorId: text("actor_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("uq_authority_outreach_draft_versions_draft_version").on(table.draftId, table.clientId, table.version),
  index("idx_authority_outreach_draft_versions_opportunity").on(table.clientId, table.opportunityId, table.version),
  foreignKey({
    name: "fk_authority_outreach_draft_version_draft_tenant",
    columns: [table.draftId, table.clientId],
    foreignColumns: [authorityOutreachDraftsTable.id, authorityOutreachDraftsTable.clientId],
  }),
  foreignKey({
    name: "fk_authority_outreach_draft_version_opportunity_tenant",
    columns: [table.opportunityId, table.clientId],
    foreignColumns: [backlinkOpportunitiesTable.id, backlinkOpportunitiesTable.clientId],
  }),
  foreignKey({
    name: "fk_authority_outreach_draft_version_workflow_tenant",
    columns: [table.workflowId, table.clientId],
    foreignColumns: [backlinkWorkflowsTable.id, backlinkWorkflowsTable.clientId],
  }),
  check("ck_authority_outreach_draft_version_action", sql`${table.action} IN ('create','save','approve','reopen','reject')`),
  check("ck_authority_outreach_draft_version_status", sql`${table.status} IN ('draft','approved','rejected')`),
  check("ck_authority_outreach_draft_version_subject", sql`char_length(${table.subject}) BETWEEN 1 AND 300`),
  check("ck_authority_outreach_draft_version_body", sql`char_length(${table.body}) BETWEEN 1 AND 8000`),
  check("ck_authority_outreach_draft_version_number", sql`${table.version} > 0`),
  check("ck_authority_outreach_draft_version_provenance", sql`jsonb_typeof(${table.provenance}) = 'object' AND octet_length(${table.provenance}::text) <= 65536`),
]);

export type AuthorityOutreachDraftRow = typeof authorityOutreachDraftsTable.$inferSelect;
export type AuthorityOutreachDraftVersionRow = typeof authorityOutreachDraftVersionsTable.$inferSelect;

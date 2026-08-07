import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  backlinkOpportunitiesTable,
  backlinkProspectsTable,
  backlinkWorkflowsTable,
} from "./backlinks";

export const authorityAcquisitionProofsTable = pgTable("authority_acquisition_proofs", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: text("client_id").notNull(),
  opportunityId: text("opportunity_id").notNull(),
  prospectId: text("prospect_id").notNull(),
  workflowId: text("workflow_id").notNull(),
  proofType: text("proof_type").notNull(),
  sourceUrl: text("source_url").notNull(),
  targetUrl: text("target_url"),
  notes: text("notes"),
  verificationStatus: text("verification_status").notNull().default("unverified"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedBy: text("verified_by"),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique("uq_authority_acquisition_proofs_id_client").on(table.id, table.clientId),
  index("idx_authority_acquisition_proofs_opportunity").on(table.clientId, table.opportunityId, table.verificationStatus, table.updatedAt),
  foreignKey({
    name: "fk_authority_acquisition_proof_opportunity_tenant",
    columns: [table.opportunityId, table.clientId],
    foreignColumns: [backlinkOpportunitiesTable.id, backlinkOpportunitiesTable.clientId],
  }),
  foreignKey({
    name: "fk_authority_acquisition_proof_prospect_tenant",
    columns: [table.prospectId, table.clientId],
    foreignColumns: [backlinkProspectsTable.id, backlinkProspectsTable.clientId],
  }),
  foreignKey({
    name: "fk_authority_acquisition_proof_workflow_tenant",
    columns: [table.workflowId, table.clientId],
    foreignColumns: [backlinkWorkflowsTable.id, backlinkWorkflowsTable.clientId],
  }),
  check("ck_authority_acquisition_proof_type", sql`${table.proofType} IN ('backlink_live','citation_live','partnership_confirmed','sponsorship_confirmed','guest_post_live','other')`),
  check("ck_authority_acquisition_proof_verification", sql`${table.verificationStatus} IN ('unverified','human_verified','invalid')`),
  check("ck_authority_acquisition_proof_source", sql`char_length(${table.sourceUrl}) BETWEEN 1 AND 2000`),
  check("ck_authority_acquisition_proof_target", sql`${table.targetUrl} IS NULL OR char_length(${table.targetUrl}) <= 2000`),
  check("ck_authority_acquisition_proof_notes", sql`${table.notes} IS NULL OR char_length(${table.notes}) <= 4000`),
  check("ck_authority_acquisition_proof_version", sql`${table.version} > 0`),
  check("ck_authority_acquisition_proof_verified_pair", sql`(${table.verificationStatus} = 'human_verified' AND ${table.verifiedAt} IS NOT NULL AND ${table.verifiedBy} IS NOT NULL) OR (${table.verificationStatus} <> 'human_verified' AND ${table.verifiedAt} IS NULL AND ${table.verifiedBy} IS NULL)`),
]);

export type AuthorityAcquisitionProofRow = typeof authorityAcquisitionProofsTable.$inferSelect;

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
} from "./backlinks";

export const authorityTargetContactsTable = pgTable("authority_target_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: text("client_id").notNull(),
  opportunityId: text("opportunity_id").notNull(),
  prospectId: text("prospect_id").notNull(),
  organizationName: text("organization_name").notNull(),
  contactName: text("contact_name"),
  roleTitle: text("role_title"),
  contactMethod: text("contact_method").notNull(),
  email: text("email"),
  phone: text("phone"),
  contactUrl: text("contact_url"),
  sourceUrl: text("source_url"),
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
  unique("uq_authority_target_contacts_id_client").on(table.id, table.clientId),
  index("idx_authority_target_contacts_opportunity").on(table.clientId, table.opportunityId, table.verificationStatus, table.updatedAt),
  foreignKey({
    name: "fk_authority_target_contact_opportunity_tenant",
    columns: [table.opportunityId, table.clientId],
    foreignColumns: [backlinkOpportunitiesTable.id, backlinkOpportunitiesTable.clientId],
  }),
  foreignKey({
    name: "fk_authority_target_contact_prospect_tenant",
    columns: [table.prospectId, table.clientId],
    foreignColumns: [backlinkProspectsTable.id, backlinkProspectsTable.clientId],
  }),
  check("ck_authority_target_contact_method", sql`${table.contactMethod} IN ('email','phone','contact_form','social','other')`),
  check("ck_authority_target_contact_verification", sql`${table.verificationStatus} IN ('unverified','human_verified','invalid')`),
  check("ck_authority_target_contact_org", sql`char_length(${table.organizationName}) BETWEEN 1 AND 300`),
  check("ck_authority_target_contact_name", sql`${table.contactName} IS NULL OR char_length(${table.contactName}) <= 300`),
  check("ck_authority_target_contact_role", sql`${table.roleTitle} IS NULL OR char_length(${table.roleTitle}) <= 300`),
  check("ck_authority_target_contact_email", sql`${table.email} IS NULL OR char_length(${table.email}) <= 320`),
  check("ck_authority_target_contact_phone", sql`${table.phone} IS NULL OR char_length(${table.phone}) <= 80`),
  check("ck_authority_target_contact_url", sql`${table.contactUrl} IS NULL OR char_length(${table.contactUrl}) <= 2000`),
  check("ck_authority_target_contact_source", sql`${table.sourceUrl} IS NULL OR char_length(${table.sourceUrl}) <= 2000`),
  check("ck_authority_target_contact_notes", sql`${table.notes} IS NULL OR char_length(${table.notes}) <= 4000`),
  check("ck_authority_target_contact_path", sql`${table.email} IS NOT NULL OR ${table.phone} IS NOT NULL OR ${table.contactUrl} IS NOT NULL`),
  check("ck_authority_target_contact_version", sql`${table.version} > 0`),
  check("ck_authority_target_contact_verified_pair", sql`(${table.verificationStatus} = 'human_verified' AND ${table.verifiedAt} IS NOT NULL AND ${table.verifiedBy} IS NOT NULL AND ${table.sourceUrl} IS NOT NULL) OR (${table.verificationStatus} <> 'human_verified' AND ${table.verifiedAt} IS NULL AND ${table.verifiedBy} IS NULL)`),
]);

export type AuthorityTargetContactRow = typeof authorityTargetContactsTable.$inferSelect;

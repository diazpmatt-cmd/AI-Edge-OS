import { pool } from "@workspace/db";
import {
  nextAuthorityTargetContactVerification,
  validateAuthorityTargetContactExpectedVersion,
  validateAuthorityTargetContactInput,
  verificationAfterAuthorityTargetContactEdit,
  type AuthorityTargetContactAction,
  type AuthorityTargetContactInput,
  type AuthorityTargetContactVerification,
} from "./authority-target-contact-lifecycle.js";

interface ContactRow {
  id: string;
  client_id: string;
  opportunity_id: string;
  prospect_id: string;
  organization_name: string;
  contact_name: string | null;
  role_title: string | null;
  contact_method: string;
  email: string | null;
  phone: string | null;
  contact_url: string | null;
  source_url: string | null;
  notes: string | null;
  verification_status: string;
  verified_at: Date | null;
  verified_by: string | null;
  version: number;
  created_by: string;
  updated_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface AuthorityTargetContactRecord extends AuthorityTargetContactInput {
  id: string;
  clientId: string;
  opportunityId: string;
  prospectId: string;
  verificationStatus: AuthorityTargetContactVerification;
  verifiedAt: string | null;
  verifiedBy: string | null;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: ContactRow): AuthorityTargetContactRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    opportunityId: row.opportunity_id,
    prospectId: row.prospect_id,
    organizationName: row.organization_name,
    contactName: row.contact_name,
    roleTitle: row.role_title,
    contactMethod: row.contact_method as AuthorityTargetContactRecord["contactMethod"],
    email: row.email,
    phone: row.phone,
    contactUrl: row.contact_url,
    sourceUrl: row.source_url,
    notes: row.notes,
    verificationStatus: row.verification_status as AuthorityTargetContactVerification,
    verifiedAt: row.verified_at?.toISOString() ?? null,
    verifiedBy: row.verified_by,
    version: row.version,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listAuthorityTargetContacts(
  opportunityId: string,
  clientId: string,
): Promise<AuthorityTargetContactRecord[]> {
  const result = await pool.query<ContactRow>(
    `SELECT * FROM authority_target_contacts
     WHERE opportunity_id = $1 AND client_id = $2
     ORDER BY created_at ASC, id ASC`,
    [opportunityId, clientId],
  );
  return result.rows.map(mapRow);
}

export async function createAuthorityTargetContact(input: {
  clientId: string;
  opportunityId: string;
  prospectId: string;
  actorId: string;
  contact: Record<string, unknown>;
}): Promise<AuthorityTargetContactRecord> {
  const contact = validateAuthorityTargetContactInput(input.contact);
  const result = await pool.query<ContactRow>(
    `INSERT INTO authority_target_contacts (
       client_id, opportunity_id, prospect_id, organization_name, contact_name,
       role_title, contact_method, email, phone, contact_url, source_url, notes,
       verification_status, verified_at, verified_by, version, created_by, updated_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'unverified',NULL,NULL,1,$13,$13)
     RETURNING *`,
    [
      input.clientId,
      input.opportunityId,
      input.prospectId,
      contact.organizationName,
      contact.contactName,
      contact.roleTitle,
      contact.contactMethod,
      contact.email,
      contact.phone,
      contact.contactUrl,
      contact.sourceUrl,
      contact.notes,
      input.actorId,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error("authority_target_contact_insert_failed");
  return mapRow(row);
}

export async function updateAuthorityTargetContact(input: {
  id: string;
  clientId: string;
  actorId: string;
  expectedVersion: unknown;
  contact: Record<string, unknown>;
}): Promise<AuthorityTargetContactRecord> {
  const expectedVersion = validateAuthorityTargetContactExpectedVersion(input.expectedVersion);
  const contact = validateAuthorityTargetContactInput(input.contact);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query<ContactRow>(
      `SELECT * FROM authority_target_contacts
       WHERE id = $1 AND client_id = $2
       FOR UPDATE`,
      [input.id, input.clientId],
    );
    const current = selected.rows[0];
    if (!current) throw new Error("authority_target_contact_not_found");
    if (current.version !== expectedVersion) throw new Error("authority_target_contact_version_conflict");
    const verificationStatus = verificationAfterAuthorityTargetContactEdit(
      current.verification_status as AuthorityTargetContactVerification,
    );

    const updated = await client.query<ContactRow>(
      `UPDATE authority_target_contacts
       SET organization_name = $3,
           contact_name = $4,
           role_title = $5,
           contact_method = $6,
           email = $7,
           phone = $8,
           contact_url = $9,
           source_url = $10,
           notes = $11,
           verification_status = $12,
           verified_at = NULL,
           verified_by = NULL,
           version = $13,
           updated_by = $14,
           updated_at = NOW()
       WHERE id = $1 AND client_id = $2 AND version = $15
       RETURNING *`,
      [
        input.id,
        input.clientId,
        contact.organizationName,
        contact.contactName,
        contact.roleTitle,
        contact.contactMethod,
        contact.email,
        contact.phone,
        contact.contactUrl,
        contact.sourceUrl,
        contact.notes,
        verificationStatus,
        current.version + 1,
        input.actorId,
        expectedVersion,
      ],
    );
    const row = updated.rows[0];
    if (!row) throw new Error("authority_target_contact_version_conflict");
    await client.query("COMMIT");
    return mapRow(row);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function actOnAuthorityTargetContact(input: {
  id: string;
  clientId: string;
  actorId: string;
  expectedVersion: unknown;
  action: AuthorityTargetContactAction;
}): Promise<AuthorityTargetContactRecord> {
  const expectedVersion = validateAuthorityTargetContactExpectedVersion(input.expectedVersion);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query<ContactRow>(
      `SELECT * FROM authority_target_contacts
       WHERE id = $1 AND client_id = $2
       FOR UPDATE`,
      [input.id, input.clientId],
    );
    const current = selected.rows[0];
    if (!current) throw new Error("authority_target_contact_not_found");
    if (current.version !== expectedVersion) throw new Error("authority_target_contact_version_conflict");

    const status = nextAuthorityTargetContactVerification(
      input.action,
      current.verification_status as AuthorityTargetContactVerification,
      current.source_url,
    );
    const verifiedAt = status === "human_verified" ? new Date() : null;
    const verifiedBy = status === "human_verified" ? input.actorId : null;

    const updated = await client.query<ContactRow>(
      `UPDATE authority_target_contacts
       SET verification_status = $3,
           verified_at = $4,
           verified_by = $5,
           version = $6,
           updated_by = $7,
           updated_at = NOW()
       WHERE id = $1 AND client_id = $2 AND version = $8
       RETURNING *`,
      [
        input.id,
        input.clientId,
        status,
        verifiedAt,
        verifiedBy,
        current.version + 1,
        input.actorId,
        expectedVersion,
      ],
    );
    const row = updated.rows[0];
    if (!row) throw new Error("authority_target_contact_version_conflict");
    await client.query("COMMIT");
    return mapRow(row);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

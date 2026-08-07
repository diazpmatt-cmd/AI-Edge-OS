import { pool } from "@workspace/db";
import {
  planAuthorityOutreachDraftMutation,
  validateAuthorityOutreachDraftExpectedVersion,
  validateAuthorityOutreachDraftText,
  type AuthorityOutreachDraftMutationAction,
  type AuthorityOutreachDraftStatus,
} from "./authority-outreach-draft-lifecycle.js";

export interface AuthorityOutreachDraftRecord {
  id: string;
  clientId: string;
  opportunityId: string;
  workflowId: string;
  status: AuthorityOutreachDraftStatus;
  subject: string;
  body: string;
  provenance: Record<string, unknown>;
  generatedBy: string;
  version: number;
  approvedAt: string | null;
  approvedBy: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthorityOutreachDraftVersionRecord {
  id: string;
  draftId: string;
  clientId: string;
  opportunityId: string;
  workflowId: string;
  version: number;
  action: "create" | AuthorityOutreachDraftMutationAction;
  status: AuthorityOutreachDraftStatus;
  subject: string;
  body: string;
  provenance: Record<string, unknown>;
  generatedBy: string;
  actorId: string;
  createdAt: string;
}

interface DraftRow {
  id: string;
  client_id: string;
  opportunity_id: string;
  workflow_id: string;
  status: string;
  subject: string;
  body: string;
  provenance: unknown;
  generated_by: string;
  version: number;
  approved_at: Date | null;
  approved_by: string | null;
  created_by: string;
  updated_by: string;
  created_at: Date;
  updated_at: Date;
}

interface VersionRow {
  id: string;
  draft_id: string;
  client_id: string;
  opportunity_id: string;
  workflow_id: string;
  version: number;
  action: string;
  status: string;
  subject: string;
  body: string;
  provenance: unknown;
  generated_by: string;
  actor_id: string;
  created_at: Date;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function mapDraft(row: DraftRow): AuthorityOutreachDraftRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    opportunityId: row.opportunity_id,
    workflowId: row.workflow_id,
    status: row.status as AuthorityOutreachDraftStatus,
    subject: row.subject,
    body: row.body,
    provenance: asObject(row.provenance),
    generatedBy: row.generated_by,
    version: row.version,
    approvedAt: row.approved_at?.toISOString() ?? null,
    approvedBy: row.approved_by,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapVersion(row: VersionRow): AuthorityOutreachDraftVersionRecord {
  return {
    id: row.id,
    draftId: row.draft_id,
    clientId: row.client_id,
    opportunityId: row.opportunity_id,
    workflowId: row.workflow_id,
    version: row.version,
    action: row.action as AuthorityOutreachDraftVersionRecord["action"],
    status: row.status as AuthorityOutreachDraftStatus,
    subject: row.subject,
    body: row.body,
    provenance: asObject(row.provenance),
    generatedBy: row.generated_by,
    actorId: row.actor_id,
    createdAt: row.created_at.toISOString(),
  };
}

export async function getAuthorityOutreachDraft(
  opportunityId: string,
  clientId: string,
): Promise<AuthorityOutreachDraftRecord | null> {
  const result = await pool.query<DraftRow>(
    `SELECT * FROM authority_outreach_drafts
     WHERE opportunity_id = $1 AND client_id = $2
     LIMIT 1`,
    [opportunityId, clientId],
  );
  return result.rows[0] ? mapDraft(result.rows[0]) : null;
}

export async function listAuthorityOutreachDraftVersions(
  opportunityId: string,
  clientId: string,
  limit = 25,
): Promise<AuthorityOutreachDraftVersionRecord[]> {
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const result = await pool.query<VersionRow>(
    `SELECT * FROM authority_outreach_draft_versions
     WHERE opportunity_id = $1 AND client_id = $2
     ORDER BY version DESC
     LIMIT $3`,
    [opportunityId, clientId, boundedLimit],
  );
  return result.rows.map(mapVersion);
}

export async function createAuthorityOutreachDraft(input: {
  clientId: string;
  opportunityId: string;
  workflowId: string;
  actorId: string;
  subject: unknown;
  body: unknown;
  provenance: Record<string, unknown>;
  generatedBy: string;
}): Promise<AuthorityOutreachDraftRecord> {
  const text = validateAuthorityOutreachDraftText(input.subject, input.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query<DraftRow>(
      `SELECT * FROM authority_outreach_drafts
       WHERE opportunity_id = $1 AND client_id = $2
       FOR UPDATE`,
      [input.opportunityId, input.clientId],
    );
    if (existing.rows[0]) {
      throw new Error("authority_outreach_draft_already_exists");
    }

    const inserted = await client.query<DraftRow>(
      `INSERT INTO authority_outreach_drafts (
         client_id, opportunity_id, workflow_id, status, subject, body,
         provenance, generated_by, version, approved_at, approved_by,
         created_by, updated_by
       ) VALUES ($1,$2,$3,'draft',$4,$5,$6::jsonb,$7,1,NULL,NULL,$8,$8)
       RETURNING *`,
      [
        input.clientId,
        input.opportunityId,
        input.workflowId,
        text.subject,
        text.body,
        JSON.stringify(input.provenance),
        input.generatedBy,
        input.actorId,
      ],
    );
    const draft = inserted.rows[0];
    if (!draft) throw new Error("authority_outreach_draft_insert_failed");

    await client.query(
      `INSERT INTO authority_outreach_draft_versions (
         draft_id, client_id, opportunity_id, workflow_id, version, action,
         status, subject, body, provenance, generated_by, actor_id
       ) VALUES ($1,$2,$3,$4,1,'create','draft',$5,$6,$7::jsonb,$8,$9)`,
      [
        draft.id,
        input.clientId,
        input.opportunityId,
        input.workflowId,
        text.subject,
        text.body,
        JSON.stringify(input.provenance),
        input.generatedBy,
        input.actorId,
      ],
    );

    await client.query("COMMIT");
    return mapDraft(draft);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505") {
      throw new Error("authority_outreach_draft_conflict");
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function mutateAuthorityOutreachDraft(input: {
  clientId: string;
  opportunityId: string;
  actorId: string;
  action: AuthorityOutreachDraftMutationAction;
  expectedVersion: unknown;
  subject?: unknown;
  body?: unknown;
}): Promise<AuthorityOutreachDraftRecord> {
  const expectedVersion = validateAuthorityOutreachDraftExpectedVersion(input.expectedVersion);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query<DraftRow>(
      `SELECT * FROM authority_outreach_drafts
       WHERE opportunity_id = $1 AND client_id = $2
       FOR UPDATE`,
      [input.opportunityId, input.clientId],
    );
    const current = selected.rows[0];
    if (!current) throw new Error("authority_outreach_draft_not_found");
    if (current.version !== expectedVersion) {
      throw new Error("authority_outreach_draft_version_conflict");
    }

    const plan = planAuthorityOutreachDraftMutation(
      input.action,
      current.status as AuthorityOutreachDraftStatus,
      current.version,
    );

    let subject = current.subject;
    let body = current.body;
    if (input.action === "save") {
      const text = validateAuthorityOutreachDraftText(input.subject, input.body);
      subject = text.subject;
      body = text.body;
    }

    const approvedAt = plan.setsApproval ? new Date() : null;
    const approvedBy = plan.setsApproval ? input.actorId : null;

    const updated = await client.query<DraftRow>(
      `UPDATE authority_outreach_drafts
       SET status = $3,
           subject = $4,
           body = $5,
           version = $6,
           approved_at = $7,
           approved_by = $8,
           updated_by = $9,
           updated_at = NOW()
       WHERE opportunity_id = $1 AND client_id = $2 AND version = $10
       RETURNING *`,
      [
        input.opportunityId,
        input.clientId,
        plan.toStatus,
        subject,
        body,
        plan.nextVersion,
        approvedAt,
        approvedBy,
        input.actorId,
        expectedVersion,
      ],
    );
    const draft = updated.rows[0];
    if (!draft) throw new Error("authority_outreach_draft_version_conflict");

    await client.query(
      `INSERT INTO authority_outreach_draft_versions (
         draft_id, client_id, opportunity_id, workflow_id, version, action,
         status, subject, body, provenance, generated_by, actor_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)`,
      [
        draft.id,
        draft.client_id,
        draft.opportunity_id,
        draft.workflow_id,
        draft.version,
        input.action,
        draft.status,
        draft.subject,
        draft.body,
        JSON.stringify(asObject(draft.provenance)),
        draft.generated_by,
        input.actorId,
      ],
    );

    await client.query("COMMIT");
    return mapDraft(draft);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

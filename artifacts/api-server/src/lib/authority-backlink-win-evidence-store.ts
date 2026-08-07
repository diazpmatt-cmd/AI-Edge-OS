import { pool } from "@workspace/db";
import {
  nextAuthorityBacklinkWinEvidenceVerification,
  validateAuthorityBacklinkWinEvidenceExpectedVersion,
  validateAuthorityBacklinkWinEvidenceInput,
  verificationAfterAuthorityBacklinkWinEvidenceEdit,
  type AuthorityBacklinkWinEvidenceAction,
  type AuthorityBacklinkWinEvidenceVerification,
} from "./authority-backlink-win-evidence-lifecycle.js";

interface WinEvidenceRow {
  id: string;
  client_id: string;
  opportunity_id: string;
  prospect_id: string;
  source_url: string;
  target_url: string;
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

export interface AuthorityBacklinkWinEvidenceRecord {
  id: string;
  clientId: string;
  opportunityId: string;
  prospectId: string;
  sourceUrl: string;
  targetUrl: string;
  notes: string | null;
  verificationStatus: AuthorityBacklinkWinEvidenceVerification;
  verifiedAt: string | null;
  verifiedBy: string | null;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: WinEvidenceRow): AuthorityBacklinkWinEvidenceRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    opportunityId: row.opportunity_id,
    prospectId: row.prospect_id,
    sourceUrl: row.source_url,
    targetUrl: row.target_url,
    notes: row.notes,
    verificationStatus: row.verification_status as AuthorityBacklinkWinEvidenceVerification,
    verifiedAt: row.verified_at?.toISOString() ?? null,
    verifiedBy: row.verified_by,
    version: row.version,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function getAuthorityBacklinkWinEvidence(opportunityId: string, clientId: string): Promise<AuthorityBacklinkWinEvidenceRecord | null> {
  const result = await pool.query<WinEvidenceRow>(
    `SELECT * FROM authority_backlink_win_evidence WHERE opportunity_id = $1 AND client_id = $2 LIMIT 1`,
    [opportunityId, clientId],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function hasVerifiedAuthorityBacklinkWinEvidence(opportunityId: string, clientId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM authority_backlink_win_evidence
     WHERE opportunity_id = $1 AND client_id = $2
       AND verification_status = 'human_verified'
       AND verified_at IS NOT NULL AND verified_by IS NOT NULL
     LIMIT 1`,
    [opportunityId, clientId],
  );
  return result.rowCount === 1;
}

export async function createAuthorityBacklinkWinEvidence(input: {
  clientId: string;
  opportunityId: string;
  prospectId: string;
  actorId: string;
  evidence: Record<string, unknown>;
}): Promise<AuthorityBacklinkWinEvidenceRecord> {
  const evidence = validateAuthorityBacklinkWinEvidenceInput(input.evidence);
  const result = await pool.query<WinEvidenceRow>(
    `INSERT INTO authority_backlink_win_evidence (
       client_id, opportunity_id, prospect_id, source_url, target_url, notes,
       verification_status, verified_at, verified_by, version, created_by, updated_by
     ) VALUES ($1,$2,$3,$4,$5,$6,'unverified',NULL,NULL,1,$7,$7)
     RETURNING *`,
    [input.clientId, input.opportunityId, input.prospectId, evidence.sourceUrl, evidence.targetUrl, evidence.notes, input.actorId],
  );
  return mapRow(result.rows[0]!);
}

export async function updateAuthorityBacklinkWinEvidence(input: {
  id: string;
  clientId: string;
  actorId: string;
  expectedVersion: unknown;
  evidence: Record<string, unknown>;
}): Promise<AuthorityBacklinkWinEvidenceRecord> {
  const expectedVersion = validateAuthorityBacklinkWinEvidenceExpectedVersion(input.expectedVersion);
  const evidence = validateAuthorityBacklinkWinEvidenceInput(input.evidence);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const currentResult = await client.query<WinEvidenceRow>(
      `SELECT * FROM authority_backlink_win_evidence WHERE id = $1 AND client_id = $2 FOR UPDATE`,
      [input.id, input.clientId],
    );
    const current = currentResult.rows[0];
    if (!current) throw new Error("win_evidence_not_found");
    if (current.version !== expectedVersion) throw new Error("version_conflict");
    const workflowResult = await client.query<{ status: string }>(
      `SELECT status FROM backlink_workflows
       WHERE opportunity_id = $1 AND client_id = $2
       FOR SHARE`,
      [current.opportunity_id, input.clientId],
    );
    if (workflowResult.rows[0]?.status === "won" && current.verification_status === "human_verified") {
      throw new Error("won_evidence_immutable");
    }
    const nextVerification = verificationAfterAuthorityBacklinkWinEvidenceEdit(current.verification_status as AuthorityBacklinkWinEvidenceVerification);
    const updated = await client.query<WinEvidenceRow>(
      `UPDATE authority_backlink_win_evidence
       SET source_url=$3, target_url=$4, notes=$5,
           verification_status=$6, verified_at=NULL, verified_by=NULL,
           version=version+1, updated_by=$7, updated_at=NOW()
       WHERE id=$1 AND client_id=$2 AND version=$8
       RETURNING *`,
      [input.id, input.clientId, evidence.sourceUrl, evidence.targetUrl, evidence.notes, nextVerification, input.actorId, expectedVersion],
    );
    if (!updated.rows[0]) throw new Error("version_conflict");
    await client.query("COMMIT");
    return mapRow(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function actOnAuthorityBacklinkWinEvidence(input: {
  id: string;
  clientId: string;
  actorId: string;
  expectedVersion: unknown;
  action: AuthorityBacklinkWinEvidenceAction;
}): Promise<AuthorityBacklinkWinEvidenceRecord> {
  const expectedVersion = validateAuthorityBacklinkWinEvidenceExpectedVersion(input.expectedVersion);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const currentResult = await client.query<WinEvidenceRow>(
      `SELECT * FROM authority_backlink_win_evidence WHERE id = $1 AND client_id = $2 FOR UPDATE`,
      [input.id, input.clientId],
    );
    const current = currentResult.rows[0];
    if (!current) throw new Error("win_evidence_not_found");
    if (current.version !== expectedVersion) throw new Error("version_conflict");
    const workflowResult = await client.query<{ status: string }>(
      `SELECT status FROM backlink_workflows
       WHERE opportunity_id = $1 AND client_id = $2
       FOR SHARE`,
      [current.opportunity_id, input.clientId],
    );
    if (workflowResult.rows[0]?.status === "won" && current.verification_status === "human_verified") {
      throw new Error("won_evidence_immutable");
    }
    const nextVerification = nextAuthorityBacklinkWinEvidenceVerification(
      current.verification_status as AuthorityBacklinkWinEvidenceVerification,
      input.action,
    );
    const verified = nextVerification === "human_verified";
    const updated = await client.query<WinEvidenceRow>(
      `UPDATE authority_backlink_win_evidence
       SET verification_status=$3,
           verified_at=CASE WHEN $4 THEN NOW() ELSE NULL END,
           verified_by=CASE WHEN $4 THEN $5 ELSE NULL END,
           version=version+1, updated_by=$5, updated_at=NOW()
       WHERE id=$1 AND client_id=$2 AND version=$6
       RETURNING *`,
      [input.id, input.clientId, nextVerification, verified, input.actorId, expectedVersion],
    );
    if (!updated.rows[0]) throw new Error("version_conflict");
    await client.query("COMMIT");
    return mapRow(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

import { pool } from "@workspace/db";
import {
  nextAuthorityAcquisitionProofVerification,
  validateAuthorityAcquisitionProofExpectedVersion,
  validateAuthorityAcquisitionProofInput,
  verificationAfterAuthorityAcquisitionProofEdit,
  type AuthorityAcquisitionProofAction,
  type AuthorityAcquisitionProofInput,
  type AuthorityAcquisitionProofVerification,
} from "./authority-acquisition-proof-lifecycle.js";

interface ProofRow {
  id: string;
  client_id: string;
  opportunity_id: string;
  prospect_id: string;
  workflow_id: string;
  proof_type: string;
  source_url: string;
  target_url: string | null;
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

export interface AuthorityAcquisitionProofRecord extends AuthorityAcquisitionProofInput {
  id: string;
  clientId: string;
  opportunityId: string;
  prospectId: string;
  workflowId: string;
  verificationStatus: AuthorityAcquisitionProofVerification;
  verifiedAt: string | null;
  verifiedBy: string | null;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

const lockIdentity = (clientId: string, opportunityId: string) =>
  `authority-acquisition:${clientId}:${opportunityId}`;

async function acquireTransactionOutcomeLock(
  client: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  clientId: string,
  opportunityId: string,
): Promise<void> {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext($1))",
    [lockIdentity(clientId, opportunityId)],
  );
}

async function assertPursuingWorkflow(
  client: { query: (text: string, values?: unknown[]) => Promise<{ rows: Array<{ status: string }> }> },
  clientId: string,
  opportunityId: string,
): Promise<void> {
  const result = await client.query(
    `SELECT status FROM backlink_workflows
     WHERE opportunity_id = $1 AND client_id = $2
     LIMIT 1`,
    [opportunityId, clientId],
  );
  if (result.rows[0]?.status !== "pursuing") {
    throw new Error("authority_acquisition_proof_workflow_not_pursuing");
  }
}

export async function withAuthorityAcquisitionOutcomeLock<T>(
  clientId: string,
  opportunityId: string,
  task: () => Promise<T>,
): Promise<T> {
  const lockClient = await pool.connect();
  const identity = lockIdentity(clientId, opportunityId);
  try {
    await lockClient.query("SELECT pg_advisory_lock(hashtext($1))", [identity]);
    return await task();
  } finally {
    try {
      await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [identity]);
    } finally {
      lockClient.release();
    }
  }
}

function mapRow(row: ProofRow): AuthorityAcquisitionProofRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    opportunityId: row.opportunity_id,
    prospectId: row.prospect_id,
    workflowId: row.workflow_id,
    proofType: row.proof_type as AuthorityAcquisitionProofRecord["proofType"],
    sourceUrl: row.source_url,
    targetUrl: row.target_url,
    notes: row.notes,
    verificationStatus: row.verification_status as AuthorityAcquisitionProofVerification,
    verifiedAt: row.verified_at?.toISOString() ?? null,
    verifiedBy: row.verified_by,
    version: row.version,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listAuthorityAcquisitionProofs(
  opportunityId: string,
  clientId: string,
): Promise<AuthorityAcquisitionProofRecord[]> {
  const result = await pool.query<ProofRow>(
    `SELECT * FROM authority_acquisition_proofs
     WHERE opportunity_id = $1 AND client_id = $2
     ORDER BY created_at ASC, id ASC`,
    [opportunityId, clientId],
  );
  return result.rows.map(mapRow);
}

export async function hasVerifiedAuthorityAcquisitionProof(
  opportunityId: string,
  clientId: string,
): Promise<{ ready: boolean; proofId: string | null }> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM authority_acquisition_proofs
     WHERE opportunity_id = $1
       AND client_id = $2
       AND verification_status = 'human_verified'
       AND verified_at IS NOT NULL
       AND verified_by IS NOT NULL
       AND source_url IS NOT NULL
     ORDER BY verified_at DESC, id ASC
     LIMIT 1`,
    [opportunityId, clientId],
  );
  return { ready: result.rowCount === 1, proofId: result.rows[0]?.id ?? null };
}

export async function createAuthorityAcquisitionProof(input: {
  clientId: string;
  opportunityId: string;
  prospectId: string;
  workflowId: string;
  actorId: string;
  proof: Record<string, unknown>;
}): Promise<AuthorityAcquisitionProofRecord> {
  const proof = validateAuthorityAcquisitionProofInput(input.proof);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await acquireTransactionOutcomeLock(client, input.clientId, input.opportunityId);
    await assertPursuingWorkflow(client, input.clientId, input.opportunityId);
    const result = await client.query<ProofRow>(
      `INSERT INTO authority_acquisition_proofs (
         client_id, opportunity_id, prospect_id, workflow_id, proof_type,
         source_url, target_url, notes, verification_status,
         verified_at, verified_by, version, created_by, updated_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'unverified',NULL,NULL,1,$9,$9)
       RETURNING *`,
      [
        input.clientId,
        input.opportunityId,
        input.prospectId,
        input.workflowId,
        proof.proofType,
        proof.sourceUrl,
        proof.targetUrl,
        proof.notes,
        input.actorId,
      ],
    );
    if (!result.rows[0]) throw new Error("authority_acquisition_proof_create_failed");
    await client.query("COMMIT");
    return mapRow(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateAuthorityAcquisitionProof(input: {
  id: string;
  clientId: string;
  opportunityId: string;
  actorId: string;
  expectedVersion: unknown;
  proof: Record<string, unknown>;
}): Promise<AuthorityAcquisitionProofRecord> {
  const expectedVersion = validateAuthorityAcquisitionProofExpectedVersion(input.expectedVersion);
  const proof = validateAuthorityAcquisitionProofInput(input.proof);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await acquireTransactionOutcomeLock(client, input.clientId, input.opportunityId);
    await assertPursuingWorkflow(client, input.clientId, input.opportunityId);
    const currentResult = await client.query<ProofRow>(
      `SELECT * FROM authority_acquisition_proofs
       WHERE id = $1 AND client_id = $2 AND opportunity_id = $3
       FOR UPDATE`,
      [input.id, input.clientId, input.opportunityId],
    );
    const current = currentResult.rows[0];
    if (!current) throw new Error("authority_acquisition_proof_not_found");
    if (current.version !== expectedVersion) throw new Error("authority_acquisition_proof_version_conflict");
    const nextVerification = verificationAfterAuthorityAcquisitionProofEdit(
      current.verification_status as AuthorityAcquisitionProofVerification,
    );
    const result = await client.query<ProofRow>(
      `UPDATE authority_acquisition_proofs
       SET proof_type = $1,
           source_url = $2,
           target_url = $3,
           notes = $4,
           verification_status = $5,
           verified_at = NULL,
           verified_by = NULL,
           version = version + 1,
           updated_by = $6,
           updated_at = NOW()
       WHERE id = $7 AND client_id = $8 AND opportunity_id = $9 AND version = $10
       RETURNING *`,
      [
        proof.proofType,
        proof.sourceUrl,
        proof.targetUrl,
        proof.notes,
        nextVerification,
        input.actorId,
        input.id,
        input.clientId,
        input.opportunityId,
        expectedVersion,
      ],
    );
    if (!result.rows[0]) throw new Error("authority_acquisition_proof_version_conflict");
    await client.query("COMMIT");
    return mapRow(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function actOnAuthorityAcquisitionProof(input: {
  id: string;
  clientId: string;
  opportunityId: string;
  actorId: string;
  expectedVersion: unknown;
  action: AuthorityAcquisitionProofAction;
}): Promise<AuthorityAcquisitionProofRecord> {
  const expectedVersion = validateAuthorityAcquisitionProofExpectedVersion(input.expectedVersion);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await acquireTransactionOutcomeLock(client, input.clientId, input.opportunityId);
    await assertPursuingWorkflow(client, input.clientId, input.opportunityId);
    const currentResult = await client.query<ProofRow>(
      `SELECT * FROM authority_acquisition_proofs
       WHERE id = $1 AND client_id = $2 AND opportunity_id = $3
       FOR UPDATE`,
      [input.id, input.clientId, input.opportunityId],
    );
    const current = currentResult.rows[0];
    if (!current) throw new Error("authority_acquisition_proof_not_found");
    if (current.version !== expectedVersion) throw new Error("authority_acquisition_proof_version_conflict");
    const next = nextAuthorityAcquisitionProofVerification(
      input.action,
      current.verification_status as AuthorityAcquisitionProofVerification,
    );
    const humanVerified = next === "human_verified";
    const result = await client.query<ProofRow>(
      `UPDATE authority_acquisition_proofs
       SET verification_status = $1,
           verified_at = $2,
           verified_by = $3,
           version = version + 1,
           updated_by = $4,
           updated_at = NOW()
       WHERE id = $5 AND client_id = $6 AND opportunity_id = $7 AND version = $8
       RETURNING *`,
      [
        next,
        humanVerified ? new Date() : null,
        humanVerified ? input.actorId : null,
        input.actorId,
        input.id,
        input.clientId,
        input.opportunityId,
        expectedVersion,
      ],
    );
    if (!result.rows[0]) throw new Error("authority_acquisition_proof_version_conflict");
    await client.query("COMMIT");
    return mapRow(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

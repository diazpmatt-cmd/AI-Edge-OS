import { pool } from "@workspace/db";

/**
 * Holds a shared row lock on the current human-verified win-evidence record while
 * the supplied workflow transition runs. Evidence edits/invalidation use
 * SELECT ... FOR UPDATE, so they cannot revoke verification between the gate
 * check and a successful Mark Won transition.
 *
 * This is intentionally a narrow coordination primitive: it does not mutate
 * evidence or workflow state itself and it does not authorize any external
 * action.
 */
export async function withVerifiedAuthorityBacklinkWinEvidenceGate<T>(
  opportunityId: string,
  clientId: string,
  transition: () => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const verified = await client.query(
      `SELECT id
       FROM authority_backlink_win_evidence
       WHERE opportunity_id = $1
         AND client_id = $2
         AND verification_status = 'human_verified'
         AND verified_at IS NOT NULL
         AND verified_by IS NOT NULL
       FOR SHARE`,
      [opportunityId, clientId],
    );
    if (verified.rowCount !== 1) {
      throw new Error("acquisition_proof_missing");
    }

    const result = await transition();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

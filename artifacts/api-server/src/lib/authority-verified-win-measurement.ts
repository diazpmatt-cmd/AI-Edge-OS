import { pool } from "@workspace/db";

/**
 * Count only durable Authority wins that still retain current human-verified
 * acquisition evidence. Workflow state alone is not sufficient measurement
 * evidence, and evidence alone is not sufficient without a completed win.
 */
export async function countVerifiedAuthorityWins(clientId: string): Promise<number> {
  if (!clientId.trim()) throw new Error("client_id_required");

  const result = await pool.query<{ verified_won_count: number }>(
    `SELECT COUNT(*)::int AS verified_won_count
     FROM backlink_workflows AS workflow
     INNER JOIN authority_backlink_win_evidence AS evidence
       ON evidence.opportunity_id = workflow.opportunity_id
      AND evidence.client_id = workflow.client_id
     WHERE workflow.client_id = $1
       AND workflow.status = 'won'
       AND evidence.verification_status = 'human_verified'
       AND evidence.verified_at IS NOT NULL
       AND evidence.verified_by IS NOT NULL`,
    [clientId.trim()],
  );

  return result.rows[0]?.verified_won_count ?? 0;
}

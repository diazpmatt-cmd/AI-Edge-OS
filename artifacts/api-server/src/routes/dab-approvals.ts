import { Router } from "express";
import { getAuth } from "@clerk/express";
import { pool } from "@workspace/db";
import {
  isSupportedPreparationCapability,
  stableProposalFingerprint,
  validateDecisionInput,
  proposalIsExpired,
} from "../lib/dab-approval-policy.js";

const router = Router();

async function bootstrap(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dab_approval_proposals (
      proposal_id text PRIMARY KEY,
      proposal_fingerprint text NOT NULL UNIQUE,
      request_id text NOT NULL,
      run_id text NOT NULL,
      context_hash text NOT NULL,
      capability text NOT NULL CHECK (capability IN ('prepare_documentation_change','prepare_task_record_change','prepare_code_patch')),
      risk_level text NOT NULL CHECK (risk_level IN ('low','medium','high')),
      summary text NOT NULL,
      recommended_next_step text NOT NULL,
      affected_resources jsonb NOT NULL,
      rationale text NOT NULL,
      confidence double precision NOT NULL,
      status text NOT NULL CHECK (status IN ('pending','approved','rejected','modify','expired')),
      created_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL,
      decided_at timestamptz,
      decided_by text,
      operator_instructions text,
      decision_idempotency_key text UNIQUE
    );
    CREATE INDEX IF NOT EXISTS idx_dab_approval_proposals_status_created
      ON dab_approval_proposals(status, created_at DESC);
  `);
}

async function materializeLatestProposal(): Promise<void> {
  const latest = await pool.query<{
    request_id: string;
    run_id: string;
    created_at: Date;
    recommendation: unknown;
    context_hash: string;
  }>(`
    SELECT r.request_id, r.run_id, r.created_at, r.recommendation, q.context_hash
      FROM dab_agent_results r
      JOIN dab_agent_requests q ON q.request_id = r.request_id
     ORDER BY r.created_at DESC
     LIMIT 1
  `).catch(() => ({ rows: [] } as any));
  const row = latest.rows[0];
  if (!row || !row.recommendation || typeof row.recommendation !== "object") return;
  const rec = row.recommendation as Record<string, unknown>;
  if (rec.requiresHumanApproval !== true || !isSupportedPreparationCapability(rec.requestedCapability)) return;
  const summary = typeof rec.summary === "string" ? rec.summary.slice(0, 2_000) : "Agent requested approval.";
  const recommendedNextStep = typeof rec.recommendedNextStep === "string" ? rec.recommendedNextStep.slice(0, 2_000) : "Prepare the requested bounded work.";
  const confidence = typeof rec.confidence === "number" && rec.confidence >= 0 && rec.confidence <= 1 ? rec.confidence : 0;
  const material = {
    requestId: row.request_id,
    runId: row.run_id,
    resultCreatedAt: row.created_at.toISOString(),
    contextHash: row.context_hash,
    capability: rec.requestedCapability,
    summary,
    recommendedNextStep,
    confidence,
  };
  const fingerprint = stableProposalFingerprint(material);
  const proposalId = `dap_${fingerprint.slice(0, 24)}`;
  const riskLevel = rec.requestedCapability === "prepare_code_patch" ? "medium" : "low";
  const affectedResources = rec.requestedCapability === "prepare_documentation_change"
    ? ["approved project documentation only"]
    : rec.requestedCapability === "prepare_task_record_change"
      ? ["internal task records only"]
      : ["isolated sandbox workspace only"];
  await pool.query(`
    INSERT INTO dab_approval_proposals(
      proposal_id, proposal_fingerprint, request_id, run_id, context_hash, capability,
      risk_level, summary, recommended_next_step, affected_resources, rationale,
      confidence, status, created_at, expires_at
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,'pending',now(),now()+interval '24 hours')
    ON CONFLICT(proposal_fingerprint) DO NOTHING
  `, [proposalId, fingerprint, row.request_id, row.run_id, row.context_hash, rec.requestedCapability, riskLevel, summary, recommendedNextStep, JSON.stringify(affectedResources), "Approval authorizes future sandboxed preparation only. It does not authorize applying, committing, merging, deploying, publishing, or external action.", confidence]);
}

router.get("/dab/approvals", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  await bootstrap();
  await materializeLatestProposal();
  await pool.query(`UPDATE dab_approval_proposals SET status='expired' WHERE status='pending' AND expires_at <= now()`);
  const result = await pool.query(`
    SELECT proposal_id, proposal_fingerprint, request_id, run_id, context_hash, capability,
           risk_level, summary, recommended_next_step, affected_resources, rationale,
           confidence, status, created_at, expires_at, decided_at, decided_by, operator_instructions
      FROM dab_approval_proposals
     ORDER BY created_at DESC
     LIMIT 50
  `);
  return res.json({
    executionEnabled: false,
    authorityNotice: "A decision authorizes future sandboxed preparation only. No action is executed by DAB-7A.",
    proposals: result.rows.map((row: any) => ({
      proposalId: row.proposal_id,
      proposalFingerprint: row.proposal_fingerprint,
      requestId: row.request_id,
      runId: row.run_id,
      contextHash: row.context_hash,
      capability: row.capability,
      riskLevel: row.risk_level,
      summary: row.summary,
      recommendedNextStep: row.recommended_next_step,
      affectedResources: Array.isArray(row.affected_resources) ? row.affected_resources : [],
      rationale: row.rationale,
      confidence: row.confidence,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      decidedAt: row.decided_at?.toISOString() ?? null,
      decidedBy: row.decided_by,
      operatorInstructions: row.operator_instructions,
    })),
  });
});

router.post("/dab/approvals/:proposalId/decision", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  await bootstrap();
  const validated = validateDecisionInput(req.body ?? {});
  if (!validated.ok) return res.status(400).json({ error: validated.code });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<any>(`SELECT * FROM dab_approval_proposals WHERE proposal_id=$1 FOR UPDATE`, [req.params.proposalId]);
    const proposal = found.rows[0];
    if (!proposal) { await client.query("ROLLBACK"); return res.status(404).json({ error: "PROPOSAL_NOT_FOUND" }); }
    if (proposal.proposal_fingerprint !== validated.proposalFingerprint) { await client.query("ROLLBACK"); return res.status(409).json({ error: "FINGERPRINT_MISMATCH" }); }
    if (proposalIsExpired(proposal.expires_at.toISOString(), new Date().toISOString())) {
      await client.query(`UPDATE dab_approval_proposals SET status='expired' WHERE proposal_id=$1 AND status='pending'`, [proposal.proposal_id]);
      await client.query("COMMIT");
      return res.status(409).json({ error: "PROPOSAL_EXPIRED" });
    }
    if (proposal.status !== "pending") {
      const same = proposal.status === validated.decision && proposal.operator_instructions === validated.operatorInstructions;
      await client.query("ROLLBACK");
      return same ? res.json({ status: proposal.status, idempotent: true, executionEnabled: false }) : res.status(409).json({ error: "PROPOSAL_ALREADY_DECIDED", status: proposal.status });
    }
    const idempotencyKey = `${proposal.proposal_fingerprint}:${userId}:${validated.decision}:${validated.operatorInstructions ?? ""}`;
    const updated = await client.query<any>(`
      UPDATE dab_approval_proposals
         SET status=$2, decided_at=now(), decided_by=$3, operator_instructions=$4, decision_idempotency_key=$5
       WHERE proposal_id=$1 AND status='pending'
       RETURNING status, decided_at
    `, [proposal.proposal_id, validated.decision, userId, validated.operatorInstructions, idempotencyKey]);
    if (!updated.rows[0]) { await client.query("ROLLBACK"); return res.status(409).json({ error: "CONCURRENT_DECISION" }); }
    await client.query("COMMIT");
    return res.json({ status: updated.rows[0].status, decidedAt: updated.rows[0].decided_at.toISOString(), decidedBy: userId, executionEnabled: false });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
});

export default router;

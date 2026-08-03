import { Router } from "express";
import { getAuth } from "@clerk/express";
import { pool } from "@workspace/db";

const router = Router();

router.get("/dab/preparations", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const tables = await pool.query<{ jobs: string | null; artifacts: string | null }>(`
    SELECT to_regclass('public.dab_preparation_jobs')::text AS jobs,
           to_regclass('public.dab_preparation_artifacts')::text AS artifacts
  `);
  if (!tables.rows[0]?.jobs) return res.json({ executionEnabled: false, jobs: [] });
  const jobs = await pool.query<any>(`
    SELECT job_id, proposal_id, proposal_fingerprint, capability, context_hash, approved_by,
           status, attempts, created_at, updated_at, completed_at, failure_code
      FROM dab_preparation_jobs ORDER BY created_at DESC LIMIT 50
  `);
  const artifacts = tables.rows[0]?.artifacts ? await pool.query<any>(`
    SELECT artifact_id, job_id, kind, bytes, sha256, created_at,
           CASE WHEN kind IN ('completion_report','validation_report') THEN content ELSE NULL END AS preview
      FROM dab_preparation_artifacts ORDER BY artifact_id ASC
  `) : { rows: [] };
  const byJob = new Map<string, any[]>();
  for (const row of artifacts.rows) {
    const list = byJob.get(row.job_id) ?? [];
    list.push({ artifactId: row.artifact_id, kind: row.kind, bytes: row.bytes, sha256: row.sha256, createdAt: row.created_at.toISOString(), preview: row.preview });
    byJob.set(row.job_id, list);
  }
  return res.json({
    executionEnabled: false,
    authorityNotice: "Prepared artifacts are review-only. They have not been applied, committed, merged, deployed, or published.",
    jobs: jobs.rows.map((row: any) => ({
      jobId: row.job_id,
      proposalId: row.proposal_id,
      proposalFingerprint: row.proposal_fingerprint,
      capability: row.capability,
      contextHash: row.context_hash,
      approvedBy: row.approved_by,
      status: row.status,
      attempts: row.attempts,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      completedAt: row.completed_at?.toISOString() ?? null,
      failureCode: row.failure_code,
      artifacts: byJob.get(row.job_id) ?? [],
    })),
  });
});

router.get("/dab/preparations/:jobId/artifacts/:kind", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const result = await pool.query<any>(`
    SELECT kind, content, bytes, sha256, created_at FROM dab_preparation_artifacts
     WHERE job_id=$1 AND kind=$2 LIMIT 1
  `, [req.params.jobId, req.params.kind]);
  const row = result.rows[0];
  if (!row) return res.status(404).json({ error: "ARTIFACT_NOT_FOUND" });
  return res.json({ executionEnabled: false, kind: row.kind, content: row.content, bytes: row.bytes, sha256: row.sha256, createdAt: row.created_at.toISOString() });
});

export default router;

import { Router } from "express";
import { getAuth } from "@clerk/express";
import { pool } from "@workspace/db";

const router = Router();

router.get("/dab/engineering-status", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const tables = await pool.query<{ tasks: string | null; specs: string | null; milestones: string | null; claims: string | null }>(`
    SELECT to_regclass('public.development_tasks')::text AS tasks,
           to_regclass('public.development_task_specifications')::text AS specs,
           to_regclass('public.development_milestones')::text AS milestones,
           to_regclass('public.development_task_claims')::text AS claims
  `);
  const available = Boolean(tables.rows[0]?.tasks && tables.rows[0]?.specs && tables.rows[0]?.milestones && tables.rows[0]?.claims);
  if (!available) {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "canonical_development_control",
      sourceAvailable: false,
      status: "unavailable",
      blocker: "canonical_development_control_store_not_connected_to_api_runtime",
      humanNeeded: false,
      task: null,
      note: "No engineering mission state is inferred from chat history or planner tables.",
    });
    return;
  }

  const taskResult = await pool.query<{
    task_id: string;
    state: string;
    version: number;
    updated_at: Date;
    specification: any;
    owner_snapshot: any | null;
  }>(`
    SELECT t.task_id, t.state, t.version, t.updated_at, s.specification, c.owner_snapshot
      FROM development_tasks t
      JOIN development_task_specifications s
        ON s.task_id=t.task_id AND s.revision=t.active_revision
      LEFT JOIN development_task_claims c ON c.task_id=t.task_id
     ORDER BY t.updated_at DESC, t.task_id DESC
     LIMIT 1
  `);
  const task = taskResult.rows[0] ?? null;
  if (!task) {
    res.setHeader("Cache-Control", "no-store");
    res.json({ source: "canonical_development_control", sourceAvailable: true, status: "idle", blocker: null, humanNeeded: false, task: null });
    return;
  }

  const milestones = await pool.query<{ kind: string; status: string; evidence: string | null; recorded_at: Date }>(`
    SELECT kind,status,evidence,recorded_at
      FROM development_milestones
     WHERE task_id=$1 AND current=true
     ORDER BY kind ASC
  `, [task.task_id]);

  const refs = Array.isArray(task.specification?.references) ? task.specification.references : [];
  const issueRef = refs.find((item: any) => item?.kind === "issue")?.value ?? null;
  const prRef = refs.find((item: any) => item?.kind === "pull_request")?.value ?? null;
  const status = task.state === "completed" ? "complete"
    : task.state === "blocked" ? "blocked"
      : task.state === "proposed" || task.state === "review_requested" ? "awaiting_approval"
        : task.owner_snapshot ? "active" : "queued";
  const verified = milestones.rows.filter(item => item.status === "verified");
  const order = ["merged", "pull_request_opened", "pushed", "committed"];
  const lastVerifiedMilestone = order.find(kind => verified.some(item => item.kind === kind)) ?? null;

  res.setHeader("Cache-Control", "no-store");
  res.json({
    source: "canonical_development_control",
    sourceAvailable: true,
    status,
    blocker: task.state === "blocked" ? "canonical_task_blocked" : null,
    humanNeeded: task.state === "blocked" || task.state === "proposed" || task.state === "review_requested",
    task: {
      taskId: task.task_id,
      title: typeof task.specification?.title === "string" ? task.specification.title : task.task_id,
      state: task.state,
      version: task.version,
      updatedAt: task.updated_at.toISOString(),
      currentLeaseOwner: typeof task.owner_snapshot?.displayName === "string" ? task.owner_snapshot.displayName : null,
      lastVerifiedMilestone,
      milestones: milestones.rows.map(item => ({ kind: item.kind, status: item.status, evidence: item.evidence, recordedAt: item.recorded_at.toISOString() })),
      issueRef,
      prRef,
    },
  });
});

export default router;

import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, pool } from "@workspace/db";
import { agentTasksTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { evaluateTask, RULE_SET_VERSION } from "../lib/approval-engine.js";

// ── Table bootstrap ───────────────────────────────────────────────────────────
// drizzle-kit push is blocked by a pre-existing constraint conflict in this DB,
// so we bootstrap agent_tasks via pool.query on startup.
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_tasks (
        id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id          TEXT        NOT NULL,
        task_type        TEXT        NOT NULL,
        payload          TEXT        NOT NULL DEFAULT '{}',
        status           TEXT        NOT NULL DEFAULT 'pending_review',
        decision         TEXT,
        decision_by      TEXT,
        decision_at      TIMESTAMPTZ,
        decision_note    TEXT,
        rule_id          TEXT,
        rule_set_version TEXT        NOT NULL DEFAULT 'v1',
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_agent_tasks_user_created
        ON agent_tasks(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_agent_tasks_user_status
        ON agent_tasks(user_id, status);
    `);
    console.log("[AGENT-TASKS] Table and indexes ready");
  } catch (err) {
    console.error("[AGENT-TASKS] Bootstrap failed:", err);
  }
})();

const router = Router();

// ── POST /agent-tasks — submit a task for approval ────────────────────────────
router.post("/agent-tasks", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { taskType, payload: rawPayload } = req.body as {
    taskType?: unknown;
    payload?: unknown;
  };

  if (typeof taskType !== "string" || taskType.trim().length === 0) {
    return res.status(400).json({ error: "taskType is required and must be a non-empty string" });
  }

  // payload may arrive as an already-parsed object (JSON middleware) or a string
  let parsedPayload: unknown = rawPayload ?? {};
  if (typeof rawPayload === "string") {
    try {
      parsedPayload = JSON.parse(rawPayload);
    } catch {
      return res.status(400).json({ error: "payload must be valid JSON when supplied as a string" });
    }
  }

  const result = evaluateTask(taskType, parsedPayload);

  // Determine initial status from engine decision
  const status =
    result.decision === "auto_approved" ? "approved" :
    result.decision === "rejected"      ? "rejected" :
    "pending_review";

  const decisionBy   = result.decision !== "requires_review" ? "system" : null;
  const decisionAt   = result.decision !== "requires_review" ? new Date() : null;

  const [inserted] = await db.insert(agentTasksTable).values({
    userId,
    taskType: taskType.trim(),
    payload:  JSON.stringify(parsedPayload),
    status,
    decision:        result.decision,
    decisionBy,
    decisionAt,
    decisionNote:    null,
    ruleId:          result.ruleId,
    ruleSetVersion:  RULE_SET_VERSION,
  }).returning();

  return res.status(201).json(inserted);
});

// ── GET /agent-tasks — list caller's tasks ────────────────────────────────────
router.get("/agent-tasks", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { status: statusFilter } = req.query as { status?: string };

  const conditions = statusFilter
    ? [eq(agentTasksTable.userId, userId), eq(agentTasksTable.status, statusFilter)]
    : [eq(agentTasksTable.userId, userId)];

  const tasks = await db
    .select()
    .from(agentTasksTable)
    .where(and(...conditions))
    .orderBy(desc(agentTasksTable.createdAt))
    .limit(100);

  return res.json({ tasks });
});

// ── GET /agent-tasks/:id — single task ───────────────────────────────────────
router.get("/agent-tasks/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const [task] = await db
    .select()
    .from(agentTasksTable)
    .where(and(eq(agentTasksTable.id, req.params.id), eq(agentTasksTable.userId, userId)));

  if (!task) return res.status(404).json({ error: "Task not found" });
  return res.json(task);
});

// ── POST /agent-tasks/:id/approve — human approves a pending task ─────────────
router.post("/agent-tasks/:id/approve", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const [existing] = await db
    .select()
    .from(agentTasksTable)
    .where(and(eq(agentTasksTable.id, req.params.id), eq(agentTasksTable.userId, userId)));

  if (!existing) return res.status(404).json({ error: "Task not found" });
  if (existing.status !== "pending_review") {
    return res.status(409).json({
      error: `Cannot approve a task with status "${existing.status}". Only pending_review tasks can be approved.`,
    });
  }

  const [updated] = await db
    .update(agentTasksTable)
    .set({
      status:     "approved",
      decisionBy: userId,
      decisionAt: new Date(),
    })
    .where(eq(agentTasksTable.id, req.params.id))
    .returning();

  return res.json(updated);
});

// ── POST /agent-tasks/:id/reject — human rejects a pending task ───────────────
router.post("/agent-tasks/:id/reject", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const [existing] = await db
    .select()
    .from(agentTasksTable)
    .where(and(eq(agentTasksTable.id, req.params.id), eq(agentTasksTable.userId, userId)));

  if (!existing) return res.status(404).json({ error: "Task not found" });
  if (existing.status !== "pending_review") {
    return res.status(409).json({
      error: `Cannot reject a task with status "${existing.status}". Only pending_review tasks can be rejected.`,
    });
  }

  const { note } = req.body as { note?: string };

  const [updated] = await db
    .update(agentTasksTable)
    .set({
      status:       "rejected",
      decisionBy:   userId,
      decisionAt:   new Date(),
      decisionNote: typeof note === "string" ? note.trim() || null : null,
    })
    .where(eq(agentTasksTable.id, req.params.id))
    .returning();

  return res.json(updated);
});

export default router;

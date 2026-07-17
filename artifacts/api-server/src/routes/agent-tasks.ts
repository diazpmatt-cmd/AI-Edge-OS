import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { agentTasksTable } from "@workspace/db/schema";
import type { AgentTask } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { evaluateTask, RULE_SET_VERSION } from "../lib/approval-engine.js";

const router = Router();

// ── Atomic helpers ─────────────────────────────────────────────────────────────
//
// Both approve and reject use a single conditional UPDATE whose WHERE clause
// enforces three invariants atomically at the DB level:
//   1. id matches the requested task
//   2. user_id matches the authenticated caller (tenant isolation)
//   3. status is pending_review (prevents double-processing)
//
// If the UPDATE touches 0 rows, a read-only probe on (id, user_id) safely
// distinguishes "task not found" (404) from "task already processed" (409).
// Exported for unit testing.

type ApproveResult =
  | { task: AgentTask }
  | { notFound: true }
  | { conflict: string };

export async function atomicApprove(
  taskId: string,
  userId: string,
): Promise<ApproveResult> {
  const [updated] = await db
    .update(agentTasksTable)
    .set({
      status:     "approved",
      resolution: "approved",
      decisionBy: userId,
      decisionAt: new Date(),
    })
    .where(
      and(
        eq(agentTasksTable.id, taskId),
        eq(agentTasksTable.userId, userId),
        eq(agentTasksTable.status, "pending_review"),
      ),
    )
    .returning();

  if (updated) return { task: updated };

  const [probe] = await db
    .select({ id: agentTasksTable.id, status: agentTasksTable.status })
    .from(agentTasksTable)
    .where(and(eq(agentTasksTable.id, taskId), eq(agentTasksTable.userId, userId)));

  if (!probe) return { notFound: true };
  return { conflict: probe.status };
}

type RejectResult =
  | { task: AgentTask }
  | { notFound: true }
  | { conflict: string };

export async function atomicReject(
  taskId: string,
  userId: string,
  note: string | null,
): Promise<RejectResult> {
  const [updated] = await db
    .update(agentTasksTable)
    .set({
      status:       "rejected",
      resolution:   "rejected",
      decisionBy:   userId,
      decisionAt:   new Date(),
      decisionNote: note,
    })
    .where(
      and(
        eq(agentTasksTable.id, taskId),
        eq(agentTasksTable.userId, userId),
        eq(agentTasksTable.status, "pending_review"),
      ),
    )
    .returning();

  if (updated) return { task: updated };

  const [probe] = await db
    .select({ id: agentTasksTable.id, status: agentTasksTable.status })
    .from(agentTasksTable)
    .where(and(eq(agentTasksTable.id, taskId), eq(agentTasksTable.userId, userId)));

  if (!probe) return { notFound: true };
  return { conflict: probe.status };
}

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

  let parsedPayload: unknown = rawPayload ?? {};
  if (typeof rawPayload === "string") {
    try {
      parsedPayload = JSON.parse(rawPayload);
    } catch {
      return res.status(400).json({ error: "payload must be valid JSON when supplied as a string" });
    }
  }

  const result = evaluateTask(taskType, parsedPayload);

  const status =
    result.decision === "auto_approved" ? "approved" :
    result.decision === "rejected"      ? "rejected" :
    "pending_review";

  // resolution is the terminal outcome. For auto-decided tasks it is set
  // immediately; for requires_review tasks it remains null until a human acts.
  const resolution: string | null =
    result.decision === "auto_approved" ? "approved" :
    result.decision === "rejected"      ? "rejected" :
    null;

  const decisionBy = result.decision !== "requires_review" ? "system" : null;
  const decisionAt = result.decision !== "requires_review" ? new Date()  : null;

  const [inserted] = await db.insert(agentTasksTable).values({
    userId,
    taskType:        taskType.trim(),
    payload:         JSON.stringify(parsedPayload),
    status,
    decision:        result.decision,
    resolution,
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

  const result = await atomicApprove(req.params.id, userId);

  if ("notFound" in result) {
    return res.status(404).json({ error: "Task not found" });
  }
  if ("conflict" in result) {
    return res.status(409).json({
      error: `Cannot approve a task with status "${result.conflict}". Only pending_review tasks can be approved.`,
    });
  }
  return res.json(result.task);
});

// ── POST /agent-tasks/:id/reject — human rejects a pending task ───────────────
router.post("/agent-tasks/:id/reject", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { note } = req.body as { note?: string };
  const parsedNote = typeof note === "string" ? note.trim() || null : null;

  const result = await atomicReject(req.params.id, userId, parsedNote);

  if ("notFound" in result) {
    return res.status(404).json({ error: "Task not found" });
  }
  if ("conflict" in result) {
    return res.status(409).json({
      error: `Cannot reject a task with status "${result.conflict}". Only pending_review tasks can be rejected.`,
    });
  }
  return res.json(result.task);
});

export default router;

import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  agentTasksTable,
  agentTaskStepsTable,
  socialPostsTable,
} from "@workspace/db/schema";
import type { AgentTask } from "@workspace/db/schema";
import { eq, and, asc, desc, gte, inArray, sql } from "drizzle-orm";
import { evaluateTask, RULE_SET_VERSION } from "../lib/approval-engine.js";
import { diagnoseApollosTask } from "../lib/apollos-diagnostics.js";
import { buildApollosRepairPlan } from "../lib/apollos-repair-planner.js";
import {
  assertWeeklyGenerationContract,
  type WeeklyCampaignPlan,
  type WeeklyGenerationJob,
} from "../lib/apollos-weekly-campaign.js";

const router = Router();

function repairDailyLimit(env: NodeJS.ProcessEnv): number {
  const parsed = Number(env.APOLLOS_REPAIR_DAILY_TENANT_LIMIT);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 50 ? parsed : 6;
}

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
  return db.transaction(async (tx) => {
    const [updated] = await tx
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

    if (updated) {
      if (updated.taskType === "weekly_campaign") {
        const payload =
          typeof updated.payload === "string"
            ? JSON.parse(updated.payload)
            : updated.payload;
        const batchKey = payload?.batchKey;
        const plan = payload?.plan as WeeklyCampaignPlan;
        const generationJobs =
          payload?.generationJobs as readonly WeeklyGenerationJob[];
        if (
          typeof batchKey !== "string" ||
          !plan ||
          !Array.isArray(generationJobs)
        ) {
          throw new Error("APOLLOS_WEEKLY_APPROVAL_PAYLOAD_INVALID");
        }
        assertWeeklyGenerationContract(batchKey, plan, generationJobs);
        const weeklyPlanIds = generationJobs.map(
          (job) => job.weeklyPlanId,
        );
        const posts = await tx
          .select({
            id: socialPostsTable.id,
            weeklyPlanId: socialPostsTable.weeklyPlanId,
            status: socialPostsTable.status,
            approvalStatus: socialPostsTable.approvalStatus,
          })
          .from(socialPostsTable)
          .where(
            and(
              eq(socialPostsTable.userId, userId),
              inArray(socialPostsTable.weeklyPlanId, weeklyPlanIds),
            ),
          );
        if (
          posts.length !== plan.deliveryCount ||
          posts.some(
            (post) =>
              post.status !== "draft" ||
              post.approvalStatus !== "pending_review",
          ) ||
          generationJobs.some(
            (job) =>
              posts.filter(
                (post) => post.weeklyPlanId === job.weeklyPlanId,
              ).length !== job.count,
          )
        ) {
          throw new Error("APOLLOS_WEEKLY_APPROVAL_DRAFT_MISMATCH");
        }
        const approvedAt = new Date();
        const approvedPosts = await tx
          .update(socialPostsTable)
          .set({
            approvalStatus: "approved",
            approvedBy: userId,
            approvedAt,
            status: "scheduled",
            updatedAt: approvedAt,
          })
          .where(
            and(
              eq(socialPostsTable.userId, userId),
              inArray(socialPostsTable.weeklyPlanId, weeklyPlanIds),
              eq(socialPostsTable.status, "draft"),
              eq(socialPostsTable.approvalStatus, "pending_review"),
            ),
          )
          .returning({ id: socialPostsTable.id });
        if (approvedPosts.length !== plan.deliveryCount) {
          throw new Error("APOLLOS_WEEKLY_APPROVAL_UPDATE_MISMATCH");
        }
      }
      return { task: updated };
    }

    const [probe] = await tx
      .select({ id: agentTasksTable.id, status: agentTasksTable.status })
      .from(agentTasksTable)
      .where(and(eq(agentTasksTable.id, taskId), eq(agentTasksTable.userId, userId)));

    if (!probe) return { notFound: true };
    return { conflict: probe.status };
  });
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

  const steps = await db
    .select()
    .from(agentTaskStepsTable)
    .where(eq(agentTaskStepsTable.taskId, task.id))
    .orderBy(asc(agentTaskStepsTable.position));
  const completedSteps = steps.filter((step) => step.status === "completed").length;
  const diagnosis = diagnoseApollosTask({
    taskId: task.id,
    taskStatus: task.status,
    taskFailureCode: task.failureCode,
    taskDetail: task.decisionNote,
    taskUpdatedAt: task.updatedAt.toISOString(),
    steps: steps.map((step) => ({
      stepKey: step.stepKey,
      status: step.status,
      failureCode: step.failureCode,
      updatedAt: step.updatedAt.toISOString(),
    })),
  });
  return res.json({
    ...task,
    steps,
    diagnosis,
    repairPlan: buildApollosRepairPlan(diagnosis),
    progress: {
      completedSteps,
      totalSteps: steps.length,
      percent:
        steps.length === 0
          ? 0
          : Math.round((completedSteps / steps.length) * 100),
      currentStep:
        steps.find((step) => step.status === "running")?.stepKey ??
        steps.find((step) => step.status === "pending" || step.status === "failed")
          ?.stepKey ??
        null,
    },
  });
});

// ── GET /agent-tasks/:id/diagnosis — evidence-based root cause ───────────────
router.get("/agent-tasks/:id/diagnosis", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const [task] = await db
    .select()
    .from(agentTasksTable)
    .where(and(eq(agentTasksTable.id, req.params.id), eq(agentTasksTable.userId, userId)));
  if (!task) return res.status(404).json({ error: "Task not found" });

  const steps = await db
    .select()
    .from(agentTaskStepsTable)
    .where(eq(agentTaskStepsTable.taskId, task.id))
    .orderBy(asc(agentTaskStepsTable.position));

  return res.json(diagnoseApollosTask({
    taskId: task.id,
    taskStatus: task.status,
    taskFailureCode: task.failureCode,
    taskDetail: task.decisionNote,
    taskUpdatedAt: task.updatedAt.toISOString(),
    steps: steps.map((step) => ({
      stepKey: step.stepKey,
      status: step.status,
      failureCode: step.failureCode,
      updatedAt: step.updatedAt.toISOString(),
    })),
  }));
});

// ── GET /agent-tasks/:id/repair-plan — diagnosis-bound safe plan ──────────────
router.get("/agent-tasks/:id/repair-plan", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const [task] = await db
    .select()
    .from(agentTasksTable)
    .where(and(eq(agentTasksTable.id, req.params.id), eq(agentTasksTable.userId, userId)));
  if (!task) return res.status(404).json({ error: "Task not found" });

  const steps = await db
    .select()
    .from(agentTaskStepsTable)
    .where(eq(agentTaskStepsTable.taskId, task.id))
    .orderBy(asc(agentTaskStepsTable.position));
  const diagnosis = diagnoseApollosTask({
    taskId: task.id,
    taskStatus: task.status,
    taskFailureCode: task.failureCode,
    taskDetail: task.decisionNote,
    taskUpdatedAt: task.updatedAt.toISOString(),
    steps: steps.map((item) => ({
      stepKey: item.stepKey,
      status: item.status,
      failureCode: item.failureCode,
      updatedAt: item.updatedAt.toISOString(),
    })),
  });

  return res.json(buildApollosRepairPlan(diagnosis));
});

// ── POST /agent-tasks/:id/repair-plan/submit — durable guarded request ────────
router.post("/agent-tasks/:id/repair-plan/submit", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const requestedPlanId =
    typeof req.body?.planId === "string" ? req.body.planId : null;
  const requestedDiagnosisId =
    typeof req.body?.diagnosisId === "string" ? req.body.diagnosisId : null;
  if (!requestedPlanId || !requestedDiagnosisId) {
    return res.status(400).json({
      error: "planId and diagnosisId are required",
      code: "APOLLOS_REPAIR_BINDING_REQUIRED",
    });
  }

  const [sourceTask] = await db
    .select()
    .from(agentTasksTable)
    .where(and(eq(agentTasksTable.id, req.params.id), eq(agentTasksTable.userId, userId)));
  if (!sourceTask) return res.status(404).json({ error: "Task not found" });

  const sourceSteps = await db
    .select()
    .from(agentTaskStepsTable)
    .where(eq(agentTaskStepsTable.taskId, sourceTask.id))
    .orderBy(asc(agentTaskStepsTable.position));
  const diagnosis = diagnoseApollosTask({
    taskId: sourceTask.id,
    taskStatus: sourceTask.status,
    taskFailureCode: sourceTask.failureCode,
    taskDetail: sourceTask.decisionNote,
    taskUpdatedAt: sourceTask.updatedAt.toISOString(),
    steps: sourceSteps.map((item) => ({
      stepKey: item.stepKey,
      status: item.status,
      failureCode: item.failureCode,
      updatedAt: item.updatedAt.toISOString(),
    })),
  });
  const repairPlan = buildApollosRepairPlan(diagnosis);

  if (
    repairPlan.planId !== requestedPlanId ||
    repairPlan.diagnosisId !== requestedDiagnosisId
  ) {
    return res.status(409).json({
      error: "The diagnosis or repair plan changed. Review the current plan before approving it.",
      code: "APOLLOS_REPAIR_EVIDENCE_CHANGED",
      currentPlanId: repairPlan.planId,
      currentDiagnosisId: repairPlan.diagnosisId,
    });
  }
  if (
    repairPlan.status === "not_required" ||
    repairPlan.status === "manual_required" ||
    repairPlan.status === "insufficient_evidence"
  ) {
    return res.status(422).json({
      error: "This repair plan is not executable by Apollos.",
      code: "APOLLOS_REPAIR_NOT_EXECUTABLE",
      status: repairPlan.status,
    });
  }

  const payload = {
    sourceTaskId: sourceTask.id,
    planId: repairPlan.planId,
    diagnosisId: repairPlan.diagnosisId,
    repairPlan,
  };
  const evaluation = evaluateTask("execute_repair_plan", payload);
  if (evaluation.decision !== "requires_review") {
    return res.status(500).json({
      error: "Repair approval boundary rejected the request.",
      code: "APOLLOS_REPAIR_APPROVAL_BOUNDARY_INVALID",
    });
  }

  const dailyLimit = repairDailyLimit(process.env);
  const repairTask = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(
        hashtext(${`apollos-repair:${userId}`})
      )`,
    );
    const [existing] = await tx
      .select()
      .from(agentTasksTable)
      .where(
        and(
          eq(agentTasksTable.userId, userId),
          eq(agentTasksTable.taskType, "execute_repair_plan"),
          eq(agentTasksTable.payload, JSON.stringify(payload)),
          inArray(agentTasksTable.status, [
            "pending_review",
            "approved",
            "executing",
            "executed",
          ]),
        ),
      )
      .orderBy(desc(agentTasksTable.createdAt))
      .limit(1);
    if (existing) return { task: existing, reused: true };

    const recent = await tx
      .select({ id: agentTasksTable.id })
      .from(agentTasksTable)
      .where(
        and(
          eq(agentTasksTable.userId, userId),
          eq(agentTasksTable.taskType, "execute_repair_plan"),
          gte(
            agentTasksTable.createdAt,
            new Date(Date.now() - 24 * 60 * 60 * 1000),
          ),
        ),
      )
      .limit(dailyLimit);
    if (recent.length >= dailyLimit) return null;

    const [inserted] = await tx.insert(agentTasksTable).values({
      userId,
      taskType: "execute_repair_plan",
      payload: JSON.stringify(payload),
      status: "pending_review",
      decision: evaluation.decision,
      resolution: null,
      decisionBy: null,
      decisionAt: null,
      decisionNote: null,
      ruleId: evaluation.ruleId,
      ruleSetVersion: RULE_SET_VERSION,
    }).returning();
    return { task: inserted, reused: false };
  });
  if (!repairTask) {
    return res.status(429).json({
      error: "The tenant repair request budget has been reached.",
      code: "APOLLOS_REPAIR_TENANT_BUDGET_EXHAUSTED",
      limit: dailyLimit,
      windowHours: 24,
    });
  }

  return res.status(repairTask.reused ? 200 : 201).json({
    task: repairTask.task,
    repairPlan,
    approvalRequired: true,
    reused: repairTask.reused,
  });
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

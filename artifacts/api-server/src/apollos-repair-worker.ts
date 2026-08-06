import { createHash } from "node:crypto";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger.js";
import { diagnoseApollosTask } from "./lib/apollos-diagnostics.js";
import { buildApollosRepairPlan, type ApollosRepairPlan } from "./lib/apollos-repair-planner.js";
import { runApollosUpstreamHealthProbe } from "./lib/apollos-upstream-probe.js";
import { runApollosRepairPlan, type ApollosRepairAction } from "./lib/apollos-repair-runner.js";
import type { ApollosRepairStepReceipt } from "./lib/apollos-repair-execution.js";
import { readApollosRepairWorkerConfig } from "./lib/apollos-repair-worker-config.js";
import {
  assertApollosRepairHandlerContract,
  buildApollosRepairAdapterRegistry,
} from "./lib/apollos-repair-adapters.js";

const config = readApollosRepairWorkerConfig(process.env);
let stopped = false;

interface RepairPayload {
  sourceTaskId: string;
  planId: string;
  diagnosisId: string;
  repairPlan: ApollosRepairPlan;
}

interface ClaimedRepair {
  id: string;
  user_id: string;
  payload: string;
  execution_attempts: number;
}

interface SourceTaskRow {
  id: string;
  user_id: string;
  status: string;
  failure_code: string | null;
  decision_note: string | null;
  updated_at: Date;
}

interface SourceStepRow {
  step_key: string;
  status: string;
  failure_code: string | null;
  updated_at: Date;
  position: number;
  capability: string;
  attempt_count: number;
  max_attempts: number;
  lease_owner: string | null;
  lease_expires_at: Date | null;
  output_receipt: unknown;
}

function parsePayload(text: string): RepairPayload {
  const value = JSON.parse(text) as Partial<RepairPayload>;
  if (
    typeof value.sourceTaskId !== "string" ||
    typeof value.planId !== "string" ||
    typeof value.diagnosisId !== "string" ||
    !value.repairPlan ||
    typeof value.repairPlan !== "object"
  ) {
    throw new Error("APOLLOS_REPAIR_PAYLOAD_INVALID");
  }
  return value as RepairPayload;
}

async function readSource(
  sourceTaskId: string,
  userId: string,
): Promise<{ task: SourceTaskRow; steps: SourceStepRow[] }> {
  const taskResult = await pool.query<SourceTaskRow>(
    `SELECT id,user_id,status,failure_code,decision_note,updated_at
       FROM agent_tasks
      WHERE id=$1 AND user_id=$2`,
    [sourceTaskId, userId],
  );
  const task = taskResult.rows[0];
  if (!task) throw new Error("APOLLOS_REPAIR_SOURCE_TASK_NOT_FOUND");
  const steps = await pool.query<SourceStepRow>(
    `SELECT step_key,status,failure_code,updated_at,position,capability,
            attempt_count,max_attempts,lease_owner,lease_expires_at,output_receipt
       FROM agent_task_steps
      WHERE task_id=$1
      ORDER BY position ASC`,
    [sourceTaskId],
  );
  return { task, steps: steps.rows };
}

async function currentPlan(
  sourceTaskId: string,
  userId: string,
): Promise<ApollosRepairPlan> {
  const source = await readSource(sourceTaskId, userId);
  const diagnosis = diagnoseApollosTask({
    taskId: source.task.id,
    taskStatus: source.task.status,
    taskFailureCode: source.task.failure_code,
    taskDetail: source.task.decision_note,
    taskUpdatedAt: source.task.updated_at.toISOString(),
    steps: source.steps.map((item) => ({
      stepKey: item.step_key,
      status: item.status,
      failureCode: item.failure_code,
      updatedAt: item.updated_at.toISOString(),
    })),
  });
  return buildApollosRepairPlan(diagnosis);
}

async function recoverExpiredClaims(): Promise<void> {
  await pool.query(
    `UPDATE agent_tasks
        SET status=CASE
              WHEN execution_attempts >= $1 THEN 'failed'
              ELSE 'approved'
            END,
            failure_code=CASE
              WHEN execution_attempts >= $1
                THEN 'APOLLOS_REPAIR_ATTEMPTS_EXHAUSTED'
              ELSE 'APOLLOS_REPAIR_LEASE_EXPIRED'
            END,
            decision_note=CASE
              WHEN execution_attempts >= $1
                THEN 'Repair worker attempts exhausted.'
              ELSE 'Expired repair claim recovered for a bounded retry.'
            END,
            updated_at=now()
      WHERE task_type='execute_repair_plan'
        AND status='executing'
        AND execution_started_at < now() - ($2::text || ' milliseconds')::interval`,
    [config.maxAttempts, config.leaseMs],
  );
}

async function claimOne(): Promise<ClaimedRepair | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<ClaimedRepair>(
      `SELECT id,user_id,payload,execution_attempts
         FROM agent_tasks
        WHERE task_type='execute_repair_plan'
          AND status='approved'
          AND resolution='approved'
          AND execution_attempts < $1
        ORDER BY decision_at ASC NULLS LAST, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1`,
      [config.maxAttempts],
    );
    const task = found.rows[0];
    if (!task) {
      await client.query("COMMIT");
      return null;
    }
    const claimed = await client.query<ClaimedRepair>(
      `UPDATE agent_tasks
          SET status='executing',
              execution_attempts=execution_attempts+1,
              execution_started_at=now(),
              execution_completed_at=NULL,
              failure_code=NULL,
              decision_note=$2,
              updated_at=now()
        WHERE id=$1 AND status='approved' AND resolution='approved'
        RETURNING id,user_id,payload,execution_attempts`,
      [task.id, `Claimed by ${config.runtimeId}`],
    );
    await client.query("COMMIT");
    return claimed.rows[0] ?? null;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function ensureRepairSteps(
  repairTaskId: string,
  plan: ApollosRepairPlan,
): Promise<void> {
  for (const item of plan.steps) {
    const digest = createHash("sha256")
      .update(plan.planId)
      .update(plan.diagnosisId)
      .update(JSON.stringify(item))
      .digest("hex");
    await pool.query(
      `INSERT INTO agent_task_steps
        (task_id,step_key,position,capability,status,max_attempts,input_digest)
       VALUES ($1,$2,$3,$4,'pending',1,$5)
       ON CONFLICT (task_id,step_key) DO NOTHING`,
      [repairTaskId, item.key, item.position, item.capability, digest],
    );
  }
  const rows = await pool.query<{
    step_key: string;
    position: number;
    capability: string;
    input_digest: string;
  }>(
    `SELECT step_key,position,capability,input_digest
       FROM agent_task_steps
      WHERE task_id=$1
      ORDER BY position ASC`,
    [repairTaskId],
  );
  if (rows.rows.length !== plan.steps.length) {
    throw new Error("APOLLOS_REPAIR_CHECKPOINT_COUNT_MISMATCH");
  }
  for (const item of plan.steps) {
    const expectedDigest = createHash("sha256")
      .update(plan.planId)
      .update(plan.diagnosisId)
      .update(JSON.stringify(item))
      .digest("hex");
    const row = rows.rows.find((candidate) => candidate.step_key === item.key);
    if (
      !row ||
      row.position !== item.position ||
      row.capability !== item.capability ||
      row.input_digest !== expectedDigest
    ) {
      throw new Error(`APOLLOS_REPAIR_CHECKPOINT_BINDING_MISMATCH:${item.key}`);
    }
  }
}

async function loadReceipts(
  repairTaskId: string,
): Promise<ApollosRepairStepReceipt[]> {
  const rows = await pool.query<{ output_receipt: unknown }>(
    `SELECT output_receipt
       FROM agent_task_steps
      WHERE task_id=$1 AND output_receipt IS NOT NULL
      ORDER BY position ASC`,
    [repairTaskId],
  );
  return rows.rows
    .map((item) => item.output_receipt)
    .filter((item): item is ApollosRepairStepReceipt => Boolean(item));
}

async function persistReceipt(
  repairTaskId: string,
  receipt: ApollosRepairStepReceipt,
): Promise<void> {
  const updated = await pool.query(
    `UPDATE agent_task_steps
        SET status=$3,
            output_receipt=$4::jsonb,
            failure_code=CASE WHEN $3='failed'
              THEN 'APOLLOS_REPAIR_STEP_VERIFICATION_FAILED'
              ELSE NULL END,
            completed_at=now(),
            lease_owner=NULL,
            lease_expires_at=NULL,
            updated_at=now()
      WHERE task_id=$1 AND step_key=$2 AND status IN ('pending','running','failed')
      RETURNING id`,
    [
      repairTaskId,
      receipt.stepKey,
      receipt.status === "verified" ? "completed" : "failed",
      JSON.stringify(receipt),
    ],
  );
  if (updated.rowCount !== 1) {
    throw new Error(`APOLLOS_REPAIR_RECEIPT_PERSIST_CONFLICT:${receipt.stepKey}`);
  }
}

function inspectionActions(
  sourceTaskId: string,
  userId: string,
): Readonly<Record<string, ApollosRepairAction>> {
  const snapshot: ApollosRepairAction = async ({ stepKey }) => {
    const source = await readSource(sourceTaskId, userId);
    return {
      verified: true,
      evidence: {
        stepKey,
        sourceTaskId,
        taskStatus: source.task.status,
        failureCode: source.task.failure_code,
        checkpoints: source.steps.map((item) => ({
          stepKey: item.step_key,
          status: item.status,
          failureCode: item.failure_code,
          attemptCount: item.attempt_count,
          maxAttempts: item.max_attempts,
          leaseOwner: item.lease_owner,
          leaseExpiresAt: item.lease_expires_at?.toISOString() ?? null,
        })),
      },
    };
  };
  const inspectLease: ApollosRepairAction = async ({ stepKey }) => {
    const source = await readSource(sourceTaskId, userId);
    const leased = source.steps.find(
      (item) => item.lease_owner || item.lease_expires_at,
    );
    const now = Date.now();
    return {
      verified: Boolean(leased),
      evidence: {
        stepKey,
        lease: leased
          ? {
              checkpoint: leased.step_key,
              ownerPresent: Boolean(leased.lease_owner),
              expiresAt: leased.lease_expires_at?.toISOString() ?? null,
              expired:
                leased.lease_expires_at !== null &&
                leased.lease_expires_at.getTime() <= now,
              observedAt: new Date(now).toISOString(),
            }
          : null,
      },
    };
  };
  const recoverExpiredLease: ApollosRepairAction = async ({ stepKey }) => {
    const recovered = await pool.query<{
      step_key: string;
      attempt_count: number;
      max_attempts: number;
    }>(
      `WITH candidate AS (
         SELECT step.id
           FROM agent_task_steps AS step
           JOIN agent_tasks AS task ON task.id=step.task_id
          WHERE step.task_id=$1
            AND task.user_id=$2
            AND step.status='running'
            AND step.lease_expires_at IS NOT NULL
            AND step.lease_expires_at < now()
            AND step.attempt_count < step.max_attempts
          ORDER BY step.position ASC
          LIMIT 1
          FOR UPDATE OF step SKIP LOCKED
       )
       UPDATE agent_task_steps AS step
          SET status='pending',
              lease_owner=NULL,
              lease_expires_at=NULL,
              failure_code=NULL,
              updated_at=now()
         FROM candidate
        WHERE step.id=candidate.id
      RETURNING step.step_key,step.attempt_count,step.max_attempts`,
      [sourceTaskId, userId],
    );
    return {
      verified: recovered.rowCount === 1,
      evidence: {
        stepKey,
        recoveredCount: recovered.rowCount,
        checkpoint: recovered.rows[0]?.step_key ?? null,
        attemptCount: recovered.rows[0]?.attempt_count ?? null,
        maxAttempts: recovered.rows[0]?.max_attempts ?? null,
      },
    };
  };
  const probeUpstream: ApollosRepairAction = async ({ stepKey, signal }) => {
    const result = await runApollosUpstreamHealthProbe(process.env, signal);
    return {
      verified: result.verified,
      evidence: { stepKey, ...result.evidence },
    };
  };
  const retryUpstreamCheckpoint: ApollosRepairAction = async ({ stepKey }) => {
    const retried = await pool.query<{
      step_key: string;
      attempt_count: number;
      max_attempts: number;
    }>(
      `WITH candidate AS (
         SELECT step.id
           FROM agent_task_steps AS step
           JOIN agent_tasks AS task ON task.id=step.task_id
          WHERE step.task_id=$1
            AND task.user_id=$2
            AND step.status='failed'
            AND step.attempt_count < step.max_attempts
          ORDER BY step.position ASC
          LIMIT 1
          FOR UPDATE OF step SKIP LOCKED
       )
       UPDATE agent_task_steps AS step
          SET status='pending',
              failure_code=NULL,
              lease_owner=NULL,
              lease_expires_at=NULL,
              updated_at=now()
         FROM candidate
        WHERE step.id=candidate.id
      RETURNING step.step_key,step.attempt_count,step.max_attempts`,
      [sourceTaskId, userId],
    );
    return {
      verified: retried.rowCount === 1,
      evidence: {
        stepKey,
        retriedCount: retried.rowCount,
        checkpoint: retried.rows[0]?.step_key ?? null,
        attemptCount: retried.rows[0]?.attempt_count ?? null,
        maxAttempts: retried.rows[0]?.max_attempts ?? null,
      },
    };
  };
  const earliestFailure: ApollosRepairAction = async ({ stepKey }) => {
    const source = await readSource(sourceTaskId, userId);
    const failed = source.steps.find((item) => item.failure_code);
    return {
      verified: Boolean(failed),
      evidence: {
        stepKey,
        earliestFailure: failed
          ? {
              checkpoint: failed.step_key,
              failureCode: failed.failure_code,
              observedAt: failed.updated_at.toISOString(),
            }
          : null,
      },
    };
  };
  return Object.freeze({
    "preserve-render-inputs": snapshot,
    "preserve-binding-evidence": snapshot,
    "find-earliest-failure": earliestFailure,
    "collect-causal-evidence": earliestFailure,
    "inspect-lease-owner": inspectLease,
    "recover-expired-lease": recoverExpiredLease,
    "probe-upstream-health": probeUpstream,
    "retry-upstream-checkpoint": retryUpstreamCheckpoint,
  });
}

async function finishTask(
  taskId: string,
  status: string,
  failureCode: string | null,
  note: string,
): Promise<void> {
  const updated = await pool.query(
    `UPDATE agent_tasks
        SET status=$2,
            failure_code=$3,
            decision_note=$4,
            execution_completed_at=now(),
            updated_at=now()
      WHERE id=$1 AND status='executing'
      RETURNING id`,
    [taskId, status, failureCode, note.slice(0, 500)],
  );
  if (updated.rowCount !== 1) {
    throw new Error("APOLLOS_REPAIR_TASK_FINISH_CONFLICT");
  }
}

async function processOne(): Promise<void> {
  const task = await claimOne();
  if (!task) return;
  try {
    const payload = parsePayload(task.payload);
    const plan = await currentPlan(payload.sourceTaskId, task.user_id);
    if (
      plan.planId !== payload.planId ||
      plan.diagnosisId !== payload.diagnosisId ||
      payload.repairPlan.planId !== payload.planId ||
      payload.repairPlan.diagnosisId !== payload.diagnosisId
    ) {
      throw new Error("APOLLOS_REPAIR_EVIDENCE_CHANGED");
    }

    await ensureRepairSteps(task.id, plan);
    const receipts = await loadReceipts(task.id);
    const handlers = inspectionActions(payload.sourceTaskId, task.user_id);
    assertApollosRepairHandlerContract(handlers);
    const adapterRegistry = buildApollosRepairAdapterRegistry({
      plan,
      handlers,
      env: process.env,
    });
    logger.info(
      {
        repairTaskId: task.id,
        adapters: adapterRegistry.decisions.map((item) => ({
          stepKey: item.stepKey,
          allowed: item.allowed,
          reasonCode: item.reasonCode,
        })),
      },
      "[apollos-repair] adapter permissions resolved",
    );
    const controller = new AbortController();
    const result = await runApollosRepairPlan(
      {
        sourceTaskId: payload.sourceTaskId,
        repairTaskId: task.id,
        plan,
        approvedPlanId: payload.planId,
        approvedDiagnosisId: payload.diagnosisId,
        receipts,
        signal: controller.signal,
      },
      {
        actions: adapterRegistry.actions,
        readCurrentBinding: async () => {
          const current = await currentPlan(payload.sourceTaskId, task.user_id);
          return {
            diagnosisId: current.diagnosisId,
            planId: current.planId,
          };
        },
        persistReceipt: (receipt) => persistReceipt(task.id, receipt),
        now: () => new Date().toISOString(),
      },
    );

    if (result.status === "completed") {
      await finishTask(
        task.id,
        "executed",
        null,
        `Repair plan completed with ${result.completedSteps} verified steps.`,
      );
    } else if (
      result.status === "waiting_for_approval" ||
      result.status === "waiting_for_operator"
    ) {
      await finishTask(
        task.id,
        "failed",
        result.reasonCode,
        `Repair stopped safely: ${result.status}.`,
      );
    } else if (result.status === "blocked_unsupported") {
      await finishTask(
        task.id,
        "failed",
        result.reasonCode,
        "Repair reached a step with no registered production adapter.",
      );
    } else {
      await finishTask(
        task.id,
        "failed",
        result.reasonCode,
        `Repair stopped safely: ${result.status}.`,
      );
    }
    logger.info(
      {
        repairTaskId: task.id,
        sourceTaskId: payload.sourceTaskId,
        status: result.status,
        reasonCode: result.reasonCode,
        completedSteps: result.completedSteps,
        totalSteps: result.totalSteps,
      },
      "[apollos-repair] repair task processed",
    );
  } catch (error) {
    const raw =
      error instanceof Error ? error.message : "APOLLOS_REPAIR_WORKER_FAILED";
    const code = raw.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]").slice(0, 300);
    await finishTask(task.id, "failed", code, `Repair failed closed: ${code}`);
    logger.error({ repairTaskId: task.id, code }, "[apollos-repair] failed closed");
  }
}

async function main(): Promise<void> {
  if (!config.enabled || config.killSwitch) {
    logger.info(config, "[apollos-repair] disabled");
    return;
  }
  logger.info(
    {
      runtimeId: config.runtimeId,
      intervalMs: config.intervalMs,
      maxAttempts: config.maxAttempts,
    },
    "[apollos-repair] worker started",
  );
  while (!stopped) {
    try {
      await recoverExpiredClaims();
      await processOne();
    } catch (error) {
      logger.error({ error }, "[apollos-repair] tick failed closed");
    }
    await new Promise((resolve) => setTimeout(resolve, config.intervalMs));
  }
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    stopped = true;
  });
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    logger.error({ error }, "[apollos-repair] startup failed closed");
    await pool.end().catch(() => undefined);
    process.exit(1);
  });

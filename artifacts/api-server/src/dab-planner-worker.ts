import { pool } from "@workspace/db";
import {
  planNextOperation,
  type ExecutionPlan as PlannerExecutionPlan,
  type RunnerInput as PlannerRunnerInput,
} from "../../../lib/development-control-runner/src/index.js";
import {
  createRunnerRuntime,
  type ExecutionPlan as RuntimeExecutionPlan,
  type RunnerCycleRecord,
  type RunnerInput as RuntimeRunnerInput,
  type TaskSnapshot as RuntimeTaskSnapshot,
} from "../../../lib/development-control-runner-runtime/src/index.js";
import {
  createWakeupController,
  type PriorHeartbeatSnapshot,
  type WakeupHeartbeat,
} from "../../../lib/development-control-runner-runtime/src/scheduler.js";
import {
  evaluateActivationReadiness,
  INITIAL_PLANNER_RUNTIME_OPERATIONS,
} from "../../../lib/development-control-runner-runtime/src/readiness.js";
import { logger } from "./lib/logger";
import { readDabPlannerWorkerConfig } from "./lib/dab-planner-worker-config";

const config = readDabPlannerWorkerConfig();
let stopped = false;

function planRuntimeInput(input: RuntimeRunnerInput): RuntimeExecutionPlan {
  return planNextOperation(
    input as unknown as PlannerRunnerInput,
  ) as PlannerExecutionPlan as RuntimeExecutionPlan;
}

async function bootstrapRunnerTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dab_runner_leases (
      schedule_id text PRIMARY KEY,
      owner_id text NOT NULL,
      acquired_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL,
      lease_version integer NOT NULL CHECK (lease_version > 0)
    );
    CREATE TABLE IF NOT EXISTS dab_runner_cycles (
      cycle_key text PRIMARY KEY,
      actor_id text NOT NULL,
      started_at timestamptz NOT NULL,
      completed_at timestamptz NOT NULL,
      task_id text,
      operation text NOT NULL,
      stop_code text,
      required_categories jsonb NOT NULL,
      plan_fingerprint text NOT NULL,
      input_fingerprint text NOT NULL,
      outcome text NOT NULL CHECK (outcome IN ('planned','stopped')),
      record jsonb NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dab_runner_heartbeats (
      heartbeat_id bigserial PRIMARY KEY,
      schedule_id text NOT NULL,
      runtime_id text NOT NULL,
      evaluated_at timestamptz NOT NULL,
      readiness_status text NOT NULL CHECK (readiness_status IN ('ready','blocked')),
      readiness_fingerprint text NOT NULL,
      readiness_blockers jsonb NOT NULL,
      reason_code text NOT NULL,
      attempted_cycle_key text,
      due_slot bigint,
      next_eligible_at timestamptz,
      consecutive_failures integer NOT NULL CHECK (consecutive_failures >= 0),
      heartbeat jsonb NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dab_runner_heartbeats_schedule_time
      ON dab_runner_heartbeats(schedule_id, evaluated_at DESC, heartbeat_id DESC);
  `);
}

async function acquireLease(now: string): Promise<boolean> {
  const expiresAt = new Date(Date.parse(now) + config.leaseMs).toISOString();
  const result = await pool.query<{ owner_id: string }>(
    `INSERT INTO dab_runner_leases(schedule_id, owner_id, acquired_at, expires_at, lease_version)
     VALUES ($1, $2, $3, $4, 1)
     ON CONFLICT (schedule_id) DO UPDATE SET
       owner_id = EXCLUDED.owner_id,
       acquired_at = EXCLUDED.acquired_at,
       expires_at = EXCLUDED.expires_at,
       lease_version = dab_runner_leases.lease_version + 1
     WHERE dab_runner_leases.expires_at <= EXCLUDED.acquired_at
        OR dab_runner_leases.owner_id = EXCLUDED.owner_id
     RETURNING owner_id`,
    [config.scheduleId, config.runtimeId, now, expiresAt],
  );
  return result.rows[0]?.owner_id === config.runtimeId;
}

async function releaseLease(): Promise<void> {
  await pool.query(
    `DELETE FROM dab_runner_leases WHERE schedule_id = $1 AND owner_id = $2`,
    [config.scheduleId, config.runtimeId],
  );
}

async function canonicalStoreReady(): Promise<boolean> {
  const result = await pool.query<{ ready: boolean }>(`
    SELECT to_regclass('public.development_tasks') IS NOT NULL
       AND to_regclass('public.development_task_specifications') IS NOT NULL
       AND to_regclass('public.development_authorization_decisions') IS NOT NULL
       AND to_regclass('public.development_task_claims') IS NOT NULL AS ready
  `);
  return result.rows[0]?.ready === true;
}

async function readTasks(limit: number): Promise<readonly RuntimeTaskSnapshot[]> {
  const result = await pool.query<{
    task_id: string;
    active_revision: number;
    specification_hash: string;
    state: string;
    created_at: Date;
    expected_origin_main_sha: string;
    approvals: unknown;
    owner_actor_id: string | null;
    claim_expires_at: Date | null;
    lease_version: number | null;
  }>(
    `SELECT t.task_id, t.active_revision, t.specification_hash, t.state, t.created_at,
            s.expected_origin_main_sha,
            COALESCE(jsonb_agg(jsonb_build_object(
              'category', category.value,
              'approved', a.decision = 'approved',
              'expiresAt', a.expires_at,
              'revoked', a.decision = 'revoked'
            )) FILTER (WHERE a.approval_id IS NOT NULL), '[]'::jsonb) AS approvals,
            c.owner_actor_id, c.expires_at AS claim_expires_at, c.lease_version
       FROM development_tasks t
       JOIN development_task_specifications s
         ON s.task_id = t.task_id AND s.revision = t.active_revision
       LEFT JOIN development_authorization_decisions a
         ON a.task_id = t.task_id
        AND a.specification_revision = t.active_revision
        AND a.specification_hash = t.specification_hash
       LEFT JOIN LATERAL jsonb_array_elements_text(COALESCE(a.categories, '[]'::jsonb)) category(value)
         ON TRUE
       LEFT JOIN development_task_claims c ON c.task_id = t.task_id
      WHERE t.state IN ('approved','claimed','in_progress','review_requested','verified')
      GROUP BY t.task_id, t.active_revision, t.specification_hash, t.state, t.created_at,
               s.expected_origin_main_sha, c.owner_actor_id, c.expires_at, c.lease_version
      ORDER BY t.updated_at ASC, t.task_id ASC
      LIMIT $1`,
    [limit],
  );

  return Object.freeze(result.rows.map((row): RuntimeTaskSnapshot => Object.freeze({
    taskId: row.task_id,
    priority: 0,
    createdAt: row.created_at.toISOString(),
    state: row.state,
    specificationRevision: row.active_revision,
    specificationHash: row.specification_hash,
    observedSpecificationRevision: row.active_revision,
    observedSpecificationHash: row.specification_hash,
    expectedSha: row.expected_origin_main_sha,
    approvals: Array.isArray(row.approvals) ? row.approvals : [],
    lease: row.owner_actor_id && row.claim_expires_at && row.lease_version
      ? Object.freeze({
          ownerId: row.owner_actor_id,
          expiresAt: row.claim_expires_at.toISOString(),
          version: row.lease_version,
        })
      : null,
    gitEvidence: Object.freeze({
      available: false,
      expectedSha: row.expected_origin_main_sha,
      observedSha: row.expected_origin_main_sha,
    }),
    policyDecision: "allowed",
  })));
}

async function readPriorHeartbeat(): Promise<PriorHeartbeatSnapshot> {
  const result = await pool.query<{
    due_slot: string | null;
    evaluated_at: Date;
    consecutive_failures: number;
  }>(
    `SELECT due_slot, evaluated_at, consecutive_failures
       FROM dab_runner_heartbeats
      WHERE schedule_id = $1
      ORDER BY evaluated_at DESC, heartbeat_id DESC
      LIMIT 1`,
    [config.scheduleId],
  );
  const row = result.rows[0];
  if (!row) return Object.freeze({ consecutiveFailures: 0 });
  return Object.freeze({
    lastDueSlot: row.due_slot == null ? null : Number(row.due_slot),
    lastCompletedAt: row.evaluated_at.toISOString(),
    inProgressCycleKey: null,
    consecutiveFailures: row.consecutive_failures,
  });
}

async function appendHeartbeat(input: {
  now: string;
  readiness: ReturnType<typeof evaluateActivationReadiness>;
  heartbeat: WakeupHeartbeat;
  consecutiveFailures: number;
}): Promise<void> {
  await pool.query(
    `INSERT INTO dab_runner_heartbeats(
       schedule_id, runtime_id, evaluated_at, readiness_status,
       readiness_fingerprint, readiness_blockers, reason_code,
       attempted_cycle_key, due_slot, next_eligible_at,
       consecutive_failures, heartbeat
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12::jsonb)`,
    [
      config.scheduleId,
      config.runtimeId,
      input.now,
      input.readiness.status,
      input.readiness.fingerprint,
      JSON.stringify(input.readiness.blockers),
      input.heartbeat.reasonCode,
      input.heartbeat.attemptedCycleKey,
      input.heartbeat.dueSlot,
      input.heartbeat.nextEligibleAt,
      input.consecutiveFailures,
      JSON.stringify(input.heartbeat),
    ],
  );
}

async function tick(): Promise<void> {
  const now = new Date().toISOString();
  if (!(await acquireLease(now))) {
    logger.info({ runtimeId: config.runtimeId }, "[dab-planner] lease held by another worker");
    return;
  }

  try {
    const storeReady = await canonicalStoreReady();
    const evidence = (ready: boolean, ref: string) => Object.freeze({
      ready,
      evidenceRef: ref,
      observedAt: now,
    });
    const readiness = evaluateActivationReadiness({
      runtimeId: config.runtimeId,
      environment: "production",
      evaluatedAt: now,
      evidenceMaxAgeSeconds: 300,
      durableStore: evidence(storeReady, "postgres:development-control"),
      migrations: evidence(true, "postgres:dab-runner-tables"),
      schedulerHost: evidence(true, "coolify:dab-planner-worker"),
      heartbeatPersistence: evidence(true, "postgres:dab-runner-heartbeats"),
      killSwitch: evidence(true, "env:DAB_PLANNER_KILL_SWITCH"),
      policyVersion: "planner-only-v1",
      supportedPolicyVersions: ["planner-only-v1"],
      allowedOperations: INITIAL_PLANNER_RUNTIME_OPERATIONS,
      capabilities: {
        credentialsEnabled: false,
        gitWritesEnabled: false,
        deploymentEnabled: false,
        providerWritesEnabled: false,
        paidProvidersEnabled: false,
        externalActionsEnabled: false,
      },
      activationAuthorizationRef: config.activationAuthorizationRef,
    });

    const prior = await readPriorHeartbeat();
    const runtime = createRunnerRuntime({
      now: () => new Date().toISOString(),
      plan: planRuntimeInput,
      reads: {
        readTasks: storeReady ? readTasks : async () => [],
        async readCycleLease() {
          return Object.freeze({ available: false, ownerId: null, expiresAt: null });
        },
        async readPriorCycle(cycleKey) {
          const result = await pool.query<{
            input_fingerprint: string;
            record: RunnerCycleRecord;
          }>(
            `SELECT input_fingerprint, record FROM dab_runner_cycles WHERE cycle_key = $1`,
            [cycleKey],
          );
          const row = result.rows[0];
          return row
            ? Object.freeze({
                cycleKey,
                inputFingerprint: row.input_fingerprint,
                result: row.record,
              })
            : null;
        },
      },
      writes: {
        async appendCycle(record) {
          await pool.query(
            `INSERT INTO dab_runner_cycles(
               cycle_key, actor_id, started_at, completed_at, task_id, operation,
               stop_code, required_categories, plan_fingerprint, input_fingerprint,
               outcome, record
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12::jsonb)
             ON CONFLICT (cycle_key) DO NOTHING`,
            [
              record.cycleKey,
              record.actorId,
              record.startedAt,
              record.completedAt,
              record.taskId,
              record.operation,
              record.stopCode,
              JSON.stringify(record.requiredCategories),
              record.planFingerprint,
              record.inputFingerprint,
              record.outcome,
              JSON.stringify(record),
            ],
          );
        },
      },
    });

    const controller = createWakeupController({ runCycle: runtime.runCycle });
    const heartbeat: WakeupHeartbeat = readiness.status === "ready"
      ? await controller.tick({
          now,
          policy: {
            scheduleId: config.scheduleId,
            actorId: config.runtimeId,
            intervalMs: config.intervalMs,
            backoffBaseMs: config.intervalMs,
            backoffMaxMs: Math.min(config.intervalMs * 16, 3_600_000),
            paused: false,
            killSwitch: config.killSwitch,
            maxTasks: 100,
          },
          prior,
        })
      : Object.freeze({
          scheduleId: config.scheduleId,
          evaluatedAt: now,
          due: false,
          reasonCode: "PAUSED",
          attemptedCycleKey: null,
          dueSlot: null,
          nextEligibleAt: null,
          cycleResult: null,
        });

    const consecutiveFailures = heartbeat.reasonCode === "CYCLE_FAILED"
      ? prior.consecutiveFailures + 1
      : heartbeat.reasonCode === "CYCLE_COMPLETED" || heartbeat.reasonCode === "CYCLE_STOPPED"
        ? 0
        : prior.consecutiveFailures;
    await appendHeartbeat({ now, readiness, heartbeat, consecutiveFailures });
    logger.info({
      readiness: readiness.status,
      blockers: readiness.blockers,
      reasonCode: heartbeat.reasonCode,
      cycleKey: heartbeat.attemptedCycleKey,
    }, "[dab-planner] heartbeat persisted");
  } catch (err) {
    logger.error({ err }, "[dab-planner] tick failed closed");
  } finally {
    await releaseLease().catch((err) =>
      logger.error({ err }, "[dab-planner] lease release failed"),
    );
  }
}

async function main(): Promise<void> {
  if (!config.enabled) {
    logger.info("[dab-planner] disabled by DAB_PLANNER_WORKER_ENABLED");
    return;
  }
  await bootstrapRunnerTables();
  logger.info(
    { runtimeId: config.runtimeId, intervalMs: config.intervalMs },
    "[dab-planner] planner-only worker started",
  );
  while (!stopped) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, config.intervalMs));
  }
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    stopped = true;
    logger.info({ signal }, "[dab-planner] shutdown requested");
  });
}

main()
  .then(async () => {
    await pool.end();
  })
  .catch(async (err) => {
    logger.error({ err }, "[dab-planner] startup failed closed");
    await pool.end().catch(() => undefined);
    process.exit(1);
  });

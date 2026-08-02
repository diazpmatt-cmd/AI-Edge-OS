export type AuthorizationCategory =
  | "scope"
  | "editing"
  | "committing"
  | "pushing"
  | "pull_request_creation"
  | "merging"
  | "deployment"
  | "credentials"
  | "paid_providers"
  | "external_actions";

export type RunnerOperation =
  | "claim_approved_task"
  | "renew_claim"
  | "transition_to_in_progress"
  | "request_review"
  | "submit_completion_report"
  | "verify_task"
  | "complete_task"
  | "release_claim"
  | "stop";

export type RunnerStopCode =
  | "NO_ELIGIBLE_TASK"
  | "APPROVAL_MISSING"
  | "CATEGORY_MISSING"
  | "STALE_SHA"
  | "STALE_SPECIFICATION"
  | "ACTIVE_FOREIGN_LEASE"
  | "LEASE_EXPIRED_REQUIRES_RECOVERY"
  | "GIT_EVIDENCE_UNAVAILABLE"
  | "POLICY_DENIED"
  | "OPERATION_DEFERRED"
  | "HUMAN_REQUIRED"
  | "KILL_SWITCH_ACTIVE"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_SNAPSHOT";

export interface TaskSnapshot {
  readonly taskId: string;
  readonly priority: number;
  readonly createdAt: string;
  readonly state: string;
  readonly specificationRevision: number;
  readonly specificationHash: string;
  readonly observedSpecificationRevision: number;
  readonly observedSpecificationHash: string;
  readonly expectedSha: string;
  readonly approvals: readonly unknown[];
  readonly lease?: unknown;
  readonly gitEvidence: Readonly<Record<string, unknown>>;
  readonly requestedOperation?: Exclude<RunnerOperation, "stop"> | null;
  readonly policyDecision: "allowed" | "denied" | "deferred";
  readonly humanRequired?: boolean;
  readonly idempotency?: unknown;
}

export interface RunnerInput {
  readonly actorId: string;
  readonly now: string;
  readonly killSwitch: boolean;
  readonly tasks: readonly TaskSnapshot[];
}

export interface ExecutionPlan {
  readonly taskId: string | null;
  readonly operation: RunnerOperation;
  readonly stopCode: RunnerStopCode | null;
  readonly requiredCategories: readonly AuthorizationCategory[];
  readonly fingerprint: string;
}

export type RuntimeFailureCode =
  | "INVALID_CYCLE"
  | "READ_UNAVAILABLE"
  | "ACTIVE_FOREIGN_CYCLE"
  | "IDEMPOTENCY_CONFLICT"
  | "PERSISTENCE_FAILED";

export interface CycleLeaseSnapshot {
  readonly available: boolean;
  readonly ownerId: string | null;
  readonly expiresAt: string | null;
}

export interface PriorCycleRecord {
  readonly cycleKey: string;
  readonly inputFingerprint: string;
  readonly result: RunnerCycleRecord;
}

export interface RunnerCycleRecord {
  readonly cycleKey: string;
  readonly actorId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly taskId: string | null;
  readonly operation: RunnerOperation;
  readonly stopCode: RunnerStopCode | null;
  readonly requiredCategories: readonly AuthorizationCategory[];
  readonly planFingerprint: string;
  readonly inputFingerprint: string;
  readonly outcome: "planned" | "stopped";
}

export interface RunnerCycleFailure {
  readonly cycleKey: string;
  readonly failureCode: RuntimeFailureCode;
  readonly inputFingerprint: string | null;
}

export type RunnerCycleResult = RunnerCycleRecord | RunnerCycleFailure;

export interface RunnerRuntimeReadPort {
  readTasks(limit: number): Promise<readonly TaskSnapshot[]>;
  readCycleLease(cycleKey: string): Promise<CycleLeaseSnapshot>;
  readPriorCycle(cycleKey: string): Promise<PriorCycleRecord | null>;
}

export interface RunnerRuntimeWritePort {
  appendCycle(record: RunnerCycleRecord): Promise<void>;
}

export interface RunnerRuntimeDependencies {
  readonly reads: RunnerRuntimeReadPort;
  readonly writes: RunnerRuntimeWritePort;
  readonly plan: (input: RunnerInput) => ExecutionPlan;
  readonly now: () => string;
}

export interface RunCycleRequest {
  readonly cycleKey: string;
  readonly actorId: string;
  readonly killSwitch: boolean;
  readonly maxTasks?: number;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

function fingerprint(value: unknown): string {
  const input = canonical(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `cycle_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function validIdentifier(value: string): boolean {
  return value.length > 0 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);
}

function parseTime(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function failure(cycleKey: string, failureCode: RuntimeFailureCode, inputFingerprint: string | null): RunnerCycleFailure {
  return Object.freeze({ cycleKey, failureCode, inputFingerprint });
}

function toRecord(
  request: RunCycleRequest,
  startedAt: string,
  completedAt: string,
  inputFingerprint: string,
  plan: ExecutionPlan,
): RunnerCycleRecord {
  return Object.freeze({
    cycleKey: request.cycleKey,
    actorId: request.actorId,
    startedAt,
    completedAt,
    taskId: plan.taskId,
    operation: plan.operation,
    stopCode: plan.stopCode,
    requiredCategories: Object.freeze([...plan.requiredCategories]),
    planFingerprint: plan.fingerprint,
    inputFingerprint,
    outcome: plan.operation === "stop" ? "stopped" : "planned",
  });
}

export function createRunnerRuntime(dependencies: RunnerRuntimeDependencies) {
  return Object.freeze({
    async runCycle(request: RunCycleRequest): Promise<RunnerCycleResult> {
      const maxTasks = request.maxTasks ?? 100;
      if (
        !validIdentifier(request.cycleKey) ||
        !validIdentifier(request.actorId) ||
        !Number.isInteger(maxTasks) ||
        maxTasks < 1 ||
        maxTasks > 100
      ) {
        return failure(request.cycleKey, "INVALID_CYCLE", null);
      }

      const startedAt = dependencies.now();
      const startedAtMs = parseTime(startedAt);
      if (startedAtMs === null) return failure(request.cycleKey, "INVALID_CYCLE", null);

      let lease: CycleLeaseSnapshot;
      let tasks: readonly TaskSnapshot[];
      let prior: PriorCycleRecord | null;
      try {
        [lease, tasks, prior] = await Promise.all([
          dependencies.reads.readCycleLease(request.cycleKey),
          dependencies.reads.readTasks(maxTasks),
          dependencies.reads.readPriorCycle(request.cycleKey),
        ]);
      } catch {
        return failure(request.cycleKey, "READ_UNAVAILABLE", null);
      }

      if (tasks.length > maxTasks) return failure(request.cycleKey, "INVALID_CYCLE", null);

      if (lease.available && lease.ownerId !== request.actorId) {
        const expiresAtMs = lease.expiresAt === null ? null : parseTime(lease.expiresAt);
        if (expiresAtMs === null || expiresAtMs > startedAtMs) {
          return failure(request.cycleKey, "ACTIVE_FOREIGN_CYCLE", null);
        }
      }

      const runnerInput: RunnerInput = Object.freeze({
        actorId: request.actorId,
        now: startedAt,
        killSwitch: request.killSwitch,
        tasks: Object.freeze([...tasks]),
      });
      const inputFingerprint = fingerprint({ cycleKey: request.cycleKey, runnerInput });

      if (prior !== null) {
        if (prior.inputFingerprint === inputFingerprint) return prior.result;
        return failure(request.cycleKey, "IDEMPOTENCY_CONFLICT", inputFingerprint);
      }

      const plan = dependencies.plan(runnerInput);
      const completedAt = dependencies.now();
      if (parseTime(completedAt) === null) return failure(request.cycleKey, "INVALID_CYCLE", inputFingerprint);

      const record = toRecord(request, startedAt, completedAt, inputFingerprint, plan);
      try {
        await dependencies.writes.appendCycle(record);
      } catch {
        return failure(request.cycleKey, "PERSISTENCE_FAILED", inputFingerprint);
      }
      return record;
    },
  });
}

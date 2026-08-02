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

export interface ApprovalSnapshot {
  readonly category: AuthorizationCategory;
  readonly approved: boolean;
  readonly expiresAt?: string | null;
  readonly revoked?: boolean;
}

export interface LeaseSnapshot {
  readonly ownerId: string;
  readonly expiresAt: string;
  readonly version: number;
}

export interface GitEvidenceSnapshot {
  readonly available: boolean;
  readonly ambiguous?: boolean;
  readonly expectedSha: string;
  readonly observedSha: string;
}

export interface IdempotencySnapshot {
  readonly key: string;
  readonly fingerprint: string;
  readonly observedFingerprint?: string | null;
}

export interface TaskSnapshot {
  readonly taskId: string;
  readonly priority: number;
  readonly createdAt: string;
  readonly state:
    | "proposed"
    | "approved"
    | "claimed"
    | "in_progress"
    | "review_requested"
    | "verified"
    | "completed"
    | "blocked"
    | "rejected"
    | "cancelled";
  readonly specificationRevision: number;
  readonly specificationHash: string;
  readonly observedSpecificationRevision: number;
  readonly observedSpecificationHash: string;
  readonly expectedSha: string;
  readonly approvals: readonly ApprovalSnapshot[];
  readonly lease?: LeaseSnapshot | null;
  readonly gitEvidence: GitEvidenceSnapshot;
  readonly requestedOperation?: Exclude<RunnerOperation, "stop"> | null;
  readonly policyDecision: "allowed" | "denied" | "deferred";
  readonly humanRequired?: boolean;
  readonly idempotency?: IdempotencySnapshot | null;
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

function categories(...values: AuthorizationCategory[]): readonly AuthorizationCategory[] {
  return Object.freeze(values);
}

const OPERATION_CATEGORIES: Readonly<Record<Exclude<RunnerOperation, "stop">, readonly AuthorizationCategory[]>> = Object.freeze({
  claim_approved_task: categories("scope"),
  renew_claim: categories("scope"),
  transition_to_in_progress: categories("scope", "editing"),
  request_review: categories("scope", "pull_request_creation"),
  submit_completion_report: categories("scope"),
  verify_task: categories("scope"),
  complete_task: categories("scope", "merging"),
  release_claim: categories("scope"),
});

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function hash(input: string): string {
  let a = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    a ^= input.charCodeAt(i);
    a = Math.imul(a, 16777619);
  }
  return `plan_${(a >>> 0).toString(16).padStart(8, "0")}`;
}

function stop(taskId: string | null, code: RunnerStopCode): ExecutionPlan {
  const plan = { taskId, operation: "stop" as const, stopCode: code, requiredCategories: categories() };
  return Object.freeze({ ...plan, fingerprint: hash(canonical(plan)) });
}

function parseTime(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function approvalUsable(approval: ApprovalSnapshot, nowMs: number): boolean {
  if (!approval.approved || approval.revoked === true) return false;
  if (approval.expiresAt == null) return true;
  const expiresAt = parseTime(approval.expiresAt);
  return expiresAt !== null && expiresAt > nowMs;
}

function defaultOperation(task: TaskSnapshot): Exclude<RunnerOperation, "stop"> | null {
  switch (task.state) {
    case "approved": return "claim_approved_task";
    case "claimed": return "transition_to_in_progress";
    case "in_progress": return "request_review";
    case "review_requested": return "verify_task";
    case "verified": return "complete_task";
    default: return null;
  }
}

function evaluateTask(task: TaskSnapshot, actorId: string, nowMs: number): ExecutionPlan {
  if (!task.taskId || task.taskId.length > 128 || !Number.isInteger(task.priority)) return stop(task.taskId || null, "INVALID_SNAPSHOT");
  if (task.specificationRevision !== task.observedSpecificationRevision || task.specificationHash !== task.observedSpecificationHash) {
    return stop(task.taskId, "STALE_SPECIFICATION");
  }
  if (!task.gitEvidence.available || task.gitEvidence.ambiguous === true) return stop(task.taskId, "GIT_EVIDENCE_UNAVAILABLE");
  if (task.expectedSha !== task.gitEvidence.expectedSha || task.gitEvidence.observedSha !== task.expectedSha) return stop(task.taskId, "STALE_SHA");
  if (task.policyDecision === "denied") return stop(task.taskId, "POLICY_DENIED");
  if (task.policyDecision === "deferred") return stop(task.taskId, "OPERATION_DEFERRED");
  if (task.humanRequired === true) return stop(task.taskId, "HUMAN_REQUIRED");

  if (task.idempotency?.observedFingerprint != null && task.idempotency.observedFingerprint !== task.idempotency.fingerprint) {
    return stop(task.taskId, "IDEMPOTENCY_CONFLICT");
  }

  const lease = task.lease;
  if (lease) {
    const expiresAt = parseTime(lease.expiresAt);
    if (expiresAt === null) return stop(task.taskId, "INVALID_SNAPSHOT");
    if (expiresAt <= nowMs) return stop(task.taskId, "LEASE_EXPIRED_REQUIRES_RECOVERY");
    if (lease.ownerId !== actorId) return stop(task.taskId, "ACTIVE_FOREIGN_LEASE");
  }

  const operation = task.requestedOperation ?? defaultOperation(task);
  if (operation === null) return stop(task.taskId, "NO_ELIGIBLE_TASK");
  const requiredCategories = OPERATION_CATEGORIES[operation];
  const approved = new Set(task.approvals.filter((entry) => approvalUsable(entry, nowMs)).map((entry) => entry.category));
  if (task.approvals.length === 0) return stop(task.taskId, "APPROVAL_MISSING");
  if (requiredCategories.some((category) => !approved.has(category))) return stop(task.taskId, "CATEGORY_MISSING");

  const body = {
    taskId: task.taskId,
    operation,
    stopCode: null,
    requiredCategories: categories(...requiredCategories),
  };
  return Object.freeze({ ...body, fingerprint: hash(canonical(body)) });
}

export function planNextOperation(input: RunnerInput): ExecutionPlan {
  if (input.killSwitch) return stop(null, "KILL_SWITCH_ACTIVE");
  const nowMs = parseTime(input.now);
  if (nowMs === null || !input.actorId || input.tasks.length > 100) return stop(null, "INVALID_SNAPSHOT");

  const ordered = [...input.tasks].sort((left, right) =>
    right.priority - left.priority || left.createdAt.localeCompare(right.createdAt) || left.taskId.localeCompare(right.taskId));

  for (const task of ordered) {
    const plan = evaluateTask(task, input.actorId, nowMs);
    if (plan.operation !== "stop") return plan;
    if (plan.stopCode !== "NO_ELIGIBLE_TASK") return plan;
  }
  return stop(null, "NO_ELIGIBLE_TASK");
}

export const RUNNER_OPERATION_CATEGORIES = OPERATION_CATEGORIES;

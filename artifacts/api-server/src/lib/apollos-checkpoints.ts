export type ApollosCheckpointStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type ApollosCheckpointAction =
  | "run"
  | "skip_completed"
  | "skip_cancelled"
  | "wait_for_lease"
  | "fail_exhausted";

export interface ApollosCheckpointSnapshot {
  readonly status: ApollosCheckpointStatus;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly leaseExpiresAt: string | null;
}

export interface ApollosCheckpointDecision {
  readonly action: ApollosCheckpointAction;
  readonly nextAttemptCount: number;
  readonly reasonCode: string;
  readonly terminal: boolean;
}

export interface ApollosCheckpointDefinition {
  readonly stepKey: string;
  readonly position: number;
  readonly capability: string;
  readonly inputDigest: string;
  readonly maxAttempts: number;
}

const STEP_KEY_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,127}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

export function validateCheckpointDefinitions(
  definitions: readonly ApollosCheckpointDefinition[],
): readonly ApollosCheckpointDefinition[] {
  if (definitions.length < 1 || definitions.length > 100) {
    throw new Error("APOLLOS_CHECKPOINT_COUNT_INVALID");
  }
  const keys = new Set<string>();
  const positions = new Set<number>();
  for (const step of definitions) {
    if (!STEP_KEY_PATTERN.test(step.stepKey)) {
      throw new Error("APOLLOS_CHECKPOINT_KEY_INVALID");
    }
    if (!Number.isInteger(step.position) || step.position < 0) {
      throw new Error("APOLLOS_CHECKPOINT_POSITION_INVALID");
    }
    if (!step.capability.trim()) {
      throw new Error("APOLLOS_CHECKPOINT_CAPABILITY_INVALID");
    }
    if (!DIGEST_PATTERN.test(step.inputDigest)) {
      throw new Error("APOLLOS_CHECKPOINT_DIGEST_INVALID");
    }
    if (
      !Number.isInteger(step.maxAttempts) ||
      step.maxAttempts < 1 ||
      step.maxAttempts > 10
    ) {
      throw new Error("APOLLOS_CHECKPOINT_ATTEMPTS_INVALID");
    }
    if (keys.has(step.stepKey)) {
      throw new Error("APOLLOS_CHECKPOINT_KEY_DUPLICATE");
    }
    if (positions.has(step.position)) {
      throw new Error("APOLLOS_CHECKPOINT_POSITION_DUPLICATE");
    }
    keys.add(step.stepKey);
    positions.add(step.position);
  }
  return Object.freeze(
    [...definitions]
      .sort((a, b) => a.position - b.position)
      .map((step) => Object.freeze({ ...step })),
  );
}

export function decideCheckpointAction(
  snapshot: ApollosCheckpointSnapshot,
  nowIso: string,
): ApollosCheckpointDecision {
  if (
    !Number.isInteger(snapshot.attemptCount) ||
    snapshot.attemptCount < 0 ||
    !Number.isInteger(snapshot.maxAttempts) ||
    snapshot.maxAttempts < 1 ||
    snapshot.maxAttempts > 10
  ) {
    throw new Error("APOLLOS_CHECKPOINT_STATE_INVALID");
  }
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) {
    throw new Error("APOLLOS_CHECKPOINT_NOW_INVALID");
  }

  if (snapshot.status === "completed") {
    return Object.freeze({
      action: "skip_completed",
      nextAttemptCount: snapshot.attemptCount,
      reasonCode: "APOLLOS_CHECKPOINT_ALREADY_COMPLETED",
      terminal: true,
    });
  }
  if (snapshot.status === "cancelled") {
    return Object.freeze({
      action: "skip_cancelled",
      nextAttemptCount: snapshot.attemptCount,
      reasonCode: "APOLLOS_CHECKPOINT_CANCELLED",
      terminal: true,
    });
  }
  if (snapshot.attemptCount >= snapshot.maxAttempts) {
    return Object.freeze({
      action: "fail_exhausted",
      nextAttemptCount: snapshot.attemptCount,
      reasonCode: "APOLLOS_CHECKPOINT_RETRIES_EXHAUSTED",
      terminal: true,
    });
  }

  if (snapshot.status === "running" && snapshot.leaseExpiresAt) {
    const leaseExpiry = Date.parse(snapshot.leaseExpiresAt);
    if (Number.isFinite(leaseExpiry) && leaseExpiry > now) {
      return Object.freeze({
        action: "wait_for_lease",
        nextAttemptCount: snapshot.attemptCount,
        reasonCode: "APOLLOS_CHECKPOINT_LEASE_ACTIVE",
        terminal: false,
      });
    }
  }

  return Object.freeze({
    action: "run",
    nextAttemptCount: snapshot.attemptCount + 1,
    reasonCode:
      snapshot.status === "running"
        ? "APOLLOS_CHECKPOINT_LEASE_RECOVERED"
        : snapshot.status === "failed"
          ? "APOLLOS_CHECKPOINT_RETRY"
          : "APOLLOS_CHECKPOINT_READY",
    terminal: false,
  });
}

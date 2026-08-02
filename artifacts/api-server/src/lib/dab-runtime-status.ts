export type DabRuntimeHealth =
  | "healthy"
  | "stale"
  | "blocked"
  | "disabled"
  | "uninitialized";

export interface DabRuntimeStatusInput {
  readonly enabled: boolean;
  readonly now: string;
  readonly intervalMs: number;
  readonly staleAfterMs: number;
  readonly heartbeatObservedAt?: string | null;
  readonly readinessStatus?: "ready" | "blocked" | null;
}

export interface DabRuntimeStatusDecision {
  readonly status: DabRuntimeHealth;
  readonly ageMs: number | null;
  readonly staleAfterMs: number;
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function classifyDabRuntimeStatus(
  input: DabRuntimeStatusInput,
): DabRuntimeStatusDecision {
  const nowMs = parseTime(input.now);
  const observedAtMs = parseTime(input.heartbeatObservedAt);
  const validBounds =
    nowMs !== null &&
    Number.isInteger(input.intervalMs) &&
    input.intervalMs >= 1_000 &&
    input.intervalMs <= 86_400_000 &&
    Number.isInteger(input.staleAfterMs) &&
    input.staleAfterMs >= input.intervalMs * 2 &&
    input.staleAfterMs <= 86_400_000;

  if (!input.enabled) {
    return Object.freeze({ status: "disabled", ageMs: null, staleAfterMs: input.staleAfterMs });
  }

  if (!validBounds || observedAtMs === null) {
    return Object.freeze({ status: "uninitialized", ageMs: null, staleAfterMs: input.staleAfterMs });
  }

  const ageMs = Math.max(0, nowMs - observedAtMs);
  if (input.readinessStatus === "blocked") {
    return Object.freeze({ status: "blocked", ageMs, staleAfterMs: input.staleAfterMs });
  }
  if (ageMs > input.staleAfterMs) {
    return Object.freeze({ status: "stale", ageMs, staleAfterMs: input.staleAfterMs });
  }
  return Object.freeze({ status: "healthy", ageMs, staleAfterMs: input.staleAfterMs });
}

/**
 * Phase C6 — Canonical Run Lifecycle FSM
 *
 * Defines and enforces the canonical state machine for discovery runs.
 *
 * State transition rules:
 *   planned      → queued, running, cancelled
 *   queued       → running, cancelled, failed
 *   running      → complete, partial, failed, cancel_requested
 *   partial      → complete, failed, queued
 *   cancel_requested → cancelled, partial, complete, failed
 *   complete     → (terminal — no transitions allowed)
 *   failed       → queued (retry path, future)
 *   cancelled    → (terminal — no transitions allowed)
 *
 * Rules enforced by validateTransition():
 *   - Terminal states (complete, cancelled) cannot transition to any active state.
 *   - A completed run cannot be restarted — replay must be rejected at the route level.
 *   - Cancellation cannot corrupt already-persisted canonical records.
 *   - All transition IDs are deterministic (no Math.random()).
 *
 * Actor types for transition history:
 *   system   — automated lifecycle engine
 *   user     — authenticated Clerk user
 *   provider — external provider hook (future)
 *   recovery — recovery/reconciliation process
 *   test     — test environment only; never stored in production
 */

import { createHash } from "node:crypto";

// ── Run state ─────────────────────────────────────────────────────────────────

/**
 * Extended SnapshotStatus for Phase C6.
 *
 * Backward-compatible extension of Phase C3 SnapshotStatus.
 * C3 states ("running", "complete", "partial", "failed") are valid C6 states.
 * New C6 states: "planned", "queued", "cancel_requested", "cancelled".
 *
 * Note: existing DB rows may contain the C3 values. The FSM treats them as
 * equivalent to their C6 counterparts — no migration required.
 */
export type RunState =
  | "planned"           // Run defined, not yet submitted
  | "queued"            // Queued, waiting for execution slot
  | "running"           // Active — pipeline is executing
  | "partial"           // Completed with provider failures (C3 terminal)
  | "complete"          // Fully successful (C3 terminal)
  | "failed"            // Catastrophic failure (C3 terminal unless retried)
  | "cancel_requested"  // Cancellation requested; execution may still be in flight
  | "cancelled";        // Fully cancelled — no provider work will start/continue

// ── Transition record ─────────────────────────────────────────────────────────

export type TransitionActorType =
  | "system"
  | "user"
  | "provider"
  | "recovery"
  | "test";

export type TransitionReasonCode =
  | "initial_queued"
  | "execution_started"
  | "execution_complete"
  | "provider_partial_failure"
  | "execution_failed"
  | "cancellation_requested"
  | "cancellation_honored"
  | "cancellation_before_execution"
  | "cancellation_during_execution"
  | "cancellation_during_persistence"
  | "cancellation_during_finalization"
  | "recovery_stale_lease"
  | "recovery_partial"
  | "recovery_failed"
  | "recovery_cancelled"
  | "retry_queued"
  | "test_transition";

/** Append-only canonical record of a single state change for a discovery run. */
export interface RunTransitionRecord {
  /** Deterministic: "trans::{runId}::{seq}" */
  id:             string;
  runId:          string;
  clientId:       string;
  /** Monotonically increasing per run. First transition is seq 1. */
  seq:            number;
  fromState:      RunState;
  toState:        RunState;
  reasonCode:     TransitionReasonCode;
  /** Human-readable, safe for logs. Must not contain credentials. */
  message:        string;
  actorType:      TransitionActorType;
  /** Clerk userId, provider name, or "system" — never a credential. */
  actorId:        string | null;
  correlationId:  string | null;
  /** Safe structured metadata — sanitized before persistence. */
  metadata:       Record<string, unknown>;
  createdAt:      Date;
}

// ── Allowed transition table ───────────────────────────────────────────────────

/**
 * Canonical allowed-transitions map.
 * Key = fromState, Value = set of allowed toStates.
 *
 * This is the single source of truth for lifecycle policy.
 * All route handlers, recovery processes, and tests MUST use validateTransition().
 */
const ALLOWED_TRANSITIONS: ReadonlyMap<RunState, ReadonlySet<RunState>> = new Map([
  ["planned",          new Set<RunState>(["queued", "running", "cancelled"])],
  ["queued",           new Set<RunState>(["running", "cancelled", "failed"])],
  ["running",          new Set<RunState>(["complete", "partial", "failed", "cancel_requested"])],
  ["partial",          new Set<RunState>(["complete", "failed", "queued"])],
  ["cancel_requested", new Set<RunState>(["cancelled", "partial", "complete", "failed"])],
  ["complete",         new Set<RunState>([])],     // terminal
  ["failed",           new Set<RunState>(["queued"])], // retry path
  ["cancelled",        new Set<RunState>([])],     // terminal
]);

// ── FSM helpers ───────────────────────────────────────────────────────────────

/**
 * Returns true if `toState` is a valid transition from `fromState`.
 * This is the canonical lifecycle gate — call before every state change.
 */
export function validateTransition(fromState: RunState, toState: RunState): boolean {
  return ALLOWED_TRANSITIONS.get(fromState)?.has(toState) ?? false;
}

/**
 * Returns the full set of states reachable from `fromState`.
 * Used for policy documentation and test generation.
 */
export function allowedNextStates(fromState: RunState): ReadonlySet<RunState> {
  return ALLOWED_TRANSITIONS.get(fromState) ?? new Set<RunState>();
}

/**
 * Returns true if the state is terminal — no further transitions are valid.
 */
export function isTerminalState(state: RunState): boolean {
  const allowed = ALLOWED_TRANSITIONS.get(state);
  return allowed !== undefined && allowed.size === 0;
}

/**
 * Returns true if the state represents an active (non-terminal) run.
 * Used for concurrency control: active runs count toward per-client limits.
 */
export function isActiveState(state: RunState): boolean {
  return state === "running" || state === "queued" || state === "cancel_requested";
}

/**
 * Returns true if the run is in a cancellable state.
 * Terminal runs and already-cancel_requested runs reject cancellation.
 */
export function isCancellable(state: RunState): boolean {
  return state === "running" || state === "queued" || state === "planned";
}

/**
 * Maps a legacy C3 SnapshotStatus string to the canonical C6 RunState.
 * Used for backward compatibility when reading pre-C6 DB rows.
 */
export function normalizeRunState(raw: string): RunState {
  // "complete" was the C3 terminal state; C6 keeps it as-is.
  // All other C3 values ("running", "partial", "failed") are identical.
  const valid: RunState[] = [
    "planned", "queued", "running", "partial", "complete",
    "failed", "cancel_requested", "cancelled",
  ];
  if ((valid as string[]).includes(raw)) return raw as RunState;
  // Unknown legacy value → treat as failed (safe default for recovery)
  return "failed";
}

// ── Transition ID derivation ───────────────────────────────────────────────────

/**
 * Derives a deterministic transition record ID.
 *
 *   "trans::{runId}::{seq}"
 *
 * seq is monotonically increasing per run (starting at 1).
 * Deterministic so duplicate-request safeguards can apply ON CONFLICT DO NOTHING.
 */
export function deriveTransitionId(runId: string, seq: number): string {
  return `trans::${runId}::${seq}`;
}

/**
 * Creates a canonical RunTransitionRecord with all required fields.
 * Does NOT persist — that is the repository's responsibility.
 *
 * @param metadata - Must be pre-sanitized (no credentials, no stack traces).
 */
export function buildTransitionRecord(params: {
  runId:         string;
  clientId:      string;
  seq:           number;
  fromState:     RunState;
  toState:       RunState;
  reasonCode:    TransitionReasonCode;
  message:       string;
  actorType:     TransitionActorType;
  actorId?:      string | null;
  correlationId?: string | null;
  metadata?:     Record<string, unknown>;
}): RunTransitionRecord {
  return {
    id:            deriveTransitionId(params.runId, params.seq),
    runId:         params.runId,
    clientId:      params.clientId,
    seq:           params.seq,
    fromState:     params.fromState,
    toState:       params.toState,
    reasonCode:    params.reasonCode,
    message:       params.message,
    actorType:     params.actorType,
    actorId:       params.actorId ?? null,
    correlationId: params.correlationId ?? null,
    metadata:      params.metadata ?? {},
    createdAt:     new Date(),
  };
}

// ── Transition validation error ───────────────────────────────────────────────

export class InvalidTransitionError extends Error {
  constructor(
    public readonly fromState: RunState,
    public readonly toState:   RunState,
  ) {
    super(
      `[lifecycle] Invalid transition: ${fromState} → ${toState}. ` +
      `Allowed from ${fromState}: [${[...allowedNextStates(fromState)].join(", ") || "none"}]`,
    );
    this.name = "InvalidTransitionError";
  }
}

/**
 * Asserts a transition is valid or throws InvalidTransitionError.
 * Use in repository methods before persisting a transition.
 */
export function assertTransition(fromState: RunState, toState: RunState): void {
  if (!validateTransition(fromState, toState)) {
    throw new InvalidTransitionError(fromState, toState);
  }
}

// ── Transition fingerprint ─────────────────────────────────────────────────────

/**
 * Derives a stable fingerprint for a (runId, fromState, toState, actorId) combination.
 * Used to deduplicate concurrent transition requests (not a secret — safe to log).
 */
export function deriveTransitionFingerprint(
  runId:     string,
  fromState: RunState,
  toState:   RunState,
  actorId:   string | null,
): string {
  const input = `${runId}::${fromState}::${toState}::${actorId ?? "system"}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

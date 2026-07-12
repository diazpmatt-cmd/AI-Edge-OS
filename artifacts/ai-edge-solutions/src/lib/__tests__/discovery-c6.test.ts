/**
 * Phase C6 — Lifecycle Governance, Run Observability, and Operational Readiness
 *
 * Test categories (A–Z + focused):
 *
 * FSM / Lifecycle:
 *   A.  validateTransition — allowed transitions return true
 *   B.  validateTransition — disallowed transitions return false
 *   C.  Terminal states — complete and cancelled have no outbound transitions
 *   D.  isTerminalState — returns true only for complete, cancelled
 *   E.  isActiveState — running, queued, cancel_requested are active
 *   F.  isCancellable — planned, queued, running are cancellable
 *   G.  normalizeRunState — maps legacy C3 values and handles unknown
 *   H.  deriveTransitionId — deterministic format
 *   I.  buildTransitionRecord — all fields present and correct
 *   J.  assertTransition — throws InvalidTransitionError on invalid
 *   K.  deriveTransitionFingerprint — same inputs → same fingerprint
 *   L.  allowedNextStates — returns correct sets per state
 *
 * Lease:
 *   M.  isLeaseExpired — returns true after expiresAt
 *   N.  isLeaseRecoverable — requires grace period beyond expiry
 *   O.  isLeaseOwner — true iff ownerId matches
 *   P.  deriveLeasExpiry — clamps to LEASE_MAX_DURATION_MS
 *   Q.  deriveLeaseOwnerId — canonical format
 *
 * Idempotency:
 *   R.  deriveIdempotencyId — tenant-scoped, dry/live-isolated
 *   S.  deriveRequestFingerprint — correlationId excluded, mode/cost/dryRun included
 *   T.  validateIdempotencyKey — rejects empty, long, non-ASCII
 *   U.  isIdempotencyExpired — returns true after expiresAt
 *   V.  fingerprintMatches — strict equality
 *   W.  deriveIdempotencyExpiry — adds TTL to now
 *
 * Progress:
 *   X.  calculateProgress — percentComplete = floor(resolved/total * 100)
 *   Y.  calculateProgress — empty state → 0%
 *   Z.  stageIndex — PIPELINE_STAGES ordering
 *
 * Focused:
 *   [diagnostics] sanitizeMetadata — redacts credential keys
 *   [diagnostics] sanitizeMetadata — redacts credential values (Basic Auth)
 *   [diagnostics] sanitizeMetadata — removes stack traces
 *   [diagnostics] sanitizeMetadata — preserves safe fields
 *   [diagnostics] sanitizeMetadata — depth-limited (no infinite recursion)
 *   [diagnostics] redactSecrets — redacts Basic Auth in strings
 *   [diagnostics] redactSecrets — redacts Bearer tokens
 *   [diagnostics] redactSecrets — redacts postgres URLs
 *   [diagnostics] deriveDiagnosticId — deterministic format
 *   [diagnostics] createDiagnosticEvent — sanitizes metadata automatically
 *   [governance] evaluateGovernance — allows when below limit
 *   [governance] evaluateGovernance — denies when at limit
 *   [governance] evaluateGovernance — denies when paused
 *   [governance] internalOverride — bypasses pause and run limit
 *   [governance] evaluateProviderOpLimit — denies at maxProviderOpsPerRun
 *   [governance] evaluateMergeConcurrency — denies when not allowed
 *   [cancellation] CancellationSignal — initial state is not cancelled
 *   [cancellation] CancellationSignal — first request wins
 *   [cancellation] CancellationSignal — records observation point once
 *   [cancellation] NullCancellationToken — always not cancelled
 *   [cancellation] shouldCancel — returns false when not cancelled
 *   [cancellation] shouldCancel — returns true and records observation
 *   [audit] deriveAuditId — deterministic format with correlation fragment
 *   [audit] createAuditEvent — sanitizes metadata automatically
 *   [audit] createAuditEvent — null correlationId safe
 *   [audit] auditId stability — same inputs → same id
 *   [rate limiter] allows initial requests within limit
 *   [rate limiter] blocks after limit reached
 *   [rate limiter] sliding window: old requests expire
 *   [rate limiter] reset clears bucket
 *   [rate limiter] peek does not consume slot
 *   [rate limiter] different operations have isolated buckets
 *   [rate limiter] different userId+clientId keys are isolated
 *   [rate limiter] live_run has stricter limit than dry_run
 *   [regression] C3 SnapshotStatus values remain unchanged
 *   [regression] C6 RunState is superset of C3 SnapshotStatus
 *   [regression] RunState values include all C6 states
 *   [regression] PIPELINE_STAGES has 11 stages
 *   [regression] TOTAL_PIPELINE_STAGES === PIPELINE_STAGES.length
 *
 * No live HTTP calls. No Math.random(). No hard-coded credentials.
 * No BB&B-specific values in canonical discovery files.
 */

import { describe, it, expect, beforeEach } from "vitest";

// ── Relative imports (same pattern as C5 tests) ────────────────────────────────

import {
  validateTransition,
  allowedNextStates,
  isTerminalState,
  isActiveState,
  isCancellable,
  normalizeRunState,
  deriveTransitionId,
  buildTransitionRecord,
  assertTransition,
  deriveTransitionFingerprint,
  InvalidTransitionError,
  type RunState,
  type TransitionReasonCode,
} from "../../../../../lib/db/src/discovery-lifecycle";

import {
  isLeaseExpired,
  isLeaseRecoverable,
  isLeaseOwner,
  deriveLeasExpiry,
  deriveLeaseOwnerId,
  LEASE_DURATION_MS,
  LEASE_MAX_DURATION_MS,
  LEASE_RECOVERY_GRACE_MS,
  type LeaseRecord,
} from "../../../../../lib/db/src/discovery-lease";

import {
  deriveIdempotencyId,
  deriveRequestFingerprint,
  validateIdempotencyKey,
  isIdempotencyExpired,
  fingerprintMatches,
  deriveIdempotencyExpiry,
  IDEMPOTENCY_TTL_MS,
  type IdempotencyRecord,
} from "../../../../../lib/db/src/discovery-idempotency";

import {
  calculateProgress,
  stageIndex,
  stageIsBefore,
  buildInitialProgress,
  isValidProgressSnapshot,
  PIPELINE_STAGES,
  TOTAL_PIPELINE_STAGES,
} from "../../../../../lib/db/src/discovery-progress";

import {
  sanitizeMetadata,
  redactSecrets,
  deriveDiagnosticId,
  createDiagnosticEvent,
} from "../../../../../lib/db/src/discovery-diagnostics";

import {
  DEFAULT_GOVERNANCE_POLICY,
  evaluateGovernance,
  evaluateProviderOpLimit,
  evaluateMergeConcurrency,
  type GovernancePolicy,
} from "../../../../../lib/db/src/discovery-governance";

import {
  CancellationSignal,
  NullCancellationToken,
  shouldCancel,
} from "../../../../../lib/db/src/discovery-cancellation";

import {
  deriveAuditId,
  createAuditEvent,
  type AuditAction,
} from "../../../../../lib/db/src/discovery-audit";

import {
  DiscoveryRateLimiter,
  DEFAULT_RATE_LIMIT_POLICIES,
} from "../../../../../lib/db/src/discovery-rate-limiter";

// ─────────────────────────────────────────────────────────────────────────────
// A. validateTransition — allowed transitions return true
// ─────────────────────────────────────────────────────────────────────────────

describe("A. validateTransition — allowed transitions", () => {
  const allowed: Array<[RunState, RunState]> = [
    ["planned",          "queued"],
    ["planned",          "running"],
    ["planned",          "cancelled"],
    ["queued",           "running"],
    ["queued",           "cancelled"],
    ["queued",           "failed"],
    ["running",          "complete"],
    ["running",          "partial"],
    ["running",          "failed"],
    ["running",          "cancel_requested"],
    ["partial",          "complete"],
    ["partial",          "failed"],
    ["partial",          "queued"],
    ["cancel_requested", "cancelled"],
    ["cancel_requested", "partial"],
    ["cancel_requested", "complete"],
    ["cancel_requested", "failed"],
    ["failed",           "queued"],
  ];

  for (const [from, to] of allowed) {
    it(`${from} → ${to} is allowed`, () => {
      expect(validateTransition(from, to)).toBe(true);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// B. validateTransition — disallowed transitions return false
// ─────────────────────────────────────────────────────────────────────────────

describe("B. validateTransition — disallowed transitions", () => {
  const disallowed: Array<[RunState, RunState]> = [
    ["complete",   "running"],
    ["complete",   "queued"],
    ["complete",   "failed"],
    ["complete",   "cancel_requested"],
    ["complete",   "cancelled"],
    ["cancelled",  "running"],
    ["cancelled",  "queued"],
    ["cancelled",  "complete"],
    ["running",    "queued"],
    ["running",    "planned"],
    ["failed",     "complete"],
    ["failed",     "partial"],
    ["planned",    "complete"],
    ["planned",    "partial"],
  ];

  for (const [from, to] of disallowed) {
    it(`${from} → ${to} is disallowed`, () => {
      expect(validateTransition(from, to)).toBe(false);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// C. Terminal states have no outbound transitions
// ─────────────────────────────────────────────────────────────────────────────

describe("C. Terminal states — no outbound transitions", () => {
  const terminals: RunState[] = ["complete", "cancelled"];
  const allStates: RunState[] = [
    "planned", "queued", "running", "partial", "complete", "failed", "cancel_requested", "cancelled",
  ];

  for (const terminal of terminals) {
    it(`${terminal} → any other state is disallowed`, () => {
      for (const to of allStates) {
        expect(validateTransition(terminal, to)).toBe(false);
      }
    });

    it(`allowedNextStates(${terminal}) is empty`, () => {
      expect(allowedNextStates(terminal).size).toBe(0);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// D. isTerminalState
// ─────────────────────────────────────────────────────────────────────────────

describe("D. isTerminalState", () => {
  it("complete is terminal", ()   => expect(isTerminalState("complete")).toBe(true));
  it("cancelled is terminal", ()  => expect(isTerminalState("cancelled")).toBe(true));
  it("running is not terminal", () => expect(isTerminalState("running")).toBe(false));
  it("failed is not terminal", () => expect(isTerminalState("failed")).toBe(false));
  it("partial is not terminal", () => expect(isTerminalState("partial")).toBe(false));
  it("queued is not terminal", () => expect(isTerminalState("queued")).toBe(false));
  it("planned is not terminal", () => expect(isTerminalState("planned")).toBe(false));
  it("cancel_requested is not terminal", () => expect(isTerminalState("cancel_requested")).toBe(false));
});

// ─────────────────────────────────────────────────────────────────────────────
// E. isActiveState
// ─────────────────────────────────────────────────────────────────────────────

describe("E. isActiveState", () => {
  it("running is active",          () => expect(isActiveState("running")).toBe(true));
  it("queued is active",           () => expect(isActiveState("queued")).toBe(true));
  it("cancel_requested is active", () => expect(isActiveState("cancel_requested")).toBe(true));
  it("complete is not active",     () => expect(isActiveState("complete")).toBe(false));
  it("failed is not active",       () => expect(isActiveState("failed")).toBe(false));
  it("cancelled is not active",    () => expect(isActiveState("cancelled")).toBe(false));
  it("planned is not active",      () => expect(isActiveState("planned")).toBe(false));
  it("partial is not active",      () => expect(isActiveState("partial")).toBe(false));
});

// ─────────────────────────────────────────────────────────────────────────────
// F. isCancellable
// ─────────────────────────────────────────────────────────────────────────────

describe("F. isCancellable", () => {
  it("planned is cancellable",           () => expect(isCancellable("planned")).toBe(true));
  it("queued is cancellable",            () => expect(isCancellable("queued")).toBe(true));
  it("running is cancellable",           () => expect(isCancellable("running")).toBe(true));
  it("complete is not cancellable",      () => expect(isCancellable("complete")).toBe(false));
  it("cancelled is not cancellable",     () => expect(isCancellable("cancelled")).toBe(false));
  it("failed is not cancellable",        () => expect(isCancellable("failed")).toBe(false));
  it("partial is not cancellable",       () => expect(isCancellable("partial")).toBe(false));
  it("cancel_requested is not cancellable", () => expect(isCancellable("cancel_requested")).toBe(false));
});

// ─────────────────────────────────────────────────────────────────────────────
// G. normalizeRunState
// ─────────────────────────────────────────────────────────────────────────────

describe("G. normalizeRunState — maps legacy C3 values", () => {
  it("maps 'complete'",         () => expect(normalizeRunState("complete")).toBe("complete"));
  it("maps 'running'",          () => expect(normalizeRunState("running")).toBe("running"));
  it("maps 'partial'",          () => expect(normalizeRunState("partial")).toBe("partial"));
  it("maps 'failed'",           () => expect(normalizeRunState("failed")).toBe("failed"));
  it("maps 'cancelled'",        () => expect(normalizeRunState("cancelled")).toBe("cancelled"));
  it("maps 'queued'",           () => expect(normalizeRunState("queued")).toBe("queued"));
  it("maps 'planned'",          () => expect(normalizeRunState("planned")).toBe("planned"));
  it("maps 'cancel_requested'", () => expect(normalizeRunState("cancel_requested")).toBe("cancel_requested"));
  it("unknown → 'failed'",      () => expect(normalizeRunState("legacy_junk")).toBe("failed"));
  it("empty → 'failed'",        () => expect(normalizeRunState("")).toBe("failed"));
});

// ─────────────────────────────────────────────────────────────────────────────
// H. deriveTransitionId
// ─────────────────────────────────────────────────────────────────────────────

describe("H. deriveTransitionId — deterministic format", () => {
  it("format is trans::{runId}::{seq}", () => {
    expect(deriveTransitionId("run::client::2024-W01", 1)).toBe("trans::run::client::2024-W01::1");
  });

  it("seq 1 and seq 2 produce different IDs", () => {
    const id1 = deriveTransitionId("run::x::w01", 1);
    const id2 = deriveTransitionId("run::x::w01", 2);
    expect(id1).not.toBe(id2);
  });

  it("different runIds produce different IDs", () => {
    const id1 = deriveTransitionId("run::a::w01", 1);
    const id2 = deriveTransitionId("run::b::w01", 1);
    expect(id1).not.toBe(id2);
  });

  it("same inputs always produce same ID", () => {
    expect(deriveTransitionId("run::x::w01", 5)).toBe(deriveTransitionId("run::x::w01", 5));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I. buildTransitionRecord — all fields present
// ─────────────────────────────────────────────────────────────────────────────

describe("I. buildTransitionRecord — fields", () => {
  it("produces a complete RunTransitionRecord", () => {
    const record = buildTransitionRecord({
      runId:       "run::c1::2024-W01",
      clientId:    "c1",
      seq:         3,
      fromState:   "running",
      toState:     "complete",
      reasonCode:  "execution_complete",
      message:     "Run completed in 1200ms.",
      actorType:   "system",
      actorId:     "discovery-pipeline",
      correlationId: "corr-123",
      metadata:    { elapsedMs: 1200 },
    });

    expect(record.id).toBe("trans::run::c1::2024-W01::3");
    expect(record.runId).toBe("run::c1::2024-W01");
    expect(record.clientId).toBe("c1");
    expect(record.seq).toBe(3);
    expect(record.fromState).toBe("running");
    expect(record.toState).toBe("complete");
    expect(record.reasonCode).toBe("execution_complete");
    expect(record.actorType).toBe("system");
    expect(record.actorId).toBe("discovery-pipeline");
    expect(record.correlationId).toBe("corr-123");
    expect(record.metadata).toEqual({ elapsedMs: 1200 });
    expect(record.createdAt).toBeInstanceOf(Date);
  });

  it("actorId defaults to null", () => {
    const record = buildTransitionRecord({
      runId: "run::c::w", clientId: "c", seq: 1,
      fromState: "queued", toState: "running",
      reasonCode: "execution_started", message: "Running.",
      actorType: "system",
    });
    expect(record.actorId).toBeNull();
    expect(record.correlationId).toBeNull();
    expect(record.metadata).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// J. assertTransition — throws on invalid
// ─────────────────────────────────────────────────────────────────────────────

describe("J. assertTransition — throws InvalidTransitionError", () => {
  it("throws on complete → running", () => {
    expect(() => assertTransition("complete", "running")).toThrow(InvalidTransitionError);
  });

  it("throws on cancelled → queued", () => {
    expect(() => assertTransition("cancelled", "queued")).toThrow(InvalidTransitionError);
  });

  it("does not throw on valid transition", () => {
    expect(() => assertTransition("running", "complete")).not.toThrow();
  });

  it("error message includes both states", () => {
    let err: Error | undefined;
    try { assertTransition("complete", "running"); } catch (e) { err = e as Error; }
    expect(err?.message).toContain("complete");
    expect(err?.message).toContain("running");
  });

  it("error name is InvalidTransitionError", () => {
    let err: Error | undefined;
    try { assertTransition("cancelled", "running"); } catch (e) { err = e as Error; }
    expect(err?.name).toBe("InvalidTransitionError");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// K. deriveTransitionFingerprint — same inputs → same result
// ─────────────────────────────────────────────────────────────────────────────

describe("K. deriveTransitionFingerprint", () => {
  it("same inputs produce same fingerprint", () => {
    const fp1 = deriveTransitionFingerprint("run::x", "running", "complete", "user-1");
    const fp2 = deriveTransitionFingerprint("run::x", "running", "complete", "user-1");
    expect(fp1).toBe(fp2);
  });

  it("different toState produces different fingerprint", () => {
    const fp1 = deriveTransitionFingerprint("run::x", "running", "complete", null);
    const fp2 = deriveTransitionFingerprint("run::x", "running", "failed",   null);
    expect(fp1).not.toBe(fp2);
  });

  it("different actorId produces different fingerprint", () => {
    const fp1 = deriveTransitionFingerprint("run::x", "running", "complete", "user-1");
    const fp2 = deriveTransitionFingerprint("run::x", "running", "complete", "user-2");
    expect(fp1).not.toBe(fp2);
  });

  it("null actorId is treated as 'system'", () => {
    const fp1 = deriveTransitionFingerprint("run::x", "running", "complete", null);
    expect(typeof fp1).toBe("string");
    expect(fp1.length).toBe(16);
  });

  it("fingerprint is 16 hex chars", () => {
    const fp = deriveTransitionFingerprint("run::x", "queued", "running", "system");
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L. allowedNextStates
// ─────────────────────────────────────────────────────────────────────────────

describe("L. allowedNextStates", () => {
  it("running has 4 allowed next states", () => {
    const states = allowedNextStates("running");
    expect(states.size).toBe(4);
    expect(states.has("complete")).toBe(true);
    expect(states.has("partial")).toBe(true);
    expect(states.has("failed")).toBe(true);
    expect(states.has("cancel_requested")).toBe(true);
  });

  it("complete has 0 allowed next states", () => {
    expect(allowedNextStates("complete").size).toBe(0);
  });

  it("failed has 1 allowed next state (queued)", () => {
    const states = allowedNextStates("failed");
    expect(states.size).toBe(1);
    expect(states.has("queued")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M. isLeaseExpired
// ─────────────────────────────────────────────────────────────────────────────

describe("M. isLeaseExpired", () => {
  const makeLease = (offsetMs: number): LeaseRecord => {
    const now = new Date();
    return {
      runId:      "run::c::w",
      clientId:   "c",
      ownerId:    "owner::corr-1",
      acquiredAt: now,
      expiresAt:  new Date(now.getTime() + offsetMs),
      renewedAt:  null,
      releasedAt: null,
    };
  };

  it("returns false when lease has not expired", () => {
    expect(isLeaseExpired(makeLease(LEASE_DURATION_MS))).toBe(false);
  });

  it("returns true when lease is past expiry", () => {
    const past = makeLease(-1000);
    expect(isLeaseExpired(past)).toBe(true);
  });

  it("returns true at exact expiry time", () => {
    const now = new Date();
    const lease = makeLease(0);
    // expires_at = now, so now >= now → expired
    expect(isLeaseExpired(lease, now)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// N. isLeaseRecoverable
// ─────────────────────────────────────────────────────────────────────────────

describe("N. isLeaseRecoverable", () => {
  const makeLease = (expiryOffsetMs: number): LeaseRecord => {
    const now = new Date();
    return {
      runId: "run::c::w", clientId: "c", ownerId: "owner::corr-1",
      acquiredAt: now,
      expiresAt:  new Date(now.getTime() + expiryOffsetMs),
      renewedAt:  null, releasedAt: null,
    };
  };

  it("not recoverable if still within grace period", () => {
    // expires_at was 10s ago — still within LEASE_RECOVERY_GRACE_MS
    const lease = makeLease(-10_000);
    expect(isLeaseRecoverable(lease)).toBe(false);
  });

  it("recoverable if past grace period", () => {
    // expires_at was well past grace period ago
    const lease = makeLease(-(LEASE_RECOVERY_GRACE_MS + 5_000));
    expect(isLeaseRecoverable(lease)).toBe(true);
  });

  it("not recoverable if lease is still valid", () => {
    const lease = makeLease(LEASE_DURATION_MS);
    expect(isLeaseRecoverable(lease)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O. isLeaseOwner
// ─────────────────────────────────────────────────────────────────────────────

describe("O. isLeaseOwner", () => {
  const lease: LeaseRecord = {
    runId: "r", clientId: "c", ownerId: "owner::corr-abc",
    acquiredAt: new Date(), expiresAt: new Date(), renewedAt: null, releasedAt: null,
  };

  it("returns true for the owner", () => {
    expect(isLeaseOwner(lease, "owner::corr-abc")).toBe(true);
  });

  it("returns false for a different caller", () => {
    expect(isLeaseOwner(lease, "owner::corr-xyz")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isLeaseOwner(lease, "")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P. deriveLeasExpiry — clamps to max
// ─────────────────────────────────────────────────────────────────────────────

describe("P. deriveLeasExpiry", () => {
  it("default duration = LEASE_DURATION_MS", () => {
    const now    = new Date(0);
    const expiry = deriveLeasExpiry(now);
    expect(expiry.getTime()).toBe(LEASE_DURATION_MS);
  });

  it("clamps to LEASE_MAX_DURATION_MS when too large", () => {
    const now    = new Date(0);
    const expiry = deriveLeasExpiry(now, LEASE_MAX_DURATION_MS + 1_000_000);
    expect(expiry.getTime()).toBe(LEASE_MAX_DURATION_MS);
  });

  it("uses custom duration within limit", () => {
    const now    = new Date(0);
    const custom = 2 * 60 * 1000; // 2 min
    const expiry = deriveLeasExpiry(now, custom);
    expect(expiry.getTime()).toBe(custom);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Q. deriveLeaseOwnerId
// ─────────────────────────────────────────────────────────────────────────────

describe("Q. deriveLeaseOwnerId", () => {
  it("produces owner:: prefix", () => {
    expect(deriveLeaseOwnerId("corr-123")).toBe("owner::corr-123");
  });

  it("same correlationId → same ownerId", () => {
    expect(deriveLeaseOwnerId("abc")).toBe(deriveLeaseOwnerId("abc"));
  });

  it("different correlationId → different ownerId", () => {
    expect(deriveLeaseOwnerId("abc")).not.toBe(deriveLeaseOwnerId("xyz"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R. deriveIdempotencyId — tenant-scoped, dry/live-isolated
// ─────────────────────────────────────────────────────────────────────────────

describe("R. deriveIdempotencyId", () => {
  it("includes clientId in the ID", () => {
    const id = deriveIdempotencyId("client-a", "key-1", "manual_run", false);
    expect(id).toContain("client-a");
  });

  it("dry and live are isolated", () => {
    const dry  = deriveIdempotencyId("c", "key-1", "manual_run", true);
    const live = deriveIdempotencyId("c", "key-1", "manual_run", false);
    expect(dry).not.toBe(live);
    expect(dry).toContain("dry");
    expect(live).toContain("live");
  });

  it("different clients produce different IDs", () => {
    const a = deriveIdempotencyId("client-a", "key-1", "manual_run", false);
    const b = deriveIdempotencyId("client-b", "key-1", "manual_run", false);
    expect(a).not.toBe(b);
  });

  it("different keys produce different IDs", () => {
    const a = deriveIdempotencyId("c", "key-1", "manual_run", false);
    const b = deriveIdempotencyId("c", "key-2", "manual_run", false);
    expect(a).not.toBe(b);
  });

  it("same inputs → same ID (deterministic)", () => {
    const a = deriveIdempotencyId("c", "key-1", "dry_run", true);
    const b = deriveIdempotencyId("c", "key-1", "dry_run", true);
    expect(a).toBe(b);
  });

  it("format is idem::{clientId}::{operation}::{scope}::{key}", () => {
    const id = deriveIdempotencyId("c", "mykey", "manual_run", false);
    expect(id).toBe("idem::c::manual_run::live::mykey");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S. deriveRequestFingerprint — excludes correlationId
// ─────────────────────────────────────────────────────────────────────────────

describe("S. deriveRequestFingerprint", () => {
  it("same params → same fingerprint", () => {
    const fp1 = deriveRequestFingerprint({ mode: "primary_only", costCeilingUSD: 5, isDryRun: false });
    const fp2 = deriveRequestFingerprint({ mode: "primary_only", costCeilingUSD: 5, isDryRun: false });
    expect(fp1).toBe(fp2);
  });

  it("different mode → different fingerprint", () => {
    const fp1 = deriveRequestFingerprint({ mode: "primary_only", costCeilingUSD: 5, isDryRun: false });
    const fp2 = deriveRequestFingerprint({ mode: "merge",        costCeilingUSD: 5, isDryRun: false });
    expect(fp1).not.toBe(fp2);
  });

  it("different costCeilingUSD → different fingerprint", () => {
    const fp1 = deriveRequestFingerprint({ mode: "primary_only", costCeilingUSD: 5, isDryRun: false });
    const fp2 = deriveRequestFingerprint({ mode: "primary_only", costCeilingUSD: 10, isDryRun: false });
    expect(fp1).not.toBe(fp2);
  });

  it("isDryRun affects fingerprint", () => {
    const fp1 = deriveRequestFingerprint({ mode: "primary_only", costCeilingUSD: 5, isDryRun: true });
    const fp2 = deriveRequestFingerprint({ mode: "primary_only", costCeilingUSD: 5, isDryRun: false });
    expect(fp1).not.toBe(fp2);
  });

  it("returns 32 hex chars", () => {
    const fp = deriveRequestFingerprint({ mode: "primary_only", costCeilingUSD: 5, isDryRun: false });
    expect(fp).toMatch(/^[0-9a-f]{32}$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T. validateIdempotencyKey
// ─────────────────────────────────────────────────────────────────────────────

describe("T. validateIdempotencyKey", () => {
  it("accepts a valid UUID", () => {
    expect(validateIdempotencyKey("550e8400-e29b-41d4-a716-446655440000")).toBeNull();
  });

  it("rejects empty string", () => {
    expect(validateIdempotencyKey("")).not.toBeNull();
  });

  it("rejects key exceeding 128 chars", () => {
    const long = "a".repeat(129);
    expect(validateIdempotencyKey(long)).not.toBeNull();
  });

  it("accepts exactly 128 chars", () => {
    expect(validateIdempotencyKey("a".repeat(128))).toBeNull();
  });

  it("rejects non-string input", () => {
    expect(validateIdempotencyKey(123)).not.toBeNull();
    expect(validateIdempotencyKey(null)).not.toBeNull();
    expect(validateIdempotencyKey(undefined)).not.toBeNull();
  });

  it("rejects control characters", () => {
    expect(validateIdempotencyKey("abc\x00def")).not.toBeNull();
    expect(validateIdempotencyKey("abc\ndef")).not.toBeNull();
  });

  it("accepts printable ASCII with hyphens, underscores", () => {
    expect(validateIdempotencyKey("my-key_123.abc")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// U. isIdempotencyExpired
// ─────────────────────────────────────────────────────────────────────────────

describe("U. isIdempotencyExpired", () => {
  const makeRecord = (expiryOffsetMs: number): IdempotencyRecord => ({
    id:                 "idem::c::manual_run::live::key",
    clientId:           "c",
    idempotencyKey:     "key",
    operation:          "manual_run",
    requestFingerprint: "fp",
    runId:              null,
    isDryRun:           false,
    responseStatus:     null,
    responseBody:       null,
    createdAt:          new Date(),
    expiresAt:          new Date(Date.now() + expiryOffsetMs),
  });

  it("not expired when expiresAt is in the future", () => {
    expect(isIdempotencyExpired(makeRecord(IDEMPOTENCY_TTL_MS))).toBe(false);
  });

  it("expired when expiresAt is in the past", () => {
    expect(isIdempotencyExpired(makeRecord(-1000))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// V. fingerprintMatches
// ─────────────────────────────────────────────────────────────────────────────

describe("V. fingerprintMatches", () => {
  it("returns true for equal fingerprints", () => {
    expect(fingerprintMatches("abc123", "abc123")).toBe(true);
  });

  it("returns false for different fingerprints", () => {
    expect(fingerprintMatches("abc123", "xyz456")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// W. deriveIdempotencyExpiry
// ─────────────────────────────────────────────────────────────────────────────

describe("W. deriveIdempotencyExpiry", () => {
  it("default TTL is IDEMPOTENCY_TTL_MS (24h)", () => {
    const now    = new Date(1_000_000);
    const expiry = deriveIdempotencyExpiry(now);
    expect(expiry.getTime()).toBe(1_000_000 + IDEMPOTENCY_TTL_MS);
  });

  it("custom TTL works", () => {
    const now    = new Date(0);
    const expiry = deriveIdempotencyExpiry(now, 60_000);
    expect(expiry.getTime()).toBe(60_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// X. calculateProgress
// ─────────────────────────────────────────────────────────────────────────────

describe("X. calculateProgress — percentComplete", () => {
  it("0 stages resolved → 0%", () => {
    const p = calculateProgress({});
    expect(p.percentComplete).toBe(0);
  });

  it("all 11 stages completed → 100%", () => {
    const p = calculateProgress({ completedStages: [...PIPELINE_STAGES] });
    expect(p.percentComplete).toBe(100);
  });

  it("floor(5/11 * 100) = 45%", () => {
    const p = calculateProgress({ completedStages: PIPELINE_STAGES.slice(0, 5) });
    expect(p.percentComplete).toBe(45);
  });

  it("failed stages count toward resolved", () => {
    const p = calculateProgress({
      completedStages: PIPELINE_STAGES.slice(0, 3),
      failedStages:    PIPELINE_STAGES.slice(3, 5),
    });
    expect(p.percentComplete).toBe(45);
  });

  it("skipped stages count toward resolved", () => {
    const p = calculateProgress({
      skippedStages: PIPELINE_STAGES.slice(0, 11),
    });
    expect(p.percentComplete).toBe(100);
  });

  it("percentComplete is always 0–100", () => {
    const p = calculateProgress({ completedStages: [...PIPELINE_STAGES, ...PIPELINE_STAGES] as typeof PIPELINE_STAGES });
    expect(p.percentComplete).toBeLessThanOrEqual(100);
    expect(p.percentComplete).toBeGreaterThanOrEqual(0);
  });

  it("updatedAt is a Date", () => {
    const p = calculateProgress({});
    expect(p.updatedAt).toBeInstanceOf(Date);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Y. calculateProgress — initial state
// ─────────────────────────────────────────────────────────────────────────────

describe("Y. calculateProgress — initial state", () => {
  it("buildInitialProgress has 0 signals, 0 clusters, 0 opportunities", () => {
    const p = buildInitialProgress();
    expect(p.signalsCollected).toBe(0);
    expect(p.clustersBuilt).toBe(0);
    expect(p.opportunitiesCreated).toBe(0);
    expect(p.currentStage).toBeNull();
    expect(p.percentComplete).toBe(0);
  });

  it("isValidProgressSnapshot returns true for a valid snapshot", () => {
    const p = buildInitialProgress();
    expect(isValidProgressSnapshot(p)).toBe(true);
  });

  it("isValidProgressSnapshot returns false for null", () => {
    expect(isValidProgressSnapshot(null)).toBe(false);
  });

  it("isValidProgressSnapshot returns false for {}", () => {
    expect(isValidProgressSnapshot({})).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Z. stageIndex / PIPELINE_STAGES ordering
// ─────────────────────────────────────────────────────────────────────────────

describe("Z. stageIndex — PIPELINE_STAGES ordering", () => {
  it("seed_extraction is index 0", () => {
    expect(stageIndex("seed_extraction")).toBe(0);
  });

  it("persistence is the last stage", () => {
    expect(stageIndex("persistence")).toBe(PIPELINE_STAGES.length - 1);
  });

  it("stageIsBefore: seed_extraction is before persistence", () => {
    expect(stageIsBefore("seed_extraction", "persistence")).toBe(true);
  });

  it("stageIsBefore: persistence is NOT before seed_extraction", () => {
    expect(stageIsBefore("persistence", "seed_extraction")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Focused: Diagnostics — sanitizeMetadata
// ─────────────────────────────────────────────────────────────────────────────

describe("[diagnostics] sanitizeMetadata", () => {
  it("redacts password field", () => {
    const result = sanitizeMetadata({ password: "super-secret", user: "alice" });
    expect(result["password"]).toBe("[REDACTED]");
    expect(result["user"]).toBe("alice");
  });

  it("redacts apikey field (case-insensitive)", () => {
    const result = sanitizeMetadata({ apiKey: "abc123", method: "GET" });
    expect(result["apiKey"]).toBe("[REDACTED]");
    expect(result["method"]).toBe("GET");
  });

  it("redacts token field", () => {
    const result = sanitizeMetadata({ authToken: "bearer-xyz" });
    expect(result["authToken"]).toBe("[REDACTED]");
  });

  it("redacts Basic Auth value regardless of key name", () => {
    const result = sanitizeMetadata({ header: "Basic dXNlcjpwYXNz" });
    expect(result["header"]).toBe("[REDACTED]");
  });

  it("redacts Bearer token value regardless of key name", () => {
    const result = sanitizeMetadata({ value: "Bearer eyJhbGciOiJIUzI1NiJ9.abc.def" });
    expect(result["value"]).toBe("[REDACTED]");
  });

  it("removes stack trace fields", () => {
    const result = sanitizeMetadata({ stack: "Error at line 1", msg: "hello" });
    expect("stack" in result).toBe(false);
    expect(result["msg"]).toBe("hello");
  });

  it("removes stackTrace field", () => {
    const result = sanitizeMetadata({ stackTrace: "...", code: "ERR_001" });
    expect("stackTrace" in result).toBe(false);
    expect(result["code"]).toBe("ERR_001");
  });

  it("preserves safe string fields", () => {
    const result = sanitizeMetadata({ stage: "keyword_expansion", provider: "dataforseo" });
    expect(result["stage"]).toBe("keyword_expansion");
    expect(result["provider"]).toBe("dataforseo");
  });

  it("preserves numbers and booleans", () => {
    const result = sanitizeMetadata({ count: 42, retryable: false, durationMs: 1234.5 });
    expect(result["count"]).toBe(42);
    expect(result["retryable"]).toBe(false);
    expect(result["durationMs"]).toBe(1234.5);
  });

  it("recursively sanitizes nested objects", () => {
    const result = sanitizeMetadata({
      outer: { inner: { password: "secret", label: "safe" } },
    });
    const inner = (result["outer"] as Record<string, unknown>)?.["inner"] as Record<string, unknown>;
    expect(inner?.["password"]).toBe("[REDACTED]");
    expect(inner?.["label"]).toBe("safe");
  });

  it("depth-limited: does not recurse infinitely (depth > 5)", () => {
    // Build a deeply nested object
    const deep: Record<string, unknown> = { val: "ok" };
    let current = deep;
    for (let i = 0; i < 10; i++) {
      const child: Record<string, unknown> = {};
      current["child"] = child;
      current = child;
    }
    // Should not throw
    expect(() => sanitizeMetadata(deep)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Focused: Diagnostics — redactSecrets
// ─────────────────────────────────────────────────────────────────────────────

describe("[diagnostics] redactSecrets", () => {
  it("redacts Basic Auth in strings", () => {
    const result = redactSecrets("Authorization: Basic dXNlcjpwYXNz");
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("dXNlcjpwYXNz");
  });

  it("redacts Bearer tokens", () => {
    const result = redactSecrets("Bearer eyJhbGciOiJIUzI1NiJ9.abc.def");
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("eyJhbGciOiJIUzI1NiJ9");
  });

  it("redacts postgres URLs with credentials", () => {
    const result = redactSecrets("postgres://user:pass@localhost:5432/db");
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("user:pass");
  });

  it("preserves non-credential strings", () => {
    const result = redactSecrets("stage: keyword_expansion, count: 42");
    expect(result).toBe("stage: keyword_expansion, count: 42");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Focused: Diagnostics — deriveDiagnosticId + createDiagnosticEvent
// ─────────────────────────────────────────────────────────────────────────────

describe("[diagnostics] deriveDiagnosticId + createDiagnosticEvent", () => {
  it("deriveDiagnosticId format is diag::{runId}::{seq}", () => {
    expect(deriveDiagnosticId("run::c::w", 1)).toBe("diag::run::c::w::1");
  });

  it("deriveDiagnosticId is deterministic", () => {
    expect(deriveDiagnosticId("run::x", 5)).toBe(deriveDiagnosticId("run::x", 5));
  });

  it("createDiagnosticEvent sanitizes metadata automatically", () => {
    const event = createDiagnosticEvent({
      runId: "r", clientId: "c", seq: 1,
      severity: "info",
      code: "run_queued",
      message: "Run queued",
      metadata: { password: "secret", label: "ok" },
    });
    expect(event.metadata["password"]).toBe("[REDACTED]");
    expect(event.metadata["label"]).toBe("ok");
  });

  it("createDiagnosticEvent redacts credentials in message", () => {
    const event = createDiagnosticEvent({
      runId: "r", clientId: "c", seq: 1,
      severity: "error",
      code: "run_failed",
      message: "Error: postgres://user:pass@host/db connection refused",
    });
    expect(event.message).toContain("[REDACTED]");
    expect(event.message).not.toContain("user:pass");
  });

  it("createDiagnosticEvent sets id, createdAt", () => {
    const event = createDiagnosticEvent({
      runId: "r", clientId: "c", seq: 7,
      severity: "warning",
      code: "provider_retried",
      message: "Retry 1",
    });
    expect(event.id).toBe("diag::r::7");
    expect(event.createdAt).toBeInstanceOf(Date);
    expect(event.stage).toBeNull();
    expect(event.retryable).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Focused: Governance
// ─────────────────────────────────────────────────────────────────────────────

describe("[governance] evaluateGovernance", () => {
  it("allows when activeRuns < maxActiveRunsPerClient", () => {
    const result = evaluateGovernance(DEFAULT_GOVERNANCE_POLICY, 0);
    expect(result.allowed).toBe(true);
  });

  it("denies when activeRuns >= maxActiveRunsPerClient", () => {
    const result = evaluateGovernance(DEFAULT_GOVERNANCE_POLICY, 1);
    expect(result.allowed).toBe(false);
    expect(result.allowed === false && result.reason).toBe("active_run_limit_exceeded");
  });

  it("denies when clientPaused=true", () => {
    const paused: GovernancePolicy = { ...DEFAULT_GOVERNANCE_POLICY, clientPaused: true };
    const result = evaluateGovernance(paused, 0);
    expect(result.allowed).toBe(false);
    expect(result.allowed === false && result.reason).toBe("client_paused");
  });

  it("internalOverride bypasses pause", () => {
    const override: GovernancePolicy = {
      ...DEFAULT_GOVERNANCE_POLICY, clientPaused: true, internalOverride: true,
    };
    expect(evaluateGovernance(override, 0).allowed).toBe(true);
  });

  it("internalOverride bypasses active-run limit", () => {
    const override: GovernancePolicy = {
      ...DEFAULT_GOVERNANCE_POLICY, internalOverride: true, maxActiveRunsPerClient: 1,
    };
    expect(evaluateGovernance(override, 5).allowed).toBe(true);
  });

  it("pause takes priority over run-limit (checked first)", () => {
    const paused: GovernancePolicy = {
      ...DEFAULT_GOVERNANCE_POLICY, clientPaused: true, maxActiveRunsPerClient: 0,
    };
    const result = evaluateGovernance(paused, 0);
    expect(result.allowed === false && result.reason).toBe("client_paused");
  });
});

describe("[governance] evaluateProviderOpLimit", () => {
  it("allows when below limit", () => {
    expect(evaluateProviderOpLimit(DEFAULT_GOVERNANCE_POLICY, 0).allowed).toBe(true);
    expect(evaluateProviderOpLimit(DEFAULT_GOVERNANCE_POLICY, 19).allowed).toBe(true);
  });

  it("denies at maxProviderOpsPerRun", () => {
    const result = evaluateProviderOpLimit(DEFAULT_GOVERNANCE_POLICY, 20);
    expect(result.allowed).toBe(false);
    expect(result.allowed === false && result.reason).toBe("provider_ops_limit_exceeded");
  });

  it("internalOverride does NOT bypass op limit", () => {
    const override: GovernancePolicy = {
      ...DEFAULT_GOVERNANCE_POLICY, internalOverride: true, maxProviderOpsPerRun: 5,
    };
    expect(evaluateProviderOpLimit(override, 5).allowed).toBe(false);
  });
});

describe("[governance] evaluateMergeConcurrency", () => {
  it("denies when allowConcurrentMerge=false (default)", () => {
    const result = evaluateMergeConcurrency(DEFAULT_GOVERNANCE_POLICY);
    expect(result.allowed).toBe(false);
  });

  it("allows when allowConcurrentMerge=true", () => {
    const policy: GovernancePolicy = { ...DEFAULT_GOVERNANCE_POLICY, allowConcurrentMerge: true };
    expect(evaluateMergeConcurrency(policy).allowed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Focused: Cancellation
// ─────────────────────────────────────────────────────────────────────────────

describe("[cancellation] CancellationSignal", () => {
  it("initial state is not cancelled", () => {
    const signal = new CancellationSignal();
    expect(signal.isCancelled).toBe(false);
    expect(signal.cancellationReason).toBeNull();
    expect(signal.cancelledAt).toBeNull();
  });

  it("request() sets isCancelled=true", () => {
    const signal = new CancellationSignal();
    signal.request("User requested", "user_requested");
    expect(signal.isCancelled).toBe(true);
    expect(signal.cancellationReason).toBe("User requested");
    expect(signal.cancellationReasonCode).toBe("user_requested");
    expect(signal.cancelledAt).toBeInstanceOf(Date);
  });

  it("first request wins (idempotent)", () => {
    const signal = new CancellationSignal();
    signal.request("First reason", "user_requested");
    signal.request("Second reason", "budget_exceeded");
    expect(signal.cancellationReason).toBe("First reason");
    expect(signal.cancellationReasonCode).toBe("user_requested");
  });

  it("recordObservationPoint records first observation only", () => {
    const signal = new CancellationSignal();
    signal.request("Cancelled", "user_requested");
    signal.recordObservationPoint("before_execution");
    signal.recordObservationPoint("between_stages");
    expect(signal.observedAt).toBe("before_execution");
  });

  it("recordObservationPoint does nothing if not cancelled", () => {
    const signal = new CancellationSignal();
    signal.recordObservationPoint("before_execution");
    expect(signal.observedAt).toBeNull();
  });
});

describe("[cancellation] NullCancellationToken", () => {
  it("is never cancelled", () => {
    expect(NullCancellationToken.isCancelled).toBe(false);
    expect(NullCancellationToken.cancellationReason).toBeNull();
    expect(NullCancellationToken.cancelledAt).toBeNull();
  });
});

describe("[cancellation] shouldCancel", () => {
  it("returns false when not cancelled", () => {
    expect(shouldCancel(NullCancellationToken, "before_execution")).toBe(false);
  });

  it("returns true and records observation when cancelled", () => {
    const signal = new CancellationSignal();
    signal.request("Cancelled", "user_requested");
    const result = shouldCancel(signal, "between_stages");
    expect(result).toBe(true);
    expect(signal.observedAt).toBe("between_stages");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Focused: Audit
// ─────────────────────────────────────────────────────────────────────────────

describe("[audit] deriveAuditId", () => {
  it("format starts with audit::{clientId}::{action}", () => {
    const id = deriveAuditId("c1", "live_run_requested", "corr-abc");
    expect(id).toMatch(/^audit::c1::live_run_requested::[0-9a-f]{8}$/);
  });

  it("same inputs → same id", () => {
    const a = deriveAuditId("c1", "live_run_requested", "corr-abc");
    const b = deriveAuditId("c1", "live_run_requested", "corr-abc");
    expect(a).toBe(b);
  });

  it("different correlationId → different id", () => {
    const a = deriveAuditId("c1", "live_run_requested", "corr-abc");
    const b = deriveAuditId("c1", "live_run_requested", "corr-xyz");
    expect(a).not.toBe(b);
  });

  it("null correlationId is safe", () => {
    expect(() => deriveAuditId("c1", "live_run_requested", null)).not.toThrow();
  });
});

describe("[audit] createAuditEvent", () => {
  it("sanitizes metadata automatically", () => {
    const event = createAuditEvent({
      clientId: "c1",
      action:   "live_run_requested",
      actorType: "user",
      actorId:  "user-123",
      metadata: { password: "secret", mode: "primary_only" },
    });
    expect(event.metadata["password"]).toBe("[REDACTED]");
    expect(event.metadata["mode"]).toBe("primary_only");
  });

  it("null correlationId is safe", () => {
    const event = createAuditEvent({
      clientId: "c1",
      action:   "dry_run_requested",
      actorType: "user",
      metadata: {},
    });
    expect(event.correlationId).toBeNull();
    expect(event.actorId).toBeNull();
    expect(event.runId).toBeNull();
  });

  it("createdAt is a Date", () => {
    const event = createAuditEvent({
      clientId: "c1", action: "lease_acquired", actorType: "system",
    });
    expect(event.createdAt).toBeInstanceOf(Date);
  });

  it("id is deterministic", () => {
    const e1 = createAuditEvent({ clientId: "c1", action: "live_run_requested", actorType: "user", correlationId: "corr-1" });
    const e2 = createAuditEvent({ clientId: "c1", action: "live_run_requested", actorType: "user", correlationId: "corr-1" });
    expect(e1.id).toBe(e2.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Focused: Rate Limiter
// ─────────────────────────────────────────────────────────────────────────────

describe("[rate limiter] DiscoveryRateLimiter", () => {
  let limiter: DiscoveryRateLimiter;
  beforeEach(() => { limiter = new DiscoveryRateLimiter(); });

  it("allows initial requests within limit", () => {
    const result = limiter.check("health", "user-1", "client-1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(DEFAULT_RATE_LIMIT_POLICIES.health.maxRequests - 1);
  });

  it("blocks after limit reached", () => {
    const max = DEFAULT_RATE_LIMIT_POLICIES.live_run.maxRequests;
    for (let i = 0; i < max; i++) {
      limiter.check("live_run", "user-1", "client-1");
    }
    const result = limiter.check("live_run", "user-1", "client-1");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterS).toBeGreaterThan(0);
    expect(result.remaining).toBe(0);
  });

  it("sliding window: old requests expire", () => {
    const policy  = DEFAULT_RATE_LIMIT_POLICIES.live_run;
    const max     = policy.maxRequests;
    const now     = Date.now();
    const pastNow = now - policy.windowMs - 1_000;  // before window

    // Simulate old requests
    for (let i = 0; i < max; i++) {
      limiter.check("live_run", "user-1", "client-1", pastNow);
    }
    // Now check with current time — old requests have expired
    const result = limiter.check("live_run", "user-1", "client-1", now);
    expect(result.allowed).toBe(true);
  });

  it("reset clears bucket for specific key", () => {
    const max = DEFAULT_RATE_LIMIT_POLICIES.dry_run.maxRequests;
    for (let i = 0; i < max; i++) {
      limiter.check("dry_run", "user-1", "client-1");
    }
    limiter.reset("dry_run", "user-1", "client-1");
    const result = limiter.check("dry_run", "user-1", "client-1");
    expect(result.allowed).toBe(true);
  });

  it("peek does not consume a slot", () => {
    const before = limiter.peek("health", "user-1", "client-1");
    const after  = limiter.peek("health", "user-1", "client-1");
    expect(before.count).toBe(0);
    expect(after.count).toBe(0);
  });

  it("after check, peek shows increased count", () => {
    limiter.check("health", "user-1", "client-1");
    const p = limiter.peek("health", "user-1", "client-1");
    expect(p.count).toBe(1);
  });

  it("different operations have isolated buckets", () => {
    const maxDry = DEFAULT_RATE_LIMIT_POLICIES.dry_run.maxRequests;
    for (let i = 0; i < maxDry; i++) {
      limiter.check("dry_run", "user-1", "client-1");
    }
    const result = limiter.check("live_run", "user-1", "client-1");
    expect(result.allowed).toBe(true);
  });

  it("different userId+clientId keys are isolated", () => {
    const max = DEFAULT_RATE_LIMIT_POLICIES.live_run.maxRequests;
    for (let i = 0; i < max; i++) {
      limiter.check("live_run", "user-1", "client-1");
    }
    const result = limiter.check("live_run", "user-2", "client-2");
    expect(result.allowed).toBe(true);
  });

  it("live_run has stricter limit than dry_run", () => {
    const liveMax = DEFAULT_RATE_LIMIT_POLICIES.live_run.maxRequests;
    const dryMax  = DEFAULT_RATE_LIMIT_POLICIES.dry_run.maxRequests;
    expect(liveMax).toBeLessThan(dryMax);
  });

  it("resetAll clears all buckets", () => {
    limiter.check("live_run", "user-1", "client-1");
    limiter.check("dry_run",  "user-1", "client-1");
    limiter.resetAll();
    expect(limiter.bucketCount).toBe(0);
  });

  it("retryAfterS is at least 1 when denied", () => {
    const max = DEFAULT_RATE_LIMIT_POLICIES.live_run.maxRequests;
    for (let i = 0; i < max; i++) limiter.check("live_run", "u", "c");
    const denied = limiter.check("live_run", "u", "c");
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterS).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regression
// ─────────────────────────────────────────────────────────────────────────────

describe("[regression] C3/C6 backward compatibility", () => {
  it("C3 SnapshotStatus values all present in C6 RunState", () => {
    const c3States = ["running", "complete", "failed", "partial"];
    const c6States: RunState[] = [
      "planned", "queued", "running", "partial", "complete", "failed", "cancel_requested", "cancelled",
    ];
    for (const state of c3States) {
      expect(c6States).toContain(state);
    }
  });

  it("C6 RunState has 8 values", () => {
    const allStates: RunState[] = [
      "planned", "queued", "running", "partial", "complete", "failed", "cancel_requested", "cancelled",
    ];
    expect(allStates).toHaveLength(8);
  });

  it("PIPELINE_STAGES has 11 stages", () => {
    expect(PIPELINE_STAGES).toHaveLength(11);
  });

  it("TOTAL_PIPELINE_STAGES === PIPELINE_STAGES.length", () => {
    expect(TOTAL_PIPELINE_STAGES).toBe(PIPELINE_STAGES.length);
    expect(TOTAL_PIPELINE_STAGES).toBe(11);
  });

  it("seed_extraction is the first stage, persistence is the last", () => {
    expect(PIPELINE_STAGES[0]).toBe("seed_extraction");
    expect(PIPELINE_STAGES[PIPELINE_STAGES.length - 1]).toBe("persistence");
  });

  it("DEFAULT_GOVERNANCE_POLICY.maxActiveRunsPerClient is 1", () => {
    expect(DEFAULT_GOVERNANCE_POLICY.maxActiveRunsPerClient).toBe(1);
  });

  it("DEFAULT_GOVERNANCE_POLICY.internalOverride is false", () => {
    expect(DEFAULT_GOVERNANCE_POLICY.internalOverride).toBe(false);
  });

  it("DEFAULT_GOVERNANCE_POLICY.clientPaused is false", () => {
    expect(DEFAULT_GOVERNANCE_POLICY.clientPaused).toBe(false);
  });

  it("IDEMPOTENCY_TTL_MS is 24 hours", () => {
    expect(IDEMPOTENCY_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("LEASE_DURATION_MS is 5 minutes", () => {
    expect(LEASE_DURATION_MS).toBe(5 * 60 * 1000);
  });

  it("LEASE_MAX_DURATION_MS is 15 minutes", () => {
    expect(LEASE_MAX_DURATION_MS).toBe(15 * 60 * 1000);
  });
});

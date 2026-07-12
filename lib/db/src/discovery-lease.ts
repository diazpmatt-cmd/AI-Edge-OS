/**
 * Phase C6 — Execution Lease
 *
 * Provides a canonical execution-lease boundary to prevent unsafe duplicate
 * execution of the same discovery run by concurrent requests or recovered workers.
 *
 * Design decisions:
 *   - One active lease per run (run_id = primary key of discovery_run_leases table).
 *   - Lease ownership identified by a correlationId (request-scoped unique value).
 *   - Lease acquisition is atomic via PostgreSQL INSERT ON CONFLICT DO NOTHING.
 *   - Expired leases can be recovered (UPDATE WHERE expires_at < NOW()).
 *   - A caller cannot release another process's lease without an authorized recovery.
 *   - Lease release occurs on terminal transition (complete/failed/cancelled).
 *   - Crashed processes do not permanently block recovery once TTL expires.
 *   - No Redis — uses the existing PostgreSQL connection pool.
 *
 * This file contains only pure types and lease-logic helpers.
 * Actual DB operations live in discovery-drizzle-repository.ts.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** Default execution lease duration: 5 minutes. */
export const LEASE_DURATION_MS  = 5 * 60 * 1000;

/** Maximum allowed lease duration (hard cap — never exceed this). */
export const LEASE_MAX_DURATION_MS = 15 * 60 * 1000;

/** Grace period before an expired lease may be recovered. */
export const LEASE_RECOVERY_GRACE_MS = 30 * 1000;

/** Maximum active runs per client (default governance). Overridable via GovernancePolicy. */
export const DEFAULT_MAX_ACTIVE_RUNS_PER_CLIENT = 1;

// ── Lease record ──────────────────────────────────────────────────────────────

/** One row per active-or-released run in discovery_run_leases. */
export interface LeaseRecord {
  /** FK → discovery_snapshots.id */
  runId:        string;
  clientId:     string;
  /**
   * Correlation ID of the process/request that holds this lease.
   * Used to validate ownership before renewal or release.
   */
  ownerId:      string;
  acquiredAt:   Date;
  expiresAt:    Date;
  renewedAt:    Date | null;
  /** Set when the lease is voluntarily released on terminal state. */
  releasedAt:   Date | null;
}

// ── Lease acquisition result ──────────────────────────────────────────────────

export type LeaseAcquireResult =
  | { acquired: true;  lease: LeaseRecord }
  | { acquired: false; reason: LeaseAcquireFailureReason; existingOwnerId: string | null; expiresAt: Date | null };

export type LeaseAcquireFailureReason =
  | "already_held"            // Another owner holds a valid non-expired lease
  | "run_not_found"           // No snapshot exists for this runId
  | "run_terminal"            // Run is already in a terminal state
  | "client_limit_exceeded";  // Per-client active-run limit reached

// ── Lease renewal result ──────────────────────────────────────────────────────

export type LeaseRenewResult =
  | { renewed: true;  lease: LeaseRecord }
  | { renewed: false; reason: "not_owner" | "not_found" | "already_expired" };

// ── Lease release result ──────────────────────────────────────────────────────

export type LeaseReleaseResult =
  | { released: true }
  | { released: false; reason: "not_owner" | "not_found" | "already_released" };

// ── Lease recovery result ─────────────────────────────────────────────────────

export type LeaseRecoveryResult =
  | { recovered: true;  lease: LeaseRecord }
  | { recovered: false; reason: "not_expired" | "not_found" | "recently_released" };

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Returns true if the lease has passed its expiration time.
 * A newly-expired lease is still within the recovery grace period.
 */
export function isLeaseExpired(lease: LeaseRecord, now: Date = new Date()): boolean {
  return lease.expiresAt.getTime() <= now.getTime();
}

/**
 * Returns true if the lease is expired AND past the recovery grace period.
 * Used to prevent premature recovery of a lease that a process might still hold.
 */
export function isLeaseRecoverable(lease: LeaseRecord, now: Date = new Date()): boolean {
  return lease.expiresAt.getTime() + LEASE_RECOVERY_GRACE_MS <= now.getTime();
}

/**
 * Returns true if the caller owns this lease.
 * Always check ownership before renewal or release.
 */
export function isLeaseOwner(lease: LeaseRecord, callerId: string): boolean {
  return lease.ownerId === callerId;
}

/**
 * Derives the new expiry time for a lease from the current time.
 * Clamps to LEASE_MAX_DURATION_MS regardless of durationMs input.
 */
export function deriveLeasExpiry(
  now: Date = new Date(),
  durationMs: number = LEASE_DURATION_MS,
): Date {
  const clamped = Math.min(durationMs, LEASE_MAX_DURATION_MS);
  return new Date(now.getTime() + clamped);
}

/**
 * Derives a canonical lease owner ID from a correlation ID.
 * The correlation ID is already unique per request; this function
 * provides a canonical prefix for clarity in audit logs.
 */
export function deriveLeaseOwnerId(correlationId: string): string {
  return `owner::${correlationId}`;
}

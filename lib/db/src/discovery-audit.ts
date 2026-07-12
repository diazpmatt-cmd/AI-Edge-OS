/**
 * Phase C6 — Audit Boundary
 *
 * Append-only audit trail for sensitive discovery actions.
 *
 * Audit events are produced for:
 *   - Manual live run requested
 *   - Dry run requested
 *   - Budget override used
 *   - Governance override used
 *   - Cancellation requested
 *   - Recovery invoked
 *   - Execution denied (ownership, budget, rate limit, concurrency)
 *   - Provider health checked
 *   - Run read by privileged internal actor
 *
 * Constraints:
 *   - No credentials, tokens, or raw provider payloads in audit events.
 *   - Metadata is sanitized before persistence (sanitizeMetadata from diagnostics).
 *   - Records are append-only — no updates or deletes.
 *   - Tenant-scoped: clientId on every record.
 *   - Deterministic IDs: deriveAuditId(clientId, action, correlationId).
 *
 * No Math.random(). No BB&B-specific values.
 */

import { createHash } from "node:crypto";
import { sanitizeMetadata } from "./discovery-diagnostics.js";

// ── Audit actions ─────────────────────────────────────────────────────────────

/**
 * Canonical audit actions. Stable — never rename existing values.
 */
export type AuditAction =
  | "live_run_requested"
  | "dry_run_requested"
  | "run_cancelled_requested"
  | "run_read"
  | "provider_health_checked"
  | "budget_override_used"
  | "governance_override_used"
  | "execution_denied_ownership"
  | "execution_denied_budget"
  | "execution_denied_rate_limit"
  | "execution_denied_concurrency"
  | "execution_denied_governance"
  | "execution_failed"
  | "recovery_invoked"
  | "idempotency_replay"
  | "idempotency_mismatch_rejected"
  | "lease_acquired"
  | "lease_released"
  | "lease_recovered"
  | "transition_recorded"
  | "diagnostic_created"
  | "schedule_created"
  | "schedule_updated"
  | "schedule_paused"
  | "schedule_resumed"
  | "schedule_disabled"
  | "schedule_archived"
  | "schedule_error_blocked"
  | "schedule_run_dispatched"
  | "schedule_run_skipped_overlap"
  | "schedule_run_skipped_budget"
  | "schedule_run_skipped_governance"
  | "schedule_occurrence_idempotency_hit"
  | "schedule_catch_up_created"
  | "scheduler_leadership_acquired"
  | "scheduler_leadership_lost"
  | "scheduler_leadership_released"
  | "recovery_scan_invoked"
  | "stale_run_recovered"
  | "stale_claim_released"
  | "schedule_read";

// ── Actor types ───────────────────────────────────────────────────────────────

export type AuditActorType =
  | "user"       // Authenticated Clerk user
  | "system"     // Internal process (scheduler, recovery, bootstrap)
  | "recovery"   // Recovery/reconciliation process
  | "test";      // Test environment only — never in production

// ── Audit event ───────────────────────────────────────────────────────────────

export interface AuditEvent {
  /**
   * Deterministic:
   *   "audit::{clientId}::{action}::{sha256(correlationId)[:8]}"
   * Includes correlationId fragment for uniqueness within same action+client.
   */
  id:             string;
  clientId:       string;
  /**
   * FK → discovery_snapshots.id. null for pre-run actions (health checks, denials).
   */
  runId:          string | null;
  action:         AuditAction;
  actorType:      AuditActorType;
  /**
   * Clerk userId, "system", or provider name.
   * Never a credential or token.
   */
  actorId:        string | null;
  correlationId:  string | null;
  /**
   * Safe structured metadata — sanitized before persistence.
   * May include: dryRun flag, mode, estimated cost, reason codes.
   * Must NOT include: credentials, tokens, provider payloads.
   */
  metadata:       Record<string, unknown>;
  createdAt:      Date;
}

// ── ID derivation ─────────────────────────────────────────────────────────────

/**
 * Derives a deterministic audit event ID.
 *
 *   "audit::{clientId}::{action}::{sha256(correlationId || 'null')[:8]}"
 *
 * The correlationId fragment ensures uniqueness across concurrent requests
 * from the same client taking the same action.
 */
export function deriveAuditId(
  clientId:       string,
  action:         AuditAction,
  correlationId:  string | null,
): string {
  const fragment = createHash("sha256")
    .update(correlationId ?? "null")
    .digest("hex")
    .slice(0, 8);
  return `audit::${clientId}::${action}::${fragment}`;
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Creates a sanitized AuditEvent ready for persistence.
 * metadata is automatically sanitized — no credentials will be persisted.
 */
export function createAuditEvent(params: {
  clientId:       string;
  runId?:         string | null;
  action:         AuditAction;
  actorType:      AuditActorType;
  actorId?:       string | null;
  correlationId?: string | null;
  metadata?:      Record<string, unknown>;
}): AuditEvent {
  const correlationId = params.correlationId ?? null;
  return {
    id:            deriveAuditId(params.clientId, params.action, correlationId),
    clientId:      params.clientId,
    runId:         params.runId          ?? null,
    action:        params.action,
    actorType:     params.actorType,
    actorId:       params.actorId        ?? null,
    correlationId,
    metadata:      sanitizeMetadata(params.metadata ?? {}),
    createdAt:     new Date(),
  };
}

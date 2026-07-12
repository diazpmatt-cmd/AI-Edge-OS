/**
 * Phase C6 — Cooperative Cancellation
 *
 * Injectable cancellation token so pure pipeline functions remain pure.
 *
 * Design:
 *   - CancellationToken is a read-only interface: isCancelled() + reason.
 *   - CancellationSignal is the writable side: request() sets the cancelled state.
 *   - NullCancellationToken is a no-op token for paths that don't support cancellation.
 *   - The pipeline checks isCancelled() between stages, before each provider call.
 *   - In-flight external HTTP requests (DataForSEO etc.) cannot be interrupted.
 *     Cancellation is cooperative — no new calls start after cancel is observed.
 *   - Already-persisted canonical data (signals, clusters, opportunities) is preserved.
 *   - CancellationStage records where cancellation was observed.
 *
 * No Math.random(). No BB&B-specific values.
 */

// ── Stage where cancellation was observed ─────────────────────────────────────

export type CancellationObservationPoint =
  | "before_execution"       // Checked before first provider call
  | "between_stages"         // Checked between pipeline stage N and N+1
  | "during_provider"        // Observed while a provider call was in flight
  | "during_persistence"     // Checked before Stage 11 (DB write)
  | "during_finalization";   // Checked before final status assignment

// ── Reason codes ──────────────────────────────────────────────────────────────

export type CancellationReasonCode =
  | "user_requested"   // Authenticated user requested via API
  | "budget_exceeded"  // Budget guard triggered automatic cancellation
  | "governance"       // Policy violation detected mid-run
  | "timeout"          // Run exceeded maximum allowed duration
  | "test";            // Test environment only

// ── Token (read-only interface) ───────────────────────────────────────────────

/**
 * Read-only cancellation observable.
 * Inject into pipeline stages and provider calls.
 * Pure functions check isCancelled() before starting new work.
 */
export interface CancellationToken {
  /**
   * Returns true if cancellation has been requested.
   * Check before every provider call and between pipeline stages.
   */
  readonly isCancelled: boolean;
  /** Human-readable reason for cancellation. null if not cancelled. */
  readonly cancellationReason: string | null;
  /** Reason code for structured handling. null if not cancelled. */
  readonly cancellationReasonCode: CancellationReasonCode | null;
  /** When the cancellation was requested. null if not cancelled. */
  readonly cancelledAt: Date | null;
  /** Where in the pipeline cancellation was first observed. null if not yet. */
  readonly observedAt: CancellationObservationPoint | null;
}

// ── Signal (writable side) ────────────────────────────────────────────────────

/**
 * Writable cancellation controller.
 * The route handler calls .request() when a cancel API request is received.
 * The pipeline only reads via the CancellationToken interface.
 */
export class CancellationSignal implements CancellationToken {
  private _cancelled    = false;
  private _reason:      string | null = null;
  private _reasonCode:  CancellationReasonCode | null = null;
  private _cancelledAt: Date | null = null;
  private _observedAt:  CancellationObservationPoint | null = null;

  get isCancelled():           boolean                         { return this._cancelled; }
  get cancellationReason():    string | null                   { return this._reason; }
  get cancellationReasonCode(): CancellationReasonCode | null  { return this._reasonCode; }
  get cancelledAt():           Date | null                     { return this._cancelledAt; }
  get observedAt():            CancellationObservationPoint | null { return this._observedAt; }

  /**
   * Requests cancellation of the associated run.
   * Idempotent: multiple calls with the same reason are safe; first wins.
   */
  request(reason: string, reasonCode: CancellationReasonCode): void {
    if (this._cancelled) return; // first cancellation wins
    this._cancelled   = true;
    this._reason      = reason;
    this._reasonCode  = reasonCode;
    this._cancelledAt = new Date();
  }

  /**
   * Records where in the pipeline cancellation was first observed.
   * Called by the pipeline when it checks isCancelled() and finds it true.
   */
  recordObservationPoint(point: CancellationObservationPoint): void {
    if (!this._cancelled) return;
    if (this._observedAt === null) {
      this._observedAt = point;
    }
  }
}

// ── Null token (no-op) ────────────────────────────────────────────────────────

/**
 * A CancellationToken that is never cancelled.
 * Use for code paths that don't support cooperative cancellation.
 * Tests and dry-run planning use this token.
 */
export const NullCancellationToken: CancellationToken = Object.freeze({
  isCancelled:             false,
  cancellationReason:      null,
  cancellationReasonCode:  null,
  cancelledAt:             null,
  observedAt:              null,
});

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Checks the cancellation token and records the observation point if cancelled.
 * Returns true if the pipeline should stop.
 *
 * Usage in pipeline:
 *   if (shouldCancel(token, "between_stages")) { break; }
 */
export function shouldCancel(
  token: CancellationToken,
  point: CancellationObservationPoint,
): boolean {
  if (!token.isCancelled) return false;
  if (token instanceof CancellationSignal) {
    token.recordObservationPoint(point);
  }
  return true;
}

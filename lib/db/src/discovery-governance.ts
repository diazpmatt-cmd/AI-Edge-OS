/**
 * Phase C6 — Execution Governance Policy
 *
 * Injectable per-client governance policy for discovery runs.
 *
 * Governance controls:
 *   - Maximum active runs per client (default: 1)
 *   - Maximum provider operations per run
 *   - Maximum provider operations per client (across all active runs)
 *   - Whether merge mode may execute providers concurrently (default: false)
 *   - Whether expensive capabilities require serial execution (default: true)
 *   - Whether a client is temporarily paused
 *   - Internal authorized override (must be validated by route — never caller-supplied)
 *
 * Governance ordering is deterministic even when implementation uses parallel promises.
 *
 * No Math.random(). No BB&B-specific values. No hardcoded client IDs.
 */

// ── Governance policy ─────────────────────────────────────────────────────────

/**
 * Per-client execution governance policy.
 * Injected by the route handler — not derived from untrusted request input.
 */
export interface GovernancePolicy {
  /**
   * Maximum number of runs in an active state (running, queued, cancel_requested)
   * for this client at any one time.
   * Default: 1. Set to 0 to pause this client entirely.
   */
  maxActiveRunsPerClient: number;

  /**
   * Maximum number of provider calls allowed per run (across all stages).
   * Prevents runaway execution from pipeline bugs.
   * Default: 20.
   */
  maxProviderOpsPerRun: number;

  /**
   * Whether merge mode may execute providers concurrently.
   * Default: false — serial execution for determinism and cost safety.
   */
  allowConcurrentMerge: boolean;

  /**
   * Whether expensive capabilities (SERP, volume queries) require serial execution.
   * Default: true.
   */
  requireSerialForExpensive: boolean;

  /**
   * When true, this client's discovery runs are administratively paused.
   * No new runs will be started. Existing runs will complete.
   * Default: false.
   */
  clientPaused: boolean;

  /**
   * When true, a trusted internal actor has authorized an override of normal limits.
   * Must NEVER be set from untrusted request input — only from internal route logic
   * after verifying Clerk session and internal authorization.
   * Default: false.
   */
  internalOverride: boolean;
}

/** Conservative default governance policy. Applied when no custom policy is set. */
export const DEFAULT_GOVERNANCE_POLICY: Readonly<GovernancePolicy> = {
  maxActiveRunsPerClient:    1,
  maxProviderOpsPerRun:      20,
  allowConcurrentMerge:      false,
  requireSerialForExpensive: true,
  clientPaused:              false,
  internalOverride:          false,
};

// ── Governance evaluation result ──────────────────────────────────────────────

export type GovernanceDenyReason =
  | "client_paused"
  | "active_run_limit_exceeded"
  | "provider_ops_limit_exceeded"
  | "concurrent_merge_not_allowed"
  | "expensive_capability_requires_serial";

export type GovernanceResult =
  | { allowed: true }
  | { allowed: false; reason: GovernanceDenyReason; message: string };

// ── Evaluation ────────────────────────────────────────────────────────────────

/**
 * Evaluates whether a new discovery run may proceed under the given policy.
 *
 * @param policy       - The governance policy for this client.
 * @param activeRuns   - Count of currently active runs for this client.
 * @returns GovernanceResult — allowed or denied with reason.
 */
export function evaluateGovernance(
  policy:     GovernancePolicy,
  activeRuns: number,
): GovernanceResult {
  // Internal override bypasses active-run and pause limits (not concurrency safety)
  if (!policy.internalOverride) {
    if (policy.clientPaused) {
      return {
        allowed: false,
        reason:  "client_paused",
        message: "Discovery runs are administratively paused for this client.",
      };
    }

    if (activeRuns >= policy.maxActiveRunsPerClient) {
      return {
        allowed: false,
        reason:  "active_run_limit_exceeded",
        message: `Client already has ${activeRuns} active run(s). ` +
                 `Maximum allowed: ${policy.maxActiveRunsPerClient}.`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Evaluates whether a provider operation may proceed given the current ops count.
 * Always enforced — internal override does NOT bypass per-run op limits.
 */
export function evaluateProviderOpLimit(
  policy:       GovernancePolicy,
  currentOps:   number,
): GovernanceResult {
  if (currentOps >= policy.maxProviderOpsPerRun) {
    return {
      allowed: false,
      reason:  "provider_ops_limit_exceeded",
      message: `Run has attempted ${currentOps} provider operations. ` +
               `Maximum allowed per run: ${policy.maxProviderOpsPerRun}.`,
    };
  }
  return { allowed: true };
}

/**
 * Evaluates whether merge mode may run concurrently under the policy.
 * Used by SearchOrchestrator in merge mode.
 */
export function evaluateMergeConcurrency(policy: GovernancePolicy): GovernanceResult {
  if (!policy.allowConcurrentMerge) {
    return {
      allowed: false,
      reason:  "concurrent_merge_not_allowed",
      message: "Merge mode is configured for serial execution on this client.",
    };
  }
  return { allowed: true };
}

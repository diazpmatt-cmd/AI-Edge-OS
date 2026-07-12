/**
 * Phase C5 — Budget Guard
 *
 * Injectable policy boundary that prevents or limits provider execution
 * based on estimated cost, request count, and capability allowances.
 *
 * Key rules:
 *   - No provider call occurs when BudgetGuard.check() returns allowed=false.
 *   - Budget rejection is recorded as a diagnostic, NOT as a provider failure.
 *   - A rejected call does not appear in DiscoveryRunSummary.providerFailures.
 *   - dryRunMode always blocks execution — no external calls, no persistence.
 *   - callers cannot set a ceiling above MAX_RUN_CEILING_USD.
 *   - perRunCeilingUSD from the request is clamped to MAX_RUN_CEILING_USD.
 *
 * No Math.random(). No hardcoded BB&B values. No live API calls. Deterministic.
 */

import type { ProviderCapability } from "./discovery-capability";

// ── System limits ─────────────────────────────────────────────────────────────

/**
 * Hard ceiling for any single discovery run, regardless of caller-supplied value.
 * Protects against runaway cost from misconfiguration or adversarial inputs.
 */
export const MAX_RUN_CEILING_USD = 5.00;

/**
 * Default per-run ceiling when none is supplied by the caller.
 * Conservative for developer / QA runs.
 */
export const DEFAULT_RUN_CEILING_USD = 1.00;

// ── Policy ────────────────────────────────────────────────────────────────────

export interface BudgetPolicy {
  /**
   * Maximum estimated cost for a single discovery run in USD.
   * Automatically clamped to MAX_RUN_CEILING_USD.
   * undefined → DEFAULT_RUN_CEILING_USD.
   */
  perRunCeilingUSD?: number;
  /**
   * Maximum number of API requests (volume batch + SERP calls) per run.
   * undefined → no request-count limit.
   */
  maxRequestCount?: number;
  /**
   * When true: build the plan but make no provider calls and write no persistence.
   * The guard blocks every provider call with reason "dry_run_mode".
   */
  dryRunMode?: boolean;
  /**
   * Capability allowlist.
   * When provided, any capability not in this list is blocked.
   * undefined → all capabilities allowed.
   */
  allowedCapabilities?: ProviderCapability[];
}

// ── Block reason ──────────────────────────────────────────────────────────────

export type BudgetBlockReason =
  | "dry_run_mode"
  | "per_run_ceiling_exceeded"
  | "max_request_count_exceeded"
  | "capability_not_allowed";

// ── Check result ──────────────────────────────────────────────────────────────

export interface BudgetDiagnostic {
  policyViolation:   BudgetBlockReason;
  estimatedCostUSD:  number;
  ceilingUSD:        number | null;
  requestCount:      number;
  maxRequestCount:   number | null;
  blockedCapability: ProviderCapability | null;
}

export interface BudgetCheckResult {
  /** True when execution is permitted under the current policy. */
  allowed: boolean;
  /**
   * Machine-readable block reason. Present only when allowed=false.
   */
  reason?: BudgetBlockReason;
  /**
   * Structured diagnostic for inclusion in run response.
   * Never contains secrets or credentials.
   */
  diagnostic?: BudgetDiagnostic;
}

// ── Guard ─────────────────────────────────────────────────────────────────────

/**
 * Injectable budget guard. Instantiate once per run, check before every call.
 *
 *   const guard = new BudgetGuard({ perRunCeilingUSD: 0.50, dryRunMode: false });
 *   const check = guard.check(estimatedCostUSD, requestCount);
 *   if (!check.allowed) { // record diagnostic and skip provider
 *     return;
 *   }
 *   // execute provider...
 */
export class BudgetGuard {
  private readonly effectiveCeiling:   number;
  private readonly maxRequestCount:    number;
  private readonly dryRunMode:         boolean;
  private readonly allowedCapabilities?: ProviderCapability[];

  constructor(rawPolicy: BudgetPolicy = {}) {
    this.effectiveCeiling = Math.min(
      rawPolicy.perRunCeilingUSD ?? DEFAULT_RUN_CEILING_USD,
      MAX_RUN_CEILING_USD,
    );
    this.maxRequestCount    = rawPolicy.maxRequestCount ?? Infinity;
    this.dryRunMode         = rawPolicy.dryRunMode ?? false;
    this.allowedCapabilities = rawPolicy.allowedCapabilities;
  }

  /**
   * Check whether a provider call is permitted given estimated cost + count.
   *
   * @param estimatedCostUSD  Estimated cost (USD) for this execution.
   * @param requestCount      Number of API requests this execution will make.
   */
  check(estimatedCostUSD: number, requestCount: number): BudgetCheckResult {
    const ceilingForDiag   = this.effectiveCeiling;
    const maxCountForDiag  = this.maxRequestCount === Infinity ? null : this.maxRequestCount;

    if (this.dryRunMode) {
      return {
        allowed: false,
        reason:  "dry_run_mode",
        diagnostic: {
          policyViolation:   "dry_run_mode",
          estimatedCostUSD,
          ceilingUSD:        ceilingForDiag,
          requestCount,
          maxRequestCount:   maxCountForDiag,
          blockedCapability: null,
        },
      };
    }

    if (estimatedCostUSD > this.effectiveCeiling) {
      return {
        allowed: false,
        reason:  "per_run_ceiling_exceeded",
        diagnostic: {
          policyViolation:   "per_run_ceiling_exceeded",
          estimatedCostUSD,
          ceilingUSD:        ceilingForDiag,
          requestCount,
          maxRequestCount:   maxCountForDiag,
          blockedCapability: null,
        },
      };
    }

    if (requestCount > this.maxRequestCount) {
      return {
        allowed: false,
        reason:  "max_request_count_exceeded",
        diagnostic: {
          policyViolation:   "max_request_count_exceeded",
          estimatedCostUSD,
          ceilingUSD:        ceilingForDiag,
          requestCount,
          maxRequestCount:   maxCountForDiag,
          blockedCapability: null,
        },
      };
    }

    return { allowed: true };
  }

  /**
   * Check whether a specific capability is allowed under the current policy.
   * Used to skip unsupported or restricted capability calls before budgeting.
   */
  checkCapability(capability: ProviderCapability): BudgetCheckResult {
    if (!this.allowedCapabilities) return { allowed: true };
    if (!this.allowedCapabilities.includes(capability)) {
      return {
        allowed: false,
        reason:  "capability_not_allowed",
        diagnostic: {
          policyViolation:   "capability_not_allowed",
          estimatedCostUSD:  0,
          ceilingUSD:        this.effectiveCeiling,
          requestCount:      0,
          maxRequestCount:   this.maxRequestCount === Infinity ? null : this.maxRequestCount,
          blockedCapability: capability,
        },
      };
    }
    return { allowed: true };
  }

  getEffectiveCeiling():   number  { return this.effectiveCeiling; }
  getMaxRequestCount():    number  { return this.maxRequestCount; }
  isDryRun():              boolean { return this.dryRunMode; }
}

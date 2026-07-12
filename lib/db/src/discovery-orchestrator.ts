/**
 * Phase C5 — Multi-Provider Search Orchestrator
 *
 * Wraps multiple SearchDataProvider instances and executes them according to
 * the configured OrchestrationMode. The pipeline receives a single
 * SearchDataProvider (the orchestrator) and is unaware of how many underlying
 * providers ran.
 *
 * Modes:
 *   primary_only — Execute only the highest-priority provider.
 *                  Failures propagate immediately (no fallback).
 *   fallback     — Try providers in deterministic priority order until one succeeds.
 *                  Non-retryable errors (auth, quota, disabled, unconfigured) stop
 *                  the chain — the error is re-thrown. Retryable errors advance
 *                  to the next provider.
 *   merge        — Execute ALL eligible providers sequentially and merge results.
 *                  Provider failures produce empty contribution (never abort merge).
 *
 * Determinism guarantees:
 *   - Providers are always sorted by priority ascending (lower number = runs first).
 *   - Same input always produces the same execution order.
 *   - merge mode runs providers sequentially (NOT concurrently) so output order
 *     does not depend on network timing.
 *   - No Math.random().
 *
 * Budget integration (optional):
 *   If a BudgetGuard is supplied, guard.check() is called before each provider
 *   call. Budget-rejected calls are recorded in executionRecords with
 *   budgetRejected=true and do NOT appear in DiscoveryRunSummary.providerFailures.
 *
 * Non-retryable error kinds (never advance to fallback):
 *   auth_error, quota_exceeded, provider_disabled, provider_unconfigured
 *
 * No hardcoded BB&B values. No live API calls. Deterministic.
 */

import type { SearchDataProvider, RawKeywordResult } from "./discovery-providers";
import type { ProviderSource } from "./discovery-types";
import type { ProviderCapabilitySet } from "./discovery-capability";
import type { BudgetGuard } from "./discovery-budget-guard";
import { DataForSEOError } from "./dataforseo-config";
import { mergeKeywordResults } from "./discovery-merger";

// ── Orchestration mode ────────────────────────────────────────────────────────

export type OrchestrationMode = "primary_only" | "fallback" | "merge";

// ── Retry classification ──────────────────────────────────────────────────────

/**
 * DataForSEOError kinds that must NOT trigger fallback to the next provider.
 * These represent deterministic failures where no downstream provider will help:
 *   auth_error:            Credentials invalid — applies to all providers.
 *   quota_exceeded:        Account exhausted — trying a secondary costs money.
 *   provider_disabled:     Feature flag off — operator decision, not transient.
 *   provider_unconfigured: No credentials — no provider will succeed.
 *
 * Note: budget_rejected is NOT in this set — it is handled before this classification.
 */
const NON_RETRYABLE_KINDS = new Set([
  "auth_error",
  "quota_exceeded",
  "provider_disabled",
  "provider_unconfigured",
]);

/**
 * Returns true when the error is transient and fallback to another provider
 * might succeed. Returns false for deterministic failures.
 * Unknown (non-DataForSEOError) failures are treated as retryable.
 */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof DataForSEOError) {
    return !NON_RETRYABLE_KINDS.has(err.kind);
  }
  return true; // unknown errors: fail safely by allowing fallback
}

// ── Execution record ──────────────────────────────────────────────────────────

/** Per-provider record written after each fetchKeywords call. */
export interface ProviderExecutionRecord {
  provider:       ProviderSource;
  mode:           OrchestrationMode;
  success:        boolean;
  retryCount:     number;
  /** null on success. */
  errorKind:      string | null;
  /** true when the budget guard blocked this call — no fetch was made. */
  budgetRejected: boolean;
  durationMs:     number;
}

// ── Provider entry ────────────────────────────────────────────────────────────

export interface OrchestrationProviderEntry {
  provider:     SearchDataProvider;
  capabilities: ProviderCapabilitySet;
  /**
   * Lower number = higher priority = runs first.
   * Two entries with equal priority: stable insertion order is preserved.
   */
  priority: number;
}

// ── Orchestrator config ───────────────────────────────────────────────────────

export interface SearchOrchestratorConfig {
  mode:      OrchestrationMode;
  /**
   * One or more provider entries. Must not be empty.
   * Will be sorted by priority ascending before execution.
   */
  providers: OrchestrationProviderEntry[];
  /**
   * Optional budget guard. Checked before each provider call.
   * undefined = no budget enforcement.
   */
  budgetGuard?: BudgetGuard;
}

// ── SearchOrchestrator ────────────────────────────────────────────────────────

/**
 * Multi-provider SearchDataProvider.
 *
 * Inject into DiscoveryProviderSet.search in place of a bare adapter.
 * The pipeline is unaware of orchestration — it sees one SearchDataProvider.
 */
export class SearchOrchestrator implements SearchDataProvider {
  /**
   * Reports the primary (highest-priority) provider's name.
   * Appears in DiscoveryRunSummary.providersAttempted.
   */
  readonly name: ProviderSource;

  private readonly sorted:   OrchestrationProviderEntry[];
  private readonly _records: ProviderExecutionRecord[] = [];

  constructor(private readonly config: SearchOrchestratorConfig) {
    // Sort ascending: lower priority number = runs first
    this.sorted = [...config.providers].sort((a, b) => a.priority - b.priority);
    this.name   = this.sorted[0]?.provider.name ?? "dataforseo";
  }

  /** Retrieve execution records after the run completes. Useful for diagnostics. */
  getExecutionRecords(): readonly ProviderExecutionRecord[] {
    return this._records;
  }

  // ── SearchDataProvider interface ───────────────────────────────────────────

  async fetchKeywords(
    input: {
      seeds:    string[];
      city:     string;
      state:    string;
      industry: string;
      limit:    number;
    },
  ): Promise<RawKeywordResult[]> {
    switch (this.config.mode) {
      case "primary_only": return this._primaryOnly(input);
      case "fallback":     return this._fallback(input);
      case "merge":        return this._merge(input);
    }
  }

  async fetchCompetitorKeywords(input: {
    competitorDomain: string;
    clientDomain:     string;
    location:         string;
  }): Promise<RawKeywordResult[]> {
    // Stage 5 not active in Phase C5 — delegate to primary provider
    const primary = this.sorted[0]?.provider;
    if (!primary) return [];
    return primary.fetchCompetitorKeywords(input);
  }

  // ── Mode implementations ───────────────────────────────────────────────────

  private async _primaryOnly(
    input: Parameters<SearchDataProvider["fetchKeywords"]>[0],
  ): Promise<RawKeywordResult[]> {
    const entry = this.sorted[0];
    if (!entry) return [];

    // Budget check
    const budgetGuard = this.config.budgetGuard;
    if (budgetGuard) {
      const check = budgetGuard.check(0, input.seeds.length);
      if (!check.allowed) {
        this._records.push({
          provider: entry.provider.name, mode: "primary_only",
          success: false, retryCount: 0,
          errorKind: check.reason ?? "budget_rejected",
          budgetRejected: true, durationMs: 0,
        });
        return [];
      }
    }

    const start = Date.now();
    try {
      const results = await entry.provider.fetchKeywords(input);
      this._records.push({
        provider: entry.provider.name, mode: "primary_only",
        success: true, retryCount: 0, errorKind: null,
        budgetRejected: false, durationMs: Date.now() - start,
      });
      return results;
    } catch (err) {
      this._records.push({
        provider: entry.provider.name, mode: "primary_only",
        success: false, retryCount: 0,
        errorKind: err instanceof DataForSEOError ? err.kind : "unknown",
        budgetRejected: false, durationMs: Date.now() - start,
      });
      throw err;
    }
  }

  private async _fallback(
    input: Parameters<SearchDataProvider["fetchKeywords"]>[0],
  ): Promise<RawKeywordResult[]> {
    for (const entry of this.sorted) {
      const budgetGuard = this.config.budgetGuard;
      if (budgetGuard) {
        const check = budgetGuard.check(0, input.seeds.length);
        if (!check.allowed) {
          this._records.push({
            provider: entry.provider.name, mode: "fallback",
            success: false, retryCount: 0,
            errorKind: check.reason ?? "budget_rejected",
            budgetRejected: true, durationMs: 0,
          });
          continue;
        }
      }

      const start = Date.now();
      try {
        const results = await entry.provider.fetchKeywords(input);
        this._records.push({
          provider: entry.provider.name, mode: "fallback",
          success: true, retryCount: 0, errorKind: null,
          budgetRejected: false, durationMs: Date.now() - start,
        });
        return results; // First success wins — stop the fallback chain
      } catch (err) {
        const errorKind = err instanceof DataForSEOError ? err.kind : "unknown";
        this._records.push({
          provider: entry.provider.name, mode: "fallback",
          success: false, retryCount: 0, errorKind,
          budgetRejected: false, durationMs: Date.now() - start,
        });

        if (!isRetryableError(err)) {
          throw err; // Non-retryable: stop chain, propagate error
        }
        console.warn(
          `[orchestrator:fallback] ${entry.provider.name} failed (retryable): ${String(err)}`
        );
        // Retryable: continue to next provider
      }
    }
    return []; // All providers failed with retryable errors
  }

  private async _merge(
    input: Parameters<SearchDataProvider["fetchKeywords"]>[0],
  ): Promise<RawKeywordResult[]> {
    const allSets: RawKeywordResult[][] = [];

    // Sequential for determinism — output order must not depend on network timing
    for (const entry of this.sorted) {
      const budgetGuard = this.config.budgetGuard;
      if (budgetGuard) {
        const check = budgetGuard.check(0, input.seeds.length);
        if (!check.allowed) {
          this._records.push({
            provider: entry.provider.name, mode: "merge",
            success: false, retryCount: 0,
            errorKind: check.reason ?? "budget_rejected",
            budgetRejected: true, durationMs: 0,
          });
          allSets.push([]);
          continue;
        }
      }

      const start = Date.now();
      try {
        const results = await entry.provider.fetchKeywords(input);
        this._records.push({
          provider: entry.provider.name, mode: "merge",
          success: true, retryCount: 0, errorKind: null,
          budgetRejected: false, durationMs: Date.now() - start,
        });
        allSets.push(results);
      } catch (err) {
        const errorKind = err instanceof DataForSEOError ? err.kind : "unknown";
        this._records.push({
          provider: entry.provider.name, mode: "merge",
          success: false, retryCount: 0, errorKind,
          budgetRejected: false, durationMs: Date.now() - start,
        });
        console.warn(`[orchestrator:merge] ${entry.provider.name} failed: ${String(err)}`);
        allSets.push([]); // failed provider contributes nothing — merge continues
      }
    }

    return mergeKeywordResults(allSets);
  }
}

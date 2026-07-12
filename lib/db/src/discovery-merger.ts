/**
 * Phase C5 — Signal Merger
 *
 * Merges DiscoverySignal arrays from multiple providers into a single
 * deduplicated canonical list, and merges raw keyword results before
 * normalization.
 *
 * Merge contract:
 *   - Deterministic: output order does not depend on async resolution order.
 *     All sets are processed sequentially in the order supplied by the caller.
 *   - Tenant-scoped: signals with different clientIds never merge.
 *     The deduplication key embeds clientId, so cross-client signals
 *     produce distinct groups naturally.
 *   - Deduplication key: (clientId × normalizedValue) for signals,
 *     keyword.toLowerCase() for raw keyword results.
 *   - Winner selection:
 *       1. Prefer higher evidenceStrength (real SERP > gpt_simulated).
 *       2. On equal strength, prefer non-null volumeEstimate over null.
 *       3. On full tie, keep first occurrence (stable insertion order).
 *   - Provenance: the winning signal's rawProviderData gains a
 *     _mergedFromProviders string[] listing all sources that found this keyword.
 *   - Evidence inflation prevention:
 *       evidenceStrength is taken from the single strongest signal.
 *       It is NEVER averaged, summed, or boosted because N providers confirmed
 *       the same keyword. Confirmation does not increase strength.
 *
 * No Math.random(). No hardcoded BB&B values. No live API calls.
 */

import type { DiscoverySignal } from "./discovery-types";

// ── Signal merger ──────────────────────────────────────────────────────────────

/** Deduplication key for a signal: tenant × normalized topic. */
function signalKey(s: DiscoverySignal): string {
  return `${s.clientId}|${s.normalizedValue}`;
}

/**
 * Merge canonical DiscoverySignal arrays from multiple providers.
 *
 * Algorithm:
 *   1. Flatten all input arrays.
 *   2. Group by deduplication key (clientId × normalizedValue).
 *   3. For each group select the strongest signal (see contract above).
 *   4. Annotate the winner with _mergedFromProviders provenance array.
 *   5. Return in deterministic insertion-order (Map preserves first-seen order).
 *
 * @param signalSets  One array per provider. Order determines tie-breaking.
 *                    First set gets priority on equal-strength ties.
 */
export function mergeSignals(signalSets: DiscoverySignal[][]): DiscoverySignal[] {
  const winners   = new Map<string, DiscoverySignal>();
  const provenance = new Map<string, Set<string>>();

  for (const signals of signalSets) {
    for (const signal of signals) {
      const key     = signalKey(signal);
      const sources = provenance.get(key) ?? new Set<string>();
      sources.add(String(signal.source));
      provenance.set(key, sources);

      const existing = winners.get(key);
      if (!existing) {
        winners.set(key, signal);
        continue;
      }

      // Prefer higher evidenceStrength
      if (signal.evidenceStrength > existing.evidenceStrength) {
        winners.set(key, signal);
        continue;
      }

      // On equal strength: prefer non-null volume
      if (
        signal.evidenceStrength === existing.evidenceStrength &&
        signal.volumeEstimate !== null &&
        existing.volumeEstimate === null
      ) {
        winners.set(key, signal);
      }
      // else: keep first (stable tie-break)
    }
  }

  // Annotate winners with provenance and return in stable insertion order
  const results: DiscoverySignal[] = [];
  for (const [key, signal] of winners) {
    const sources     = provenance.get(key) ?? new Set([String(signal.source)]);
    const sourceArray = [...sources].sort(); // deterministic alphabetic order

    results.push({
      ...signal,
      rawProviderData: {
        ...signal.rawProviderData,
        _mergedFromProviders: sourceArray,
      },
    });
  }

  return results;
}

// ── Raw keyword result merger ─────────────────────────────────────────────────

/**
 * Merge raw keyword result arrays from multiple providers before normalization.
 * Used by the orchestrator in merge mode.
 *
 * Deduplication key: keyword.toLowerCase().
 * Winner selection: prefer non-null volumeMonthly; on tie keep first occurrence.
 *
 * @param sets  One array per provider. Deterministic: first set wins on full tie.
 */
export function mergeKeywordResults<T extends { keyword: string; volumeMonthly: number | null }>(
  sets: T[][],
): T[] {
  const winners = new Map<string, T>();

  for (const results of sets) {
    for (const result of results) {
      const key      = result.keyword.toLowerCase();
      const existing = winners.get(key);

      if (!existing) {
        winners.set(key, result);
        continue;
      }

      // Prefer non-null volume
      if (result.volumeMonthly !== null && existing.volumeMonthly === null) {
        winners.set(key, result);
      }
      // else: keep first (stable tie-break)
    }
  }

  return [...winners.values()];
}

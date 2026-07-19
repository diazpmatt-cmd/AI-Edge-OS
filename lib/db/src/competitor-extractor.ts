/**
 * Competitor Extractor
 *
 * Pure functions that extract NormalizedCompetitor entities from raw
 * discovery_signals rows. Zero API calls, zero DB calls — fully testable.
 *
 * Design:
 * - Competitors currently live as ephemeral SERP signals in raw_provider_data.
 * - This module promotes them to first-class entities without touching the
 *   existing discovery pipeline.
 * - The extractor is the ONLY place that knows how to read competitor data
 *   from raw_provider_data. The repository and routes must not parse signals.
 */

import type { NormalizedCompetitor, DiscoverySource } from "./competitor-types";

// ── Signal row shape (subset used by extractor) ───────────────────────────────

export interface SignalRow {
  clientId:        string;
  snapshotId:      string;
  normalizedValue: string;    // keyword
  signalType:      string;
  competitorRank:  number | null;
  rawProviderData: Record<string, unknown>;
}

// ── Domain normalization ───────────────────────────────────────────────────────

/**
 * Normalize a raw domain string to bare lowercase form.
 * "https://www.Arrow-Ext.com/pest-control" → "arrow-ext.com"
 */
export function normalizeDomain(raw: string): string {
  try {
    const url = raw.startsWith("http") ? new URL(raw) : new URL("https://" + raw);
    return url.hostname.replace(/^www\./, "").toLowerCase().trim();
  } catch {
    return raw.toLowerCase().replace(/^www\./, "").trim();
  }
}

/**
 * Extract a clean business name from a raw SERP page title.
 * "Arrow Exterminators | Pest Control Services in Alabama" → "Arrow Exterminators"
 * "Bed Bug Experts - Local Treatment"                      → "Bed Bug Experts"
 */
export function extractBusinessName(title: string | null | undefined): string | null {
  if (!title) return null;
  const cleaned = title.split(/\s+[|–—\-]\s+/)[0]?.trim();
  return cleaned || null;
}

// ── Per-signal competitor extraction ─────────────────────────────────────────

/**
 * Extract zero or one NormalizedCompetitor from a single discovery_signal row.
 *
 * Returns null when the signal has no usable competitor domain.
 * The returned entity has confidenceScore=10 (SERP signal only — minimal info).
 */
export function extractCompetitorFromSignal(
  signal: SignalRow,
): NormalizedCompetitor | null {
  const raw = signal.rawProviderData;

  // Priority 1: topCompetitorDomain (set by dataforseo-adapter for top organic result)
  let domain: string | null = null;
  if (typeof raw["topCompetitorDomain"] === "string" && raw["topCompetitorDomain"]) {
    domain = normalizeDomain(raw["topCompetitorDomain"] as string);
  }

  // Priority 2: competitorDomains[0] (array set by extractCompetitorDomains())
  if (!domain) {
    const domains = raw["competitorDomains"];
    if (Array.isArray(domains) && domains.length > 0 && typeof domains[0] === "string") {
      domain = normalizeDomain(domains[0] as string);
    }
  }

  if (!domain) return null;

  // Derive business name from topCompetitorTitle or pre-extracted competitorName
  const rawName =
    (typeof raw["competitorName"] === "string" ? raw["competitorName"] : null) ??
    (typeof raw["topCompetitorTitle"] === "string" ? raw["topCompetitorTitle"] : null);
  const businessName = extractBusinessName(rawName);

  // Derive website from topCompetitorDomain
  const website = typeof raw["topCompetitorDomain"] === "string" && raw["topCompetitorDomain"]
    ? `https://${domain}`
    : null;

  // Rank from the signal itself or from raw data
  const topKeywordRank =
    signal.competitorRank ??
    (typeof raw["topCompetitorRank"] === "number" ? (raw["topCompetitorRank"] as number) : null);

  return {
    clientId:           signal.clientId,
    domain,
    businessName:       businessName ?? null,
    website:            website ?? null,
    topKeywordRank:     topKeywordRank ?? null,
    lastSeenRank:       topKeywordRank ?? null,
    keywordGapCount:    1,
    discoverySource:    "serp_organic" as DiscoverySource,
    discoveredProvider: "dataforseo_serp",
    providerMetadata:   {
      snapshotId:       signal.snapshotId,
      keyword:          signal.normalizedValue,
      signalType:       signal.signalType,
    },
    confidenceScore:    10,
    canonicalStatus:    "active",
  };
}

// ── Batch extraction + deduplication ─────────────────────────────────────────

/**
 * Extract and deduplicate NormalizedCompetitor entities from a batch of signals.
 *
 * Deduplication rules:
 * - One entity per domain (case-insensitive, www-stripped).
 * - keywordGapCount = number of signals that cited this domain.
 * - topKeywordRank = MIN (best) rank seen across all signals.
 * - businessName: last non-null value wins (signals are processed in order).
 * - website: last non-null value wins.
 *
 * @param signals  Array of signal rows, typically from one discovery snapshot.
 * @returns        Deduplicated array — one entry per unique (clientId, domain).
 */
export function extractCompetitorsFromSignals(
  signals: SignalRow[],
): NormalizedCompetitor[] {
  const map = new Map<string, NormalizedCompetitor>();

  for (const signal of signals) {
    const entity = extractCompetitorFromSignal(signal);
    if (!entity) continue;

    const key = `${entity.clientId}::${entity.domain}`;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, { ...entity });
    } else {
      // Merge: accumulate gap count, take best (lowest) rank, keep best name
      map.set(key, {
        ...existing,
        keywordGapCount: (existing.keywordGapCount ?? 0) + 1,
        topKeywordRank: mergeRank(existing.topKeywordRank, entity.topKeywordRank),
        lastSeenRank:   entity.lastSeenRank ?? existing.lastSeenRank,
        businessName:   entity.businessName ?? existing.businessName,
        website:        entity.website ?? existing.website,
      });
    }
  }

  return Array.from(map.values());
}

/** Returns the lower (better) rank, treating null as absent. */
function mergeRank(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null && b == null) return null;
  if (a == null) return b ?? null;
  if (b == null) return a;
  return Math.min(a, b);
}

// ── Threat level derivation ────────────────────────────────────────────────────

/**
 * Derive a threat level from the metrics available on a normalized entity.
 *
 * Heuristic (can be overridden by any scoring engine in Phase 6):
 *   critical  → rank 1–3 AND gap_count ≥ 3
 *   high      → rank 1–10 OR gap_count ≥ 5
 *   medium    → rank 11–20 OR gap_count ≥ 2
 *   low       → everything else
 */
export function deriveThreatLevel(
  topKeywordRank: number | null | undefined,
  keywordGapCount: number,
): "low" | "medium" | "high" | "critical" {
  const rank = topKeywordRank ?? 999;
  if (rank <= 3 && keywordGapCount >= 3) return "critical";
  if (rank <= 10 || keywordGapCount >= 5) return "high";
  if (rank <= 20 || keywordGapCount >= 2) return "medium";
  return "low";
}

/**
 * Derive an opportunity score (0–100) from available metrics.
 * Higher = the gap is more actionable for the client.
 *
 * Formula: weighted combination of rank gap (how dominant the competitor is)
 * and gap count (how many keywords they beat us on).
 */
export function deriveOpportunityScore(
  topKeywordRank: number | null | undefined,
  keywordGapCount: number,
): number {
  const rank = topKeywordRank ?? 999;
  // Rank component: rank 1 → 100pts, rank 10 → 50pts, rank 20+ → 0pts
  const rankScore = Math.max(0, Math.min(100, Math.round(100 - (rank - 1) * 5)));
  // Gap count component: 1 gap → 10pts, 10 gaps → 100pts
  const gapScore  = Math.min(100, keywordGapCount * 10);
  return Math.round(rankScore * 0.6 + gapScore * 0.4);
}

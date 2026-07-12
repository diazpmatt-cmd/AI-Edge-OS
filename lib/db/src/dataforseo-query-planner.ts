/**
 * Phase C4 — DataForSEO Query Planner
 *
 * Deterministic, bounded query planning for the DataForSEO adapter.
 *
 * Rules:
 *   - NO AI, no randomness, no dynamic query generation.
 *   - ALL blocked/educational-only services are excluded from SERP queries.
 *   - Hard caps on query count protect cost and rate limits.
 *   - Same input always produces the same plan (deterministic).
 *   - No queries are generated for: termite, wildlife, heat treatment, or any
 *     service with generationAllowed=false.
 *
 * Query templates (for C4):
 *   "{service} {city}"          — local intent, geo-modified (primary)
 *   "{service} {state}"         — regional intent
 *   "{service} cost {city}"     — commercial intent
 *   "{service}"                 — bare service name (national fallback)
 *
 * For BB&B:
 *   - No termite queries (coming_soon, generationAllowed=false)
 *   - No wildlife removal queries (disabled, generationAllowed=false)
 *   - Fumigation queries permitted but flagged as "educational_only" in the plan
 *   - No whole-home heat treatment queries
 */

import type { DiscoveryContext } from "./discovery-context";
import type { DataForSEOConfig } from "./dataforseo-config";
import {
  TOPIC_COMING_SOON_KEYWORDS,
  TOPIC_DISABLED_KEYWORDS,
  TOPIC_NOT_GENERATABLE_KEYWORDS,
} from "./bbb-services";

// ── Query plan types ──────────────────────────────────────────────────────────

export type QueryCategory = "local" | "commercial" | "informational" | "regional";

export interface PlannedSerpQuery {
  /** The exact keyword string to submit to DataForSEO SERP API. */
  keyword: string;
  /**
   * DataForSEO location_name format: "City,State,United States"
   * e.g. "Foley,Alabama,United States"
   */
  locationName: string;
  /** Inferred intent category for this query. */
  category: QueryCategory;
  /** ServiceId from the registry, or null for general/industry queries. */
  serviceId: string | null;
  /**
   * True when the service is restricted to educational content only.
   * These queries still run but opportunities are gated to educational angles.
   * Example: fumigation queries for BB&B.
   */
  educationalOnly: boolean;
}

export interface PlannedVolumeKeyword {
  /** Keyword string to include in the volume batch call. */
  keyword: string;
  serviceId: string | null;
}

/**
 * Complete query plan for one discovery run.
 * Produced by buildDataForSEOQueryPlan().
 *
 * serpQueries:        Ordered list of SERP calls to make (already capped).
 * volumeKeywords:     All keywords to include in the keyword volume batch call.
 * estimatedApiCalls:  Total API calls = 1 (volume batch) + serpQueries.length.
 *                     0 if no queries survived filtering.
 * estimatedCostUSD:   Estimated cost per run at DataForSEO 2026 pricing.
 * blockedQueries:     Queries that were excluded — logged for auditability.
 */
export interface DataForSEOQueryPlan {
  serpQueries:       PlannedSerpQuery[];
  volumeKeywords:    PlannedVolumeKeyword[];
  estimatedApiCalls: number;
  estimatedCostUSD:  number;
  blockedQueries:    string[];
}

// ── Hard-coded blocked keyword fragments ─────────────────────────────────────

/**
 * Normalized keyword fragments that MUST be excluded from all SERP queries.
 * These supplement the service-registry blocks for defense-in-depth.
 *
 * Kept as a constant — not configurable at runtime — to match the same
 * safety approach as TOPIC_COMING_SOON_KEYWORDS and TOPIC_DISABLED_KEYWORDS.
 */
const BLOCKED_QUERY_FRAGMENTS: readonly string[] = [
  ...TOPIC_COMING_SOON_KEYWORDS,
  ...TOPIC_DISABLED_KEYWORDS,
  ...TOPIC_NOT_GENERATABLE_KEYWORDS,
  "whole-home heat",
  "diy fumigation",
];

/** Fragments that allow queries but flag them as educational-only. */
const EDUCATIONAL_ONLY_FRAGMENTS: readonly string[] = [
  "fumigation",
];

// ── Location name builder ──────────────────────────────────────────────────────

/**
 * Build a DataForSEO location_name string.
 * Format: "City,State,United States" or "State,United States".
 * DataForSEO requires exact location names from their locations list.
 * This function produces well-formed US location strings.
 */
export function buildLocationName(city: string, state: string): string {
  const cleanCity  = city.trim();
  const cleanState = state.trim();
  if (!cleanCity && !cleanState) return "United States";
  if (!cleanCity) return `${cleanState},United States`;
  return `${cleanCity},${cleanState},United States`;
}

// ── Query fragment safety checks ──────────────────────────────────────────────

/**
 * Returns true if the keyword contains any blocked fragment.
 * Check is case-insensitive and uses substring matching.
 */
export function isQueryBlocked(keyword: string): boolean {
  const kw = keyword.toLowerCase();
  return BLOCKED_QUERY_FRAGMENTS.some(frag => kw.includes(frag.toLowerCase()));
}

/**
 * Returns true if the keyword is restricted to educational content.
 * These queries proceed but opportunities are limited to educational angles.
 */
export function isQueryEducationalOnly(keyword: string): boolean {
  const kw = keyword.toLowerCase();
  return EDUCATIONAL_ONLY_FRAGMENTS.some(frag => kw.includes(frag.toLowerCase()));
}

/**
 * Infer query category from keyword text.
 * Deterministic — same keyword always maps to the same category.
 */
export function inferQueryCategory(keyword: string): QueryCategory {
  const kw = keyword.toLowerCase();
  if (kw.includes("cost") || kw.includes("price") || kw.includes("how much") || kw.includes("fee")) {
    return "commercial";
  }
  if (kw.includes("how") || kw.includes("what") || kw.includes("why") || kw.includes("does")) {
    return "informational";
  }
  // If it ends with a state name alone (no city), call it regional
  const statePattern = /,\s*[a-z]{2}\s*$/;
  if (statePattern.test(kw)) return "regional";
  return "local";
}

// ── Query plan builder ─────────────────────────────────────────────────────────

/**
 * Build a deterministic, bounded query plan from a DiscoveryContext.
 *
 * Query generation rules:
 *   1. For each active/generatable service (up to 5 services):
 *      a. "{service} {city}"       — local intent
 *      b. "{service} cost {city}"  — commercial intent (max 1 per service)
 *   2. Deduplicate by keyword string (case-insensitive).
 *   3. Filter out blocked queries.
 *   4. Cap at config.maxQueriesPerRun SERP queries.
 *
 * Volume keywords:
 *   - All generated keywords (before capping SERP queries).
 *   - Plus the bare service names (for broader volume context).
 *   - Cap at 50 (well within DataForSEO's 700/batch limit).
 *
 * @param context  DiscoveryContext for this client and week.
 * @param config   DataForSEO adapter configuration (determines hard caps).
 * @returns        Complete query plan ready for the adapter to execute.
 */
export function buildDataForSEOQueryPlan(
  context: DiscoveryContext,
  config: Pick<DataForSEOConfig, "maxQueriesPerRun">,
): DataForSEOQueryPlan {
  const city  = context.location.city;
  const state = context.location.state;
  const locationName = buildLocationName(city, state);

  // Take up to 5 generatable services (sorted by priority ascending = highest priority first)
  const services = context.discoveryServices.slice(0, 5);

  const blocked:   string[]              = [];
  const candidates: PlannedSerpQuery[]  = [];
  const volumeSet:  Set<string>         = new Set();

  for (const svc of services) {
    const displayName = svc.displayName;

    // Always add the bare service name to the volume batch
    volumeSet.add(displayName);

    // Build query variants for this service
    const variants: Array<{ kw: string; category: QueryCategory }> = [];

    // Primary: geo-modified local query
    if (city) variants.push({ kw: `${displayName} ${city}`, category: "local" });

    // Commercial: cost query
    if (city) variants.push({ kw: `${displayName} cost ${city}`, category: "commercial" });

    // Regional: state-level fallback (only if no city)
    if (!city && state) variants.push({ kw: `${displayName} ${state}`, category: "regional" });

    // Bare name: national fallback (always add to volume, only to SERP if no city/state)
    if (!city && !state) variants.push({ kw: displayName, category: "local" });

    for (const { kw, category } of variants) {
      const kwLower = kw.toLowerCase();

      // Defense-in-depth: apply service-level blocks first
      if (!svc.generationAllowed) {
        blocked.push(kw);
        continue;
      }

      // Apply keyword-fragment safety check
      if (isQueryBlocked(kwLower)) {
        blocked.push(kw);
        continue;
      }

      volumeSet.add(kw);

      candidates.push({
        keyword:        kw,
        locationName,
        category,
        serviceId:      svc.serviceId,
        educationalOnly: isQueryEducationalOnly(kwLower),
      });
    }
  }

  // Deduplicate candidates by keyword (case-insensitive)
  const seen = new Set<string>();
  const deduped: PlannedSerpQuery[] = [];
  for (const q of candidates) {
    const key = q.keyword.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(q);
    }
  }

  // Apply SERP cap
  const serpQueries = deduped.slice(0, config.maxQueriesPerRun);

  // Volume keywords: all deduplicated keywords (capped at 50 for safety)
  const volumeKeywords: PlannedVolumeKeyword[] = [...volumeSet]
    .slice(0, 50)
    .map(kw => ({
      keyword:   kw,
      serviceId: services.find(s =>
        kw.toLowerCase().includes(s.displayName.toLowerCase())
      )?.serviceId ?? null,
    }));

  // Compute estimated cost
  // 1 volume batch call + N SERP calls
  const volumeBatches = volumeKeywords.length > 0 ? 1 : 0;
  const serpCallCount = serpQueries.length;
  const estimatedApiCalls = volumeBatches + serpCallCount;

  // DataForSEO pricing: ~$0.0005 per keyword (volume), ~$0.002 per SERP task
  const estimatedCostUSD =
    (volumeKeywords.length * 0.0005) + (serpCallCount * 0.002);

  return {
    serpQueries,
    volumeKeywords,
    estimatedApiCalls,
    estimatedCostUSD: Math.round(estimatedCostUSD * 100000) / 100000,
    blockedQueries: blocked,
  };
}

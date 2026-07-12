/**
 * Phase C2 — Registry Gate + Seasonality Evaluator
 *
 * registryGate(): pure function. Validates whether a discovered signal topic
 * is eligible for content generation before it becomes an opportunity.
 * Executes as Stage 8 of the discovery pipeline.
 *
 * evaluateSeasonality(): pure function. Computes how seasonally relevant a
 * service is RIGHT NOW given the current month (1–12).
 * Seeds from BBBService.seasonality string — no external API call.
 *
 * CRITICAL RULES:
 *   - No signal becomes a DiscoveryOpportunity without passing the registry gate.
 *   - No opportunity is created for a service where generationAllowed=false.
 *   - Gate runs before scoring — suppressed signals never reach OpportunityScorer.
 *   - "unknown" signals (no registry match) pass through by design:
 *     they represent general industry topics valid for discovery.
 */

import type { BBBService } from "./bbb-services";
import type { ServiceRegistryProvider } from "./client-context";
import type { RegistryGateResult } from "./discovery-types";

// ── Month name lookup (for seasonality parser) ─────────────────────────────────

const MONTH_NAMES: Record<string, number> = {
  january: 1,  february: 2,  march: 3,     april: 4,
  may: 5,      june: 6,      july: 7,      august: 8,
  september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7,
  aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function parseMonthName(token: string): number | null {
  return MONTH_NAMES[token.toLowerCase().trim()] ?? null;
}

/**
 * Extract a contiguous (or year-wrapping) month range from a "Month–Month" string.
 * Returns month integers in range order. Handles year-wrap: October–February → [10,11,12,1,2].
 */
function extractMonthRange(rangeStr: string): number[] {
  const parts = rangeStr.split(/[–\-–]/);
  if (parts.length < 2) return [];
  const start = parseMonthName(parts[0].trim());
  const end   = parseMonthName(parts[parts.length - 1].trim());
  if (!start || !end) return [];
  if (start <= end) {
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }
  // Year-wrap: e.g., October–February
  const months: number[] = [];
  for (let m = start; m <= 12; m++) months.push(m);
  for (let m = 1; m <= end; m++) months.push(m);
  return months;
}

// ── Seasonality evaluator ──────────────────────────────────────────────────────

/**
 * Compute how seasonally relevant a service is RIGHT NOW (0–100).
 *
 * Score tiers:
 *   100 — current month is in the explicit peak range
 *    80 — service has no seasonality data (year-round high base)
 *    80 — seasonality string contains "year-round"
 *    60 — current month is in the active/shoulder range (but not peak)
 *    20 — current month is outside the active range (off-season)
 *
 * Seeds exclusively from BBBService.seasonality — no external API call.
 * Deterministic for a given (service, month) pair.
 *
 * Supported seasonality string formats:
 *   null → year-round → 80
 *   "Peak April–October on the Gulf Coast of Alabama"
 *   "Active March–November; peak summer"
 *   "Fall/winter uptick (October–February); year-round in coastal areas"
 */
export function evaluateSeasonality(service: BBBService, currentMonth: number): number {
  if (!service.seasonality) return 80;

  const raw = service.seasonality.toLowerCase();
  if (raw.includes("year-round")) return 80;

  // Extract explicit peak range: "peak April–October"
  const peakMatch = raw.match(/peak\s+([a-z]+)\s*[–\-–]\s*([a-z]+)/);
  const peakMonths: number[] = peakMatch
    ? extractMonthRange(`${peakMatch[1]}-${peakMatch[2]}`)
    : [];

  // Extract active range: "active March–November"
  const activeMatch = raw.match(/active\s+([a-z]+)\s*[–\-–]\s*([a-z]+)/);
  // Or parenthesized range: "(October–February)"
  const parenMatch  = raw.match(/\(([a-z]+)\s*[–\-–]\s*([a-z]+)\)/);

  const activeMonths: number[] = [];
  if (activeMatch) {
    activeMonths.push(...extractMonthRange(`${activeMatch[1]}-${activeMatch[2]}`));
  } else if (parenMatch) {
    activeMonths.push(...extractMonthRange(`${parenMatch[1]}-${parenMatch[2]}`));
  }
  if (peakMonths.length > 0 && activeMonths.length === 0) {
    activeMonths.push(...peakMonths);
  }

  if (peakMonths.includes(currentMonth))   return 100;
  if (activeMonths.includes(currentMonth)) return 60;
  if (activeMonths.length === 0)           return 80; // couldn't parse — treat year-round
  return 20; // off-season
}

// ── Content angle sets ─────────────────────────────────────────────────────────

/** Angles that indicate transactional / commercial content capability. */
const PROMOTIONAL_ANGLES = new Set(["promotional", "emergency"]);

/**
 * Provider source types that represent real (non-simulated) SERP data.
 * Used for confidence scoring.
 */
export const REAL_SERP_SOURCES = new Set(["dataforseo", "serp_api"]);

// ── Registry gate ──────────────────────────────────────────────────────────────

/**
 * Evaluate whether a discovered signal topic is eligible for content generation.
 *
 * MUST run before any signal becomes a DiscoveryOpportunity (Stage 8).
 * The result carries content constraints (prohibitedClaims, allowedAngles)
 * that the Content Engine must respect at AI prompt time.
 *
 * Evaluation order:
 *   1. Malformed/empty topic                         → "unsupported"
 *   2. registry.validateTopic() returns error code   → "blocked"
 *   3. registry.matchByTopic() finds no service      → "unknown" (pass-through)
 *   4. Service has generationAllowed=false            → "blocked"
 *   5. Service allows only non-promotional angles     → "educational_only"
 *   6. All checks pass                               → "allowed"
 *
 * "unknown" signals pass through — they represent general industry topics not
 * mapped to a specific service record, and are valid discovery signals.
 *
 * prohibitedClaims are always carried in the result for "allowed" and
 * "educational_only" statuses so the Content Engine can enforce them at
 * prompt time without a second registry lookup.
 */
export function registryGate(
  topic: string | null | undefined,
  registry: ServiceRegistryProvider,
): RegistryGateResult {
  // 1. Malformed / empty topic
  if (!topic || topic.trim() === "") {
    return {
      status:          "unsupported",
      reason:          "empty_signal_topic",
      serviceId:       null,
      displayName:     null,
      prohibitedClaims: [],
      allowedAngles:   [],
    };
  }

  const trimmed = topic.trim();

  // 2. Structured validation: catches coming_soon, disabled, not_generatable
  const validationError = registry.validateTopic(trimmed);
  if (validationError) {
    return {
      status:          "blocked",
      reason:          validationError,
      serviceId:       null,
      displayName:     null,
      prohibitedClaims: [],
      allowedAngles:   [],
    };
  }

  // 3. Match to a service record
  const service = registry.matchByTopic(trimmed);
  if (!service) {
    return {
      status:          "unknown",
      reason:          "no_registry_match",
      serviceId:       null,
      displayName:     null,
      prohibitedClaims: [],
      allowedAngles:   [],
    };
  }

  // 4. Hard gate on generationAllowed
  if (!service.generationAllowed) {
    return {
      status:          "blocked",
      reason:          "SERVICE_NOT_GENERATABLE",
      serviceId:       service.serviceId,
      displayName:     service.displayName,
      prohibitedClaims: [],
      allowedAngles:   [],
    };
  }

  const angles = service.allowedContentAngles ?? [];

  // 5. Educational-only: service allows generation but has no promotional/transactional angles
  const hasPromotionalAngle = angles.some(a => PROMOTIONAL_ANGLES.has(a));
  if (!hasPromotionalAngle && angles.length > 0) {
    return {
      status:          "educational_only",
      reason:          "content_restricted_to_educational_angles",
      serviceId:       service.serviceId,
      displayName:     service.displayName,
      prohibitedClaims: [...(service.prohibitedClaims ?? [])],
      allowedAngles:   [...angles],
    };
  }

  // 6. Fully allowed — carry prohibitedClaims for Content Engine enforcement
  return {
    status:          "allowed",
    reason:          "ok",
    serviceId:       service.serviceId,
    displayName:     service.displayName,
    prohibitedClaims: [...(service.prohibitedClaims ?? [])],
    allowedAngles:   [...angles],
  };
}

export type { RegistryGateResult };

/**
 * Phase C2 — DiscoveryContext Builder
 *
 * Pure function. No IO. No external API calls. Deterministic.
 *
 * Builds a DiscoveryContext from a ClientContentContext + client identity + clock.
 * The context is the single input passed through the entire discovery pipeline.
 *
 * Safety rules enforced here:
 *   - MUST NOT silently fall back to BB&B for an unknown tenant.
 *   - All arrays are cloned — mutations do not propagate.
 *   - clientId is mandatory; empty string is not accepted.
 *   - snapshotId defaults to "pending" in Phase C2 (no DB); C3 replaces it.
 */

import type { ClientContentContext } from "./client-context";
import type { BBBService } from "./bbb-services";

// ── DiscoveryContext ───────────────────────────────────────────────────────────

/**
 * Extends ClientContentContext with discovery-specific runtime state.
 * Passed through the entire discovery pipeline unchanged after construction.
 *
 * snapshotId: "pending" in Phase C2 (pre-persistence runs).
 *   In Phase C3+, the DB layer writes a discovery_snapshots row before
 *   calling the pipeline and supplies a real UUID here.
 */
export interface DiscoveryContext extends ClientContentContext {
  /** FK → clients.id. Required for tenant isolation — never empty. */
  clientId: string;
  /** ISO week label derived from the run timestamp. Format: "2026-W29". */
  currentWeek: string;
  /**
   * Active discovery_snapshots.id.
   * "pending" in Phase C2 (assigned by pipeline for in-memory runs).
   * Real UUID in Phase C3+.
   */
  snapshotId: string;
  /** Calendar month 1–12. Derived from the run timestamp. Used by SeasonalityEvaluator. */
  month: number;
  location: {
    city:   string;
    state:  string;
    /** Inherited from ClientContentContext.region. */
    region: string;
  };
  /**
   * Services eligible for discovery: registry.getGeneratableServices() output,
   * cloned. Mutations do not affect the underlying registry.
   */
  discoveryServices: BBBService[];
  /**
   * AI search gap score (0–100): how much the client is missing from AI search
   * citations. Feeds the aiSearchPotential scoring dimension.
   *
   * Derived from: 100 − ai_visibility_audits.aiSearchScore for this client.
   * Default: 50 (neutral — no audit data available).
   */
  aiSearchGapScore: number;
}

// ── ISO week helpers ───────────────────────────────────────────────────────────

/** Returns the ISO 8601 week number (1–53) for a given date. Pure. No IO. */
export function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Returns the ISO 8601 year for a date (may differ from calendar year near Jan 1). */
export function getISOYear(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  return d.getUTCFullYear();
}

/** Returns the ISO week label for a date. E.g. new Date("2026-07-12") → "2026-W28". */
export function toISOWeekLabel(date: Date): string {
  const week = getISOWeekNumber(date);
  const year = getISOYear(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

// ── Location parser ────────────────────────────────────────────────────────────

/**
 * Parse city and state from a "City, ST" serviceArea entry.
 * Returns empty strings for malformed input — never throws.
 */
export function parseServiceArea(serviceArea: string): { city: string; state: string } {
  const parts = (serviceArea ?? "").split(",").map(s => s.trim());
  return {
    city:  parts[0] ?? "",
    state: parts[1] ?? "",
  };
}

// ── Builder input ──────────────────────────────────────────────────────────────

export interface DiscoveryContextInput {
  /** Fully resolved ClientContentContext for this client. */
  contentContext: ClientContentContext;
  /** DB clients.id value. Must not be empty. */
  clientId: string;
  /** Run timestamp — determines currentWeek and month. */
  now: Date;
  /**
   * AI search gap score (0–100).
   * = 100 − aiSearchScore from the client's latest ai_visibility_audits row.
   * Default 50 when no audit data is available.
   */
  aiSearchGapScore?: number;
  /**
   * Snapshot ID override.
   * "pending" by default in Phase C2.
   * In Phase C3+, supply the real UUID from the discovery_snapshots row.
   */
  snapshotId?: string;
}

// ── Builder ────────────────────────────────────────────────────────────────────

/**
 * Build a DiscoveryContext from a resolved ClientContentContext.
 *
 * Pure. Deterministic. Never throws.
 *
 * All arrays from contentContext are deep-cloned so that mutations to the
 * returned context cannot affect the original ClientContentContext or the
 * registry's internal state.
 *
 * Safety: if contentContext.serviceAreas is empty, location.city and
 * location.state will be empty strings. The caller must validate before use.
 *
 * Discovery services are filtered via registry.getGeneratableServices() —
 * services with generationAllowed=false are excluded from the pipeline.
 */
export function buildDiscoveryContext(input: DiscoveryContextInput): DiscoveryContext {
  const {
    contentContext,
    clientId,
    now,
    aiSearchGapScore = 50,
    snapshotId = "pending",
  } = input;

  const week  = toISOWeekLabel(now);
  const month = now.getMonth() + 1; // convert 0-indexed to 1-12

  // Clone all mutable arrays — prevents mutation propagation
  const serviceAreas      = [...contentContext.serviceAreas];
  const topics            = [...contentContext.topics];
  const toneStyle         = [...contentContext.toneStyle];
  const postAngles        = [...contentContext.postAngles];
  const postingTimes      = [...contentContext.postingTimes];
  const platforms         = [...contentContext.platforms];

  // Snapshot discovery-eligible services (cloned)
  const discoveryServices: BBBService[] = [...contentContext.registry.getGeneratableServices()];

  // Derive location from the first serviceArea entry
  const firstArea = serviceAreas[0] ?? "";
  const { city, state } = parseServiceArea(firstArea);
  const location = { city, state, region: contentContext.region };

  return {
    // ── ClientContentContext fields (cloned where mutable) ──────────────────
    clientName:    contentContext.clientName,
    industry:      contentContext.industry,
    industryLabel: contentContext.industryLabel,
    serviceAreas,
    region:        contentContext.region,
    topics,
    toneStyle,
    ctaText:       contentContext.ctaText,
    ctaPreference: contentContext.ctaPreference,
    approvalMode:  contentContext.approvalMode,
    frequency:     contentContext.frequency,
    postingTimes,
    platforms,
    postAngles,
    registry:      contentContext.registry, // interface — not mutated

    // ── Discovery-specific fields ────────────────────────────────────────────
    clientId,
    currentWeek:      week,
    snapshotId,
    month,
    location,
    discoveryServices,
    aiSearchGapScore: Math.max(0, Math.min(100, aiSearchGapScore)),
  };
}

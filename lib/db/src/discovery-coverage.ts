/**
 * Phase C5 — Site Coverage Provider
 *
 * Provider-independent interface for determining whether a client already has
 * meaningful coverage for a discovered topic.
 *
 * Coverage states (canonical, defined in discovery-types.ts):
 *   "covered"  — client has strong, current coverage for this topic
 *   "partial"  — client has some coverage but it may be thin or dated
 *   "gap"      — topic is discoverable but client has no meaningful coverage
 *   "unknown"  — coverage state cannot be determined (no data source configured)
 *
 * C5 default: UnknownCoverageProvider
 *   Returns "unknown" for all topics.
 *   No web crawl. No Search Console OAuth. No content inventory required.
 *   Phase C6 will introduce a content-inventory-backed implementation.
 *
 * The coverage result enriches DiscoveryOpportunity via enrichOpportunity().
 * Coverage state does NOT block signals — the gate (Stage 8) handles that.
 *
 * No Math.random(). No hardcoded BB&B values. No live API calls in tests.
 */

import type { CoverageState } from "./discovery-types";

export type { CoverageState };

// ── Coverage result ────────────────────────────────────────────────────────────

export interface CoverageResult {
  /** The determined coverage state for this topic. */
  state: CoverageState;
  /** Human-readable reason — suitable for logs and diagnostics. */
  reason: string;
  /**
   * Known URLs where the client currently has coverage.
   * Empty unless state = "covered" or "partial".
   * Never contains external URLs (only client-owned properties).
   */
  coveredUrls: string[];
}

// ── Provider interface ─────────────────────────────────────────────────────────

/**
 * Provider-independent contract for site coverage checks.
 *
 * Implementations may use:
 *   - Content inventory DB records (Phase C6)
 *   - Google Search Console data (future — requires OAuth, out of C5 scope)
 *   - Manual URL allowlists (simple Phase C6 option)
 *
 * The C5 default is UnknownCoverageProvider (returns "unknown" always).
 */
export interface SiteCoverageProvider {
  readonly name: string;

  /**
   * Check whether the client has meaningful coverage for a discovered topic.
   *
   * @param input.topic      Normalized signal text (keyword or PAA question).
   * @param input.clientId   Tenant FK — ensures coverage check is tenant-scoped.
   * @param input.serviceId  Service registry ID if known; null for general topics.
   */
  checkCoverage(input: {
    topic:     string;
    clientId:  string;
    serviceId: string | null;
  }): Promise<CoverageResult>;
}

// ── C5 default implementation ─────────────────────────────────────────────────

/**
 * Default Phase C5 coverage provider.
 * Returns "unknown" for every topic.
 * Satisfies SiteCoverageProvider so the pipeline and enricher can wire it
 * without requiring Search Console OAuth or a content inventory DB.
 *
 * Replace with a real implementation in Phase C6.
 */
export class UnknownCoverageProvider implements SiteCoverageProvider {
  readonly name = "unknown_coverage";

  async checkCoverage(_input: {
    topic:     string;
    clientId:  string;
    serviceId: string | null;
  }): Promise<CoverageResult> {
    return {
      state:       "unknown",
      reason:      "No coverage data source configured (Phase C5 default). " +
                   "Phase C6 will introduce content-inventory-backed coverage checks.",
      coveredUrls: [],
    };
  }
}

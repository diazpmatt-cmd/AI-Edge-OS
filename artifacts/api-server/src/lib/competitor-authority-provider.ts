/**
 * Edge Authority Provider — P6.3 (Path C)
 *
 * Real CompetitorEnrichmentProvider for category "authority".
 *
 * Status: Path C — No live arbitrary-domain authority lookup is available.
 *
 * Architecture audit findings:
 *   - The existing backlink system (lib/db/src/backlink-*.ts) is a client-owned
 *     link-gap discovery pipeline: BacklinkDataProvider.discover() takes
 *     clientDomain + competitorDomains to find link intersections — NOT a
 *     per-domain authority metrics (DA, backlink count) lookup service.
 *   - DataForSEO integration covers SERP keyword discovery only; no
 *     DataForSEO Backlinks API adapter exists.
 *   - No Moz, Ahrefs, Majestic, or equivalent credentials are configured.
 *
 * This provider:
 *   - Always returns isMock: false (it is a real provider, not a mock).
 *   - Accepts an optional AuthorityLookupAdapter injected at construction time.
 *     Default is null (Path C — always sparse). When a real API adapter is
 *     integrated, inject it here; no other code changes are needed.
 *   - Returns a sparse non-mock observation that clearly reports the blocker when
 *     no adapter is registered.
 *   - When a live adapter returns data: populates domainAuthority, backlinkCount,
 *     referringDomains (if available); does NOT derive citationScore (no
 *     canonical formula exists for it in this provider).
 *
 * Domain normalization is canonical and exported:
 *   - lowercase
 *   - strip protocol (http:// / https://)
 *   - strip www. prefix
 *   - strip path, query string, fragment
 *   - strip trailing slash
 *
 * Confidence: Only bumped (via applyAuthorityConfidenceBoost) when hasMatch: true.
 * In Path C, hasMatch is always false; confidence is never incremented here.
 *
 * Cache and quota notes:
 *   - Results are persisted in competitor_observations (24h TTL via enrichment service).
 *   - In Path C, no external API quota is consumed.
 *   - When a live adapter is injected: de-duplication within a single execution is
 *     handled by the enrichment service's 24h observation cache. The adapter is only
 *     called once per competitor per freshness window; bounded parallelism across
 *     multiple competitors should be enforced by the caller.
 */

import { randomUUID } from "crypto";
import type { CompetitorEnrichmentProvider, EnrichmentInput } from "@workspace/db";
import type { ProviderObservation, AuthorityNormalized } from "@workspace/db";

// ── Domain normalization ───────────────────────────────────────────────────────

/**
 * Canonical domain normalization used before any authority lookup.
 * Strips protocol, www prefix, path, query string, and trailing slash.
 *
 * Examples:
 *   "https://www.example.com/path?q=1#frag" → "example.com"
 *   "www.orkin.com"                          → "orkin.com"
 *   "ORKIN.COM/"                             → "orkin.com"
 *   "arrowexterminators.com"                 → "arrowexterminators.com"
 */
export function normalizeDomain(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "")
    .replace(/\/+$/, "")
    .trim();
}

// ── Authority lookup adapter contract ─────────────────────────────────────────

/**
 * Verified result shape from a successful authority lookup.
 * Only fields that real providers (DataForSEO Backlinks, Moz, Ahrefs) supply.
 * trustFlow is Majestic-specific. citationScore is NOT here — it belongs
 * to the backlink engine with its own canonical formula.
 */
export interface AuthorityLookupResult {
  domainAuthority:   number;
  backlinkCount:     number;
  referringDomains?: number | null;
  trustFlow?:        number | null;
  sourceUrl?:        string | null;
  dataFreshnessDays?: number | null;
}

/**
 * Boundary contract for an arbitrary-domain authority data source.
 * In Path C, no concrete implementation exists.
 * In Path A/B, inject e.g. DataForSEOBacklinksAdapter or MozApiAdapter.
 *
 * Returns null when the domain has no data at the provider.
 */
export interface AuthorityLookupAdapter {
  readonly name: string;
  lookup(normalizedDomain: string): Promise<AuthorityLookupResult | null>;
}

// ── Confidence boost helper ────────────────────────────────────────────────────

/**
 * Shared helper: applies the Authority independent-source confidence increment
 * (+5) to an existing confidence score, capped at the system maximum of 70.
 *
 * Mirrors applyAiVisibilityConfidenceBoost in competitor-ai-visibility-provider.ts.
 * Called by CompetitorEnrichmentService only after a confirmed real match
 * (rawObservation.hasMatch === true). Never called for sparse observations.
 */
export function applyAuthorityConfidenceBoost(current: number): number {
  return Math.min(70, current + 5);
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class EdgeAuthorityProvider
  implements CompetitorEnrichmentProvider<AuthorityNormalized>
{
  readonly providerId  = "edge_authority";
  readonly displayName = "Edge Authority";
  readonly category    = "authority" as const;
  readonly active      = true;
  readonly isMock      = false;

  /**
   * @param lookup Optional data source adapter.
   *   null  = Path C (no live lookup; always returns sparse observation).
   *   non-null = Path A/B (live lookup; real data when domain is found).
   */
  constructor(private readonly lookup: AuthorityLookupAdapter | null = null) {}

  /**
   * Outer enrich wraps the inner logic so all unexpected throws are caught.
   * The provider contract requires this never propagates to the caller.
   */
  async enrich(
    input: EnrichmentInput,
  ): Promise<ProviderObservation<AuthorityNormalized>> {
    try {
      return await this.doEnrich(input);
    } catch (err) {
      console.error("[edge-authority-provider] unexpected error:", err);
      return this.sparseObservation(input, "Provider error during authority enrichment");
    }
  }

  // ── Private implementation ─────────────────────────────────────────────────

  private async doEnrich(
    input: EnrichmentInput,
  ): Promise<ProviderObservation<AuthorityNormalized>> {
    const normalizedDomain = normalizeDomain(input.domain);

    // Path C guard: no live data source registered.
    if (!this.lookup) {
      return this.sparseObservation(
        input,
        "No live domain authority data source available (Path C). " +
        "Integrate a DataForSEO Backlinks, Moz, or Ahrefs adapter to enable real lookups.",
      );
    }

    // Path A/B: attempt live lookup with normalized domain.
    const result = await this.lookup.lookup(normalizedDomain);

    if (!result) {
      return this.sparseObservation(
        input,
        `No authority data found for domain: ${normalizedDomain}`,
      );
    }

    // Verified data returned — build real observation.
    const score = Math.round(Math.min(100, Math.max(0, result.domainAuthority)));

    const normalized: AuthorityNormalized = {
      score,
      domainAuthority:  result.domainAuthority,
      backlinkCount:    result.backlinkCount,
      referringDomains: result.referringDomains ?? null,
      trustFlow:        result.trustFlow ?? null,
      signals:          this.buildSignals(result),
    };

    return {
      id:           randomUUID(),
      clientId:     input.clientId,
      competitorId: input.competitorId,
      domain:       input.domain,
      category:     "authority",
      providerId:   this.providerId,
      observedAt:   new Date(),
      confidence:   65,
      sourceUrl:    result.sourceUrl ?? null,
      rawObservation: {
        hasMatch:         true,
        normalizedDomain,
        domainAuthority:  result.domainAuthority,
        backlinkCount:    result.backlinkCount,
        referringDomains: result.referringDomains ?? null,
        trustFlow:        result.trustFlow ?? null,
      },
      normalizedObservation: normalized,
      attribution: {
        providerName:      this.lookup.name,
        providerVersion:   "1.0.0",
        methodology:       "live_domain_authority_lookup",
        dataFreshnessDays: result.dataFreshnessDays ?? null,
      },
      isMock: false,
    };
  }

  private buildSignals(result: AuthorityLookupResult): string[] {
    const signals: string[] = [
      `Domain Authority: ${result.domainAuthority}/100`,
      `${result.backlinkCount.toLocaleString()} backlinks`,
    ];
    if (result.referringDomains != null) {
      signals.push(`${result.referringDomains} referring domains`);
    }
    if (result.trustFlow != null) {
      signals.push(`Trust Flow: ${result.trustFlow}`);
    }
    if (result.sourceUrl) {
      signals.push(`Source: ${result.sourceUrl}`);
    }
    return signals;
  }

  private sparseObservation(
    input:  EnrichmentInput,
    reason: string,
  ): ProviderObservation<AuthorityNormalized> {
    return {
      id:           randomUUID(),
      clientId:     input.clientId,
      competitorId: input.competitorId,
      domain:       input.domain,
      category:     "authority",
      providerId:   this.providerId,
      observedAt:   new Date(),
      confidence:   20,
      sourceUrl:    null,
      rawObservation: {
        hasMatch:         false,
        reason,
        normalizedDomain: normalizeDomain(input.domain),
      },
      normalizedObservation: {
        score:            0,
        domainAuthority:  null,
        backlinkCount:    null,
        referringDomains: null,
        trustFlow:        null,
        signals:          [`Authority data unavailable: ${reason}`],
      },
      attribution: {
        providerName:      "Edge Authority",
        providerVersion:   "1.0.0",
        methodology:       "path_c_no_live_source",
        dataFreshnessDays: null,
      },
      isMock: false,
    };
  }
}

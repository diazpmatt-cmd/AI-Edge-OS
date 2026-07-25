/**
 * Competitor Enrichment Provider Interface — Phase 5
 *
 * Defines the plug-in contract for all competitor intelligence providers.
 * Future providers (DataForSEO, GBP, Moz, etc.) implement this interface
 * and register themselves in EnrichmentProviderRegistry.
 * No dashboard logic changes are required when a new provider is added.
 *
 * Architecture rules:
 * - One provider covers exactly ONE ObservationCategory.
 * - Providers MUST NOT write to the competitors table directly.
 * - Providers MUST return isMock=true when generating demo/stub data.
 * - Mock providers MUST be deterministic: same input → same output.
 * - Provider failures are non-fatal; the enrichment service catches all throws.
 */

import type {
  ProviderObservation,
  ObservationCategory,
} from "./competitor-observation-types.js";

// ── Input contract ────────────────────────────────────────────────────────────

export interface EnrichmentInput {
  clientId:     string;
  competitorId: string;
  domain:       string;
  /**
   * Partial canonical data already on the competitors row.
   * Providers may use this to avoid redundant fetches or to improve scoring.
   */
  existingData: Record<string, unknown>;
}

// ── Provider interface ────────────────────────────────────────────────────────

/**
 * T is the category-specific normalized observation type.
 * @see WebsiteIntelNormalized, LocalPresenceNormalized, ReviewsNormalized,
 *      AuthorityNormalized, AiVisibilityNormalized
 */
export interface CompetitorEnrichmentProvider<T> {
  readonly providerId:   string;
  readonly displayName:  string;
  readonly category:     ObservationCategory;
  /** When false, the provider is registered but skipped at enrichment time. */
  readonly active:       boolean;
  /** true = this provider returns demo/generated data, never live data. */
  readonly isMock:       boolean;

  /**
   * Enrich a competitor with category-specific intelligence.
   * Must never throw — catch internally and return a low-confidence stub.
   */
  enrich(input: EnrichmentInput): Promise<ProviderObservation<T>>;
}

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * Central registry of all active enrichment providers.
 * Providers register themselves at API server startup.
 * The EnrichmentService queries this registry to decide which providers to call.
 */
export class EnrichmentProviderRegistry {
  private readonly providers = new Map<
    string,
    CompetitorEnrichmentProvider<unknown>
  >();

  /**
   * Register a provider. Throws if providerId is already registered to
   * surface accidental duplicate registrations early.
   */
  register<T>(provider: CompetitorEnrichmentProvider<T>): this {
    if (this.providers.has(provider.providerId)) {
      throw new Error(
        `Enrichment provider "${provider.providerId}" is already registered.`,
      );
    }
    this.providers.set(
      provider.providerId,
      provider as CompetitorEnrichmentProvider<unknown>,
    );
    return this;
  }

  /** All active providers for a specific category (in registration order). */
  getByCategory(
    category: ObservationCategory,
  ): CompetitorEnrichmentProvider<unknown>[] {
    return [...this.providers.values()].filter(
      p => p.active && p.category === category,
    );
  }

  /** All active providers across all categories. */
  getAll(): CompetitorEnrichmentProvider<unknown>[] {
    return [...this.providers.values()].filter(p => p.active);
  }

  has(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  get size(): number {
    return this.providers.size;
  }
}

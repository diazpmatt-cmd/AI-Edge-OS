/**
 * Competitor Enrichment Service — Phase 5 + P6.2
 *
 * Orchestrates all registered CompetitorEnrichmentProviders for a given
 * competitor. Caches results in competitor_observations (24h TTL) so
 * repeated card-expand requests don't re-run providers unnecessarily.
 *
 * Architecture rules enforced here:
 * - Providers run in parallel via Promise.allSettled — provider failures
 *   are non-fatal and do not block other category results.
 * - No provider touches the competitors canonical table directly.
 * - Only the enrichment service calls updateScores() for canonical persistence
 *   when a real (non-mock) provider returns a verified score.
 * - Tenant isolation: every DB query filters on client_id.
 *
 * P6.2 change:
 * - AiEdgeVisibilityProvider replaces MockAiVisibilityProvider.
 * - After enrichment, if the ai_visibility observation is real and has a
 *   derivedScore, competitors.ai_visibility_score is persisted and confidence
 *   is bumped using the shared applyAiVisibilityConfidenceBoost() helper.
 */

import { pool as defaultPool, db as defaultDb, DrizzleCompetitorRepository, EnrichmentProviderRegistry } from "@workspace/db";
import type {
  CompetitorEnrichmentProvider,
  ProviderObservation,
  ProviderObservationSummary,
  ObservationCategory,
  EnrichmentInput,
} from "@workspace/db";
import { ALL_MOCK_PROVIDERS } from "./competitor-mock-providers.js";
import {
  AiEdgeVisibilityProvider,
  applyAiVisibilityConfidenceBoost,
} from "./competitor-ai-visibility-provider.js";

type Pool = typeof defaultPool;
type Db   = typeof defaultDb;

/** Max age of cached observations before re-running providers (24 hours). */
const OBS_FRESHNESS_MS = 24 * 60 * 60 * 1000;

/** Canonical observation category ordering for consistent UI rendering. */
export const ENRICHMENT_CATEGORIES: ObservationCategory[] = [
  "website_intel",
  "local_presence",
  "reviews",
  "authority",
  "ai_visibility",
];

// ── DB row type ───────────────────────────────────────────────────────────────

interface ObsRow {
  id:              string;
  client_id:       string;
  competitor_id:   string;
  domain:          string;
  category:        string;
  provider_id:     string;
  observed_at:     Date;
  confidence:      number;
  source_url:      string | null;
  raw_observation: Record<string, unknown>;
  normalized_obs:  Record<string, unknown>;
  attribution:     Record<string, unknown>;
  is_mock:         boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function obsToSummary(obs: ProviderObservation<unknown>): ProviderObservationSummary {
  const norm = obs.normalizedObservation as { score?: number; signals?: string[] };
  return {
    category:     obs.category,
    providerId:   obs.providerId,
    providerName: obs.attribution.providerName,
    observedAt:   obs.observedAt.toISOString(),
    confidence:   obs.confidence,
    sourceUrl:    obs.sourceUrl,
    score:        norm.score ?? 0,
    signals:      norm.signals ?? [],
    isMock:       obs.isMock,
    attribution:  obs.attribution,
    normalized:   norm as Record<string, unknown>,
  };
}

function rowToSummary(row: ObsRow): ProviderObservationSummary {
  const norm = row.normalized_obs as { score?: number; signals?: string[] };
  const attr = row.attribution as {
    providerName?: string; providerVersion?: string;
    methodology?: string; dataFreshnessDays?: number | null;
  };
  return {
    category:     row.category as ObservationCategory,
    providerId:   row.provider_id,
    providerName: attr.providerName ?? row.provider_id,
    observedAt:   row.observed_at.toISOString(),
    confidence:   row.confidence,
    sourceUrl:    row.source_url,
    score:        norm.score ?? 0,
    signals:      norm.signals ?? [],
    isMock:       row.is_mock,
    attribution: {
      providerName:      attr.providerName      ?? row.provider_id,
      providerVersion:   attr.providerVersion   ?? "unknown",
      methodology:       attr.methodology       ?? "unknown",
      dataFreshnessDays: attr.dataFreshnessDays ?? null,
    },
    normalized: norm as Record<string, unknown>,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export class CompetitorEnrichmentService {
  constructor(
    private readonly registry: EnrichmentProviderRegistry,
    private readonly pool: Pool,
    private readonly db: Db,
  ) {}

  /**
   * Enrich a competitor with provider observations.
   * Returns cached observations if fresh, otherwise runs providers and persists.
   *
   * Pass existingData with at minimum { businessName, confidenceScore } so the
   * AI Edge Visibility provider can match by business name and the service can
   * apply the correct confidence boost without ever decreasing the stored value.
   */
  async enrichCompetitor(
    clientId:     string,
    competitorId: string,
    domain:       string,
    existingData: Record<string, unknown> = {},
  ): Promise<ProviderObservationSummary[]> {
    // 1. Try the cache
    const cached = await this.loadCached(clientId, competitorId);
    if (this.isCacheFresh(cached)) {
      return cached.map(rowToSummary);
    }

    // 2. Run all active providers (parallel, non-fatal)
    const input: EnrichmentInput = { clientId, competitorId, domain, existingData };
    const providers = this.registry.getAll();
    const settled = await Promise.allSettled(providers.map(p => p.enrich(input)));

    const observations: ProviderObservation<unknown>[] = [];
    for (const result of settled) {
      if (result.status === "fulfilled") {
        observations.push(result.value);
      }
    }

    // 3. Persist (upsert — newer observation overwrites stale one)
    await this.persist(observations);

    // 4. Persist canonical score + confidence boost for real AI Visibility match (P6.2)
    await this.persistAiVisibilityScore(clientId, domain, observations, existingData);

    return observations.map(obsToSummary);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * After real ai_visibility enrichment, write the derived score to the
   * competitors canonical row and bump confidence using the shared helper.
   *
   * Guard conditions (all must hold before any write):
   *   a. The ai_visibility observation is real (isMock === false)
   *   b. rawObservation.hasMatch === true (a competitor entry was found in audit data)
   *   c. rawObservation.derivedScore is a number (not null)
   *
   * Confidence is never decreased: we use max(existing, boosted) implicitly via
   * applyAiVisibilityConfidenceBoost which only adds +5 capped at 70.
   * The current stored confidence comes from existingData.confidenceScore (passed
   * by the route from the competitors row). Falls back to 10 when not provided.
   */
  private async persistAiVisibilityScore(
    clientId:     string,
    domain:       string,
    observations: ProviderObservation<unknown>[],
    existingData: Record<string, unknown>,
  ): Promise<void> {
    const aiObs = observations.find(o => o.category === "ai_visibility" && !o.isMock);
    if (!aiObs) return;

    const raw = aiObs.rawObservation as Record<string, unknown>;
    if (raw["hasMatch"] !== true) return;

    const derivedScore = raw["derivedScore"];
    if (typeof derivedScore !== "number") return;

    const existingConfidence =
      typeof existingData["confidenceScore"] === "number"
        ? existingData["confidenceScore"]
        : 10;

    const repo = new DrizzleCompetitorRepository(this.db);
    await repo.updateScores(clientId, domain, {
      aiVisibilityScore:  derivedScore,
      confidenceScore:    applyAiVisibilityConfidenceBoost(existingConfidence),
    });
  }

  private async loadCached(
    clientId: string,
    competitorId: string,
  ): Promise<ObsRow[]> {
    const res = await this.pool.query<ObsRow>(
      `SELECT id, client_id, competitor_id, domain, category, provider_id,
              observed_at, confidence, source_url,
              raw_observation, normalized_obs, attribution, is_mock
       FROM competitor_observations
       WHERE client_id = $1 AND competitor_id = $2
       ORDER BY category, observed_at DESC`,
      [clientId, competitorId],
    );
    return res.rows;
  }

  private isCacheFresh(rows: ObsRow[]): boolean {
    if (rows.length < ENRICHMENT_CATEGORIES.length) return false;
    const now = Date.now();
    return rows.every(r => now - new Date(r.observed_at).getTime() < OBS_FRESHNESS_MS);
  }

  private async persist(
    observations: ProviderObservation<unknown>[],
  ): Promise<void> {
    for (const obs of observations) {
      await this.pool.query(
        `INSERT INTO competitor_observations
           (id, client_id, competitor_id, domain, category, provider_id,
            observed_at, confidence, source_url,
            raw_observation, normalized_obs, attribution, is_mock)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (client_id, competitor_id, category, provider_id)
         DO UPDATE SET
           observed_at      = EXCLUDED.observed_at,
           confidence       = EXCLUDED.confidence,
           source_url       = EXCLUDED.source_url,
           raw_observation  = EXCLUDED.raw_observation,
           normalized_obs   = EXCLUDED.normalized_obs,
           attribution      = EXCLUDED.attribution,
           is_mock          = EXCLUDED.is_mock,
           updated_at       = NOW()`,
        [
          obs.id,
          obs.clientId,
          obs.competitorId,
          obs.domain,
          obs.category,
          obs.providerId,
          obs.observedAt,
          obs.confidence,
          obs.sourceUrl,
          JSON.stringify(obs.rawObservation),
          JSON.stringify(obs.normalizedObservation),
          JSON.stringify(obs.attribution),
          obs.isMock,
        ],
      );
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Creates a CompetitorEnrichmentService with:
 *   - Real AiEdgeVisibilityProvider registered for the ai_visibility category.
 *   - All other mock providers unchanged (website_intel, local_presence, reviews, authority).
 *   - MockAiVisibilityProvider is excluded from registration.
 *
 * Call once at API server startup; reuse the instance across requests.
 */
export function createEnrichmentService(
  overridePool?: Pool,
  overrideDb?:   Db,
): CompetitorEnrichmentService {
  const activePool = overridePool ?? defaultPool;
  const activeDb   = overrideDb   ?? defaultDb;
  const registry   = new EnrichmentProviderRegistry();

  // Register all mock providers EXCEPT ai_visibility (replaced by real provider).
  const mockWithoutAiVisibility = ALL_MOCK_PROVIDERS.filter(
    p => p.category !== "ai_visibility",
  ) as ReadonlyArray<CompetitorEnrichmentProvider<unknown>>;

  for (const provider of mockWithoutAiVisibility) {
    registry.register(provider);
  }

  // Register the real AI Edge Visibility provider.
  registry.register(new AiEdgeVisibilityProvider(activePool));

  return new CompetitorEnrichmentService(registry, activePool, activeDb);
}

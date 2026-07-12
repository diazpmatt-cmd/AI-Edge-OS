/**
 * Phase C2 — Fault-Tolerant Discovery Pipeline
 *
 * Accepts a DiscoveryContext and a set of injected providers.
 * Executes 11 pipeline stages, isolating failures per provider.
 * Returns a typed DiscoveryRunSummary.
 *
 * Fault tolerance contract:
 *   - Each provider stage wraps its call in try/catch.
 *   - A caught error is logged with "[discovery] stage N failed: ..." and
 *     the stage result is an empty array.
 *   - Downstream stages receive whatever the upstream stages produced.
 *   - After all stages: status = "complete" if all provider stages succeeded,
 *     "partial" if any failed, "failed" only if Stage 1 (seed extraction) throws.
 *
 * Dependency injection contract:
 *   - The pipeline never calls Drizzle directly.
 *   - The repository (DiscoveryRepository) is optional; persistence is skipped
 *     when absent (Phase C2 default).
 *   - In Phase C3, DrizzleDiscoveryRepository is injected.
 *
 * CRITICAL: The pipeline must NOT use:
 *   - Math.random() — all logic is deterministic
 *   - Hardcoded competitor names — all data comes from providers or DB
 *   - Legacy mock intelligence from ai-visibility.ts or ai.ts routes
 */

import type {
  DiscoverySignal, DiscoveryCluster, DiscoveryOpportunity,
  DiscoveryRunSummary, ProviderSource, ProviderFailure, SnapshotStatus,
} from "./discovery-types";
import type { DiscoveryContext } from "./discovery-context";
import type { DiscoveryProviderSet, DiscoveryRepository } from "./discovery-providers";
import type { BBBService } from "./bbb-services";
import { registryGate } from "./discovery-registry-gate";
import { buildClusters } from "./discovery-cluster-builder";
import { scoreCluster } from "./discovery-scorer";
import {
  normalizeKeywordResult, normalizePAAResult,
  normalizeRedditResult,
} from "./discovery-normalizer";
import { evaluateSeasonality } from "./discovery-registry-gate";

// ── Run ID derivation ──────────────────────────────────────────────────────────

/**
 * Deterministic run ID from (clientId × weekLabel).
 * Stable across re-runs for the same week. Used in the run summary.
 */
export function deriveRunId(clientId: string, weekLabel: string): string {
  return `run::${clientId}::${weekLabel}`;
}

// ── Seed extraction (Stage 1) ──────────────────────────────────────────────────

/**
 * Stage 1: Seed Extraction. Pure function. Always succeeds.
 *
 * Produces keyword seeds by crossing service names with city names:
 *   "Bed Bug Inspection" × "Foley" → "bed bug inspection Foley"
 *   "Mosquito Control" × "Daphne" → "mosquito control Daphne"
 *
 * Limits: up to 10 services × 3 cities = 30 seeds max.
 */
export function extractSeeds(context: DiscoveryContext): string[] {
  const services = context.discoveryServices.slice(0, 10);
  const cities   = context.serviceAreas.slice(0, 3).map(a => a.split(",")[0]?.trim() ?? "");

  const seeds: string[] = [];
  for (const service of services) {
    // Always add the bare service name
    seeds.push(service.displayName);
    // Add city-qualified variants for the first city
    const city = cities[0];
    if (city) seeds.push(`${service.displayName} ${city}`);
  }
  return [...new Set(seeds)]; // deduplicate
}

// ── DiscoveryPipeline ──────────────────────────────────────────────────────────

export class DiscoveryPipeline {
  constructor(
    private readonly providers: DiscoveryProviderSet,
    private readonly repository?: DiscoveryRepository,
  ) {}

  /**
   * Run the full 11-stage discovery pipeline for one client.
   *
   * Stages 1, 8, 9, 10 are pure functions that always succeed.
   * Stages 2–7 wrap provider calls in try/catch — failures produce empty arrays.
   * Stage 11 persists via the injected repository (skipped if absent in C2).
   */
  async run(context: DiscoveryContext): Promise<DiscoveryRunSummary> {
    const startTime = Date.now();
    const runId     = deriveRunId(context.clientId, context.currentWeek);

    const providersAttempted: ProviderSource[] = [];
    const providersSucceeded: ProviderSource[] = [];
    const providerFailures:   ProviderFailure[] = [];

    let allSignals: DiscoverySignal[] = [];

    // ── Stage 1: Seed Extraction (pure, always succeeds) ─────────────────────
    const seeds = extractSeeds(context);

    // ── Stage 2: Keyword Expansion [SearchDataProvider] ──────────────────────
    if (this.providers.search) {
      const provider = this.providers.search;
      providersAttempted.push(provider.name);
      try {
        const raws = await provider.fetchKeywords({
          seeds,
          city:     context.location.city,
          state:    context.location.state,
          industry: context.industry,
          limit:    50,
        });
        const normalized = raws.map(raw => {
          const serviceId = this.inferServiceId(raw.keyword, context.discoveryServices, context);
          const seasonalRelevance = serviceId
            ? evaluateSeasonality(
                context.discoveryServices.find(s => s.serviceId === serviceId)!,
                context.month,
              )
            : 50;
          return normalizeKeywordResult({
            raw,
            clientId:         context.clientId,
            source:           provider.name,
            snapshotId:       context.snapshotId,
            serviceId,
            seasonalRelevance,
          });
        });
        allSignals.push(...normalized);
        providersSucceeded.push(provider.name);
      } catch (err) {
        console.error(`[discovery] stage 2 failed (${provider.name}): ${String(err)}`);
        providerFailures.push({
          provider:   provider.name,
          stage:      2,
          error:      String(err),
          occurredAt: new Date(),
        });
      }
    }

    // ── Stage 3: People Also Ask [PeopleAlsoAskProvider] ─────────────────────
    if (this.providers.paa) {
      const provider = this.providers.paa;
      providersAttempted.push(provider.name);
      // Use top 5 seeds for PAA queries
      const topSeeds = seeds.slice(0, 5);
      try {
        for (const seed of topSeeds) {
          const raws = await provider.fetchPAA({
            seedKeyword: seed,
            location:    `${context.location.city}, ${context.location.state}`,
            language:    "en",
          });
          const normalized = raws.map(raw => {
            const serviceId = this.inferServiceId(raw.question, context.discoveryServices, context);
            return normalizePAAResult({
              raw,
              clientId:   context.clientId,
              source:     provider.name,
              snapshotId: context.snapshotId,
              serviceId,
            });
          });
          allSignals.push(...normalized);
        }
        providersSucceeded.push(provider.name);
      } catch (err) {
        console.error(`[discovery] stage 3 failed (${provider.name}): ${String(err)}`);
        providerFailures.push({
          provider:   provider.name,
          stage:      3,
          error:      String(err),
          occurredAt: new Date(),
        });
      }
    }

    // ── Stage 4: Trend Overlay [TrendProvider] ────────────────────────────────
    // Updates seasonalRelevance on existing signals from Stage 2+3.
    // On failure: seasonalRelevance stays from SeasonalityEvaluator (registry-based).
    if (this.providers.trend && allSignals.length > 0) {
      const provider = this.providers.trend;
      providersAttempted.push(provider.name);
      try {
        const keywords = [...new Set(allSignals.map(s => s.normalizedValue))].slice(0, 20);
        const trends   = await provider.getSeasonalTrends({
          keywords,
          region:     context.region,
          monthsBack: 12,
        });
        // Apply trend overlay: update seasonalRelevance for matching signals
        const trendMap = new Map(trends.map(t => [t.keyword.toLowerCase(), t]));
        allSignals = allSignals.map(signal => {
          const trend = trendMap.get(signal.normalizedValue);
          if (!trend) return signal;
          const newSeasonalRelevance = Math.round(trend.relativeInterest);
          return { ...signal, seasonalRelevance: newSeasonalRelevance, trendDirection: trend.trend };
        });
        providersSucceeded.push(provider.name);
      } catch (err) {
        console.error(`[discovery] stage 4 failed (${provider.name}): ${String(err)}`);
        providerFailures.push({
          provider:   provider.name,
          stage:      4,
          error:      String(err),
          occurredAt: new Date(),
        });
        // Failure: seasonalRelevance stays from SeasonalityEvaluator (registry-based) — no abort
      }
    }

    // ── Stage 5: Competitor Gap [SearchDataProvider.fetchCompetitorKeywords] ──
    // Skipped in C2 (no competitor domain data available yet).
    // Will be activated in C4 when competitor data is sourced from ai_visibility_audits.

    // ── Stage 6: AI Search Audit [AISearchProvider] ───────────────────────────
    if (this.providers.aiSearch) {
      const provider = this.providers.aiSearch;
      providersAttempted.push(provider.name);
      try {
        // Probe top keywords by volume (or top 5 by position)
        const topKeywords = allSignals
          .filter(s => s.signalType === "keyword")
          .sort((a, b) => (b.volumeEstimate ?? 0) - (a.volumeEstimate ?? 0))
          .slice(0, 5);
        for (const kw of topKeywords) {
          const probe = await provider.probeQuery({
            query:        kw.rawValue,
            businessName: context.clientName,
            platform:     "chatgpt",
          });
          // AI probe signals are handled by the caller via normalizeAIProbeResult
          // In Stage 6, we just mark the signal with citationFound
          const idx = allSignals.findIndex(s => s.id === kw.id);
          if (idx >= 0) {
            allSignals[idx] = {
              ...allSignals[idx]!,
              citationFound: probe.isCited,
            };
          }
        }
        providersSucceeded.push(provider.name);
      } catch (err) {
        console.error(`[discovery] stage 6 failed (${provider.name}): ${String(err)}`);
        providerFailures.push({
          provider:   provider.name,
          stage:      6,
          error:      String(err),
          occurredAt: new Date(),
        });
        // Failure: aiSearchPotential defaults to context.aiSearchGapScore gap in scorer
      }
    }

    // ── Stage 7: Social Listening [SocialListeningProvider] ──────────────────
    if (this.providers.social) {
      const provider = this.providers.social;
      providersAttempted.push(provider.name);
      try {
        const keywords = context.topics.slice(0, 5);
        const raws     = await provider.fetchRedditSignals({
          subreddits: [
            `r/${context.industry.replace(/_/g, "")}`,
            "r/HomeImprovement",
          ],
          keywords,
          limit: 20,
        });
        const normalized = raws.map(raw => {
          const serviceId = this.inferServiceId(raw.title, context.discoveryServices, context);
          return normalizeRedditResult({
            raw,
            clientId:   context.clientId,
            source:     provider.name,
            snapshotId: context.snapshotId,
            serviceId,
          });
        });
        allSignals.push(...normalized);
        providersSucceeded.push(provider.name);
      } catch (err) {
        console.error(`[discovery] stage 7 failed (${provider.name}): ${String(err)}`);
        providerFailures.push({
          provider:   provider.name,
          stage:      7,
          error:      String(err),
          occurredAt: new Date(),
        });
      }
    }

    // ── Stage 8: Registry Gate (pure, always succeeds) ────────────────────────
    const gateResults = allSignals.map(signal => ({
      signal,
      gate: registryGate(
        signal.serviceId ?? signal.rawValue,
        context.registry,
      ),
    }));

    const allowedSignals = gateResults
      .filter(r => r.gate.status !== "blocked" && r.gate.status !== "unsupported")
      .map(r => r.signal);

    const blockedSignals = gateResults
      .filter(r => r.gate.status === "blocked" || r.gate.status === "unsupported")
      .map(r => r.signal);

    // ── Stage 9: Cluster Building (pure, always succeeds) ─────────────────────
    const clusters = buildClusters(allowedSignals, context.registry, context);

    // ── Stage 10: Opportunity Scoring (pure, always succeeds) ─────────────────
    const signalById = new Map<string, DiscoverySignal>(allSignals.map(s => [s.id, s]));

    const opportunities: DiscoveryOpportunity[] = [];
    const scoredClusters: DiscoveryCluster[] = [];

    for (const cluster of clusters) {
      const clusterSignals = cluster.signalIds
        .map(id => signalById.get(id))
        .filter((s): s is DiscoverySignal => s !== undefined);

      const opportunity = scoreCluster({
        cluster,
        signals: clusterSignals,
        context,
      });

      // Update cluster with the computed opportunityScore
      const scoredCluster: DiscoveryCluster = {
        ...cluster,
        opportunityScore: opportunity.compositeScore,
        isActive:         opportunity.status !== "suppressed",
      };

      opportunities.push(opportunity);
      scoredClusters.push(scoredCluster);
    }

    // Sort opportunities by compositeScore desc
    opportunities.sort((a, b) => b.compositeScore - a.compositeScore);

    // ── Phase C3: restamp snapshotId on all child records ─────────────────────
    // During C2, signals/clusters/opportunities carry snapshotId: "pending" because
    // no DB existed to assign a real snapshot PK. Now that the runId is known,
    // restamp every child record so they can be stored against the correct FK.
    const stampedSignals      = allSignals.map(s => s.snapshotId === runId ? s : { ...s, snapshotId: runId });
    const stampedClusters     = scoredClusters.map(c => c.snapshotId === runId ? c : { ...c, snapshotId: runId });
    const stampedOpportunities = opportunities.map(o => o.snapshotId === runId ? o : { ...o, snapshotId: runId });

    // ── Assemble summary fields ───────────────────────────────────────────────
    const status: SnapshotStatus = providerFailures.length > 0 ? "partial" : "complete";

    const summaryBase = {
      runId,
      clientId:   context.clientId,
      weekLabel:  context.currentWeek,
      status,
      providersAttempted,
      providersSucceeded,
      providersFailed: providerFailures.map(f => f.provider),
      providerFailures,
      signals: {
        received: allSignals.length,
        accepted: allowedSignals.length,
        blocked:  blockedSignals.length,
      },
      clusters:      { created: stampedClusters.length },
      opportunities: {
        created:      stampedOpportunities.length,
        highPriority: stampedOpportunities.filter(o =>
          o.priority === "critical" || o.priority === "high"
        ).length,
      },
      topOpportunityScore:  stampedOpportunities[0]?.compositeScore ?? 0,
      runDurationMs:        Date.now() - startTime,
      topOpportunities:     stampedOpportunities.slice(0, 5),
      allClusters:          stampedClusters,
      // Phase C3: full signal and opportunity lists for persistence
      allSignals:           stampedSignals,
      allOpportunities:     stampedOpportunities,
    };

    // ── Stage 11: Persistence [DB write, skipped when no repository] ──────────
    if (this.repository) {
      try {
        await this.repository.persistRunResult(summaryBase);
      } catch (err) {
        console.error(`[discovery] stage 11 failed (persistence): ${String(err)}`);
        // Persistence failure does not change the result returned to the caller.
        // The summary is already assembled above — return it regardless.
      }
    }

    return summaryBase;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Attempt to map a raw text value to a service registry serviceId.
   * Uses registry.matchByTopic() — returns null if no match.
   *
   * Tenant-safe: uses the context's registry (not a global lookup).
   */
  private inferServiceId(
    text: string,
    services: BBBService[],
    context: DiscoveryContext,
  ): string | null {
    const service = context.registry.matchByTopic(text);
    if (service) return service.serviceId;

    // Fallback: check if any service displayName appears in the text
    const lower = text.toLowerCase();
    for (const svc of services) {
      if (lower.includes(svc.displayName.toLowerCase())) {
        return svc.serviceId;
      }
    }
    return null;
  }
}

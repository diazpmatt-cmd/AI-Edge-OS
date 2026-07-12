/**
 * Phase C5 — Opportunity Enricher
 *
 * Pure function that enriches a C2-scored DiscoveryOpportunity with additional
 * evidence extracted from signal providerRaw data and site coverage state.
 *
 * Enrichment process:
 *   1. Extract enrichment data from signal.rawProviderData fields:
 *        competitorDomains — local business domains found in organic SERP
 *        paaQuestions      — People Also Ask questions from SERP
 *        cpcUsd            — cost-per-click in USD (commercial value proxy)
 *   2. Accept a CoverageState from the SiteCoverageProvider.
 *   3. Compute dimension adjustments deterministically from enrichment data.
 *   4. Recompute composite score and priority.
 *   5. Return a new opportunity with version="c5" and enrichment block.
 *
 * Backward compatibility:
 *   - enrichOpportunity() returns the original opportunity unchanged when no
 *     C5 data is present (no competitor domains, no PAA, no CPC).
 *   - Scorecard version field is optional — C2 records have version=undefined.
 *   - The Zod schema in discovery-drizzle-repository.ts treats version and
 *     enrichment as optional, so old records parse cleanly.
 *
 * Composite invariants:
 *   - Composite is always recomputed from the adjusted dimensions.
 *   - Adjustments are capped at 0–100 per dimension.
 *   - All adjustments are deterministic: same inputs → same outputs.
 *   - No Math.random(). No hardcoded BB&B values. No live API calls.
 */

import type {
  DiscoveryOpportunity,
  DiscoverySignal,
  OpportunityScoreCard,
  C5EnrichmentData,
  CoverageState,
} from "./discovery-types";
import { computeComposite, priorityFromScore } from "./discovery-scorer";

// ── Enrichment extraction ──────────────────────────────────────────────────────

/**
 * Scan a cluster's signals and extract the maximum enrichment values found.
 *
 * Uses max (not sum) across signals to avoid double-counting when multiple
 * signals in the same cluster observed the same competitor/PAA/CPC data.
 *
 * Fields read from signal.rawProviderData:
 *   competitorDomains  — string[] of filtered local business domains
 *   paaQuestions       — string[] of PAA question texts
 *   cpcUsd             — number (USD cost-per-click for this keyword)
 */
export function extractEnrichmentFromSignals(
  signals:       DiscoverySignal[],
  coverageState: CoverageState = "unknown",
): C5EnrichmentData {
  let maxCompetitorDomains = 0;
  let maxPaaQuestions      = 0;
  let maxCpc: number | null = null;

  for (const signal of signals) {
    const raw = signal.rawProviderData;

    const domains = raw["competitorDomains"];
    if (Array.isArray(domains)) {
      maxCompetitorDomains = Math.max(maxCompetitorDomains, domains.length);
    }

    const questions = raw["paaQuestions"];
    if (Array.isArray(questions)) {
      maxPaaQuestions = Math.max(maxPaaQuestions, questions.length);
    }

    const cpc = raw["cpcUsd"];
    if (typeof cpc === "number" && cpc > 0) {
      maxCpc = maxCpc === null ? cpc : Math.max(maxCpc, cpc);
    }
  }

  return {
    competitorDomainCount: maxCompetitorDomains,
    paaQuestionCount:      maxPaaQuestions,
    cpcUsd:                maxCpc,
    coverageState,
  };
}

// ── Dimension adjustments ─────────────────────────────────────────────────────

/**
 * Compute adjusted dimension scores based on C5 enrichment data.
 *
 * Adjustment rules (deterministic, clamped 0–100):
 *
 *   competitorGap + 10  if ≥5 competitor domains
 *                       (SERP confirms real market competition exists)
 *   competitorGap + 10  if coverageState = "gap"
 *                       (client has no coverage → gap is confirmed)
 *   competitorGap - 20  if coverageState = "covered"
 *                       (client already ranks → lower gap priority)
 *   aiSearchPotential + 10  if ≥3 PAA questions
 *                           (strong educational/Q&A surface area)
 *   revenueImpact + min(15, cpcUsd × 1.5)  if cpcUsd > 2
 *                                           (high CPC = strong commercial intent)
 *
 * All values rounded to 2 decimal places.
 */
function computeAdjustedDimensions(
  base:       OpportunityScoreCard,
  enrichment: C5EnrichmentData,
): Pick<OpportunityScoreCard, "competitorGap" | "aiSearchPotential" | "revenueImpact"> {
  let competitorGap     = base.competitorGap;
  let aiSearchPotential = base.aiSearchPotential;
  let revenueImpact     = base.revenueImpact;

  if (enrichment.competitorDomainCount >= 5) {
    competitorGap = Math.min(100, competitorGap + 10);
  }

  if (enrichment.coverageState === "gap") {
    competitorGap = Math.min(100, competitorGap + 10);
  } else if (enrichment.coverageState === "covered") {
    competitorGap = Math.max(0, competitorGap - 20);
  }

  if (enrichment.paaQuestionCount >= 3) {
    aiSearchPotential = Math.min(100, aiSearchPotential + 10);
  }

  if (enrichment.cpcUsd !== null && enrichment.cpcUsd > 2) {
    const boost = Math.min(15, enrichment.cpcUsd * 1.5);
    revenueImpact = Math.min(100, revenueImpact + boost);
  }

  return {
    competitorGap:     Math.round(competitorGap     * 100) / 100,
    aiSearchPotential: Math.round(aiSearchPotential * 100) / 100,
    revenueImpact:     Math.round(revenueImpact     * 100) / 100,
  };
}

// ── Enricher ──────────────────────────────────────────────────────────────────

/**
 * Enrich a C2-scored DiscoveryOpportunity with C5 evidence.
 *
 * Returns the SAME opportunity object (no mutation) when:
 *   - Signals have no competitorDomains, PAA questions, or CPC data.
 *   - coverageState is "unknown".
 *   (No C5 data present → C2 opportunity is authoritative.)
 *
 * Returns a NEW opportunity (pure — input never mutated) when enrichment data
 * is present:
 *   - Adjusted dimension scores per the rules above.
 *   - Recomputed composite from adjusted dimensions.
 *   - Recomputed priority from the new composite.
 *   - scoreCard.version = "c5"
 *   - scoreCard.enrichment = { competitorDomainCount, paaQuestionCount, cpcUsd, coverageState }
 *
 * Note: priority override rules from discovery-scorer.ts (seasonal capping,
 * revenue weight, competitor gap critical) are NOT re-applied by the enricher.
 * The enricher is downstream of Stage 10. Re-applying overrides requires context
 * not available here; future phases may add a re-override pass.
 */
export function enrichOpportunity(
  opportunity:   DiscoveryOpportunity,
  signals:       DiscoverySignal[],
  coverageState: CoverageState = "unknown",
): DiscoveryOpportunity {
  const enrichment = extractEnrichmentFromSignals(signals, coverageState);

  const hasC5Data =
    enrichment.competitorDomainCount > 0 ||
    enrichment.paaQuestionCount > 0 ||
    enrichment.cpcUsd !== null ||
    enrichment.coverageState !== "unknown";

  if (!hasC5Data) {
    // No C5 evidence — return C2 opportunity unchanged
    return opportunity;
  }

  const base     = opportunity.scoreCard;
  const adjusted = computeAdjustedDimensions(base, enrichment);

  const enrichedScoreCard: OpportunityScoreCard = {
    ...base,
    competitorGap:     adjusted.competitorGap,
    aiSearchPotential: adjusted.aiSearchPotential,
    revenueImpact:     adjusted.revenueImpact,
    composite:         0, // recomputed below
    version:           "c5",
    enrichment,
  };
  enrichedScoreCard.composite = computeComposite(enrichedScoreCard);

  return {
    ...opportunity,
    scoreCard:      enrichedScoreCard,
    compositeScore: enrichedScoreCard.composite,
    priority:       priorityFromScore(enrichedScoreCard.composite),
  };
}

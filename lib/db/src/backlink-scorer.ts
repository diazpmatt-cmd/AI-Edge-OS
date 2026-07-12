import type { BacklinkScore, CanonicalBacklinkEvidence } from "./backlink-types";

export const BACKLINK_POTENTIAL_WEIGHTS = Object.freeze({ authority: 0.35, localRelevance: 0.20, serviceRelevance: 0.25, competitorFrequency: 0.20 });
export const BACKLINK_ATTAINABILITY_WEIGHTS = Object.freeze({ localRelevance: 0.15, serviceRelevance: 0.15, competitorFrequency: 0.10, relationshipAccessibility: 0.20, editorialEase: 0.15, effortEase: 0.15, freshness: 0.10 });

const round = (value: number) => Math.max(0, Math.min(100, Math.round(value * 100) / 100));
const freshnessScore = (days: number) => round(100 - Math.min(100, Math.max(0, days) / 3.65));

export function scoreBacklinkEvidence(evidence: CanonicalBacklinkEvidence): BacklinkScore {
  const potentialComponents = {
    authority: evidence.authority,
    localRelevance: evidence.localRelevance,
    serviceRelevance: evidence.serviceRelevance,
    competitorFrequency: evidence.competitorFrequency,
  };
  const attainabilityComponents = {
    localRelevance: evidence.localRelevance,
    serviceRelevance: evidence.serviceRelevance,
    competitorFrequency: evidence.competitorFrequency,
    relationshipAccessibility: evidence.relationshipAccessibility,
    editorialEase: 100 - evidence.editorialRequirements,
    effortEase: 100 - evidence.estimatedEffort,
    freshness: freshnessScore(evidence.freshnessDays),
  };
  const weighted = (values: Record<string, number>, weights: Record<string, number>) =>
    round(Object.entries(weights).reduce((sum, [key, weight]) => sum + values[key] * weight, 0));
  return {
    potentialValue: weighted(potentialComponents, BACKLINK_POTENTIAL_WEIGHTS),
    attainability: weighted(attainabilityComponents, BACKLINK_ATTAINABILITY_WEIGHTS),
    potentialComponents,
    attainabilityComponents,
  };
}

export function rankBacklinkEvidence(items: readonly CanonicalBacklinkEvidence[]) {
  return items.map(evidence => ({ evidence, score: scoreBacklinkEvidence(evidence) }))
    .sort((a, b) => b.score.attainability - a.score.attainability || b.score.potentialValue - a.score.potentialValue || a.evidence.id.localeCompare(b.evidence.id));
}


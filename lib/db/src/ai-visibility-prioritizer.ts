import type {
  AiVisibilityAttainabilityFactors,
  AiVisibilityPotentialFactors,
  AiVisibilityPriority,
  AiVisibilityScore,
  AiVisibilityScoreBasis,
} from "./ai-visibility-read-model-types";

/** All C8R-5 weights are public, deterministic, and sum to 1. */
export const AI_VISIBILITY_POTENTIAL_WEIGHTS = Object.freeze({
  businessImpact: 0.30,
  evidenceStrength: 0.25,
  localImpact: 0.20,
  servicePriority: 0.15,
  urgency: 0.10,
} satisfies Record<keyof AiVisibilityPotentialFactors, number>);

export const AI_VISIBILITY_ATTAINABILITY_WEIGHTS = Object.freeze({
  relationshipAccess: 0.25,
  workflowReadiness: 0.20,
  effortEase: 0.20,
  freshness: 0.15,
  localRelevance: 0.10,
  serviceRelevance: 0.10,
} satisfies Record<keyof AiVisibilityAttainabilityFactors, number>);

export const AI_VISIBILITY_PRIORITY_THRESHOLDS = Object.freeze({
  critical: 80,
  high: 65,
  medium: 45,
} as const);

const clamp = (value: number): number => Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;

export function scoreAiVisibilityOpportunity(basis: AiVisibilityScoreBasis): AiVisibilityScore {
  if (basis.kind === "canonical_backlink") {
    return {
      potentialValue: clamp(basis.potentialValue),
      attainability: clamp(basis.attainability),
      potentialFactors: null,
      attainabilityFactors: null,
      basis: "canonical_backlink",
    };
  }
  const potential = Object.fromEntries(Object.entries(basis.potential).map(([key, value]) => [key, clamp(value)])) as unknown as AiVisibilityPotentialFactors;
  const attainability = Object.fromEntries(Object.entries(basis.attainability).map(([key, value]) => [key, clamp(value)])) as unknown as AiVisibilityAttainabilityFactors;
  return {
    potentialValue: clamp(
      potential.businessImpact * AI_VISIBILITY_POTENTIAL_WEIGHTS.businessImpact
      + potential.evidenceStrength * AI_VISIBILITY_POTENTIAL_WEIGHTS.evidenceStrength
      + potential.localImpact * AI_VISIBILITY_POTENTIAL_WEIGHTS.localImpact
      + potential.servicePriority * AI_VISIBILITY_POTENTIAL_WEIGHTS.servicePriority
      + potential.urgency * AI_VISIBILITY_POTENTIAL_WEIGHTS.urgency,
    ),
    attainability: clamp(
      attainability.relationshipAccess * AI_VISIBILITY_ATTAINABILITY_WEIGHTS.relationshipAccess
      + attainability.workflowReadiness * AI_VISIBILITY_ATTAINABILITY_WEIGHTS.workflowReadiness
      + attainability.effortEase * AI_VISIBILITY_ATTAINABILITY_WEIGHTS.effortEase
      + attainability.freshness * AI_VISIBILITY_ATTAINABILITY_WEIGHTS.freshness
      + attainability.localRelevance * AI_VISIBILITY_ATTAINABILITY_WEIGHTS.localRelevance
      + attainability.serviceRelevance * AI_VISIBILITY_ATTAINABILITY_WEIGHTS.serviceRelevance,
    ),
    potentialFactors: potential,
    attainabilityFactors: attainability,
    basis: "weighted",
  };
}

export function aiVisibilityPriority(potentialValue: number): AiVisibilityPriority {
  if (potentialValue >= AI_VISIBILITY_PRIORITY_THRESHOLDS.critical) return "critical";
  if (potentialValue >= AI_VISIBILITY_PRIORITY_THRESHOLDS.high) return "high";
  if (potentialValue >= AI_VISIBILITY_PRIORITY_THRESHOLDS.medium) return "medium";
  return "low";
}

/** Phase C8R-5 canonical AI Visibility read-model contracts. Pure and serializable. */

export type AiVisibilitySource =
  | "local_presence"
  | "google_business"
  | "discovery"
  | "backlink"
  | "reviews"
  | "content"
  | "google_search_console"
  | "google_analytics"
  | "ai_query";

export type AiVisibilityCoverageStatus =
  | "available"
  | "not_connected"
  | "not_implemented"
  | "not_tenant_safe"
  | "no_observation";

export type AiVisibilityCategory =
  | "local_presence"
  | "citation_directory"
  | "review_intelligence"
  | "discovery"
  | "backlink"
  | "content"
  | "measurement";

export type AiVisibilityPriority = "critical" | "high" | "medium" | "low";

export type AiVisibilityWorkflowKind =
  | "local_presence"
  | "discovery"
  | "backlink"
  | "content_autopilot"
  | "measurement";

export interface AiVisibilityCanonicalReference {
  source: AiVisibilitySource;
  recordType: string;
  recordId: string;
  clientId: string;
  observedAt: string;
}

export interface AiVisibilityCoverageDiagnostic {
  source: AiVisibilitySource;
  status: AiVisibilityCoverageStatus;
  detail: string;
  observedAt: string | null;
}

export interface AiVisibilityLifecycleProjection {
  preparation: "generated" | "draft" | "not_applicable";
  approval: "not_approved" | "pending" | "approved" | "rejected" | "not_required" | "not_applicable";
  dispatch: "not_queued" | "queued" | "scheduled" | "not_applicable";
  delivery:
    | "not_attempted"
    | "publishing"
    | "published"
    | "published_with_warning"
    | "failed"
    | "cancelled"
    | "skipped"
    | "not_applicable";
}

export interface AiVisibilityWorkflowDestination {
  kind: AiVisibilityWorkflowKind;
  recordId: string;
  action: string;
}

export interface AiVisibilityPotentialFactors {
  businessImpact: number;
  evidenceStrength: number;
  localImpact: number;
  servicePriority: number;
  urgency: number;
}

export interface AiVisibilityAttainabilityFactors {
  relationshipAccess: number;
  workflowReadiness: number;
  effortEase: number;
  freshness: number;
  localRelevance: number;
  serviceRelevance: number;
}

export type AiVisibilityScoreBasis =
  | {
      kind: "weighted";
      potential: AiVisibilityPotentialFactors;
      attainability: AiVisibilityAttainabilityFactors;
    }
  | {
      /** C8R backlink scores are already canonical and must not be recomputed here. */
      kind: "canonical_backlink";
      potentialValue: number;
      attainability: number;
    };

/** Bounded, adapter-produced input accepted by the pure composer. */
export interface AiVisibilityNormalizedInput {
  clientId: string;
  dedupeKey: string;
  category: AiVisibilityCategory;
  serviceId: string | null;
  geography: string;
  title: string;
  whatWasObserved: string;
  whyItMatters: string;
  evidence: readonly string[];
  references: readonly AiVisibilityCanonicalReference[];
  workflow: AiVisibilityWorkflowDestination;
  humanApprovalRequired: boolean;
  lifecycle: AiVisibilityLifecycleProjection | null;
  scoreBasis: AiVisibilityScoreBasis;
}

export interface AiVisibilityScore {
  potentialValue: number;
  attainability: number;
  potentialFactors: AiVisibilityPotentialFactors | null;
  attainabilityFactors: AiVisibilityAttainabilityFactors | null;
  basis: "weighted" | "canonical_backlink";
}

export interface AiVisibilityRecommendation extends AiVisibilityScore {
  id: string;
  clientId: string;
  category: AiVisibilityCategory;
  serviceId: string | null;
  geography: string;
  title: string;
  priority: AiVisibilityPriority;
  whatWasObserved: readonly string[];
  whyItMatters: readonly string[];
  evidence: readonly string[];
  references: readonly AiVisibilityCanonicalReference[];
  workflow: AiVisibilityWorkflowDestination;
  humanApprovalRequired: boolean;
  lifecycle: AiVisibilityLifecycleProjection | null;
}

export type AiVisibilityRejectionCode =
  | "invalid_input"
  | "tenant_mismatch"
  | "prohibited_positioning"
  | "outside_authorized_geography"
  | "unsupported_service";

export interface AiVisibilityRejectedInput {
  dedupeKey: string;
  code: AiVisibilityRejectionCode;
  reason: string;
  references: readonly AiVisibilityCanonicalReference[];
}

export interface AiVisibilityAuthorizedScope {
  clientId: string;
  activeServiceIds: readonly string[];
  authorizedGeographies: readonly string[];
  prohibitedPhrases: readonly string[];
}

export interface AiVisibilityReadModel {
  id: string;
  clientId: string;
  generatedAt: string;
  recommendations: readonly AiVisibilityRecommendation[];
  coverage: readonly AiVisibilityCoverageDiagnostic[];
  rejected: readonly AiVisibilityRejectedInput[];
  summary: {
    recommendationCount: number;
    rejectedCount: number;
    availableSourceCount: number;
    unavailableSourceCount: number;
  };
}

export interface ComposeAiVisibilityReadModelInput {
  scope: AiVisibilityAuthorizedScope;
  observations: readonly AiVisibilityNormalizedInput[];
  coverage: readonly AiVisibilityCoverageDiagnostic[];
  generatedAt: Date;
}

export const AI_VISIBILITY_BOUNDS = Object.freeze({
  title: 200,
  explanation: 1_000,
  evidenceItems: 50,
  references: 100,
  coverageDetail: 500,
});

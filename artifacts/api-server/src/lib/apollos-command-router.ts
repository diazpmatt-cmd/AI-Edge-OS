export type ApollosCommandCapability =
  | "diagnose"
  | "recommend"
  | "prepare"
  | "publish";

export type ApollosCommandOperation =
  | "weekly_campaign"
  | "system_diagnosis"
  | "business_recommendation"
  | "content_preparation"
  | "external_publish"
  | "unknown";

export type ApollosCommandConfidence = "high" | "medium" | "low";

export type ApollosApprovalBoundary =
  | "none"
  | "before_external_effect"
  | "before_destructive_effect";

export interface ApollosCommandRoute {
  readonly operation: ApollosCommandOperation;
  readonly capability: ApollosCommandCapability;
  readonly confidence: ApollosCommandConfidence;
  readonly approvalBoundary: ApollosApprovalBoundary;
  readonly requiresApprovalNow: boolean;
  readonly requestedExternalEffect: boolean;
  readonly reasonCode: string;
  readonly matchedSignals: readonly string[];
}

const WEEK_PATTERN = /\b(?:week(?:'s|s|ly)?|seven[- ]day|7[- ]day)\b/i;
const PLATFORM_PATTERN =
  /\b(?:all four|all 4|facebook|instagram|google business|gbp|youtube)\b/i;
const CREATE_PATTERN = /\b(?:create|generate|build|prepare|draft|make)\b/i;
const DIAGNOSE_PATTERN =
  /\b(?:diagnose|debug|troubleshoot|root cause|why|error|failed|failing|broken|not working|under the hood)\b/i;
const RECOMMEND_PATTERN =
  /\b(?:recommend|suggest|what should|what do you think|priority|prioritize|next best|improve)\b/i;
const PUBLISH_PATTERN =
  /\b(?:publish|send out|post live|go live|release|deploy|schedule)\b/i;
const CONTENT_PATTERN =
  /\b(?:content|caption|image|video|campaign|post|social media)\b/i;

function frozenRoute(
  route: Omit<ApollosCommandRoute, "matchedSignals"> & {
    matchedSignals: string[];
  },
): ApollosCommandRoute {
  return Object.freeze({
    ...route,
    matchedSignals: Object.freeze([...route.matchedSignals]),
  });
}

export function routeApollosCommand(command: string): ApollosCommandRoute {
  const normalized = command.trim().replace(/\s+/g, " ");
  const signals: string[] = [];
  const hasWeek = WEEK_PATTERN.test(normalized);
  const hasPlatform = PLATFORM_PATTERN.test(normalized);
  const hasCreate = CREATE_PATTERN.test(normalized);
  const hasDiagnose = DIAGNOSE_PATTERN.test(normalized);
  const hasRecommend = RECOMMEND_PATTERN.test(normalized);
  const hasPublish = PUBLISH_PATTERN.test(normalized);
  const hasContent = CONTENT_PATTERN.test(normalized);

  if (hasWeek) signals.push("weekly_scope");
  if (hasPlatform) signals.push("platform_scope");
  if (hasCreate) signals.push("creation_request");
  if (hasPublish) signals.push("external_effect_request");
  if (hasDiagnose) signals.push("diagnostic_request");
  if (hasRecommend) signals.push("recommendation_request");
  if (hasContent) signals.push("content_scope");

  // A weekly command is an orchestrated preparation job even when the desired
  // final outcome is publishing. Drafts and media are built first; one approval
  // is requested only after the complete package is reviewable.
  if (hasWeek && hasPlatform && (hasCreate || hasPublish)) {
    return frozenRoute({
      operation: "weekly_campaign",
      capability: "prepare",
      confidence: "high",
      approvalBoundary: "before_external_effect",
      requiresApprovalNow: false,
      requestedExternalEffect: hasPublish,
      reasonCode: "APOLLOS_ROUTE_WEEKLY_CAMPAIGN",
      matchedSignals: signals,
    });
  }

  // Diagnosis always wins over a coincidental action word such as
  // "why did publishing fail?" Diagnosis itself is read-only.
  if (hasDiagnose) {
    return frozenRoute({
      operation: "system_diagnosis",
      capability: "diagnose",
      confidence: "high",
      approvalBoundary: "none",
      requiresApprovalNow: false,
      requestedExternalEffect: false,
      reasonCode: "APOLLOS_ROUTE_DIAGNOSIS",
      matchedSignals: signals,
    });
  }

  if (hasPublish) {
    return frozenRoute({
      operation: "external_publish",
      capability: "publish",
      confidence: hasContent || hasPlatform ? "high" : "medium",
      approvalBoundary: "before_external_effect",
      requiresApprovalNow: true,
      requestedExternalEffect: true,
      reasonCode: "APOLLOS_ROUTE_EXTERNAL_PUBLISH",
      matchedSignals: signals,
    });
  }

  if (hasCreate || hasContent) {
    return frozenRoute({
      operation: "content_preparation",
      capability: "prepare",
      confidence: hasCreate && hasContent ? "high" : "medium",
      approvalBoundary: "before_external_effect",
      requiresApprovalNow: false,
      requestedExternalEffect: false,
      reasonCode: "APOLLOS_ROUTE_CONTENT_PREPARATION",
      matchedSignals: signals,
    });
  }

  if (hasRecommend) {
    return frozenRoute({
      operation: "business_recommendation",
      capability: "recommend",
      confidence: "high",
      approvalBoundary: "none",
      requiresApprovalNow: false,
      requestedExternalEffect: false,
      reasonCode: "APOLLOS_ROUTE_RECOMMENDATION",
      matchedSignals: signals,
    });
  }

  return frozenRoute({
    operation: "unknown",
    capability: "recommend",
    confidence: "low",
    approvalBoundary: "none",
    requiresApprovalNow: false,
    requestedExternalEffect: false,
    reasonCode: "APOLLOS_ROUTE_CLARIFICATION_REQUIRED",
    matchedSignals: signals,
  });
}

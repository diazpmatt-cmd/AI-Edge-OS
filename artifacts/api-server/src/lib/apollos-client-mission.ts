import type {
  ApollosActivationPlan,
  ApollosActivationPlanItem,
  ApollosClientCoverage,
} from "./apollos-client-orchestrator.js";

export interface ApollosClientMissionSummary {
  readonly mission: "maximize_ai_edge_utilization";
  readonly status: "optimized" | "action_required";
  readonly clientId: string;
  readonly clientName: string;
  readonly coverageScore: number;
  readonly activeCapabilities: number;
  readonly applicableCapabilities: number;
  readonly opportunities: number;
  readonly authorizationRequired: number;
  readonly blocked: number;
  readonly readyAutomatic: readonly ApollosActivationPlanItem[];
  readonly humanApprovalRequired: readonly ApollosActivationPlanItem[];
  readonly oauthAuthorizationRequired: readonly ApollosActivationPlanItem[];
  readonly externalConfigurationRequired: readonly ApollosActivationPlanItem[];
  readonly blockedActions: readonly ApollosActivationPlanItem[];
  readonly topPriorityActions: readonly ApollosActivationPlanItem[];
  readonly nextCommand: string;
}

export function buildApollosClientMissionSummary(input: {
  readonly coverage: ApollosClientCoverage;
  readonly activationPlan: ApollosActivationPlan;
  readonly topActionLimit?: number;
}): ApollosClientMissionSummary {
  if (input.coverage.client.id !== input.activationPlan.clientId) {
    throw new Error("APOLLOS_MISSION_TENANT_MISMATCH");
  }

  const limit = Math.max(1, Math.min(20, Math.trunc(input.topActionLimit ?? 8)));
  const productStageByCapability = new Map(
    input.coverage.capabilities.map((item) => [item.capability.key, item.capability.productStage] as const),
  );
  const items = input.activationPlan.items.filter(
    (item) => productStageByCapability.get(item.capabilityKey) !== "planned",
  );
  const byExecutionStatus = (status: ApollosActivationPlanItem["executionStatus"]) =>
    Object.freeze(items.filter((item) => item.executionStatus === status));

  return Object.freeze({
    mission: "maximize_ai_edge_utilization" as const,
    status: items.length === 0 ? "optimized" as const : "action_required" as const,
    clientId: input.coverage.client.id,
    clientName: input.coverage.client.name,
    coverageScore: input.coverage.score,
    activeCapabilities: input.coverage.activeCapabilities,
    applicableCapabilities: input.coverage.applicableCapabilities,
    opportunities: input.coverage.opportunities,
    authorizationRequired: input.coverage.authorizationRequired,
    blocked: input.coverage.blocked,
    readyAutomatic: byExecutionStatus("ready"),
    humanApprovalRequired: byExecutionStatus("approval_required"),
    oauthAuthorizationRequired: byExecutionStatus("authorization_required"),
    externalConfigurationRequired: byExecutionStatus("external_configuration_required"),
    blockedActions: byExecutionStatus("blocked"),
    topPriorityActions: Object.freeze(items.slice(0, limit)),
    nextCommand: items.length === 0
      ? "Continue monitoring client coverage for regressions and new capabilities."
      : "Work the highest-priority independent actions first; request human or OAuth authorization only at the explicit boundary.",
  });
}

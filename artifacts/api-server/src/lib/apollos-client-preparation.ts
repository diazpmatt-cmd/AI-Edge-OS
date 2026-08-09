import type { ApollosActionGate } from "./apollos-client-orchestrator.js";
import type { ApollosLiveCoverageSuccess } from "./apollos-client-coverage-live.js";

export interface ApollosPreparedActivation {
  readonly status: "prepared";
  readonly clientId: string;
  readonly clientName: string;
  readonly capabilityKey: string;
  readonly capabilityName: string;
  readonly action: string;
  readonly reason: string;
  readonly expectedBenefit: string;
  readonly dependencies: readonly string[];
  readonly gate: ApollosActionGate;
  readonly boundary:
    | "prepared_for_safe_execution"
    | "human_approval_required"
    | "oauth_authorization_required"
    | "external_configuration_required"
    | "blocked";
  readonly sideEffects: false;
  readonly executionStarted: false;
  readonly message: string;
}

export type ApollosActivationPreparationResult =
  | ApollosPreparedActivation
  | {
      readonly status: "no_action_required";
      readonly capabilityKey: string;
      readonly capabilityStatus: string;
      readonly sideEffects: false;
    }
  | { readonly status: "capability_not_found"; readonly capabilityKey: string };

function executionBoundary(gate: ApollosActionGate): ApollosPreparedActivation["boundary"] {
  switch (gate) {
    case "SAFE_AUTOMATIC_ACTION": return "prepared_for_safe_execution";
    case "HUMAN_APPROVAL_REQUIRED": return "human_approval_required";
    case "OAUTH_AUTHORIZATION_REQUIRED": return "oauth_authorization_required";
    case "EXTERNAL_CONFIGURATION_REQUIRED": return "external_configuration_required";
    case "BLOCKED": return "blocked";
  }
}

export function prepareApollosCapabilityActivation(
  live: ApollosLiveCoverageSuccess,
  capabilityKey: string,
): ApollosActivationPreparationResult {
  const key = capabilityKey.trim();
  const item = live.activationPlan.items.find((candidate) => candidate.capabilityKey === key);
  if (!item) {
    const current = live.coverage.capabilities.find((candidate) => candidate.capability.key === key);
    if (!current) {
      return Object.freeze({ status: "capability_not_found" as const, capabilityKey: key });
    }
    return Object.freeze({
      status: "no_action_required" as const,
      capabilityKey: key,
      capabilityStatus: current.status,
      sideEffects: false as const,
    });
  }

  return Object.freeze({
    status: "prepared" as const,
    clientId: live.context.clientId,
    clientName: live.context.clientName,
    capabilityKey: key,
    capabilityName: item.capabilityName,
    action: item.recommendedAction,
    reason: item.reason,
    expectedBenefit: item.expectedBenefit,
    dependencies: Object.freeze([...item.dependencies]),
    gate: item.gate,
    boundary: executionBoundary(item.gate),
    sideEffects: false as const,
    executionStarted: false as const,
    message:
      "Preparation only. This does not perform OAuth, publish externally, send outreach, spend money, or mutate provider state.",
  });
}

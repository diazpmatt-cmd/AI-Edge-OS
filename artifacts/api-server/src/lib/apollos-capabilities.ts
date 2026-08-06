export type ApollosCapabilityState =
  | "ready"
  | "degraded"
  | "blocked"
  | "disabled";

export interface ApollosCapability {
  readonly id: "diagnose" | "recommend" | "prepare" | "publish";
  readonly state: ApollosCapabilityState;
  readonly reasonCode: string;
  readonly detail: string;
  readonly requiresApproval: boolean;
}

export interface ApollosCapabilityInput {
  readonly agentWorkerEnabled: boolean;
  readonly agentProviderEnabled: boolean;
  readonly agentKillSwitch: boolean;
  readonly aiCredentialPresent: boolean;
  readonly preparationWorkerEnabled: boolean;
  readonly preparationKillSwitch: boolean;
  readonly publishingWorkerEnabled: boolean;
  readonly publishingKillSwitch: boolean;
  readonly schedulerSecretPresent: boolean;
}

function capability(
  id: ApollosCapability["id"],
  state: ApollosCapabilityState,
  reasonCode: string,
  detail: string,
  requiresApproval: boolean,
): ApollosCapability {
  return Object.freeze({ id, state, reasonCode, detail, requiresApproval });
}

export function buildApollosCapabilities(
  input: ApollosCapabilityInput,
): readonly ApollosCapability[] {
  const diagnose = capability(
    "diagnose",
    "ready",
    "APOLLOS_DIAGNOSTICS_READY",
    "Read-only system diagnosis is available.",
    false,
  );

  const recommend = !input.agentWorkerEnabled
    ? capability(
        "recommend",
        "disabled",
        "APOLLOS_AGENT_WORKER_DISABLED",
        "Recommendations are disabled because the agent worker is off.",
        false,
      )
    : input.agentKillSwitch
      ? capability(
          "recommend",
          "blocked",
          "APOLLOS_AGENT_KILL_SWITCH",
          "Recommendations are blocked by the agent kill switch.",
          false,
        )
      : !input.agentProviderEnabled
        ? capability(
            "recommend",
            "blocked",
            "APOLLOS_AGENT_PROVIDER_DISABLED",
            "Recommendations are blocked because the AI provider is disabled.",
            false,
          )
        : !input.aiCredentialPresent
          ? capability(
              "recommend",
              "blocked",
              "APOLLOS_AI_CREDENTIAL_MISSING",
              "Recommendations are blocked because no AI provider credential is configured.",
              false,
            )
          : capability(
              "recommend",
              "ready",
              "APOLLOS_RECOMMENDATIONS_READY",
              "AI-backed recommendations are available within configured budgets.",
              false,
            );

  const prepare = !input.preparationWorkerEnabled
    ? capability(
        "prepare",
        "disabled",
        "APOLLOS_PREPARATION_WORKER_DISABLED",
        "Change preparation is disabled because the preparation worker is off.",
        true,
      )
    : input.preparationKillSwitch
      ? capability(
          "prepare",
          "blocked",
          "APOLLOS_PREPARATION_KILL_SWITCH",
          "Change preparation is blocked by the preparation kill switch.",
          true,
        )
      : recommend.state !== "ready"
        ? capability(
            "prepare",
            "degraded",
            "APOLLOS_RECOMMENDATION_DEPENDENCY",
            "The preparation worker is enabled, but AI-backed planning is unavailable.",
            true,
          )
        : capability(
            "prepare",
            "ready",
            "APOLLOS_PREPARATION_READY",
            "Bounded changes can be prepared for human review.",
            true,
          );

  const publish = !input.publishingWorkerEnabled
    ? capability(
        "publish",
        "disabled",
        "APOLLOS_PUBLISHING_WORKER_DISABLED",
        "Approved-change publishing is disabled because the publishing worker is off.",
        true,
      )
    : input.publishingKillSwitch
      ? capability(
          "publish",
          "blocked",
          "APOLLOS_PUBLISHING_KILL_SWITCH",
          "Approved-change publishing is blocked by the publishing kill switch.",
          true,
        )
      : !input.schedulerSecretPresent
        ? capability(
            "publish",
            "blocked",
            "APOLLOS_SCHEDULER_SECRET_MISSING",
            "Approved-change publishing is blocked because the internal scheduler credential is missing.",
            true,
          )
        : capability(
            "publish",
            "ready",
            "APOLLOS_PUBLISHING_READY",
            "Human-approved changes can be published by the guarded worker.",
            true,
          );

  return Object.freeze([diagnose, recommend, prepare, publish]);
}

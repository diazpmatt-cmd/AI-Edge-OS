import { AiVisibilityExecutionService } from "./ai-visibility-execution-service.js";
import type { ApollosLiveCoverageSuccess } from "./apollos-client-coverage-live.js";

export interface ApollosAiVisibilityRunner {
  execute(input: { readonly clientId: string; readonly userId: string }): Promise<{
    readonly generatedAt: string | Date;
    readonly recommendations: readonly unknown[];
    readonly coverage: readonly unknown[];
    readonly rejected: readonly unknown[];
  }>;
}

export type ApollosSafeActionExecutionResult =
  | {
      readonly status: "executed";
      readonly capabilityKey: "ai_visibility_monitoring";
      readonly clientId: string;
      readonly clientName: string;
      readonly sideEffects: true;
      readonly externalSideEffects: false;
      readonly effectScope: "ai_edge_internal_state_only";
      readonly providerCalls: false;
      readonly spendAuthorized: false;
      readonly generatedAt: string;
      readonly recommendationCount: number;
      readonly coverageSourceCount: number;
      readonly rejectedCount: number;
    }
  | {
      readonly status:
        | "capability_not_found"
        | "not_applicable"
        | "execution_not_allowed"
        | "handler_not_implemented";
      readonly capabilityKey: string;
      readonly sideEffects: false;
      readonly reason: string;
      readonly gate?: string;
      readonly missingDependencies?: readonly string[];
    };

/**
 * Executes only explicitly safe, canonically implemented Apollos actions.
 *
 * This is intentionally an allowlist rather than a generic dispatcher. A
 * capability being marked SAFE_AUTOMATIC_ACTION is necessary but not sufficient:
 * it must also have a concrete handler in this class. That prevents newly-added
 * registry entries from becoming executable by accident.
 */
export class ApollosSafeActionExecutor {
  constructor(
    private readonly aiVisibility: ApollosAiVisibilityRunner = new AiVisibilityExecutionService(),
  ) {}

  async execute(input: {
    readonly live: ApollosLiveCoverageSuccess;
    readonly ownerUserId: string;
    readonly capabilityKey: string;
  }): Promise<ApollosSafeActionExecutionResult> {
    const capabilityKey = input.capabilityKey.trim();
    const coverage = input.live.coverage.capabilities.find(
      (candidate) => candidate.capability.key === capabilityKey,
    );

    if (!coverage) {
      return Object.freeze({
        status: "capability_not_found" as const,
        capabilityKey,
        sideEffects: false as const,
        reason: "Capability is not present in the canonical AI Edge registry.",
      });
    }

    if (coverage.status === "NOT_APPLICABLE") {
      return Object.freeze({
        status: "not_applicable" as const,
        capabilityKey,
        sideEffects: false as const,
        reason: "Capability does not apply to this client.",
      });
    }

    if (coverage.capability.activationGate !== "SAFE_AUTOMATIC_ACTION") {
      return Object.freeze({
        status: "execution_not_allowed" as const,
        capabilityKey,
        sideEffects: false as const,
        gate: coverage.capability.activationGate,
        reason: "Capability requires a non-automatic authorization boundary.",
      });
    }

    const missingDependencies = (coverage.capability.dependencies ?? []).filter((dependencyKey) => {
      const dependency = input.live.coverage.capabilities.find(
        (candidate) => candidate.capability.key === dependencyKey,
      );
      return dependency?.status !== "ACTIVE";
    });
    if (missingDependencies.length > 0 || coverage.status === "BLOCKED") {
      return Object.freeze({
        status: "execution_not_allowed" as const,
        capabilityKey,
        sideEffects: false as const,
        gate: coverage.actionGate ?? "BLOCKED",
        reason: coverage.blockedReason ?? "Required capability dependencies are not active.",
        missingDependencies: Object.freeze([...missingDependencies]),
      });
    }

    // Closed handler allowlist. Discovery remains excluded until a separate
    // pre-authorized provider-spend policy exists. Measurement remains excluded
    // until its canonical baseline writer is identified.
    if (capabilityKey !== "ai_visibility_monitoring") {
      return Object.freeze({
        status: "handler_not_implemented" as const,
        capabilityKey,
        sideEffects: false as const,
        gate: coverage.capability.activationGate,
        reason: "Capability is safe-marked but has no approved automatic handler yet.",
      });
    }

    const model = await this.aiVisibility.execute({
      clientId: input.live.context.clientId,
      userId: input.ownerUserId,
    });

    return Object.freeze({
      status: "executed" as const,
      capabilityKey: "ai_visibility_monitoring" as const,
      clientId: input.live.context.clientId,
      clientName: input.live.context.clientName,
      sideEffects: true as const,
      externalSideEffects: false as const,
      effectScope: "ai_edge_internal_state_only" as const,
      providerCalls: false as const,
      spendAuthorized: false as const,
      generatedAt: typeof model.generatedAt === "string"
        ? model.generatedAt
        : model.generatedAt.toISOString(),
      recommendationCount: model.recommendations.length,
      coverageSourceCount: model.coverage.length,
      rejectedCount: model.rejected.length,
    });
  }
}

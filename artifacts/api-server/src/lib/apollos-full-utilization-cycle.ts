import { buildApollosClientMissionSummary } from "./apollos-client-mission.js";
import {
  buildApollosLiveCoverageForUser,
  type ApollosLiveCoverageResult,
  type ApollosLiveCoverageSuccess,
} from "./apollos-client-coverage-live.js";
import {
  ApollosSafeActionExecutor,
  type ApollosSafeActionExecutionResult,
} from "./apollos-safe-action-executor.js";

export type ApollosCycleLiveBuilder = (ownerUserId: string) => Promise<ApollosLiveCoverageResult>;

export interface ApollosCycleSafeActionRunner {
  execute(input: {
    readonly live: ApollosLiveCoverageSuccess;
    readonly ownerUserId: string;
    readonly capabilityKey: string;
  }): Promise<ApollosSafeActionExecutionResult>;
}

export interface ApollosFullUtilizationCycleResult {
  readonly mission: "maximize_ai_edge_utilization";
  readonly clientId: string;
  readonly clientName: string;
  readonly initialCoverageScore: number;
  readonly finalCoverageScore: number;
  readonly sideEffects: boolean;
  readonly attemptedSafeActions: readonly ApollosSafeActionExecutionResult[];
  readonly executedCapabilityKeys: readonly string[];
  readonly remainingAutomaticCapabilityKeys: readonly string[];
  readonly remainingHumanActions: readonly {
    readonly capabilityKey: string;
    readonly capabilityName: string;
    readonly gate: string;
    readonly recommendedAction: string;
  }[];
  readonly finalMission: ReturnType<typeof buildApollosClientMissionSummary>;
}

/**
 * Runs one bounded "do everything you safely can" pass for an authorized client.
 *
 * - Safe actions are selected dynamically from the current activation plan.
 * - Each capability is attempted at most once per cycle.
 * - State is refreshed after every successful execution so later dependencies
 *   can unlock in the same cycle.
 * - OAuth, approval, external-configuration, blocked, and unimplemented work is
 *   returned to the caller rather than executed.
 */
export class ApollosFullUtilizationCycleRunner {
  constructor(
    private readonly buildLive: ApollosCycleLiveBuilder = buildApollosLiveCoverageForUser,
    private readonly safeActions: ApollosCycleSafeActionRunner = new ApollosSafeActionExecutor(),
  ) {}

  async run(input: {
    readonly ownerUserId: string;
    readonly initialLive: ApollosLiveCoverageSuccess;
  }): Promise<ApollosFullUtilizationCycleResult> {
    const initialClientId = input.initialLive.context.clientId;
    const initialCoverageScore = input.initialLive.coverage.score;
    let live = input.initialLive;

    const attemptedKeys = new Set<string>();
    const attempts: ApollosSafeActionExecutionResult[] = [];
    const executedCapabilityKeys: string[] = [];

    // Bounded by the number of capabilities in the current coverage snapshot.
    // Each key is attempted once, so newly introduced handlers cannot create a loop.
    for (let step = 0; step < live.coverage.capabilities.length; step += 1) {
      const next = live.activationPlan.items.find((item) => {
        if (attemptedKeys.has(item.capabilityKey)) return false;
        const coverage = live.coverage.capabilities.find(
          (candidate) => candidate.capability.key === item.capabilityKey,
        );
        return coverage?.capability.activationGate === "SAFE_AUTOMATIC_ACTION";
      });

      if (!next) break;
      attemptedKeys.add(next.capabilityKey);

      const execution = await this.safeActions.execute({
        live,
        ownerUserId: input.ownerUserId,
        capabilityKey: next.capabilityKey,
      });
      attempts.push(execution);

      if (execution.status !== "executed") continue;
      executedCapabilityKeys.push(execution.capabilityKey);

      const refreshed = await this.buildLive(input.ownerUserId);
      if (!refreshed.ok) {
        throw new Error(`APOLLOS_CYCLE_REFRESH_${refreshed.reason.toUpperCase()}`);
      }
      if (refreshed.context.clientId !== initialClientId) {
        throw new Error("APOLLOS_CYCLE_CLIENT_RESOLUTION_MISMATCH");
      }
      live = refreshed;
    }

    const remainingAutomaticCapabilityKeys = live.activationPlan.items
      .filter((item) => {
        const coverage = live.coverage.capabilities.find(
          (candidate) => candidate.capability.key === item.capabilityKey,
        );
        return coverage?.capability.activationGate === "SAFE_AUTOMATIC_ACTION";
      })
      .map((item) => item.capabilityKey);

    const remainingHumanActions = live.activationPlan.items
      .filter((item) => {
        const coverage = live.coverage.capabilities.find(
          (candidate) => candidate.capability.key === item.capabilityKey,
        );
        return coverage?.capability.activationGate !== "SAFE_AUTOMATIC_ACTION";
      })
      .map((item) => Object.freeze({
        capabilityKey: item.capabilityKey,
        capabilityName: item.capabilityName,
        gate: item.gate,
        recommendedAction: item.recommendedAction,
      }));

    return Object.freeze({
      mission: "maximize_ai_edge_utilization" as const,
      clientId: live.context.clientId,
      clientName: live.context.clientName,
      initialCoverageScore,
      finalCoverageScore: live.coverage.score,
      sideEffects: executedCapabilityKeys.length > 0,
      attemptedSafeActions: Object.freeze([...attempts]),
      executedCapabilityKeys: Object.freeze([...executedCapabilityKeys]),
      remainingAutomaticCapabilityKeys: Object.freeze([...remainingAutomaticCapabilityKeys]),
      remainingHumanActions: Object.freeze([...remainingHumanActions]),
      finalMission: buildApollosClientMissionSummary({
        coverage: live.coverage,
        activationPlan: live.activationPlan,
      }),
    });
  }
}

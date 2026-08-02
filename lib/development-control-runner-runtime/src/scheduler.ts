import type { RunCycleRequest, RunnerCycleResult } from "./index.js";

export type WakeupReasonCode =
  | "DUE"
  | "NOT_YET_DUE"
  | "PAUSED"
  | "KILL_SWITCH_ACTIVE"
  | "INVALID_SCHEDULE"
  | "PRIOR_CYCLE_IN_PROGRESS"
  | "BACKOFF_ACTIVE"
  | "CYCLE_COMPLETED"
  | "CYCLE_STOPPED"
  | "CYCLE_FAILED";

export interface WakeupSchedulePolicy {
  readonly scheduleId: string;
  readonly actorId: string;
  readonly intervalMs: number;
  readonly backoffBaseMs: number;
  readonly backoffMaxMs: number;
  readonly paused: boolean;
  readonly killSwitch: boolean;
  readonly maxTasks?: number;
}

export interface PriorHeartbeatSnapshot {
  readonly lastDueSlot?: number | null;
  readonly lastCompletedAt?: string | null;
  readonly inProgressCycleKey?: string | null;
  readonly consecutiveFailures: number;
}

export interface WakeupTickRequest {
  readonly now: string;
  readonly policy: WakeupSchedulePolicy;
  readonly prior: PriorHeartbeatSnapshot;
}

export interface WakeupHeartbeat {
  readonly scheduleId: string;
  readonly evaluatedAt: string;
  readonly due: boolean;
  readonly reasonCode: WakeupReasonCode;
  readonly attemptedCycleKey: string | null;
  readonly dueSlot: number | null;
  readonly nextEligibleAt: string | null;
  readonly cycleResult: RunnerCycleResult | null;
}

export interface WakeupControllerDependencies {
  readonly runCycle: (request: RunCycleRequest) => Promise<RunnerCycleResult>;
}

function parseTime(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validIdentifier(value: string): boolean {
  return value.length > 0 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);
}

function iso(value: number): string {
  return new Date(value).toISOString();
}

function heartbeat(
  request: WakeupTickRequest,
  values: Omit<WakeupHeartbeat, "scheduleId" | "evaluatedAt">,
): WakeupHeartbeat {
  return Object.freeze({
    scheduleId: request.policy.scheduleId,
    evaluatedAt: request.now,
    ...values,
  });
}

function backoffMs(policy: WakeupSchedulePolicy, failures: number): number {
  if (failures <= 0) return 0;
  const exponent = Math.min(failures - 1, 30);
  return Math.min(policy.backoffBaseMs * 2 ** exponent, policy.backoffMaxMs);
}

function classifyCycle(result: RunnerCycleResult): WakeupReasonCode {
  if ("failureCode" in result) return "CYCLE_FAILED";
  return result.outcome === "stopped" ? "CYCLE_STOPPED" : "CYCLE_COMPLETED";
}

export function createWakeupController(dependencies: WakeupControllerDependencies) {
  return Object.freeze({
    async tick(request: WakeupTickRequest): Promise<WakeupHeartbeat> {
      const { policy, prior } = request;
      const nowMs = parseTime(request.now);
      const lastCompletedMs = prior.lastCompletedAt == null ? null : parseTime(prior.lastCompletedAt);
      const valid =
        nowMs !== null &&
        validIdentifier(policy.scheduleId) &&
        validIdentifier(policy.actorId) &&
        Number.isInteger(policy.intervalMs) &&
        policy.intervalMs >= 1_000 &&
        policy.intervalMs <= 86_400_000 &&
        Number.isInteger(policy.backoffBaseMs) &&
        policy.backoffBaseMs >= 1_000 &&
        Number.isInteger(policy.backoffMaxMs) &&
        policy.backoffMaxMs >= policy.backoffBaseMs &&
        policy.backoffMaxMs <= 86_400_000 &&
        Number.isInteger(prior.consecutiveFailures) &&
        prior.consecutiveFailures >= 0 &&
        (prior.lastCompletedAt == null || lastCompletedMs !== null);

      if (!valid) {
        return heartbeat(request, {
          due: false,
          reasonCode: "INVALID_SCHEDULE",
          attemptedCycleKey: null,
          dueSlot: null,
          nextEligibleAt: null,
          cycleResult: null,
        });
      }

      if (policy.killSwitch) {
        return heartbeat(request, {
          due: false,
          reasonCode: "KILL_SWITCH_ACTIVE",
          attemptedCycleKey: null,
          dueSlot: null,
          nextEligibleAt: null,
          cycleResult: null,
        });
      }

      if (policy.paused) {
        return heartbeat(request, {
          due: false,
          reasonCode: "PAUSED",
          attemptedCycleKey: null,
          dueSlot: null,
          nextEligibleAt: null,
          cycleResult: null,
        });
      }

      if (prior.inProgressCycleKey != null) {
        return heartbeat(request, {
          due: false,
          reasonCode: "PRIOR_CYCLE_IN_PROGRESS",
          attemptedCycleKey: null,
          dueSlot: null,
          nextEligibleAt: null,
          cycleResult: null,
        });
      }

      const backoff = backoffMs(policy, prior.consecutiveFailures);
      if (backoff > 0 && lastCompletedMs !== null && nowMs! < lastCompletedMs + backoff) {
        return heartbeat(request, {
          due: false,
          reasonCode: "BACKOFF_ACTIVE",
          attemptedCycleKey: null,
          dueSlot: null,
          nextEligibleAt: iso(lastCompletedMs + backoff),
          cycleResult: null,
        });
      }

      const dueSlot = Math.floor(nowMs! / policy.intervalMs);
      if (prior.lastDueSlot != null && dueSlot <= prior.lastDueSlot) {
        return heartbeat(request, {
          due: false,
          reasonCode: "NOT_YET_DUE",
          attemptedCycleKey: null,
          dueSlot,
          nextEligibleAt: iso((prior.lastDueSlot + 1) * policy.intervalMs),
          cycleResult: null,
        });
      }

      const cycleKey = `${policy.scheduleId}:${dueSlot}`;
      const cycleResult = await dependencies.runCycle({
        cycleKey,
        actorId: policy.actorId,
        killSwitch: false,
        maxTasks: policy.maxTasks,
      });

      return heartbeat(request, {
        due: true,
        reasonCode: classifyCycle(cycleResult),
        attemptedCycleKey: cycleKey,
        dueSlot,
        nextEligibleAt: iso((dueSlot + 1) * policy.intervalMs),
        cycleResult,
      });
    },
  });
}

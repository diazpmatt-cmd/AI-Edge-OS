import type { ApollosRepairPlan } from "./apollos-repair-planner.js";
import {
  createApollosRepairReceipt,
  decideApollosRepairExecution,
  type ApollosRepairStepReceipt,
} from "./apollos-repair-execution.js";

export interface ApollosRepairBinding {
  readonly diagnosisId: string;
  readonly planId: string;
}

export interface ApollosRepairActionContext {
  readonly sourceTaskId: string;
  readonly repairTaskId: string;
  readonly plan: ApollosRepairPlan;
  readonly stepKey: string;
  readonly signal: AbortSignal;
}

export interface ApollosRepairActionResult {
  readonly verified: boolean;
  readonly evidence: unknown;
}

export type ApollosRepairAction = (
  context: ApollosRepairActionContext,
) => Promise<ApollosRepairActionResult>;

export interface ApollosRepairRunnerDependencies {
  readonly actions: Readonly<Record<string, ApollosRepairAction>>;
  readonly readCurrentBinding: () => Promise<ApollosRepairBinding>;
  readonly persistReceipt: (
    receipt: ApollosRepairStepReceipt,
  ) => Promise<void>;
  readonly now: () => string;
}

export interface ApollosRepairRunnerInput {
  readonly sourceTaskId: string;
  readonly repairTaskId: string;
  readonly plan: ApollosRepairPlan;
  readonly approvedPlanId: string | null;
  readonly approvedDiagnosisId: string | null;
  readonly receipts: readonly ApollosRepairStepReceipt[];
  readonly signal: AbortSignal;
}

export type ApollosRepairRunnerStatus =
  | "completed"
  | "waiting_for_approval"
  | "waiting_for_operator"
  | "blocked_unsupported"
  | "stopped_stale_evidence"
  | "verification_failed"
  | "cancelled";

export interface ApollosRepairRunnerResult {
  readonly status: ApollosRepairRunnerStatus;
  readonly reasonCode: string;
  readonly completedSteps: number;
  readonly totalSteps: number;
  readonly receipts: readonly ApollosRepairStepReceipt[];
}

function result(
  status: ApollosRepairRunnerStatus,
  reasonCode: string,
  completedSteps: number,
  totalSteps: number,
  receipts: readonly ApollosRepairStepReceipt[],
): ApollosRepairRunnerResult {
  return Object.freeze({
    status,
    reasonCode,
    completedSteps,
    totalSteps,
    receipts: Object.freeze([...receipts]),
  });
}

export async function runApollosRepairPlan(
  input: ApollosRepairRunnerInput,
  dependencies: ApollosRepairRunnerDependencies,
): Promise<ApollosRepairRunnerResult> {
  const receipts = [...input.receipts];

  for (let iteration = 0; iteration <= input.plan.steps.length; iteration += 1) {
    if (input.signal.aborted) {
      return result(
        "cancelled",
        "APOLLOS_REPAIR_RUN_CANCELLED",
        receipts.filter((item) => item.status === "verified").length,
        input.plan.steps.length,
        receipts,
      );
    }

    const binding = await dependencies.readCurrentBinding();
    const decision = decideApollosRepairExecution({
      plan: input.plan,
      currentDiagnosisId: binding.diagnosisId,
      currentPlanId: binding.planId,
      approvedPlanId: input.approvedPlanId,
      approvedDiagnosisId: input.approvedDiagnosisId,
      receipts,
    });

    if (decision.action === "complete") {
      return result(
        "completed",
        decision.reasonCode,
        decision.completedSteps,
        decision.totalSteps,
        receipts,
      );
    }
    if (decision.action === "wait_for_approval") {
      return result(
        "waiting_for_approval",
        decision.reasonCode,
        decision.completedSteps,
        decision.totalSteps,
        receipts,
      );
    }
    if (decision.action === "wait_for_operator") {
      return result(
        "waiting_for_operator",
        decision.reasonCode,
        decision.completedSteps,
        decision.totalSteps,
        receipts,
      );
    }
    if (decision.action === "stop_stale_evidence") {
      return result(
        "stopped_stale_evidence",
        decision.reasonCode,
        decision.completedSteps,
        decision.totalSteps,
        receipts,
      );
    }
    if (decision.action === "stop_unverified" || !decision.nextStep) {
      return result(
        "verification_failed",
        decision.reasonCode,
        decision.completedSteps,
        decision.totalSteps,
        receipts,
      );
    }

    const action = dependencies.actions[decision.nextStep.key];
    if (!action) {
      return result(
        "blocked_unsupported",
        "APOLLOS_REPAIR_ACTION_NOT_REGISTERED",
        decision.completedSteps,
        decision.totalSteps,
        receipts,
      );
    }

    const actionResult = await action({
      sourceTaskId: input.sourceTaskId,
      repairTaskId: input.repairTaskId,
      plan: input.plan,
      stepKey: decision.nextStep.key,
      signal: input.signal,
    });

    const bindingAfterAction = await dependencies.readCurrentBinding();
    if (
      bindingAfterAction.diagnosisId !== input.plan.diagnosisId ||
      bindingAfterAction.planId !== input.plan.planId
    ) {
      return result(
        "stopped_stale_evidence",
        "APOLLOS_REPAIR_EVIDENCE_CHANGED_AFTER_ACTION",
        decision.completedSteps,
        decision.totalSteps,
        receipts,
      );
    }

    const receipt = createApollosRepairReceipt({
      plan: input.plan,
      step: decision.nextStep,
      status: actionResult.verified ? "verified" : "failed",
      verificationEvidence: actionResult.evidence,
      completedAt: dependencies.now(),
    });
    await dependencies.persistReceipt(receipt);
    receipts.push(receipt);

    if (!actionResult.verified) {
      return result(
        "verification_failed",
        "APOLLOS_REPAIR_STEP_VERIFICATION_FAILED",
        decision.completedSteps,
        decision.totalSteps,
        receipts,
      );
    }
  }

  return result(
    "verification_failed",
    "APOLLOS_REPAIR_RUNNER_ITERATION_GUARD",
    receipts.filter((item) => item.status === "verified").length,
    input.plan.steps.length,
    receipts,
  );
}

import { createHash } from "node:crypto";
import type {
  ApollosRepairPlan,
  ApollosRepairStep,
} from "./apollos-repair-planner.js";

export type ApollosRepairExecutionAction =
  | "run"
  | "wait_for_approval"
  | "wait_for_operator"
  | "stop_stale_evidence"
  | "stop_unverified"
  | "complete";

export interface ApollosRepairStepReceipt {
  readonly planId: string;
  readonly diagnosisId: string;
  readonly stepKey: string;
  readonly status: "verified" | "failed";
  readonly effect: ApollosRepairStep["effect"];
  readonly verification: string;
  readonly evidenceDigest: string;
  readonly completedAt: string;
}

export interface ApollosRepairExecutionInput {
  readonly plan: ApollosRepairPlan;
  readonly currentDiagnosisId: string;
  readonly currentPlanId: string;
  readonly approvedPlanId: string | null;
  readonly approvedDiagnosisId: string | null;
  readonly receipts: readonly ApollosRepairStepReceipt[];
}

export interface ApollosRepairExecutionDecision {
  readonly action: ApollosRepairExecutionAction;
  readonly reasonCode: string;
  readonly nextStep: ApollosRepairStep | null;
  readonly completedSteps: number;
  readonly totalSteps: number;
}

function freezeDecision(
  action: ApollosRepairExecutionAction,
  reasonCode: string,
  nextStep: ApollosRepairStep | null,
  completedSteps: number,
  totalSteps: number,
): ApollosRepairExecutionDecision {
  return Object.freeze({
    action,
    reasonCode,
    nextStep,
    completedSteps,
    totalSteps,
  });
}

export function decideApollosRepairExecution(
  input: ApollosRepairExecutionInput,
): ApollosRepairExecutionDecision {
  const { plan } = input;
  const totalSteps = plan.steps.length;

  if (
    input.currentDiagnosisId !== plan.diagnosisId ||
    input.currentPlanId !== plan.planId
  ) {
    return freezeDecision(
      "stop_stale_evidence",
      "APOLLOS_REPAIR_EVIDENCE_CHANGED",
      null,
      0,
      totalSteps,
    );
  }

  const verifiedByKey = new Map(
    input.receipts
      .filter(
        (receipt) =>
          receipt.planId === plan.planId &&
          receipt.diagnosisId === plan.diagnosisId &&
          receipt.status === "verified",
      )
      .map((receipt) => [receipt.stepKey, receipt]),
  );
  const completedSteps = plan.steps.filter((item) =>
    verifiedByKey.has(item.key),
  ).length;

  if (plan.status === "not_required") {
    return freezeDecision(
      "complete",
      "APOLLOS_REPAIR_NOT_REQUIRED",
      null,
      completedSteps,
      totalSteps,
    );
  }
  if (
    plan.status === "manual_required" ||
    plan.status === "insufficient_evidence"
  ) {
    return freezeDecision(
      "wait_for_operator",
      plan.status === "manual_required"
        ? "APOLLOS_REPAIR_OPERATOR_ACTION_REQUIRED"
        : "APOLLOS_REPAIR_MORE_EVIDENCE_REQUIRED",
      null,
      completedSteps,
      totalSteps,
    );
  }

  const nextStep = plan.steps.find((item) => !verifiedByKey.has(item.key)) ?? null;
  if (!nextStep) {
    return freezeDecision(
      "complete",
      "APOLLOS_REPAIR_ALL_STEPS_VERIFIED",
      null,
      completedSteps,
      totalSteps,
    );
  }

  for (const earlier of plan.steps.filter(
    (item) => item.position < nextStep.position,
  )) {
    if (!verifiedByKey.has(earlier.key)) {
      return freezeDecision(
        "stop_unverified",
        "APOLLOS_REPAIR_PRIOR_STEP_UNVERIFIED",
        null,
        completedSteps,
        totalSteps,
      );
    }
  }

  if (!nextStep.executableByApollos) {
    return freezeDecision(
      "wait_for_operator",
      "APOLLOS_REPAIR_STEP_OPERATOR_ONLY",
      nextStep,
      completedSteps,
      totalSteps,
    );
  }

  if (
    nextStep.requiresApproval &&
    (input.approvedPlanId !== plan.planId ||
      input.approvedDiagnosisId !== plan.diagnosisId)
  ) {
    return freezeDecision(
      "wait_for_approval",
      "APOLLOS_REPAIR_PLAN_APPROVAL_REQUIRED",
      nextStep,
      completedSteps,
      totalSteps,
    );
  }

  return freezeDecision(
    "run",
    nextStep.effect === "checkpoint_resume"
      ? "APOLLOS_REPAIR_BOUNDED_RESUME_READY"
      : nextStep.effect === "read_only"
        ? "APOLLOS_REPAIR_INSPECTION_READY"
        : "APOLLOS_REPAIR_APPROVED_STEP_READY",
    nextStep,
    completedSteps,
    totalSteps,
  );
}

export function createApollosRepairReceipt(input: {
  readonly plan: ApollosRepairPlan;
  readonly step: ApollosRepairStep;
  readonly status: ApollosRepairStepReceipt["status"];
  readonly verificationEvidence: unknown;
  readonly completedAt: string;
}): ApollosRepairStepReceipt {
  const completedAt = new Date(input.completedAt);
  if (!Number.isFinite(completedAt.getTime())) {
    throw new Error("APOLLOS_REPAIR_RECEIPT_TIME_INVALID");
  }
  if (!input.plan.steps.some((item) => item.key === input.step.key)) {
    throw new Error("APOLLOS_REPAIR_RECEIPT_STEP_NOT_IN_PLAN");
  }
  const evidenceDigest = createHash("sha256")
    .update(JSON.stringify(input.verificationEvidence ?? null))
    .digest("hex");

  return Object.freeze({
    planId: input.plan.planId,
    diagnosisId: input.plan.diagnosisId,
    stepKey: input.step.key,
    status: input.status,
    effect: input.step.effect,
    verification: input.step.verification,
    evidenceDigest,
    completedAt: completedAt.toISOString(),
  });
}

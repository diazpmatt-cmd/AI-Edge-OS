import {
  DevelopmentControlError,
  type MilestoneKind,
  type MilestoneRecord,
  type MilestoneStatus,
  type TaskSpecification,
  type TrustedDevelopmentActor,
} from "./types.js";
import { validateActor } from "./events.js";

export const MILESTONE_KINDS: readonly MilestoneKind[] = Object.freeze([
  "committed",
  "pushed",
  "pull_request_opened",
  "merged",
  "deployed",
]);

export function initialMilestones(
  specification: TaskSpecification,
  timestamp: string,
): readonly MilestoneRecord[] {
  const status: MilestoneStatus =
    specification.branchMode === "no_branch"
      ? "not_applicable"
      : "not_verified";
  return Object.freeze(
    MILESTONE_KINDS.map((kind) =>
      Object.freeze({
        kind,
        status,
        evidence: null,
        verifiedBy: null,
        recordedAt: new Date(timestamp).toISOString(),
      }),
    ),
  );
}

export function createMilestoneRecord(input: {
  specification: TaskSpecification;
  kind: MilestoneKind;
  status: MilestoneStatus;
  evidence?: string | null;
  actor?: TrustedDevelopmentActor | null;
  recordedAt: string;
}): MilestoneRecord {
  if (
    input.specification.branchMode === "no_branch" &&
    input.status === "verified"
  ) {
    throw new DevelopmentControlError(
      "MILESTONE_NOT_APPLICABLE",
      "no-branch tasks cannot claim verified Git or deployment milestones",
    );
  }
  if (input.status === "verified") {
    if (!input.actor)
      throw new DevelopmentControlError(
        "MILESTONE_ACTOR_REQUIRED",
        "verified milestones require a trusted actor",
      );
    validateActor(input.actor);
    if (!input.evidence?.trim() || input.evidence.length > 500)
      throw new DevelopmentControlError(
        "MILESTONE_EVIDENCE_REQUIRED",
        "verified milestone evidence is required and bounded",
      );
  } else if (input.evidence !== undefined && input.evidence !== null) {
    throw new DevelopmentControlError(
      "INVALID_MILESTONE_EVIDENCE",
      "non-verified milestones cannot carry factual evidence",
    );
  }
  return Object.freeze({
    kind: input.kind,
    status: input.status,
    evidence: input.status === "verified" ? input.evidence!.trim() : null,
    verifiedBy:
      input.status === "verified" ? Object.freeze({ ...input.actor! }) : null,
    recordedAt: new Date(input.recordedAt).toISOString(),
  });
}

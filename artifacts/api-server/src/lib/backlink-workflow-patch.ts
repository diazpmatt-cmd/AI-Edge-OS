import type {
  BacklinkWorkflowStatus,
  BacklinkWorkflowTransitionInput,
} from "@workspace/db";

export interface LegacyBacklinkWorkflowPatchBody {
  toStatus?: BacklinkWorkflowStatus;
  reason?: string | null;
  ownerId?: string | null;
  nextAction?: string | null;
  dueAt?: string | null;
  outcomeSummary?: string | null;
}

function hasOwn(body: LegacyBacklinkWorkflowPatchBody, key: keyof LegacyBacklinkWorkflowPatchBody): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

export function buildLegacyBacklinkWorkflowTransition(
  body: LegacyBacklinkWorkflowPatchBody,
  actorId: string,
): BacklinkWorkflowTransitionInput {
  if (!body.toStatus) {
    throw new Error("toStatus_required");
  }

  const input: BacklinkWorkflowTransitionInput = {
    toStatus: body.toStatus,
    actorId,
  };

  if (hasOwn(body, "reason")) input.reason = body.reason ?? null;
  if (hasOwn(body, "ownerId")) input.ownerId = body.ownerId ?? null;
  if (hasOwn(body, "nextAction")) input.nextAction = body.nextAction ?? null;
  if (hasOwn(body, "outcomeSummary")) input.outcomeSummary = body.outcomeSummary ?? null;
  if (hasOwn(body, "dueAt")) {
    input.dueAt = body.dueAt ? new Date(body.dueAt) : null;
  }

  return input;
}

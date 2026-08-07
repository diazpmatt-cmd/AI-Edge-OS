import type { BacklinkWorkflowStatus } from "@workspace/db";

export const BACKLINK_WORKFLOW_HUMAN_ACTIONS = [
  "review",
  "approve",
  "start_pursuing",
  "mark_won",
  "reject",
] as const;

export type BacklinkWorkflowHumanAction =
  typeof BACKLINK_WORKFLOW_HUMAN_ACTIONS[number];

const ACTION_TO_STATUS = Object.freeze({
  review: "reviewing",
  approve: "approved",
  start_pursuing: "pursuing",
  mark_won: "won",
  reject: "rejected",
} as const satisfies Readonly<Record<BacklinkWorkflowHumanAction, BacklinkWorkflowStatus>>);

export function isBacklinkWorkflowHumanAction(
  value: unknown,
): value is BacklinkWorkflowHumanAction {
  return typeof value === "string" &&
    (BACKLINK_WORKFLOW_HUMAN_ACTIONS as readonly string[]).includes(value);
}

export function statusForBacklinkWorkflowHumanAction(
  action: BacklinkWorkflowHumanAction,
): BacklinkWorkflowStatus {
  return ACTION_TO_STATUS[action];
}

export function auditReasonForBacklinkWorkflowHumanAction(
  action: BacklinkWorkflowHumanAction,
): string {
  return `authority_human_action:${action}`;
}

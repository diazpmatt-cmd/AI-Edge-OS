import type { BacklinkWorkflowStatus } from "./backlink-persistence-types";

export const BACKLINK_WORKFLOW_TRANSITIONS = {
  discovered: ["reviewing", "rejected", "expired"],
  reviewing: ["approved", "rejected", "expired"],
  approved: ["pursuing", "rejected", "expired"],
  pursuing: ["won", "rejected", "expired"],
  won: [],
  rejected: [],
  expired: [],
} as const satisfies Readonly<Record<BacklinkWorkflowStatus, readonly BacklinkWorkflowStatus[]>>;

export function isBacklinkWorkflowStatus(value: string): value is BacklinkWorkflowStatus {
  return Object.prototype.hasOwnProperty.call(BACKLINK_WORKFLOW_TRANSITIONS, value);
}

export function canTransitionBacklinkWorkflow(from: BacklinkWorkflowStatus, to: BacklinkWorkflowStatus): boolean {
  return (BACKLINK_WORKFLOW_TRANSITIONS[from] as readonly BacklinkWorkflowStatus[]).includes(to);
}

export function assertBacklinkWorkflowTransition(from: BacklinkWorkflowStatus, to: BacklinkWorkflowStatus): void {
  if (!canTransitionBacklinkWorkflow(from, to)) throw new Error(`Invalid backlink workflow transition: ${from} -> ${to}`);
}

export function isTerminalBacklinkWorkflowStatus(status: BacklinkWorkflowStatus): boolean {
  return BACKLINK_WORKFLOW_TRANSITIONS[status].length === 0;
}

import type { BacklinkWorkflowHumanAction } from "./backlink-workflow-human-action.js";

export function blockerForBacklinkWorkflowWinEvidence(
  action: BacklinkWorkflowHumanAction,
  hasVerifiedWinEvidence: boolean,
): "verified_win_evidence_required" | null {
  if (action === "mark_won" && !hasVerifiedWinEvidence) {
    return "verified_win_evidence_required";
  }
  return null;
}

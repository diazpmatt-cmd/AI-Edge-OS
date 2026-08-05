export type AssistedChannel = "nextdoor" | "yelp" | "thumbtack";
export type AssistedWorkflowState = "prepared" | "ready_for_review" | "approved" | "posted_manually" | "verified" | "failed";

const transitions: Record<AssistedWorkflowState, AssistedWorkflowState[]> = {
  prepared: ["ready_for_review", "failed"], ready_for_review: ["approved", "prepared", "failed"],
  approved: ["posted_manually", "failed"], posted_manually: ["verified", "failed"], verified: [], failed: ["prepared"],
};
export function canTransitionAssistedWorkflow(from: AssistedWorkflowState, to: AssistedWorkflowState) { return transitions[from].includes(to); }
export function requiresManualPosting(channel: AssistedChannel) { return channel === "nextdoor" || channel === "yelp" || channel === "thumbtack"; }

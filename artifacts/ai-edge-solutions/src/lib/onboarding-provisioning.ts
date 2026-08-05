export type ProvisioningState = "draft" | "validated" | "ready_for_provisioning" | "provisioning" | "partial" | "ready_for_acceptance" | "active" | "failed" | "rolled_back";
export interface ProvisioningStepReceipt { clientId: string; step: string; idempotencyKey: string; status: "completed" | "failed" | "skipped"; observedAt: string; evidenceRef: string | null; errorCode: string | null; }
const transitions: Record<ProvisioningState, ProvisioningState[]> = {
  draft: ["validated", "failed"], validated: ["ready_for_provisioning", "draft", "failed"], ready_for_provisioning: ["provisioning", "failed"],
  provisioning: ["partial", "ready_for_acceptance", "failed"], partial: ["provisioning", "ready_for_acceptance", "failed", "rolled_back"],
  ready_for_acceptance: ["active", "provisioning", "failed", "rolled_back"], active: [], failed: ["draft", "rolled_back"], rolled_back: ["draft"],
};
export function canTransitionProvisioning(from: ProvisioningState, to: ProvisioningState) { return transitions[from].includes(to); }
export function deriveProvisioningState(receipts: ProvisioningStepReceipt[], requiredSteps: string[]): ProvisioningState {
  if (receipts.some(receipt => receipt.status === "failed")) return "partial";
  const completed = new Set(receipts.filter(receipt => receipt.status === "completed").map(receipt => receipt.step));
  return requiredSteps.every(step => completed.has(step)) ? "ready_for_acceptance" : receipts.length ? "provisioning" : "ready_for_provisioning";
}

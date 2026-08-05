export type BusinessActionCategory = "publish_content" | "send_message" | "place_call" | "change_configuration" | "external_write";
export interface BusinessActionPreview { actionId: string; clientId: string; category: BusinessActionCategory; summary: string; destination: string; payloadHash: string; idempotencyKey: string; createdAt: string; expiresAt: string; }
export interface BusinessActionApproval { actionId: string; clientId: string; payloadHash: string; approvedBy: string; approvedAt: string; expiresAt: string; }
export interface BusinessActionDecision { allowed: boolean; reasons: string[]; }
const PROHIBITED = new Set(["purchase", "refund", "delete_customer_data", "change_credentials"]);
export function evaluateBusinessAction(preview: BusinessActionPreview, approval: BusinessActionApproval | null, now = new Date()): BusinessActionDecision {
  const reasons: string[] = [];
  if (!preview.actionId || !preview.clientId || !preview.summary || !preview.destination || !preview.payloadHash || !preview.idempotencyKey) reasons.push("Action preview is incomplete.");
  if (PROHIBITED.has(preview.category as string)) reasons.push("Action category is prohibited.");
  if (Date.parse(preview.expiresAt) <= now.getTime()) reasons.push("Action preview has expired.");
  if (!approval) reasons.push("Human approval is required.");
  else {
    if (approval.actionId !== preview.actionId || approval.clientId !== preview.clientId || approval.payloadHash !== preview.payloadHash) reasons.push("Approval does not match the action preview.");
    if (!approval.approvedBy.trim()) reasons.push("Approval actor is required.");
    if (Date.parse(approval.expiresAt) <= now.getTime()) reasons.push("Approval has expired.");
  }
  return { allowed: reasons.length === 0, reasons };
}

import { createHash } from "node:crypto";

export const SUPPORTED_PREPARATION_CAPABILITIES = [
  "prepare_documentation_change",
  "prepare_task_record_change",
  "prepare_code_patch",
] as const;

export type PreparationCapability = (typeof SUPPORTED_PREPARATION_CAPABILITIES)[number];
export type ApprovalDecision = "approved" | "rejected" | "modify";

export type ProposalMaterial = {
  requestId: string;
  runId: string;
  resultCreatedAt: string;
  contextHash: string;
  capability: PreparationCapability;
  summary: string;
  recommendedNextStep: string;
  confidence: number;
};

export function isSupportedPreparationCapability(value: unknown): value is PreparationCapability {
  return typeof value === "string" && SUPPORTED_PREPARATION_CAPABILITIES.includes(value as PreparationCapability);
}

export function stableProposalFingerprint(material: ProposalMaterial): string {
  const canonical = JSON.stringify({
    capability: material.capability,
    confidence: material.confidence,
    contextHash: material.contextHash,
    recommendedNextStep: material.recommendedNextStep,
    requestId: material.requestId,
    resultCreatedAt: material.resultCreatedAt,
    runId: material.runId,
    summary: material.summary,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function validateDecisionInput(input: {
  decision: unknown;
  proposalFingerprint: unknown;
  operatorInstructions?: unknown;
}): { ok: true; decision: ApprovalDecision; proposalFingerprint: string; operatorInstructions: string | null } | { ok: false; code: string } {
  if (!(["approved", "rejected", "modify"] as const).includes(input.decision as ApprovalDecision)) return { ok: false, code: "UNSUPPORTED_DECISION" };
  if (typeof input.proposalFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(input.proposalFingerprint)) return { ok: false, code: "INVALID_FINGERPRINT" };
  const instructions = input.operatorInstructions == null ? null : String(input.operatorInstructions).trim();
  if (instructions && instructions.length > 2_000) return { ok: false, code: "INSTRUCTIONS_TOO_LONG" };
  if (input.decision === "modify" && !instructions) return { ok: false, code: "MODIFY_INSTRUCTIONS_REQUIRED" };
  return { ok: true, decision: input.decision as ApprovalDecision, proposalFingerprint: input.proposalFingerprint, operatorInstructions: instructions || null };
}

export function proposalIsExpired(expiresAt: string, now: string): boolean {
  const expires = Date.parse(expiresAt);
  const current = Date.parse(now);
  return !Number.isFinite(expires) || !Number.isFinite(current) || expires <= current;
}

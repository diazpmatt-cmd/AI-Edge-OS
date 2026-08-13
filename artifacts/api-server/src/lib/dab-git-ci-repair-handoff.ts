import { createHash } from "node:crypto";
import type { ApprovalRecord } from "../../../../lib/development-control/src/index.js";
import type { DabCiReceipt } from "./dab-ci-reconciliation.js";
import type { ReceiptStore } from "./dab-git-push-pr-handler.js";

export const DAB_GIT_CI_REPAIR_CONSTRAINT = "same_scope_ci_repair" as const;

export type DabGitCiRepairHandoffReceipt = Readonly<{
  operation: "ci_repair_handoff";
  outcome: "requested";
  taskId: string;
  specificationRevision: number;
  specificationHash: string;
  expectedBaseSha: string;
  authorizedFiles: readonly string[];
  sourcePreparationJobId: string;
  sourceProposalId: string;
  prNumber: number;
  failedHeadSha: string;
  ciEvidenceDigest: string;
  blockerCodes: readonly string[];
  attempt: number;
  maxAttempts: number;
  repairAuthorizationRef: string;
  requestFingerprint: string;
  idempotencyKey: string;
  createdAt: string;
}>;

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const SHA = /^[a-f0-9]{40}$/;

export function isDabGitCiRepairApprovalUsable(input: {
  approval: ApprovalRecord | null;
  normalEditingApprovalId: string;
  taskId: string;
  specificationRevision: number;
  specificationHash: string;
  expectedBaseSha: string;
  now: Date;
}): boolean {
  const approval = input.approval;
  if (!approval || approval.approvalId === input.normalEditingApprovalId) return false;
  if (approval.taskId !== input.taskId || approval.decision !== "approved") return false;
  if (!approval.categories.includes("editing") || !approval.constraints.includes(DAB_GIT_CI_REPAIR_CONSTRAINT)) return false;
  if (approval.specificationRevision !== input.specificationRevision || approval.specificationHash !== input.specificationHash) return false;
  if (approval.expectedGitSha !== input.expectedBaseSha) return false;
  if (!approval.decidingActor.verified || approval.decidingActor.actorType !== "human_authority") return false;
  if (approval.expiresAt && Date.parse(approval.expiresAt) <= input.now.getTime()) return false;
  return true;
}

export async function persistDabGitCiRepairHandoff(input: {
  taskId: string;
  specificationRevision: number;
  specificationHash: string;
  expectedBaseSha: string;
  authorizedFiles: readonly string[];
  sourcePreparationJobId: string;
  sourceProposalId: string;
  ciReceipt: DabCiReceipt;
  attempt: number;
  maxAttempts: number;
  repairAuthorizationRef: string;
  receipts: ReceiptStore<DabGitCiRepairHandoffReceipt>;
  now?: () => Date;
}): Promise<DabGitCiRepairHandoffReceipt> {
  if (input.ciReceipt.outcome !== "blocked") throw new Error("DAB_GIT_CI_REPAIR_HANDOFF_NOT_REQUIRED");
  if (!input.ciReceipt.blockerCodes.some((code) => code.startsWith("trusted_check_failed:"))) throw new Error("DAB_GIT_CI_REPAIR_HANDOFF_NO_FAILED_CHECK");
  if (!input.taskId.trim() || !input.sourcePreparationJobId.trim() || !input.sourceProposalId.trim()) throw new Error("DAB_GIT_CI_REPAIR_HANDOFF_IDENTITY_REQUIRED");
  if (!input.specificationHash.trim() || !SHA.test(input.expectedBaseSha) || !SHA.test(input.ciReceipt.headSha)) throw new Error("DAB_GIT_CI_REPAIR_HANDOFF_BINDING_INVALID");
  if (!Number.isInteger(input.attempt) || input.attempt < 1 || !Number.isInteger(input.maxAttempts) || input.maxAttempts < input.attempt) throw new Error("DAB_GIT_CI_REPAIR_HANDOFF_ATTEMPT_INVALID");
  if (!input.repairAuthorizationRef.trim()) throw new Error("DAB_GIT_CI_REPAIR_HANDOFF_AUTHORIZATION_REQUIRED");

  const authorizedFiles = Object.freeze([...new Set(input.authorizedFiles)].sort());
  if (authorizedFiles.length < 1) throw new Error("DAB_GIT_CI_REPAIR_HANDOFF_FILES_REQUIRED");
  const blockerCodes = Object.freeze([...input.ciReceipt.blockerCodes].sort());
  const material = {
    operation: "ci_repair_handoff" as const,
    taskId: input.taskId,
    specificationRevision: input.specificationRevision,
    specificationHash: input.specificationHash,
    expectedBaseSha: input.expectedBaseSha,
    authorizedFiles,
    sourcePreparationJobId: input.sourcePreparationJobId,
    sourceProposalId: input.sourceProposalId,
    prNumber: input.ciReceipt.prNumber,
    failedHeadSha: input.ciReceipt.headSha,
    ciEvidenceDigest: input.ciReceipt.evidenceDigest,
    blockerCodes,
    attempt: input.attempt,
    maxAttempts: input.maxAttempts,
    repairAuthorizationRef: input.repairAuthorizationRef.trim(),
  };
  const requestFingerprint = hash(material);
  const idempotencyKey = `dab-git-repair-handoff:${requestFingerprint}`;
  const prior = await input.receipts.getByIdempotencyKey(idempotencyKey);
  if (prior) return prior;

  const receipt = Object.freeze({
    ...material,
    outcome: "requested" as const,
    requestFingerprint,
    idempotencyKey,
    createdAt: (input.now ?? (() => new Date()))().toISOString(),
  });
  await input.receipts.save(receipt);
  return receipt;
}

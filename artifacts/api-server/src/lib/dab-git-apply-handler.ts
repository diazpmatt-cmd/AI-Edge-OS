import {
  evaluateDabGitApplyPolicy,
  verifyDabGitAppliedFiles,
  type DabGitApplyBinding,
} from "./dab-git-apply-policy.js";

export interface DabGitRepositoryAdapter {
  observeBaseSha(repositoryId: string): Promise<string>;
  applyExactFiles(input: {
    repositoryId: string;
    expectedBaseSha: string;
    branchName: string;
    files: readonly { path: string; content: string }[];
    idempotencyKey: string;
  }): Promise<{
    branchName: string;
    observedFiles: readonly { path: string; content: string }[];
    repositoryReceiptRef: string;
  }>;
}

export interface DabGitApplyReceipt {
  readonly operation: "apply_prepared_artifact";
  readonly outcome: "verified";
  readonly requestFingerprint: string;
  readonly idempotencyKey: string;
  readonly repositoryId: string;
  readonly preparationJobId: string;
  readonly proposalId: string;
  readonly expectedBaseSha: string;
  readonly branchName: string;
  readonly editingAuthorizationRef: string;
  readonly actorId: string;
  readonly workloadIdentity: string;
  readonly files: readonly { path: string; sha256: string; bytes: number }[];
  readonly repositoryReceiptRef: string;
  readonly verifiedAt: string;
}

export interface DabGitApplyReceiptStore {
  getByIdempotencyKey(key: string): Promise<DabGitApplyReceipt | null>;
  save(receipt: DabGitApplyReceipt): Promise<void>;
}

export async function applyPreparedArtifact(input: {
  binding: DabGitApplyBinding;
  manifestFiles: readonly { path: string; content: string }[];
  editingAuthorizationUsable: boolean;
  adapterEnabled: boolean;
  killSwitch: boolean;
  handlerRegistered: boolean;
  actorId: string;
  workloadIdentity: string;
  adapter: DabGitRepositoryAdapter;
  receipts: DabGitApplyReceiptStore;
  now?: () => Date;
}): Promise<DabGitApplyReceipt> {
  const existing = await input.receipts.getByIdempotencyKey(input.binding.idempotencyKey);
  if (existing) return existing;

  if (!input.actorId.trim()) throw new Error("DAB_GIT_APPLY_ACTOR_REQUIRED");
  if (!input.workloadIdentity.trim()) throw new Error("DAB_GIT_APPLY_WORKLOAD_IDENTITY_REQUIRED");

  const observedBaseSha = await input.adapter.observeBaseSha(input.binding.repositoryId);
  const decision = evaluateDabGitApplyPolicy({
    binding: input.binding,
    observedBaseSha,
    editingAuthorizationUsable: input.editingAuthorizationUsable,
    adapterEnabled: input.adapterEnabled,
    killSwitch: input.killSwitch,
    handlerRegistered: input.handlerRegistered,
  });
  if (!decision.allowed) throw new Error(decision.reasonCode);

  const preflight = verifyDabGitAppliedFiles({ binding: input.binding, observedFiles: input.manifestFiles });
  if (!preflight.verified) throw new Error(preflight.reasonCode);

  const applied = await input.adapter.applyExactFiles({
    repositoryId: input.binding.repositoryId,
    expectedBaseSha: input.binding.expectedBaseSha,
    branchName: input.binding.branchName,
    files: input.manifestFiles,
    idempotencyKey: input.binding.idempotencyKey,
  });
  if (applied.branchName !== input.binding.branchName) throw new Error("DAB_GIT_APPLY_BRANCH_MISMATCH");

  const verification = verifyDabGitAppliedFiles({ binding: input.binding, observedFiles: applied.observedFiles });
  if (!verification.verified) throw new Error(verification.reasonCode);
  if (!applied.repositoryReceiptRef.trim()) throw new Error("DAB_GIT_APPLY_REPOSITORY_RECEIPT_REQUIRED");

  const receipt: DabGitApplyReceipt = Object.freeze({
    operation: "apply_prepared_artifact",
    outcome: "verified",
    requestFingerprint: input.binding.requestFingerprint,
    idempotencyKey: input.binding.idempotencyKey,
    repositoryId: input.binding.repositoryId,
    preparationJobId: input.binding.preparationJobId,
    proposalId: input.binding.proposalId,
    expectedBaseSha: input.binding.expectedBaseSha,
    branchName: input.binding.branchName,
    editingAuthorizationRef: input.binding.editingAuthorizationRef,
    actorId: input.actorId.trim(),
    workloadIdentity: input.workloadIdentity.trim(),
    files: input.binding.files,
    repositoryReceiptRef: applied.repositoryReceiptRef.trim(),
    verifiedAt: (input.now ?? (() => new Date()))().toISOString(),
  });
  await input.receipts.save(receipt);
  return receipt;
}

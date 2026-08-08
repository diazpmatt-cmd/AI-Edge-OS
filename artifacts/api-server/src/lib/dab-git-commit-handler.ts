import { createHash } from "node:crypto";
import type { DabGitApplyReceipt } from "./dab-git-apply-handler.js";

export const DAB_GIT_COMMIT_REQUIRED_AUTHORIZATION = "committing" as const;

export interface DabGitCommitBinding {
  readonly repositoryId: string;
  readonly branchName: string;
  readonly parentSha: string;
  readonly applyRequestFingerprint: string;
  readonly applyReceiptRef: string;
  readonly committingAuthorizationRef: string;
  readonly files: DabGitApplyReceipt["files"];
  readonly requestFingerprint: string;
  readonly idempotencyKey: string;
}

export interface DabGitCommitReceipt {
  readonly outcome: "verified";
  readonly requestFingerprint: string;
  readonly idempotencyKey: string;
  readonly repositoryId: string;
  readonly branchName: string;
  readonly parentSha: string;
  readonly commitSha: string;
  readonly treeSha: string;
  readonly committingAuthorizationRef: string;
  readonly actorId: string;
  readonly workloadIdentity: string;
  readonly files: DabGitApplyReceipt["files"];
  readonly committedAt: string;
}

export interface DabGitCommitAdapter {
  observeBranch(input: { repositoryId: string; branchName: string }): Promise<{ headSha: string; files: DabGitApplyReceipt["files"] }>;
  createExactCommit(input: { repositoryId: string; branchName: string; parentSha: string; files: DabGitApplyReceipt["files"]; idempotencyKey: string }): Promise<{ commitSha: string; treeSha: string; parentSha: string; branchName: string }>;
}

export interface DabGitCommitReceiptStore {
  getByIdempotencyKey(key: string): Promise<DabGitCommitReceipt | null>;
  save(receipt: DabGitCommitReceipt): Promise<void>;
}

function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function sameFiles(a: DabGitApplyReceipt["files"], b: DabGitApplyReceipt["files"]) {
  return JSON.stringify([...a].sort((x,y)=>x.path.localeCompare(y.path))) === JSON.stringify([...b].sort((x,y)=>x.path.localeCompare(y.path)));
}

export function buildDabGitCommitBinding(input: { applyReceipt: DabGitApplyReceipt; parentSha: string; committingAuthorizationRef: string }): DabGitCommitBinding {
  if (input.applyReceipt.outcome !== "verified") throw new Error("DAB_GIT_COMMIT_APPLY_RECEIPT_INVALID");
  if (!/^[a-f0-9]{40}$/.test(input.parentSha)) throw new Error("DAB_GIT_COMMIT_PARENT_SHA_INVALID");
  if (!input.committingAuthorizationRef.trim()) throw new Error("DAB_GIT_COMMIT_AUTHORIZATION_REQUIRED");
  const material = {
    repositoryId: input.applyReceipt.repositoryId,
    branchName: input.applyReceipt.branchName,
    parentSha: input.parentSha,
    applyRequestFingerprint: input.applyReceipt.requestFingerprint,
    applyReceiptRef: input.applyReceipt.repositoryReceiptRef,
    committingAuthorizationRef: input.committingAuthorizationRef.trim(),
    files: input.applyReceipt.files,
  };
  const requestFingerprint = hash(material);
  return Object.freeze({ ...material, requestFingerprint, idempotencyKey: `dab-git-commit:${requestFingerprint}` });
}

export async function commitAppliedArtifact(input: {
  binding: DabGitCommitBinding;
  applyReceipt: DabGitApplyReceipt;
  committingAuthorizationUsable: boolean;
  killSwitch: boolean;
  adapterEnabled: boolean;
  handlerRegistered: boolean;
  actorId: string;
  workloadIdentity: string;
  adapter: DabGitCommitAdapter;
  receipts: DabGitCommitReceiptStore;
  now?: () => Date;
}): Promise<DabGitCommitReceipt> {
  const existing = await input.receipts.getByIdempotencyKey(input.binding.idempotencyKey);
  if (existing) return existing;
  if (!input.committingAuthorizationUsable) throw new Error("DAB_GIT_COMMIT_AUTHORIZATION_UNUSABLE");
  if (input.killSwitch) throw new Error("DAB_GIT_COMMIT_KILL_SWITCH");
  if (!input.adapterEnabled) throw new Error("DAB_GIT_COMMIT_ADAPTER_DISABLED");
  if (!input.handlerRegistered) throw new Error("DAB_GIT_COMMIT_HANDLER_MISSING");
  if (!input.actorId.trim()) throw new Error("DAB_GIT_COMMIT_ACTOR_REQUIRED");
  if (!input.workloadIdentity.trim()) throw new Error("DAB_GIT_COMMIT_WORKLOAD_REQUIRED");
  if (input.applyReceipt.requestFingerprint !== input.binding.applyRequestFingerprint || input.applyReceipt.repositoryId !== input.binding.repositoryId || input.applyReceipt.branchName !== input.binding.branchName || !sameFiles(input.applyReceipt.files, input.binding.files)) throw new Error("DAB_GIT_COMMIT_APPLY_RECEIPT_MISMATCH");

  const observed = await input.adapter.observeBranch({ repositoryId: input.binding.repositoryId, branchName: input.binding.branchName });
  if (observed.headSha !== input.binding.parentSha) throw new Error("DAB_GIT_COMMIT_PARENT_SHA_MISMATCH");
  if (!sameFiles(observed.files, input.binding.files)) throw new Error("DAB_GIT_COMMIT_TREE_DRIFT");

  const committed = await input.adapter.createExactCommit({ repositoryId: input.binding.repositoryId, branchName: input.binding.branchName, parentSha: input.binding.parentSha, files: input.binding.files, idempotencyKey: input.binding.idempotencyKey });
  if (committed.parentSha !== input.binding.parentSha || committed.branchName !== input.binding.branchName || !/^[a-f0-9]{40}$/.test(committed.commitSha) || !/^[a-f0-9]{40}$/.test(committed.treeSha)) throw new Error("DAB_GIT_COMMIT_VERIFICATION_FAILED");

  const receipt = Object.freeze({ outcome: "verified" as const, requestFingerprint: input.binding.requestFingerprint, idempotencyKey: input.binding.idempotencyKey, repositoryId: input.binding.repositoryId, branchName: input.binding.branchName, parentSha: input.binding.parentSha, commitSha: committed.commitSha, treeSha: committed.treeSha, committingAuthorizationRef: input.binding.committingAuthorizationRef, actorId: input.actorId.trim(), workloadIdentity: input.workloadIdentity.trim(), files: input.binding.files, committedAt: (input.now ?? (()=>new Date()))().toISOString() });
  await input.receipts.save(receipt);
  return receipt;
}

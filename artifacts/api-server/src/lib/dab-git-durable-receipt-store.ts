import type { DabGitApplyReceipt, DabGitApplyReceiptStore } from "./dab-git-apply-handler.js";
import type { DabGitCiRepairHandoffReceipt } from "./dab-git-ci-repair-handoff.js";
import type { DabGitCommitReceipt, DabGitCommitReceiptStore } from "./dab-git-commit-handler.js";
import type { DabGitMergeReceipt } from "./dab-git-merge-handler.js";
import type { DabGitPrReceipt, DabGitPushReceipt, ReceiptStore } from "./dab-git-push-pr-handler.js";

export type DabDurableGitReceiptOperation = "apply" | "commit" | "push" | "pull_request" | "repair_handoff" | "merge";
export type DabDurableGitReceipt = DabGitApplyReceipt | DabGitCommitReceipt | DabGitPushReceipt | DabGitPrReceipt | DabGitCiRepairHandoffReceipt | DabGitMergeReceipt;

export interface DabDurableGitReceiptRepositoryLike {
  get<T>(input: { taskId: string; operation: DabDurableGitReceiptOperation; idempotencyKey: string }): Promise<{ receipt: T } | null>;
  put<T>(input: { taskId: string; operation: DabDurableGitReceiptOperation; idempotencyKey: string; requestMaterial: unknown; receipt: T }): Promise<{ receipt: T }>;
}

class DurableReceiptStore<T extends { idempotencyKey: string; requestFingerprint: string }> implements ReceiptStore<T> {
  constructor(
    private readonly repository: DabDurableGitReceiptRepositoryLike,
    private readonly taskId: string,
    private readonly operation: DabDurableGitReceiptOperation,
  ) {
    if (!taskId.trim() || taskId.length > 200) throw new Error("DAB_GIT_RECEIPT_TASK_ID_INVALID");
  }

  async getByIdempotencyKey(key: string): Promise<T | null> {
    if (!key.trim()) throw new Error("DAB_GIT_RECEIPT_IDEMPOTENCY_KEY_INVALID");
    const record = await this.repository.get<T>({ taskId: this.taskId, operation: this.operation, idempotencyKey: key });
    if (!record) return null;
    if (record.receipt.idempotencyKey !== key) throw new Error("DAB_GIT_RECEIPT_REPOSITORY_MISMATCH");
    return record.receipt;
  }

  async save(receipt: T): Promise<void> {
    if (!receipt.idempotencyKey.trim() || !receipt.requestFingerprint.trim()) throw new Error("DAB_GIT_RECEIPT_INVALID");
    const saved = await this.repository.put<T>({
      taskId: this.taskId,
      operation: this.operation,
      idempotencyKey: receipt.idempotencyKey,
      requestMaterial: {
        taskId: this.taskId,
        operation: this.operation,
        handlerRequestFingerprint: receipt.requestFingerprint,
        idempotencyKey: receipt.idempotencyKey,
      },
      receipt,
    });
    if (saved.receipt.idempotencyKey !== receipt.idempotencyKey || saved.receipt.requestFingerprint !== receipt.requestFingerprint) {
      throw new Error("DAB_GIT_RECEIPT_PERSISTENCE_MISMATCH");
    }
  }
}

export function createDabGitReceiptStores(repository: DabDurableGitReceiptRepositoryLike, taskId: string): Readonly<{
  apply: DabGitApplyReceiptStore;
  commit: DabGitCommitReceiptStore;
  push: ReceiptStore<DabGitPushReceipt>;
  pullRequest: ReceiptStore<DabGitPrReceipt>;
  repairHandoff: ReceiptStore<DabGitCiRepairHandoffReceipt>;
  merge: ReceiptStore<DabGitMergeReceipt>;
}> {
  return Object.freeze({
    apply: new DurableReceiptStore<DabGitApplyReceipt>(repository, taskId, "apply"),
    commit: new DurableReceiptStore<DabGitCommitReceipt>(repository, taskId, "commit"),
    push: new DurableReceiptStore<DabGitPushReceipt>(repository, taskId, "push"),
    pullRequest: new DurableReceiptStore<DabGitPrReceipt>(repository, taskId, "pull_request"),
    repairHandoff: new DurableReceiptStore<DabGitCiRepairHandoffReceipt>(repository, taskId, "repair_handoff"),
    merge: new DurableReceiptStore<DabGitMergeReceipt>(repository, taskId, "merge"),
  });
}

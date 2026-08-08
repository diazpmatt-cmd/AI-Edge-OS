import { createHash } from "node:crypto";
import type { TaskRecord } from "@workspace/development-control";
import type { DabGitMergeReceipt } from "./dab-git-merge-handler.js";

export type DabPostMergeReceipt = Readonly<{
  outcome: "verified";
  repositoryId: string;
  prNumber: number;
  mergeSha: string;
  defaultBranch: string;
  observedHeadSha: string;
  approvedTreeDigest: string;
  observedTreeDigest: string;
  verifiedAt: string;
  evidenceDigest: string;
}>;

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function verifyDabPostMerge(input: {
  mergeReceipt: DabGitMergeReceipt;
  defaultBranch: string;
  observedDefaultHeadSha: string;
  mergeReachable: boolean;
  approvedFiles: readonly { path: string; sha256: string }[];
  observedFiles: readonly { path: string; sha256: string }[];
  now?: () => Date;
}): DabPostMergeReceipt {
  if (!input.mergeReachable) throw new Error("DAB_POST_MERGE_NOT_REACHABLE");
  if (input.observedDefaultHeadSha !== input.mergeReceipt.mergeSha) throw new Error("DAB_POST_MERGE_HEAD_MISMATCH");
  const normalize = (items: readonly { path: string; sha256: string }[]) => [...items].sort((a, b) => a.path.localeCompare(b.path));
  const approved = normalize(input.approvedFiles);
  const observed = normalize(input.observedFiles);
  if (JSON.stringify(approved) !== JSON.stringify(observed)) throw new Error("DAB_POST_MERGE_TREE_MISMATCH");
  const approvedTreeDigest = digest(approved);
  const observedTreeDigest = digest(observed);
  const verifiedAt = (input.now ?? (() => new Date()))().toISOString();
  const evidenceDigest = digest({ mergeSha: input.mergeReceipt.mergeSha, defaultBranch: input.defaultBranch, observedDefaultHeadSha: input.observedDefaultHeadSha, approvedTreeDigest, observedTreeDigest });
  return Object.freeze({ outcome: "verified", repositoryId: input.mergeReceipt.repositoryId, prNumber: input.mergeReceipt.prNumber, mergeSha: input.mergeReceipt.mergeSha, defaultBranch: input.defaultBranch, observedHeadSha: input.observedDefaultHeadSha, approvedTreeDigest, observedTreeDigest, verifiedAt, evidenceDigest });
}

export function projectDabEngineeringMission(input: {
  task: TaskRecord;
  issueUrl: string | null;
  prUrl: string | null;
  heartbeatAt: string | null;
  blocker: string | null;
  awaitingApproval: boolean;
  postMerge: DabPostMergeReceipt | null;
  nextEligibleAction: string | null;
}) {
  const verifiedMilestones = input.task.milestones.filter(item => item.status === "verified").map(item => item.kind);
  const lastVerifiedMilestone = input.postMerge
    ? "post_merge_verified"
    : (["merged", "pull_request_opened", "pushed", "committed"].find(kind => verifiedMilestones.includes(kind as never)) ?? null);
  const status = input.postMerge
    ? "complete"
    : input.blocker || input.task.state === "blocked"
      ? "blocked"
      : input.awaitingApproval
        ? "awaiting_approval"
        : input.task.claim
          ? "active"
          : input.task.state === "completed"
            ? "complete"
            : "queued";
  return Object.freeze({
    taskId: input.task.specification.taskId,
    title: input.task.specification.title,
    status,
    lastVerifiedMilestone,
    nextEligibleAction: input.postMerge ? null : input.nextEligibleAction,
    blocker: input.postMerge ? null : input.blocker,
    humanNeeded: !input.postMerge && (input.awaitingApproval || Boolean(input.blocker) || input.task.state === "blocked"),
    heartbeatAt: input.heartbeatAt,
    currentLeaseOwner: input.task.claim?.owner.displayName ?? null,
    issueUrl: input.issueUrl,
    prUrl: input.prUrl,
    verificationEvidenceDigest: input.postMerge?.evidenceDigest ?? null,
  });
}

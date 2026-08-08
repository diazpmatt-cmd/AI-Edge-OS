import { describe, expect, it } from "vitest";
import { verifyDabPostMerge, projectDabEngineeringMission, type DabEngineeringTaskProjection } from "../lib/dab-post-merge-verification.js";
import type { DabGitMergeReceipt } from "../lib/dab-git-merge-handler.js";

const merge: DabGitMergeReceipt = { outcome: "verified", repositoryId: "1293944511", prNumber: 12, headSha: "a".repeat(40), baseSha: "b".repeat(40), mergeSha: "c".repeat(40), mergeMethod: "squash", mergeAuthorizationRef: "auth", actorId: "h", workloadIdentity: "w", requestFingerprint: "f", idempotencyKey: "k", mergedAt: "x", ciEvidenceDigest: "d".repeat(64) };
const files = [{ path: "a.ts", sha256: "e".repeat(64) }];
const task: DabEngineeringTaskProjection = {
  specification: { taskId: "t", title: "Superman proof" },
  state: "in_progress",
  claim: null,
  milestones: [
    { kind: "committed", status: "verified" },
    { kind: "pushed", status: "not_verified" },
    { kind: "pull_request_opened", status: "not_verified" },
    { kind: "merged", status: "not_verified" },
    { kind: "deployed", status: "not_verified" },
  ],
};

describe("DAB post merge verification", () => {
  it("verifies exact reachable merged tree", () => {
    const receipt = verifyDabPostMerge({ mergeReceipt: merge, defaultBranch: "main", observedDefaultHeadSha: merge.mergeSha, mergeReachable: true, approvedFiles: files, observedFiles: files });
    expect(receipt.outcome).toBe("verified");
    expect(projectDabEngineeringMission({ task, issueUrl: "i", prUrl: "p", heartbeatAt: "h", blocker: null, awaitingApproval: false, postMerge: receipt, nextEligibleAction: "verify" }).status).toBe("complete");
  });

  it("fails closed on reachability, head, or tree mismatch", () => {
    expect(() => verifyDabPostMerge({ mergeReceipt: merge, defaultBranch: "main", observedDefaultHeadSha: merge.mergeSha, mergeReachable: false, approvedFiles: files, observedFiles: files })).toThrow("DAB_POST_MERGE_NOT_REACHABLE");
    expect(() => verifyDabPostMerge({ mergeReceipt: merge, defaultBranch: "main", observedDefaultHeadSha: "f".repeat(40), mergeReachable: true, approvedFiles: files, observedFiles: files })).toThrow("DAB_POST_MERGE_HEAD_MISMATCH");
    expect(() => verifyDabPostMerge({ mergeReceipt: merge, defaultBranch: "main", observedDefaultHeadSha: merge.mergeSha, mergeReachable: true, approvedFiles: files, observedFiles: [{ path: "x.ts", sha256: "e".repeat(64) }] })).toThrow("DAB_POST_MERGE_TREE_MISMATCH");
  });

  it("projects canonical task state without fabricated percentages", () => {
    expect(projectDabEngineeringMission({ task, issueUrl: "i", prUrl: null, heartbeatAt: null, blocker: null, awaitingApproval: false, postMerge: null, nextEligibleAction: "push" })).toMatchObject({ status: "queued", lastVerifiedMilestone: "committed", nextEligibleAction: "push", humanNeeded: false });
    expect(projectDabEngineeringMission({ task: { ...task, state: "blocked" }, issueUrl: "i", prUrl: null, heartbeatAt: null, blocker: "credential_required", awaitingApproval: false, postMerge: null, nextEligibleAction: null })).toMatchObject({ status: "blocked", humanNeeded: true, blocker: "credential_required" });
  });
});

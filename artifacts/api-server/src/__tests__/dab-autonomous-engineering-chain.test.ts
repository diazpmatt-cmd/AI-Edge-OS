import { describe, expect, it } from "vitest";
import {
  applyPreparedArtifact,
  type DabGitApplyReceipt,
  type DabGitApplyReceiptStore,
  type DabGitRepositoryAdapter,
} from "../lib/dab-git-apply-handler.js";
import { buildDabGitApplyBinding } from "../lib/dab-git-apply-policy.js";
import {
  buildDabGitCommitBinding,
  commitAppliedArtifact,
  type DabGitCommitAdapter,
  type DabGitCommitReceipt,
  type DabGitCommitReceiptStore,
} from "../lib/dab-git-commit-handler.js";
import {
  createBoundPullRequest,
  pushCommittedArtifact,
  type DabGitPrReceipt,
  type DabGitPushPrAdapter,
  type DabGitPushReceipt,
  type ReceiptStore,
} from "../lib/dab-git-push-pr-handler.js";
import { reconcileDabPullRequestCi } from "../lib/dab-ci-reconciliation.js";
import {
  mergeBoundPullRequest,
  type DabGitMergeAdapter,
  type DabGitMergeReceipt,
} from "../lib/dab-git-merge-handler.js";
import { verifyDabPostMerge } from "../lib/dab-post-merge-verification.js";
import { sha256 } from "../lib/dab-preparation-policy.js";

const baseSha = "c".repeat(40);
const commitSha = "d".repeat(40);
const treeSha = "e".repeat(40);
const mergeSha = "f".repeat(40);
const content = "export const supermanProof = true;\n";
const manifestContent = JSON.stringify({
  summary: "DAB-7C8 harmless proof",
  files: [
    {
      path: "artifacts/api-server/src/lib/dab-superman-proof-fixture.ts",
      content,
      rationale: "Exercise the closed engineering chain without a live credential.",
    },
  ],
  validationNotes: ["trusted focused test"],
  risks: ["no live repository mutation"],
  rollbackPlan: "Discard the injected fake adapter state.",
});

class MemoryReceiptStore<T extends { idempotencyKey: string }>
  implements ReceiptStore<T>
{
  readonly values = new Map<string, T>();

  async getByIdempotencyKey(key: string): Promise<T | null> {
    return this.values.get(key) ?? null;
  }

  async save(value: T): Promise<void> {
    this.values.set(value.idempotencyKey, value);
  }
}

function applyBinding() {
  return buildDabGitApplyBinding({
    repositoryId: "1293944511",
    preparationJobId: "dab7c8-job-1",
    proposalId: "dab7c8-proposal-1",
    proposalFingerprint: "a".repeat(64),
    capability: "prepare_code_patch",
    contextHash: "b".repeat(64),
    manifestContent,
    manifestSha256: sha256(manifestContent),
    expectedBaseSha: baseSha,
    branchName: "feature/dab7c8-proof",
    editingAuthorizationRef: "github:issue/337#editing",
  });
}

function stores() {
  return {
    apply: new MemoryReceiptStore<DabGitApplyReceipt>(),
    commit: new MemoryReceiptStore<DabGitCommitReceipt>(),
    push: new MemoryReceiptStore<DabGitPushReceipt>(),
    pr: new MemoryReceiptStore<DabGitPrReceipt>(),
    merge: new MemoryReceiptStore<DabGitMergeReceipt>(),
  };
}

describe("DAB-7C8 autonomous engineering proof", () => {
  it("traverses apply -> commit -> push -> PR -> trusted CI -> merge -> post-merge exactly once", async () => {
    const receipts = stores();
    const calls = { apply: 0, commit: 0, push: 0, pr: 0, merge: 0 };
    const binding = applyBinding();

    const applyAdapter: DabGitRepositoryAdapter = {
      observeBaseSha: async () => baseSha,
      applyExactFiles: async (input) => {
        calls.apply += 1;
        return {
          branchName: input.branchName,
          observedFiles: input.files,
          repositoryReceiptRef: "fixture:apply:1",
        };
      },
    };

    const applyArgs = {
      binding,
      manifestFiles: [{ path: binding.files[0]!.path, content }],
      editingAuthorizationUsable: true,
      adapterEnabled: true,
      killSwitch: false,
      handlerRegistered: true,
      actorId: "apollos:test",
      workloadIdentity: "coolify:fixture",
      adapter: applyAdapter,
      receipts: receipts.apply as DabGitApplyReceiptStore,
      now: () => new Date("2026-08-08T00:00:00.000Z"),
    };
    const applyReceipt = await applyPreparedArtifact(applyArgs);
    expect(await applyPreparedArtifact(applyArgs)).toEqual(applyReceipt);

    const commitBinding = buildDabGitCommitBinding({
      applyReceipt,
      parentSha: baseSha,
      committingAuthorizationRef: "github:issue/337#committing",
    });
    const commitAdapter: DabGitCommitAdapter = {
      observeBranch: async () => ({ headSha: baseSha, files: binding.files }),
      createExactCommit: async (input) => {
        calls.commit += 1;
        return {
          commitSha,
          treeSha,
          parentSha: input.parentSha,
          branchName: input.branchName,
        };
      },
    };
    const commitArgs = {
      binding: commitBinding,
      applyReceipt,
      committingAuthorizationUsable: true,
      killSwitch: false,
      adapterEnabled: true,
      handlerRegistered: true,
      actorId: "apollos:test",
      workloadIdentity: "coolify:fixture",
      adapter: commitAdapter,
      receipts: receipts.commit as DabGitCommitReceiptStore,
      now: () => new Date("2026-08-08T00:01:00.000Z"),
    };
    const commitReceipt = await commitAppliedArtifact(commitArgs);
    expect(await commitAppliedArtifact(commitArgs)).toEqual(commitReceipt);

    const gitAdapter: DabGitPushPrAdapter = {
      observeRemoteBranch: async () => ({ headSha: null }),
      pushCommit: async (input) => {
        calls.push += 1;
        return { branchName: input.branchName, headSha: input.commitSha };
      },
      observeBase: async () => ({ baseSha }),
      createPullRequest: async (input) => {
        calls.pr += 1;
        return {
          prNumber: 3378,
          headBranch: input.headBranch,
          headSha: input.headSha,
          baseBranch: input.baseBranch,
          baseSha: input.baseSha,
        };
      },
    };
    const pushArgs = {
      commitReceipt,
      expectedRemoteSha: null,
      defaultBranch: "main",
      pushAuthorizationRef: "github:issue/337#pushing",
      authorizationUsable: true,
      killSwitch: false,
      adapterEnabled: true,
      handlerRegistered: true,
      actorId: "apollos:test",
      workloadIdentity: "coolify:fixture",
      adapter: gitAdapter,
      receipts: receipts.push,
      now: () => new Date("2026-08-08T00:02:00.000Z"),
    };
    const pushReceipt = await pushCommittedArtifact(pushArgs);
    expect(await pushCommittedArtifact(pushArgs)).toEqual(pushReceipt);

    const prArgs = {
      pushReceipt,
      baseBranch: "main",
      expectedBaseSha: baseSha,
      prAuthorizationRef: "github:issue/337#pull_request_creation",
      authorizationUsable: true,
      killSwitch: false,
      adapterEnabled: true,
      handlerRegistered: true,
      actorId: "apollos:test",
      workloadIdentity: "coolify:fixture",
      adapter: gitAdapter,
      receipts: receipts.pr,
      now: () => new Date("2026-08-08T00:03:00.000Z"),
    };
    const prReceipt = await createBoundPullRequest(prArgs);
    expect(await createBoundPullRequest(prArgs)).toEqual(prReceipt);

    const ciReceipt = reconcileDabPullRequestCi({
      prReceipt,
      observed: {
        prNumber: prReceipt.prNumber,
        headSha: prReceipt.headSha,
        baseSha: prReceipt.baseSha,
        checks: [
          { name: "Lead Intelligence CI", status: "completed", conclusion: "success" },
          { name: "Coolify stack validation", status: "completed", conclusion: "success" },
        ],
      },
      trustedCheckNames: ["Lead Intelligence CI", "Coolify stack validation"],
      now: () => new Date("2026-08-08T00:04:00.000Z"),
    });
    expect(ciReceipt.outcome).toBe("green");

    const mergeAdapter: DabGitMergeAdapter = {
      observePullRequest: async () => ({
        headSha: prReceipt.headSha,
        baseSha: prReceipt.baseSha,
        mergeable: true,
      }),
      mergeExact: async (input) => {
        calls.merge += 1;
        return { merged: true, mergeSha, headSha: input.expectedHeadSha };
      },
    };
    const mergeArgs = {
      prReceipt,
      ciReceipt,
      mergeMethod: "squash" as const,
      mergeAuthorizationRef: "github:issue/337#merging",
      authorizationUsable: true,
      killSwitch: false,
      adapterEnabled: true,
      handlerRegistered: true,
      actorId: "apollos:test",
      workloadIdentity: "coolify:fixture",
      adapter: mergeAdapter,
      receipts: receipts.merge,
      now: () => new Date("2026-08-08T00:05:00.000Z"),
    };
    const mergeReceipt = await mergeBoundPullRequest(mergeArgs);
    expect(await mergeBoundPullRequest(mergeArgs)).toEqual(mergeReceipt);

    const approvedFiles = applyReceipt.files.map(({ path, sha256 }) => ({ path, sha256 }));
    const postMerge = verifyDabPostMerge({
      mergeReceipt,
      defaultBranch: "main",
      observedDefaultHeadSha: mergeSha,
      mergeReachable: true,
      approvedFiles,
      observedFiles: approvedFiles,
      now: () => new Date("2026-08-08T00:06:00.000Z"),
    });

    expect(postMerge).toMatchObject({
      outcome: "verified",
      repositoryId: "1293944511",
      prNumber: 3378,
      mergeSha,
      observedHeadSha: mergeSha,
    });
    expect(calls).toEqual({ apply: 1, commit: 1, push: 1, pr: 1, merge: 1 });
    expect(receipts.apply.values.size).toBe(1);
    expect(receipts.commit.values.size).toBe(1);
    expect(receipts.push.values.size).toBe(1);
    expect(receipts.pr.values.size).toBe(1);
    expect(receipts.merge.values.size).toBe(1);
  });

  it("does not infer later authorization and the kill switch blocks a mutable milestone", async () => {
    const binding = applyBinding();
    const receipts = new MemoryReceiptStore<DabGitApplyReceipt>();
    const applyReceipt = await applyPreparedArtifact({
      binding,
      manifestFiles: [{ path: binding.files[0]!.path, content }],
      editingAuthorizationUsable: true,
      adapterEnabled: true,
      killSwitch: false,
      handlerRegistered: true,
      actorId: "apollos:test",
      workloadIdentity: "coolify:fixture",
      adapter: {
        observeBaseSha: async () => baseSha,
        applyExactFiles: async (input) => ({
          branchName: input.branchName,
          observedFiles: input.files,
          repositoryReceiptRef: "fixture:apply:2",
        }),
      },
      receipts,
    });
    const commitBinding = buildDabGitCommitBinding({
      applyReceipt,
      parentSha: baseSha,
      committingAuthorizationRef: "github:issue/337#committing",
    });
    await expect(
      commitAppliedArtifact({
        binding: commitBinding,
        applyReceipt,
        committingAuthorizationUsable: true,
        killSwitch: true,
        adapterEnabled: true,
        handlerRegistered: true,
        actorId: "apollos:test",
        workloadIdentity: "coolify:fixture",
        adapter: {
          observeBranch: async () => ({ headSha: baseSha, files: binding.files }),
          createExactCommit: async () => {
            throw new Error("must_not_mutate");
          },
        },
        receipts: new MemoryReceiptStore<DabGitCommitReceipt>(),
      }),
    ).rejects.toThrow("DAB_GIT_COMMIT_KILL_SWITCH");
  });
});

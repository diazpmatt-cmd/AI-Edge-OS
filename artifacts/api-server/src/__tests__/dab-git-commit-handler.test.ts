import { describe, expect, it } from "vitest";
import { buildDabGitCommitBinding, commitAppliedArtifact, type DabGitCommitReceipt, type DabGitCommitReceiptStore } from "../lib/dab-git-commit-handler.js";
import type { DabGitApplyReceipt } from "../lib/dab-git-apply-handler.js";

const files = [{ path: "artifacts/api-server/src/lib/example.ts", sha256: "a".repeat(64), bytes: 12 }] as const;
const applyReceipt: DabGitApplyReceipt = { operation: "apply_prepared_artifact", outcome: "verified", requestFingerprint: "b".repeat(64), idempotencyKey: "apply:key", repositoryId: "1293944511", preparationJobId: "job-1", proposalId: "proposal-1", expectedBaseSha: "c".repeat(40), branchName: "feature/example", editingAuthorizationRef: "github:issue/329", actorId: "human", workloadIdentity: "apollos", files, repositoryReceiptRef: "repo:apply:1", verifiedAt: "2026-08-08T00:00:00.000Z" };
const binding = buildDabGitCommitBinding({ applyReceipt, parentSha: "c".repeat(40), committingAuthorizationRef: "github:issue/331" });

function makeHarness(overrides: Partial<{ auth:boolean; kill:boolean; enabled:boolean; registered:boolean; headSha:string; drift:boolean }> = {}) {
  let commits = 0; const saved = new Map<string,DabGitCommitReceipt>();
  const receipts: DabGitCommitReceiptStore = { getByIdempotencyKey: async k => saved.get(k) ?? null, save: async r => { saved.set(r.idempotencyKey,r); } };
  const adapter = { observeBranch: async () => ({ headSha: overrides.headSha ?? binding.parentSha, files: overrides.drift ? [{...files[0],bytes:99}] : files }), createExactCommit: async () => { commits += 1; return { commitSha: "d".repeat(40), treeSha: "e".repeat(40), parentSha: binding.parentSha, branchName: binding.branchName }; } };
  const run = () => commitAppliedArtifact({ binding, applyReceipt, committingAuthorizationUsable: overrides.auth ?? true, killSwitch: overrides.kill ?? false, adapterEnabled: overrides.enabled ?? true, handlerRegistered: overrides.registered ?? true, actorId: "human", workloadIdentity: "apollos", adapter, receipts, now: () => new Date("2026-08-08T00:10:00.000Z") });
  return { run, get commits(){return commits;} };
}

describe("DAB Git commit milestone", () => {
  it("creates one verified attributable commit and replays idempotently", async () => {
    const h = makeHarness(); const first = await h.run(); const second = await h.run();
    expect(h.commits).toBe(1); expect(second).toEqual(first); expect(first.commitSha).toBe("d".repeat(40)); expect(first.committingAuthorizationRef).toBe("github:issue/331");
  });
  it.each([
    [{auth:false},"DAB_GIT_COMMIT_AUTHORIZATION_UNUSABLE"],
    [{kill:true},"DAB_GIT_COMMIT_KILL_SWITCH"],
    [{enabled:false},"DAB_GIT_COMMIT_ADAPTER_DISABLED"],
    [{registered:false},"DAB_GIT_COMMIT_HANDLER_MISSING"],
    [{headSha:"f".repeat(40)},"DAB_GIT_COMMIT_PARENT_SHA_MISMATCH"],
    [{drift:true},"DAB_GIT_COMMIT_TREE_DRIFT"],
  ] as const)("fails closed: %s", async (overrides,code) => { await expect(makeHarness(overrides).run()).rejects.toThrow(code); });
  it("rejects a mismatched apply receipt", async () => {
    const receipts: DabGitCommitReceiptStore = { getByIdempotencyKey: async()=>null, save: async()=>undefined };
    await expect(commitAppliedArtifact({ binding, applyReceipt: {...applyReceipt, branchName:"other"}, committingAuthorizationUsable:true, killSwitch:false, adapterEnabled:true, handlerRegistered:true, actorId:"human", workloadIdentity:"apollos", adapter:{ observeBranch:async()=>({headSha:binding.parentSha,files}), createExactCommit:async()=>({commitSha:"d".repeat(40),treeSha:"e".repeat(40),parentSha:binding.parentSha,branchName:binding.branchName}) }, receipts })).rejects.toThrow("DAB_GIT_COMMIT_APPLY_RECEIPT_MISMATCH");
  });
});

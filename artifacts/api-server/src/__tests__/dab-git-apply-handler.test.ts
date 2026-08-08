import { describe, expect, it } from "vitest";
import { applyPreparedArtifact, type DabGitApplyReceipt, type DabGitApplyReceiptStore, type DabGitRepositoryAdapter } from "../lib/dab-git-apply-handler.js";
import { buildDabGitApplyBinding } from "../lib/dab-git-apply-policy.js";
import { sha256 } from "../lib/dab-preparation-policy.js";

const content = "export const superman = true;\n";
const manifestContent = JSON.stringify({
  summary: "Bounded apply",
  files: [{ path: "artifacts/api-server/src/lib/superman.ts", content, rationale: "test" }],
  validationNotes: ["focused test"], risks: ["none"], rollbackPlan: "restore",
}, null, 2);

function binding() {
  return buildDabGitApplyBinding({ repositoryId: "1293944511", preparationJobId: "job-1", proposalId: "proposal-1", proposalFingerprint: "a".repeat(64), capability: "prepare_code_patch", contextHash: "b".repeat(64), manifestContent, manifestSha256: sha256(manifestContent), expectedBaseSha: "c".repeat(40), branchName: "feature/dab7c2-test", editingAuthorizationRef: "github:issue/329" });
}

function harness(overrides: { baseSha?: string; observed?: string; branch?: string; enabled?: boolean; auth?: boolean; kill?: boolean; registered?: boolean } = {}) {
  let applies = 0;
  const receipts = new Map<string, DabGitApplyReceipt>();
  const store: DabGitApplyReceiptStore = { getByIdempotencyKey: async k => receipts.get(k) ?? null, save: async r => { receipts.set(r.idempotencyKey, r); } };
  const adapter: DabGitRepositoryAdapter = {
    observeBaseSha: async () => overrides.baseSha ?? "c".repeat(40),
    applyExactFiles: async input => { applies += 1; return { branchName: overrides.branch ?? input.branchName, observedFiles: [{ path: input.files[0]!.path, content: overrides.observed ?? input.files[0]!.content }], repositoryReceiptRef: "repo:receipt:1" }; },
  };
  const run = () => applyPreparedArtifact({ binding: binding(), manifestFiles: [{ path: "artifacts/api-server/src/lib/superman.ts", content }], editingAuthorizationUsable: overrides.auth ?? true, adapterEnabled: overrides.enabled ?? true, killSwitch: overrides.kill ?? false, handlerRegistered: overrides.registered ?? true, actorId: "human-actor", workloadIdentity: "apollos-worker", adapter, receipts: store, now: () => new Date("2026-08-08T00:00:00.000Z") });
  return { run, applies };
}

describe("DAB Git apply handler", () => {
  it("applies exactly once and persists an attributable verified receipt", async () => {
    let applies = 0; const receipts = new Map<string, DabGitApplyReceipt>();
    const store: DabGitApplyReceiptStore = { getByIdempotencyKey: async k => receipts.get(k) ?? null, save: async r => { receipts.set(r.idempotencyKey, r); } };
    const adapter: DabGitRepositoryAdapter = { observeBaseSha: async () => "c".repeat(40), applyExactFiles: async input => { applies += 1; return { branchName: input.branchName, observedFiles: input.files, repositoryReceiptRef: "repo:receipt:1" }; } };
    const args = { binding: binding(), manifestFiles: [{ path: "artifacts/api-server/src/lib/superman.ts", content }], editingAuthorizationUsable: true, adapterEnabled: true, killSwitch: false, handlerRegistered: true, actorId: "human-actor", workloadIdentity: "apollos-worker", adapter, receipts: store, now: () => new Date("2026-08-08T00:00:00.000Z") };
    const first = await applyPreparedArtifact(args); const replay = await applyPreparedArtifact(args);
    expect(applies).toBe(1); expect(replay).toEqual(first); expect(first.outcome).toBe("verified"); expect(first.actorId).toBe("human-actor"); expect(first.workloadIdentity).toBe("apollos-worker"); expect(first.files).toEqual(binding().files);
  });

  it.each([
    [{ enabled: false }, "DAB_GIT_APPLY_ADAPTER_DISABLED"],
    [{ registered: false }, "DAB_GIT_APPLY_HANDLER_MISSING"],
    [{ auth: false }, "DAB_GIT_APPLY_EDITING_AUTHORIZATION_UNUSABLE"],
    [{ kill: true }, "DAB_GIT_APPLY_KILL_SWITCH"],
    [{ baseSha: "d".repeat(40) }, "DAB_GIT_APPLY_BASE_SHA_MISMATCH"],
  ] as const)("fails closed before mutation: %s", async (overrides, code) => {
    const h = harness(overrides); await expect(h.run()).rejects.toThrow(code);
  });

  it("rejects changed post-apply bytes and wrong branch", async () => {
    await expect(harness({ observed: "changed" }).run()).rejects.toThrow("DAB_GIT_APPLY_DIGEST_MISMATCH");
    await expect(harness({ branch: "feature/wrong" }).run()).rejects.toThrow("DAB_GIT_APPLY_BRANCH_MISMATCH");
  });

  it("rejects manifest file drift before repository mutation", async () => {
    const value = binding(); let applied = false;
    const store: DabGitApplyReceiptStore = { getByIdempotencyKey: async () => null, save: async () => undefined };
    const adapter: DabGitRepositoryAdapter = { observeBaseSha: async () => value.expectedBaseSha, applyExactFiles: async () => { applied = true; throw new Error("must_not_run"); } };
    await expect(applyPreparedArtifact({ binding: value, manifestFiles: [{ path: value.files[0]!.path, content: "drift" }], editingAuthorizationUsable: true, adapterEnabled: true, killSwitch: false, handlerRegistered: true, actorId: "actor", workloadIdentity: "worker", adapter, receipts: store })).rejects.toThrow("DAB_GIT_APPLY_DIGEST_MISMATCH");
    expect(applied).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  buildDabGitApplyBinding,
  evaluateDabGitApplyPolicy,
  verifyDabGitAppliedFiles,
} from "../lib/dab-git-apply-policy.js";
import { sha256 } from "../lib/dab-preparation-policy.js";

const manifest = {
  summary: "Small bounded patch",
  files: [
    {
      path: "artifacts/api-server/src/lib/example.ts",
      content: "export const example = true;\n",
      rationale: "Test only",
    },
  ],
  validationNotes: ["focused test"],
  risks: ["none"],
  rollbackPlan: "Restore the prior file content.",
};
const manifestContent = JSON.stringify(manifest, null, 2);

function binding(overrides: Partial<Parameters<typeof buildDabGitApplyBinding>[0]> = {}) {
  return buildDabGitApplyBinding({
    repositoryId: "1293944511",
    preparationJobId: "dpj_test",
    proposalId: "dap_test",
    proposalFingerprint: "a".repeat(64),
    capability: "prepare_code_patch",
    contextHash: "b".repeat(64),
    manifestContent,
    manifestSha256: sha256(manifestContent),
    expectedBaseSha: "c".repeat(40),
    branchName: "feature/dab7c-test",
    editingAuthorizationRef: "github:diazpmatt-cmd/AI-Edge-OS/issues/327",
    ...overrides,
  });
}

describe("DAB Git apply policy", () => {
  it("builds a deterministic exact binding", () => {
    const first = binding();
    const second = binding();
    expect(first.requestFingerprint).toBe(second.requestFingerprint);
    expect(first.idempotencyKey).toBe(`dab-git-apply:${first.requestFingerprint}`);
    expect(first.files).toEqual([
      {
        path: "artifacts/api-server/src/lib/example.ts",
        sha256: sha256("export const example = true;\n"),
        bytes: Buffer.byteLength("export const example = true;\n"),
      },
    ]);
  });

  it("fails closed on artifact hash drift and unsafe paths", () => {
    expect(() => binding({ manifestSha256: "d".repeat(64) })).toThrow("DAB_GIT_APPLY_MANIFEST_HASH_MISMATCH");
    const unsafe = JSON.stringify({ ...manifest, files: [{ path: ".git/config", content: "x", rationale: "x" }] });
    expect(() => binding({ manifestContent: unsafe, manifestSha256: sha256(unsafe) })).toThrow("PATH_NOT_ALLOWED");
  });

  it("requires exact base SHA, editing authorization, enablement, and handler", () => {
    const value = binding();
    expect(evaluateDabGitApplyPolicy({ binding: value, observedBaseSha: "d".repeat(40), editingAuthorizationUsable: true, adapterEnabled: true, killSwitch: false, handlerRegistered: true }).reasonCode).toBe("DAB_GIT_APPLY_BASE_SHA_MISMATCH");
    expect(evaluateDabGitApplyPolicy({ binding: value, observedBaseSha: value.expectedBaseSha, editingAuthorizationUsable: false, adapterEnabled: true, killSwitch: false, handlerRegistered: true }).reasonCode).toBe("DAB_GIT_APPLY_EDITING_AUTHORIZATION_UNUSABLE");
    expect(evaluateDabGitApplyPolicy({ binding: value, observedBaseSha: value.expectedBaseSha, editingAuthorizationUsable: true, adapterEnabled: true, killSwitch: true, handlerRegistered: true }).reasonCode).toBe("DAB_GIT_APPLY_KILL_SWITCH");
    expect(evaluateDabGitApplyPolicy({ binding: value, observedBaseSha: value.expectedBaseSha, editingAuthorizationUsable: true, adapterEnabled: false, killSwitch: false, handlerRegistered: true }).reasonCode).toBe("DAB_GIT_APPLY_ADAPTER_DISABLED");
    expect(evaluateDabGitApplyPolicy({ binding: value, observedBaseSha: value.expectedBaseSha, editingAuthorizationUsable: true, adapterEnabled: true, killSwitch: false, handlerRegistered: false }).reasonCode).toBe("DAB_GIT_APPLY_HANDLER_MISSING");
    expect(evaluateDabGitApplyPolicy({ binding: value, observedBaseSha: value.expectedBaseSha, editingAuthorizationUsable: true, adapterEnabled: true, killSwitch: false, handlerRegistered: true })).toEqual({ allowed: true, reasonCode: "DAB_GIT_APPLY_ALLOWED", operation: "apply_prepared_artifact", requiredAuthorization: "editing" });
  });

  it("verifies exact post-apply file digests and rejects partial or changed output", () => {
    const value = binding();
    expect(verifyDabGitAppliedFiles({ binding: value, observedFiles: [{ path: manifest.files[0]!.path, content: manifest.files[0]!.content }] })).toEqual({ verified: true, reasonCode: "DAB_GIT_APPLY_VERIFIED" });
    expect(verifyDabGitAppliedFiles({ binding: value, observedFiles: [] }).reasonCode).toBe("DAB_GIT_APPLY_FILE_SET_MISMATCH");
    expect(verifyDabGitAppliedFiles({ binding: value, observedFiles: [{ path: manifest.files[0]!.path, content: "changed" }] }).reasonCode).toBe("DAB_GIT_APPLY_DIGEST_MISMATCH");
    expect(verifyDabGitAppliedFiles({ binding: value, observedFiles: [{ path: manifest.files[0]!.path, content: manifest.files[0]!.content }, { path: "artifacts/api-server/src/lib/extra.ts", content: "extra" }] }).reasonCode).toBe("DAB_GIT_APPLY_FILE_SET_MISMATCH");
  });
});

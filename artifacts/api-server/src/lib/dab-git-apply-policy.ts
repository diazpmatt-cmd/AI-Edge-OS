import { createHash } from "node:crypto";
import {
  sha256,
  validateManifest,
  type PreparationCapability,
} from "./dab-preparation-policy.js";

export const DAB_GIT_APPLY_OPERATION = "apply_prepared_artifact" as const;
export const DAB_GIT_APPLY_REQUIRED_AUTHORIZATION = "editing" as const;

export interface DabGitApplyFileBinding {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface DabGitApplyBinding {
  readonly operation: typeof DAB_GIT_APPLY_OPERATION;
  readonly repositoryId: string;
  readonly preparationJobId: string;
  readonly proposalId: string;
  readonly proposalFingerprint: string;
  readonly capability: PreparationCapability;
  readonly contextHash: string;
  readonly manifestSha256: string;
  readonly expectedBaseSha: string;
  readonly branchName: string;
  readonly editingAuthorizationRef: string;
  readonly files: readonly DabGitApplyFileBinding[];
  readonly requestFingerprint: string;
  readonly idempotencyKey: string;
}

export interface DabGitApplyPolicyDecision {
  readonly allowed: boolean;
  readonly reasonCode: string;
  readonly operation: typeof DAB_GIT_APPLY_OPERATION;
  readonly requiredAuthorization: typeof DAB_GIT_APPLY_REQUIRED_AUTHORIZATION;
}

const HEX_64 = /^[a-f0-9]{64}$/;
const HEX_40 = /^[a-f0-9]{40}$/;
const REPOSITORY_ID = /^[1-9][0-9]{0,19}$/;
const BRANCH = /^(?!.*\.\.)(?!.*\/\.)(?!.*\.lock$)[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/;
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,299}$/;

function canonicalHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function required(value: string, code: string, pattern?: RegExp): string {
  const normalized = value.trim();
  if (!normalized || (pattern && !pattern.test(normalized))) throw new Error(code);
  return normalized;
}

export function buildDabGitApplyBinding(input: {
  repositoryId: string;
  preparationJobId: string;
  proposalId: string;
  proposalFingerprint: string;
  capability: PreparationCapability;
  contextHash: string;
  manifestContent: string;
  manifestSha256: string;
  expectedBaseSha: string;
  branchName: string;
  editingAuthorizationRef: string;
}): DabGitApplyBinding {
  const repositoryId = required(input.repositoryId, "DAB_GIT_APPLY_REPOSITORY_INVALID", REPOSITORY_ID);
  const preparationJobId = required(input.preparationJobId, "DAB_GIT_APPLY_JOB_REQUIRED");
  const proposalId = required(input.proposalId, "DAB_GIT_APPLY_PROPOSAL_REQUIRED");
  const proposalFingerprint = required(input.proposalFingerprint, "DAB_GIT_APPLY_PROPOSAL_FINGERPRINT_INVALID", HEX_64);
  const contextHash = required(input.contextHash, "DAB_GIT_APPLY_CONTEXT_HASH_INVALID", HEX_64);
  const manifestSha256 = required(input.manifestSha256, "DAB_GIT_APPLY_MANIFEST_HASH_INVALID", HEX_64);
  const expectedBaseSha = required(input.expectedBaseSha, "DAB_GIT_APPLY_BASE_SHA_INVALID", HEX_40);
  const branchName = required(input.branchName, "DAB_GIT_APPLY_BRANCH_INVALID", BRANCH);
  const editingAuthorizationRef = required(input.editingAuthorizationRef, "DAB_GIT_APPLY_EDITING_AUTHORIZATION_REQUIRED", SAFE_REF);

  if (sha256(input.manifestContent) !== manifestSha256) throw new Error("DAB_GIT_APPLY_MANIFEST_HASH_MISMATCH");

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.manifestContent);
  } catch {
    throw new Error("DAB_GIT_APPLY_MANIFEST_JSON_INVALID");
  }
  const manifest = validateManifest(input.capability, parsed);
  const files = Object.freeze(
    manifest.files
      .map((file) => Object.freeze({
        path: file.path,
        sha256: sha256(file.content),
        bytes: Buffer.byteLength(file.content),
      }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  );

  const fingerprintMaterial = {
    operation: DAB_GIT_APPLY_OPERATION,
    repositoryId,
    preparationJobId,
    proposalId,
    proposalFingerprint,
    capability: input.capability,
    contextHash,
    manifestSha256,
    expectedBaseSha,
    branchName,
    editingAuthorizationRef,
    files,
  };
  const requestFingerprint = canonicalHash(fingerprintMaterial);

  return Object.freeze({
    ...fingerprintMaterial,
    files,
    requestFingerprint,
    idempotencyKey: `dab-git-apply:${requestFingerprint}`,
  });
}

export function evaluateDabGitApplyPolicy(input: {
  binding: DabGitApplyBinding;
  observedBaseSha: string;
  editingAuthorizationUsable: boolean;
  adapterEnabled: boolean;
  killSwitch: boolean;
  handlerRegistered: boolean;
}): DabGitApplyPolicyDecision {
  let reasonCode = "DAB_GIT_APPLY_ALLOWED";
  if (!HEX_40.test(input.observedBaseSha)) reasonCode = "DAB_GIT_APPLY_OBSERVED_SHA_INVALID";
  else if (input.observedBaseSha !== input.binding.expectedBaseSha) reasonCode = "DAB_GIT_APPLY_BASE_SHA_MISMATCH";
  else if (!input.editingAuthorizationUsable) reasonCode = "DAB_GIT_APPLY_EDITING_AUTHORIZATION_UNUSABLE";
  else if (input.killSwitch) reasonCode = "DAB_GIT_APPLY_KILL_SWITCH";
  else if (!input.adapterEnabled) reasonCode = "DAB_GIT_APPLY_ADAPTER_DISABLED";
  else if (!input.handlerRegistered) reasonCode = "DAB_GIT_APPLY_HANDLER_MISSING";
  return Object.freeze({
    allowed: reasonCode === "DAB_GIT_APPLY_ALLOWED",
    reasonCode,
    operation: DAB_GIT_APPLY_OPERATION,
    requiredAuthorization: DAB_GIT_APPLY_REQUIRED_AUTHORIZATION,
  });
}

export function verifyDabGitAppliedFiles(input: {
  binding: DabGitApplyBinding;
  observedFiles: readonly { path: string; content: string }[];
}): { readonly verified: boolean; readonly reasonCode: string } {
  const observed = [...input.observedFiles]
    .map((file) => ({ path: file.path, sha256: sha256(file.content), bytes: Buffer.byteLength(file.content) }))
    .sort((a, b) => a.path.localeCompare(b.path));
  if (observed.length !== input.binding.files.length) return Object.freeze({ verified: false, reasonCode: "DAB_GIT_APPLY_FILE_SET_MISMATCH" });
  for (let index = 0; index < observed.length; index += 1) {
    const actual = observed[index]!;
    const expected = input.binding.files[index]!;
    if (actual.path !== expected.path) return Object.freeze({ verified: false, reasonCode: "DAB_GIT_APPLY_FILE_SET_MISMATCH" });
    if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) return Object.freeze({ verified: false, reasonCode: "DAB_GIT_APPLY_DIGEST_MISMATCH" });
  }
  return Object.freeze({ verified: true, reasonCode: "DAB_GIT_APPLY_VERIFIED" });
}

import { createHash } from "node:crypto";
import type { AuthorizationCategory, ApprovalRecord } from "../../../../lib/development-control/src/index.js";
import { applyPreparedArtifact, type DabGitApplyReceipt } from "./dab-git-apply-handler.js";
import { buildDabGitApplyBinding } from "./dab-git-apply-policy.js";
import { buildDabGitCommitBinding, commitAppliedArtifact, type DabGitCommitReceipt } from "./dab-git-commit-handler.js";
import { createBoundPullRequest, pushCommittedArtifact, rebindBoundPullRequest, type DabGitPrReceipt, type DabGitPushReceipt } from "./dab-git-push-pr-handler.js";
import { evaluateDabSameScopeRepair, reconcileDabPullRequestCi, type DabCiReceipt } from "./dab-ci-reconciliation.js";
import { isDabGitCiRepairApprovalUsable, persistDabGitCiRepairHandoff, type DabGitCiRepairHandoffReceipt } from "./dab-git-ci-repair-handoff.js";
import { mergeBoundPullRequest, type DabGitMergeReceipt } from "./dab-git-merge-handler.js";
import type { DabGitWorkspaceAdapter } from "./dab-git-workspace-adapter.js";
import type { DabGitHubTransportAdapter } from "./dab-github-transport-adapter.js";
import { createDabGitReceiptStores, type DabDurableGitReceiptRepositoryLike } from "./dab-git-durable-receipt-store.js";
import { verifyDabPostMerge, type DabPostMergeReceipt } from "./dab-post-merge-verification.js";

export const DAB_GIT_MUTATION_AUTHORIZATIONS = Object.freeze([
  "editing", "committing", "pushing", "pull_request_creation", "merging",
] as const satisfies readonly AuthorizationCategory[]);

const MAX_CI_REPAIR_ATTEMPTS = 2;

export type DabGitMissionAuthorizationMap = Readonly<Record<(typeof DAB_GIT_MUTATION_AUTHORIZATIONS)[number], ApprovalRecord>>;
export type DabResolvedGitMission = Readonly<{
  taskId: string;
  specificationRevision: number;
  specificationHash: string;
  preparationJobId: string;
  proposalId: string;
  proposalFingerprint: string;
  contextHash: string;
  manifestContent: string;
  manifestSha256: string;
  expectedBaseSha: string;
  branchName: string;
  authorizedFiles: readonly string[];
  approvals: DabGitMissionAuthorizationMap;
  repairApproval: ApprovalRecord | null;
  repairAttempt: number;
  expectedRemoteSha: string | null;
  existingPrNumber: number | null;
}>;

export interface DabGitPostMergeObserver {
  observe(input: { repositoryId: string; mergeSha: string; files: readonly { path: string; sha256: string }[] }): Promise<{
    defaultBranch: "main";
    observedDefaultHeadSha: string;
    mergeReachable: boolean;
    observedFiles: readonly { path: string; sha256: string }[];
  }>;
}

export type DabGitMissionStep = "apply" | "commit" | "push" | "pull_request" | "ci" | "ci_repair" | "merge" | "post_merge" | "complete";
export type DabGitMissionResult = Readonly<{
  status: "progressed" | "waiting_ci" | "repair_requested" | "complete";
  step: DabGitMissionStep;
  applyReceipt: DabGitApplyReceipt | null;
  commitReceipt: DabGitCommitReceipt | null;
  pushReceipt: DabGitPushReceipt | null;
  prReceipt: DabGitPrReceipt | null;
  ciReceipt: DabCiReceipt | null;
  repairHandoffReceipt: DabGitCiRepairHandoffReceipt | null;
  mergeReceipt: DabGitMergeReceipt | null;
  postMergeReceipt: DabPostMergeReceipt | null;
}>;

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const authorizationRef = (approval: ApprovalRecord) => `approval:${approval.approvalId}`;

function assertApproval(mission: DabResolvedGitMission, category: AuthorizationCategory, now: Date): void {
  const approval = mission.approvals[category as keyof DabGitMissionAuthorizationMap];
  if (!approval || approval.taskId !== mission.taskId || approval.decision !== "approved" || !approval.categories.includes(category)) throw new Error(`DAB_GIT_MISSION_${category.toUpperCase()}_AUTHORIZATION_INVALID`);
  if (approval.specificationRevision !== mission.specificationRevision || approval.specificationHash !== mission.specificationHash || approval.expectedGitSha !== mission.expectedBaseSha) throw new Error(`DAB_GIT_MISSION_${category.toUpperCase()}_AUTHORIZATION_STALE`);
  if (approval.expiresAt && Date.parse(approval.expiresAt) <= now.getTime()) throw new Error(`DAB_GIT_MISSION_${category.toUpperCase()}_AUTHORIZATION_EXPIRED`);
  if (!approval.decidingActor.verified || approval.decidingActor.actorType !== "human_authority") throw new Error(`DAB_GIT_MISSION_${category.toUpperCase()}_ACTOR_INVALID`);
}

export function assertDabGitMissionAuthorizations(mission: DabResolvedGitMission, now = new Date()): void {
  for (const category of DAB_GIT_MUTATION_AUTHORIZATIONS) assertApproval(mission, category, now);
}

function exactFilesAuthorized(mission: DabResolvedGitMission, files: readonly { path: string }[]): void {
  const actual = files.map((item) => item.path).sort();
  const allowed = [...mission.authorizedFiles].sort();
  if (JSON.stringify(actual) !== JSON.stringify(allowed)) throw new Error("DAB_GIT_MISSION_FILE_SCOPE_MISMATCH");
}

function assertRepairContext(mission: DabResolvedGitMission): void {
  if (!Number.isInteger(mission.repairAttempt) || mission.repairAttempt < 0 || mission.repairAttempt > MAX_CI_REPAIR_ATTEMPTS) throw new Error("DAB_GIT_MISSION_REPAIR_ATTEMPT_INVALID");
  const hasRemote = mission.expectedRemoteSha !== null;
  const hasPr = mission.existingPrNumber !== null;
  if (mission.repairAttempt === 0 && (hasRemote || hasPr)) throw new Error("DAB_GIT_MISSION_REPAIR_CONTEXT_UNEXPECTED");
  if (mission.repairAttempt > 0 && (!hasRemote || !hasPr)) throw new Error("DAB_GIT_MISSION_REPAIR_CONTEXT_MISSING");
  if (mission.expectedRemoteSha !== null && !/^[a-f0-9]{40}$/.test(mission.expectedRemoteSha)) throw new Error("DAB_GIT_MISSION_REPAIR_REMOTE_SHA_INVALID");
  if (mission.existingPrNumber !== null && (!Number.isInteger(mission.existingPrNumber) || mission.existingPrNumber <= 0)) throw new Error("DAB_GIT_MISSION_REPAIR_PR_INVALID");
}

export class DabGitMissionRunner {
  private readonly stores;
  constructor(private readonly input: {
    mission: DabResolvedGitMission;
    workspace: DabGitWorkspaceAdapter;
    transport: DabGitHubTransportAdapter;
    receipts: DabDurableGitReceiptRepositoryLike;
    postMerge: DabGitPostMergeObserver;
    actorId: string;
    workloadIdentity: string;
    killSwitch: boolean;
    now?: () => Date;
  }) { this.stores = createDabGitReceiptStores(input.receipts, input.mission.taskId); }

  private now(): Date { return (this.input.now ?? (() => new Date()))(); }
  private assertReady(): void {
    if (this.input.killSwitch) throw new Error("DAB_GIT_MISSION_KILL_SWITCH");
    if (!this.input.actorId.trim() || !this.input.workloadIdentity.trim()) throw new Error("DAB_GIT_MISSION_IDENTITY_REQUIRED");
    assertDabGitMissionAuthorizations(this.input.mission, this.now());
    assertRepairContext(this.input.mission);
  }
  private binding() {
    const m = this.input.mission;
    return buildDabGitApplyBinding({ repositoryId: "1293944511", preparationJobId: m.preparationJobId, proposalId: m.proposalId, proposalFingerprint: m.proposalFingerprint, capability: "prepare_code_patch", contextHash: m.contextHash, manifestContent: m.manifestContent, manifestSha256: m.manifestSha256, expectedBaseSha: m.expectedBaseSha, branchName: m.branchName, editingAuthorizationRef: authorizationRef(m.approvals.editing) });
  }
  private manifestFiles(): readonly { path: string; content: string }[] {
    const parsed = JSON.parse(this.input.mission.manifestContent) as { files?: unknown };
    if (!Array.isArray(parsed.files)) throw new Error("DAB_GIT_MISSION_MANIFEST_INVALID");
    return parsed.files.map((raw) => {
      if (!raw || typeof raw !== "object") throw new Error("DAB_GIT_MISSION_MANIFEST_INVALID");
      const item = raw as Record<string, unknown>;
      if (typeof item.path !== "string" || typeof item.content !== "string") throw new Error("DAB_GIT_MISSION_MANIFEST_INVALID");
      return { path: item.path, content: item.content };
    });
  }
  private async rehydrateApply(binding: ReturnType<DabGitMissionRunner["binding"]>): Promise<void> {
    const applied = await this.input.workspace.applyExactFiles({ repositoryId: binding.repositoryId, expectedBaseSha: binding.expectedBaseSha, branchName: binding.branchName, files: this.manifestFiles(), idempotencyKey: binding.idempotencyKey });
    exactFilesAuthorized(this.input.mission, applied.observedFiles);
  }
  private async reconstructCommit(binding: ReturnType<DabGitMissionRunner["binding"]>, applyReceipt: DabGitApplyReceipt, commitReceipt: DabGitCommitReceipt): Promise<void> {
    await this.rehydrateApply(binding);
    const commitBinding = buildDabGitCommitBinding({ applyReceipt, parentSha: binding.expectedBaseSha, committingAuthorizationRef: authorizationRef(this.input.mission.approvals.committing) });
    const recreated = await this.input.workspace.createExactCommit({ repositoryId: commitBinding.repositoryId, branchName: commitBinding.branchName, parentSha: commitBinding.parentSha, files: commitBinding.files, idempotencyKey: commitBinding.idempotencyKey });
    if (recreated.commitSha !== commitReceipt.commitSha || recreated.treeSha !== commitReceipt.treeSha || recreated.parentSha !== commitReceipt.parentSha) throw new Error("DAB_GIT_MISSION_RECONSTRUCTED_COMMIT_MISMATCH");
  }

  async runOne(): Promise<DabGitMissionResult> {
    this.assertReady();
    const mission = this.input.mission;
    const binding = this.binding();
    exactFilesAuthorized(mission, binding.files);
    const manifestFiles = this.manifestFiles();
    let applyReceipt = await this.stores.apply.getByIdempotencyKey(binding.idempotencyKey);
    if (!applyReceipt) {
      applyReceipt = await applyPreparedArtifact({ binding, manifestFiles, editingAuthorizationUsable: true, adapterEnabled: true, killSwitch: false, handlerRegistered: true, actorId: this.input.actorId, workloadIdentity: this.input.workloadIdentity, adapter: this.input.workspace, receipts: this.stores.apply, now: () => this.now() });
      return this.result("progressed", "apply", { applyReceipt });
    }
    const commitBinding = buildDabGitCommitBinding({ applyReceipt, parentSha: binding.expectedBaseSha, committingAuthorizationRef: authorizationRef(mission.approvals.committing) });
    let commitReceipt = await this.stores.commit.getByIdempotencyKey(commitBinding.idempotencyKey);
    if (!commitReceipt) {
      await this.rehydrateApply(binding);
      commitReceipt = await commitAppliedArtifact({ binding: commitBinding, applyReceipt, committingAuthorizationUsable: true, killSwitch: false, adapterEnabled: true, handlerRegistered: true, actorId: this.input.actorId, workloadIdentity: this.input.workloadIdentity, adapter: this.input.workspace, receipts: this.stores.commit, now: () => this.now() });
      return this.result("progressed", "commit", { applyReceipt, commitReceipt });
    }
    const pushKey = `dab-git-push:${hash({ repositoryId: commitReceipt.repositoryId, branchName: commitReceipt.branchName, commitSha: commitReceipt.commitSha, expectedRemoteSha: mission.expectedRemoteSha, pushAuthorizationRef: authorizationRef(mission.approvals.pushing) })}`;
    let pushReceipt = await this.stores.push.getByIdempotencyKey(pushKey);
    if (!pushReceipt) {
      await this.reconstructCommit(binding, applyReceipt, commitReceipt);
      pushReceipt = await pushCommittedArtifact({ commitReceipt, expectedRemoteSha: mission.expectedRemoteSha, defaultBranch: "main", pushAuthorizationRef: authorizationRef(mission.approvals.pushing), authorizationUsable: true, killSwitch: false, adapterEnabled: true, handlerRegistered: true, actorId: this.input.actorId, workloadIdentity: this.input.workloadIdentity, adapter: this.input.transport, receipts: this.stores.push, now: () => this.now() });
      return this.result("progressed", "push", { applyReceipt, commitReceipt, pushReceipt });
    }
    const prAuthorizationRef = authorizationRef(mission.approvals.pull_request_creation);
    const prKey = mission.existingPrNumber === null
      ? `dab-git-pr:${hash({ repositoryId: pushReceipt.repositoryId, headBranch: pushReceipt.branchName, headSha: pushReceipt.commitSha, baseBranch: "main", baseSha: binding.expectedBaseSha, prAuthorizationRef })}`
      : `dab-git-pr-rebind:${hash({ repositoryId: pushReceipt.repositoryId, prNumber: mission.existingPrNumber, headBranch: pushReceipt.branchName, priorHeadSha: mission.expectedRemoteSha, headSha: pushReceipt.commitSha, baseBranch: "main", baseSha: binding.expectedBaseSha, prAuthorizationRef })}`;
    let prReceipt = await this.stores.pullRequest.getByIdempotencyKey(prKey);
    if (!prReceipt) {
      prReceipt = mission.existingPrNumber === null
        ? await createBoundPullRequest({ pushReceipt, baseBranch: "main", expectedBaseSha: binding.expectedBaseSha, prAuthorizationRef, authorizationUsable: true, killSwitch: false, adapterEnabled: true, handlerRegistered: true, actorId: this.input.actorId, workloadIdentity: this.input.workloadIdentity, adapter: this.input.transport, receipts: this.stores.pullRequest, now: () => this.now() })
        : await rebindBoundPullRequest({ existingPrNumber: mission.existingPrNumber, priorHeadSha: mission.expectedRemoteSha!, pushReceipt, baseBranch: "main", expectedBaseSha: binding.expectedBaseSha, prAuthorizationRef, authorizationUsable: true, killSwitch: false, adapterEnabled: true, handlerRegistered: true, actorId: this.input.actorId, workloadIdentity: this.input.workloadIdentity, adapter: this.input.transport, receipts: this.stores.pullRequest, now: () => this.now() });
      return this.result("progressed", "pull_request", { applyReceipt, commitReceipt, pushReceipt, prReceipt });
    }
    const observedCi = await this.input.transport.observeTrustedCi({ repositoryId: prReceipt.repositoryId, prNumber: prReceipt.prNumber, headSha: prReceipt.headSha, baseSha: prReceipt.baseSha });
    const ciReceipt = reconcileDabPullRequestCi({ prReceipt, observed: observedCi, trustedCheckNames: ["Lead Intelligence CI", "Coolify stack validation"], now: () => this.now() });
    if (ciReceipt.outcome === "blocked") {
      const waiting = ciReceipt.blockerCodes.length > 0 && ciReceipt.blockerCodes.every((code) => code.startsWith("trusted_check_pending:") || code.startsWith("trusted_check_missing:"));
      if (waiting) return this.result("waiting_ci", "ci", { applyReceipt, commitReceipt, pushReceipt, prReceipt, ciReceipt });
      const repairAuthorizationUsable = isDabGitCiRepairApprovalUsable({ approval: mission.repairApproval, normalEditingApprovalId: mission.approvals.editing.approvalId, taskId: mission.taskId, specificationRevision: mission.specificationRevision, specificationHash: mission.specificationHash, expectedBaseSha: mission.expectedBaseSha, now: this.now() });
      const repairDecision = evaluateDabSameScopeRepair({ ci: ciReceipt, currentHeadSha: prReceipt.headSha, currentBaseSha: prReceipt.baseSha, specHash: mission.specificationHash, currentSpecHash: mission.specificationHash, approvedPaths: mission.authorizedFiles, proposedPaths: binding.files.map((file) => file.path), attempt: mission.repairAttempt, maxAttempts: MAX_CI_REPAIR_ATTEMPTS, repairAuthorizationUsable, killSwitch: this.input.killSwitch });
      if (!repairDecision.allowed || !mission.repairApproval) throw new Error(`DAB_GIT_MISSION_CI_REPAIR_BLOCKED:${repairDecision.reasonCode}`);
      const repairHandoffReceipt = await persistDabGitCiRepairHandoff({ taskId: mission.taskId, specificationRevision: mission.specificationRevision, specificationHash: mission.specificationHash, expectedBaseSha: mission.expectedBaseSha, authorizedFiles: mission.authorizedFiles, sourcePreparationJobId: mission.preparationJobId, sourceProposalId: mission.proposalId, ciReceipt, attempt: mission.repairAttempt + 1, maxAttempts: MAX_CI_REPAIR_ATTEMPTS, repairAuthorizationRef: authorizationRef(mission.repairApproval), receipts: this.stores.repairHandoff, now: () => this.now() });
      return this.result("repair_requested", "ci_repair", { applyReceipt, commitReceipt, pushReceipt, prReceipt, ciReceipt, repairHandoffReceipt });
    }
    const mergeKey = `dab-git-merge:${hash({ repositoryId: prReceipt.repositoryId, prNumber: prReceipt.prNumber, headSha: prReceipt.headSha, baseSha: prReceipt.baseSha, mergeMethod: "squash", mergeAuthorizationRef: authorizationRef(mission.approvals.merging), ciEvidenceDigest: ciReceipt.evidenceDigest })}`;
    let mergeReceipt = await this.stores.merge.getByIdempotencyKey(mergeKey);
    if (!mergeReceipt) {
      mergeReceipt = await mergeBoundPullRequest({ prReceipt, ciReceipt, mergeMethod: "squash", mergeAuthorizationRef: authorizationRef(mission.approvals.merging), authorizationUsable: true, killSwitch: false, adapterEnabled: true, handlerRegistered: true, actorId: this.input.actorId, workloadIdentity: this.input.workloadIdentity, adapter: this.input.transport, receipts: this.stores.merge, now: () => this.now() });
      return this.result("progressed", "merge", { applyReceipt, commitReceipt, pushReceipt, prReceipt, ciReceipt, mergeReceipt });
    }
    const approvedFiles = applyReceipt.files.map(({ path, sha256 }) => ({ path, sha256 }));
    const observed = await this.input.postMerge.observe({ repositoryId: mergeReceipt.repositoryId, mergeSha: mergeReceipt.mergeSha, files: approvedFiles });
    const postMergeReceipt = verifyDabPostMerge({ mergeReceipt, defaultBranch: observed.defaultBranch, observedDefaultHeadSha: observed.observedDefaultHeadSha, mergeReachable: observed.mergeReachable, approvedFiles, observedFiles: observed.observedFiles, now: () => this.now() });
    return this.result("complete", "complete", { applyReceipt, commitReceipt, pushReceipt, prReceipt, ciReceipt, mergeReceipt, postMergeReceipt });
  }

  private result(status: DabGitMissionResult["status"], step: DabGitMissionStep, values: Partial<Omit<DabGitMissionResult, "status" | "step">>): DabGitMissionResult {
    return Object.freeze({ status, step, applyReceipt: null, commitReceipt: null, pushReceipt: null, prReceipt: null, ciReceipt: null, repairHandoffReceipt: null, mergeReceipt: null, postMergeReceipt: null, ...values });
  }
}

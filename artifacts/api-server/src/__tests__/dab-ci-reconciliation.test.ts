import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { reconcileDabPullRequestCi, evaluateDabSameScopeRepair, type DabCiReceipt } from "../lib/dab-ci-reconciliation.js";
import {
  DAB_GIT_CI_REPAIR_CONSTRAINT,
  isDabGitCiRepairApprovalUsable,
  persistDabGitCiRepairHandoff,
  type DabGitCiRepairHandoffReceipt,
} from "../lib/dab-git-ci-repair-handoff.js";
import type { DabGitPrReceipt, ReceiptStore } from "../lib/dab-git-push-pr-handler.js";

const baseSha = "b".repeat(40);
const failedHeadSha = "a".repeat(40);
const pr: DabGitPrReceipt = {
  outcome: "verified",
  repositoryId: "1293944511",
  prNumber: 9,
  headBranch: "feature/x",
  headSha: failedHeadSha,
  baseBranch: "main",
  baseSha,
  prAuthorizationRef: "auth",
  actorId: "h",
  workloadIdentity: "w",
  requestFingerprint: "f",
  idempotencyKey: "k",
  createdAt: "x",
};
const names = ["Lead Intelligence CI", "Coolify stack validation"];
const green = [
  { name: names[0]!, status: "completed" as const, conclusion: "success" as const },
  { name: names[1]!, status: "completed" as const, conclusion: "success" as const },
];

function failedCi(): DabCiReceipt {
  return reconcileDabPullRequestCi({
    prReceipt: pr,
    observed: {
      prNumber: pr.prNumber,
      headSha: pr.headSha,
      baseSha: pr.baseSha,
      checks: [
        { name: names[0]!, status: "completed", conclusion: "failure" },
        { name: names[1]!, status: "completed", conclusion: "success" },
      ],
    },
    trustedCheckNames: names,
    now: () => new Date("2026-08-13T20:00:00.000Z"),
  });
}

function repairDecision(overrides: Record<string, unknown> = {}) {
  const ci = failedCi();
  return evaluateDabSameScopeRepair({
    ci,
    currentHeadSha: ci.headSha,
    currentBaseSha: ci.baseSha,
    specHash: "spec-hash",
    currentSpecHash: "spec-hash",
    approvedPaths: ["a.ts"],
    proposedPaths: ["a.ts"],
    attempt: 0,
    maxAttempts: 2,
    repairAuthorizationUsable: true,
    killSwitch: false,
    ...overrides,
  });
}

class MemoryReceiptStore implements ReceiptStore<DabGitCiRepairHandoffReceipt> {
  readonly values = new Map<string, DabGitCiRepairHandoffReceipt>();
  saves = 0;
  async getByIdempotencyKey(key: string) { return this.values.get(key) ?? null; }
  async save(value: DabGitCiRepairHandoffReceipt) {
    this.saves += 1;
    this.values.set(value.idempotencyKey, value);
  }
}

function repairApproval(overrides: Record<string, unknown> = {}) {
  return {
    approvalId: "repair-approval-1",
    taskId: "task-1",
    decision: "approved",
    categories: ["editing"],
    constraints: [DAB_GIT_CI_REPAIR_CONSTRAINT],
    specificationRevision: 7,
    specificationHash: "spec-hash",
    expectedGitSha: baseSha,
    decidingActor: { verified: true, actorType: "human_authority" },
    expiresAt: "2026-08-14T20:00:00.000Z",
    ...overrides,
  } as any;
}

describe("DAB CI reconciliation", () => {
  it("accepts only exact-head/base trusted green evidence", () => {
    expect(reconcileDabPullRequestCi({
      prReceipt: pr,
      observed: { prNumber: 9, headSha: pr.headSha, baseSha: pr.baseSha, checks: green },
      trustedCheckNames: names,
    }).outcome).toBe("green");
    expect(() => reconcileDabPullRequestCi({
      prReceipt: pr,
      observed: { prNumber: 9, headSha: "c".repeat(40), baseSha: pr.baseSha, checks: green },
      trustedCheckNames: names,
    })).toThrow("DAB_CI_HEAD_SHA_STALE");
  });

  it("blocks missing, pending, and failed trusted checks", () => {
    const result = reconcileDabPullRequestCi({
      prReceipt: pr,
      observed: {
        prNumber: 9,
        headSha: pr.headSha,
        baseSha: pr.baseSha,
        checks: [{ name: names[0]!, status: "completed", conclusion: "failure" }],
      },
      trustedCheckNames: names,
    });
    expect(result.outcome).toBe("blocked");
    expect(result.blockerCodes).toContain(`trusted_check_failed:${names[0]}`);
    expect(result.blockerCodes).toContain(`trusted_check_missing:${names[1]}`);
  });

  it("permits repair only inside current approved scope and retry limit", () => {
    expect(repairDecision()).toEqual({ allowed: true, reasonCode: "DAB_CI_REPAIR_SAME_SCOPE_ALLOWED" });
    expect(repairDecision({ proposedPaths: ["other.ts"] }).reasonCode).toBe("DAB_CI_REPAIR_SCOPE_EXPANSION");
    expect(repairDecision({ attempt: 2 }).reasonCode).toBe("DAB_CI_REPAIR_ATTEMPT_LIMIT");
    expect(repairDecision({ currentSpecHash: "new" }).reasonCode).toBe("DAB_CI_REPAIR_SPEC_STALE");
    expect(repairDecision({ currentHeadSha: "c".repeat(40) }).reasonCode).toBe("DAB_CI_REPAIR_HEAD_STALE");
    expect(repairDecision({ currentBaseSha: "d".repeat(40) }).reasonCode).toBe("DAB_CI_REPAIR_BASE_STALE");
    expect(repairDecision({ repairAuthorizationUsable: false }).reasonCode).toBe("DAB_CI_REPAIR_AUTHORIZATION_UNUSABLE");
    expect(repairDecision({ killSwitch: true }).reasonCode).toBe("DAB_CI_REPAIR_KILL_SWITCH");
  });

  it("does not classify missing/pending-only CI as repairable", () => {
    const ci = reconcileDabPullRequestCi({
      prReceipt: pr,
      observed: {
        prNumber: pr.prNumber,
        headSha: pr.headSha,
        baseSha: pr.baseSha,
        checks: [{ name: names[0]!, status: "in_progress", conclusion: null }],
      },
      trustedCheckNames: names,
    });
    expect(evaluateDabSameScopeRepair({
      ci,
      currentHeadSha: ci.headSha,
      currentBaseSha: ci.baseSha,
      specHash: "spec-hash",
      currentSpecHash: "spec-hash",
      approvedPaths: ["a.ts"],
      proposedPaths: ["a.ts"],
      attempt: 0,
      maxAttempts: 2,
      repairAuthorizationUsable: true,
      killSwitch: false,
    }).reasonCode).toBe("DAB_CI_REPAIR_NO_FAILED_TRUSTED_CHECK");
  });

  it("requires a separate verified human editing approval constrained to same-scope CI repair", () => {
    const base = {
      normalEditingApprovalId: "editing-approval-1",
      taskId: "task-1",
      specificationRevision: 7,
      specificationHash: "spec-hash",
      expectedBaseSha: baseSha,
      now: new Date("2026-08-13T20:00:00.000Z"),
    };
    expect(isDabGitCiRepairApprovalUsable({ approval: repairApproval(), ...base })).toBe(true);
    expect(isDabGitCiRepairApprovalUsable({ approval: repairApproval({ approvalId: base.normalEditingApprovalId }), ...base })).toBe(false);
    expect(isDabGitCiRepairApprovalUsable({ approval: repairApproval({ constraints: [] }), ...base })).toBe(false);
    expect(isDabGitCiRepairApprovalUsable({ approval: repairApproval({ expectedGitSha: "c".repeat(40) }), ...base })).toBe(false);
    expect(isDabGitCiRepairApprovalUsable({ approval: repairApproval({ decidingActor: { verified: false, actorType: "human_authority" } }), ...base })).toBe(false);
    expect(isDabGitCiRepairApprovalUsable({ approval: repairApproval({ expiresAt: "2026-08-13T19:59:59.000Z" }), ...base })).toBe(false);
  });

  it("persists one restart-safe repair handoff bound to failed CI evidence", async () => {
    const receipts = new MemoryReceiptStore();
    const args = {
      taskId: "task-1",
      specificationRevision: 7,
      specificationHash: "spec-hash",
      expectedBaseSha: baseSha,
      authorizedFiles: ["b.ts", "a.ts", "a.ts"],
      sourcePreparationJobId: "prep-1",
      sourceProposalId: "proposal-1",
      ciReceipt: failedCi(),
      attempt: 1,
      maxAttempts: 2,
      repairAuthorizationRef: "approval:repair-approval-1",
      receipts,
      now: () => new Date("2026-08-13T20:01:00.000Z"),
    };
    const first = await persistDabGitCiRepairHandoff(args);
    const replay = await persistDabGitCiRepairHandoff(args);
    expect(replay).toEqual(first);
    expect(receipts.saves).toBe(1);
    expect(first).toMatchObject({
      operation: "ci_repair_handoff",
      outcome: "requested",
      taskId: "task-1",
      expectedBaseSha: baseSha,
      failedHeadSha,
      prNumber: 9,
      attempt: 1,
      maxAttempts: 2,
      authorizedFiles: ["a.ts", "b.ts"],
    });
    expect(first.blockerCodes).toContain(`trusted_check_failed:${names[0]}`);
    expect(first.ciEvidenceDigest).toBe(args.ciReceipt.evidenceDigest);
    expect(first.requestFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses a handoff for green or pending-only CI evidence", async () => {
    const receipts = new MemoryReceiptStore();
    const common = {
      taskId: "task-1",
      specificationRevision: 7,
      specificationHash: "spec-hash",
      expectedBaseSha: baseSha,
      authorizedFiles: ["a.ts"],
      sourcePreparationJobId: "prep-1",
      sourceProposalId: "proposal-1",
      attempt: 1,
      maxAttempts: 2,
      repairAuthorizationRef: "approval:repair-approval-1",
      receipts,
    };
    const greenCi = reconcileDabPullRequestCi({
      prReceipt: pr,
      observed: { prNumber: 9, headSha: pr.headSha, baseSha: pr.baseSha, checks: green },
      trustedCheckNames: names,
    });
    await expect(persistDabGitCiRepairHandoff({ ...common, ciReceipt: greenCi })).rejects.toThrow("DAB_GIT_CI_REPAIR_HANDOFF_NOT_REQUIRED");

    const pendingCi = reconcileDabPullRequestCi({
      prReceipt: pr,
      observed: { prNumber: 9, headSha: pr.headSha, baseSha: pr.baseSha, checks: [{ name: names[0]!, status: "in_progress", conclusion: null }] },
      trustedCheckNames: names,
    });
    await expect(persistDabGitCiRepairHandoff({ ...common, ciReceipt: pendingCi })).rejects.toThrow("DAB_GIT_CI_REPAIR_HANDOFF_NO_FAILED_CHECK");
  });

  it("wires failed trusted CI through the same-scope policy and durable handoff in the canonical runner", () => {
    const source = readFileSync(new URL("../lib/dab-git-mission-runner.ts", import.meta.url), "utf8");
    expect(source).toContain("evaluateDabSameScopeRepair");
    expect(source).toContain("isDabGitCiRepairApprovalUsable");
    expect(source).toContain("persistDabGitCiRepairHandoff");
    expect(source).toContain('return this.result("repair_requested", "ci_repair"');
  });
});

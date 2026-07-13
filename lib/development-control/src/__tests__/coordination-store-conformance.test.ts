import { describe, expect, it } from "vitest";
import {
  InMemoryDevelopmentCoordinationStore,
  MAX_COORDINATION_HISTORY_PAGE_SIZE,
  type CompletionReportInput,
  type DevelopmentCoordinationStore,
  type TaskSpecificationInput,
  type TrustedDevelopmentActor,
  createTaskSpecification,
  reviseTaskSpecification,
} from "..";

const SHA = "97fa8cabf013cc51d7c84a386ca0366cd356d747";
const T0 = "2026-07-13T20:00:00.000Z";
const T1 = "2026-07-13T20:01:00.000Z";

const matthew: TrustedDevelopmentActor = Object.freeze({
  actorId: "github:diazpmatt-cmd",
  displayName: "Matthew Diaz",
  actorType: "human_authority",
  verified: true,
  developmentControl: true,
});

const alex: TrustedDevelopmentActor = Object.freeze({
  actorId: "codex:alex",
  displayName: "Alex/Codex",
  actorType: "codex_implementer",
  verified: true,
  developmentControl: true,
});

function input(
  overrides: Partial<TaskSpecificationInput> = {},
): TaskSpecificationInput {
  return {
    taskId: "DAB-2B1-CONFORMANCE",
    title: "Coordination store conformance",
    taskType: "implementation",
    revision: 1,
    expectedOriginMainSha: SHA,
    branchMode: "dedicated_branch",
    intendedBranch: "feature/dab2b1-conformance",
    priority: "high",
    dependencies: [],
    origin: "DAB-2B1",
    proposedAgent: "Alex/Codex",
    authorizedScope: ["durable coordination"],
    authorizedFiles: ["approved.ts"],
    explicitExclusions: ["customer data"],
    acceptanceCriteria: ["converges"],
    verificationRequirements: ["focused tests"],
    documentationRequirements: ["ADR-010"],
    references: [],
    ...overrides,
  };
}

async function register(
  store: DevelopmentCoordinationStore,
  taskId = "DAB-2B1-CONFORMANCE",
  key = "register",
) {
  return await store.registerTask({
    specification: createTaskSpecification(input({ taskId })),
    actor: matthew,
    timestamp: T0,
    idempotencyKey: key,
  });
}

describe("DAB-2B1 coordination store conformance", () => {
  it("implements the complete canonical operation and read surface", () => {
    const store: DevelopmentCoordinationStore =
      new InMemoryDevelopmentCoordinationStore();
    for (const method of [
      "registerTask",
      "reviseTask",
      "decideApproval",
      "transitionTask",
      "claimTask",
      "renewClaim",
      "recoverExpiredClaim",
      "releaseClaim",
      "recordMilestone",
      "submitCompletionReport",
      "getTask",
      "getApprovals",
      "getEvents",
      "getCompletionReport",
      "getSpecificationRevisions",
      "getCompletionReports",
    ] as const) {
      expect(typeof store[method]).toBe("function");
    }
  });

  it("scopes idempotency by operation and task", async () => {
    const store = new InMemoryDevelopmentCoordinationStore();
    await register(store, "TASK-A", "shared-key");
    await register(store, "TASK-B", "shared-key");
    expect(store.getTask("TASK-A").specification.taskId).toBe("TASK-A");
    expect(store.getTask("TASK-B").specification.taskId).toBe("TASK-B");
  });

  it("preserves every immutable specification revision", async () => {
    const store = new InMemoryDevelopmentCoordinationStore();
    const first = await register(store);
    const second = reviseTaskSpecification(
      first.specification,
      input({ revision: 2, title: "Revised conformance" }),
    );
    await store.reviseTask({
      specification: second,
      actor: matthew,
      expectedTaskVersion: first.version,
      timestamp: T1,
      idempotencyKey: "revise",
    });
    expect(store.getSpecificationRevisions(first.specification.taskId)).toEqual([
      first.specification,
      second,
    ]);
    expect(
      store.getSpecificationRevisions(first.specification.taskId, {
        limit: 1,
        offset: 1,
      }),
    ).toEqual([second]);
  });

  it("bounds history pages and preserves deterministic ordering", async () => {
    const store = new InMemoryDevelopmentCoordinationStore();
    const task = await register(store);
    const events = store.getEvents(task.specification.taskId, { limit: 1 });
    expect(events).toHaveLength(1);
    expect(() =>
      store.getEvents(task.specification.taskId, {
        limit: MAX_COORDINATION_HISTORY_PAGE_SIZE + 1,
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_HISTORY_PAGE" }));
  });

  it("preserves completion-report submission history", async () => {
    const store = new InMemoryDevelopmentCoordinationStore();
    const task = await register(store);
    const base: CompletionReportInput = {
      taskId: task.specification.taskId,
      specificationRevision: task.specification.revision,
      specificationHash: task.specification.specificationHash,
      startingGitState: SHA,
      scopeCompleted: ["first"],
      filesChanged: ["approved.ts"],
      verificationResults: [],
      securityScans: [],
      acceptedLimitations: [],
      documentationAffected: [],
      finalGitState: SHA,
      milestones: task.milestones,
      blockers: [],
      recommendedNextTask: null,
    };
    await store.submitCompletionReport({
      report: base,
      actor: alex,
      expectedTaskVersion: task.version,
      submittedAt: T1,
      idempotencyKey: "report-1",
    });
    const current = store.getTask(task.specification.taskId);
    const second = { ...base, scopeCompleted: ["second"] };
    await store.submitCompletionReport({
      report: second,
      actor: alex,
      expectedTaskVersion: current.version,
      submittedAt: "2026-07-13T20:02:00.000Z",
      idempotencyKey: "report-2",
    });
    expect(store.getCompletionReports(task.specification.taskId)).toEqual([
      base,
      second,
    ]);
    expect(store.getCompletionReport(task.specification.taskId)).toEqual(second);
  });

  it("rejects an idempotency-key fingerprint conflict", async () => {
    const store = new InMemoryDevelopmentCoordinationStore();
    await register(store);
    expect(() =>
      store.registerTask({
        specification: createTaskSpecification(
          input({ title: "Different payload" }),
        ),
        actor: matthew,
        timestamp: T0,
        idempotencyKey: "register",
      }),
    ).toThrowError(expect.objectContaining({ code: "IDEMPOTENCY_CONFLICT" }));
  });

  it("keeps customer identity outside the coordination contract", () => {
    const store = new InMemoryDevelopmentCoordinationStore();
    expect(() =>
      store.registerTask({
        specification: createTaskSpecification(input()),
        actor: { ...alex, clientId: "customer" } as TrustedDevelopmentActor,
        timestamp: T0,
        idempotencyKey: "unsafe",
      }),
    ).toThrowError(
      expect.objectContaining({ code: "CUSTOMER_IDENTITY_FORBIDDEN" }),
    );
  });
});

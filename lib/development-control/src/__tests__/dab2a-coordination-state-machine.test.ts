import {
  AUTHORIZATION_CATEGORIES,
  DevelopmentControlError,
  InMemoryDevelopmentCoordinationStore,
  assertApprovalUsable,
  assertValidTransition,
  createApprovalRecord,
  deterministicHash,
  createMilestoneRecord,
  createTaskSpecification,
  reviseTaskSpecification,
  validateCompletionReport,
  type CompletionReportInput,
  type TaskSpecification,
  type TaskSpecificationInput,
  type TrustedDevelopmentActor,
} from "../index";

const SHA = "843ed2acd1ab1317e8f567e26138b303492c4d61";
const OTHER_SHA = "943ed2acd1ab1317e8f567e26138b303492c4d61";
const T0 = "2026-07-13T18:00:00.000Z";
const T1 = "2026-07-13T18:01:00.000Z";
const T2 = "2026-07-13T18:02:00.000Z";

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

const secondAgent: TrustedDevelopmentActor = Object.freeze({
  actorId: "codex:other",
  displayName: "Other Codex",
  actorType: "bounded_sub_agent",
  verified: true,
  developmentControl: true,
});

const reviewer: TrustedDevelopmentActor = Object.freeze({
  actorId: "architect:reviewer",
  displayName: "Architecture Reviewer",
  actorType: "architect_reviewer",
  verified: true,
  developmentControl: true,
});

function specificationInput(
  overrides: Partial<TaskSpecificationInput> = {},
): TaskSpecificationInput {
  return {
    taskId: "DAB-2A",
    title: "Add pure development coordination contracts and state machine",
    taskType: "implementation",
    revision: 1,
    expectedOriginMainSha: SHA,
    branchMode: "dedicated_branch",
    intendedBranch: "feature/dab2a-coordination-state-machine",
    priority: "high",
    dependencies: ["Issue #10", "Issue #11"],
    origin: "Matthew Diaz and ChatGPT architecture workflow",
    proposedAgent: "Alex/Codex",
    authorizedScope: ["pure contracts", "in-memory tests"],
    authorizedFiles: ["lib/development-control/src/index.ts"],
    explicitExclusions: ["no persistence", "no network"],
    acceptanceCriteria: ["fail closed", "deterministic"],
    verificationRequirements: ["focused tests", "typecheck"],
    documentationRequirements: ["ADR-009"],
    references: [
      {
        kind: "issue",
        value: "https://github.com/diazpmatt-cmd/AI-Edge-OS/issues/13",
      },
    ],
    ...overrides,
  };
}

function register(
  store = new InMemoryDevelopmentCoordinationStore(),
  specification = createTaskSpecification(specificationInput()),
) {
  const task = store.registerTask({
    specification,
    actor: matthew,
    timestamp: T0,
    idempotencyKey: `register:${specification.taskId}`,
  });
  return { store, specification, task };
}

function approve(
  store: InMemoryDevelopmentCoordinationStore,
  taskId = "DAB-2A",
  categories = ["scope", "editing"] as const,
) {
  const before = store.getTask(taskId);
  const approval = store.decideApproval({
    taskId,
    categories,
    decidingActor: matthew,
    decision: "approved",
    observedGitSha: SHA,
    decidedAt: T1,
    rationale: "Matthew approved the exact revision and SHA",
    expectedTaskVersion: before.version,
    idempotencyKey: `approval:${taskId}:${categories.join(",")}`,
  });
  return approval;
}

function makeApprovedStore() {
  const { store } = register();
  approve(store);
  const before = store.getTask("DAB-2A");
  store.transitionTask({
    taskId: "DAB-2A",
    nextState: "approved",
    actor: matthew,
    observedGitSha: SHA,
    expectedTaskVersion: before.version,
    reasonCode: "scope_approved",
    timestamp: T1,
    idempotencyKey: "transition:approved",
  });
  return store;
}

describe("DAB-2A task specifications", () => {
  it("hashes equivalent bounded specifications deterministically", () => {
    const first = createTaskSpecification(specificationInput());
    const second = createTaskSpecification(
      specificationInput({
        dependencies: ["Issue #11", "Issue #10", "Issue #10"],
        authorizedScope: ["in-memory tests", "pure contracts"],
      }),
    );
    expect(second).toEqual(first);
    expect(first.specificationHash).toMatch(/^spec_[0-9a-f]{64}$/);
    expect(deterministicHash("abc", "test")).toBe(
      "test_6cc43f858fbb763301637b5af970e2a46b46f461f27e5a0f41e009c59b827b25",
    );
  });

  it("requires a new revision and hash for specification changes", () => {
    const current = createTaskSpecification(specificationInput());
    const revised = reviseTaskSpecification(
      current,
      specificationInput({
        revision: 2,
        acceptanceCriteria: ["fail closed", "deterministic", "bounded"],
      }),
    );
    expect(revised.revision).toBe(2);
    expect(revised.specificationHash).not.toBe(current.specificationHash);
    expect(() =>
      reviseTaskSpecification(current, specificationInput({ revision: 1 })),
    ).toThrowError(expect.objectContaining({ code: "REVISION_MISMATCH" }));
  });

  it("rejects customer tenant identity from development-control specifications", () => {
    const unsafe = { ...specificationInput(), tenantId: "customer-1" };
    expect(() => createTaskSpecification(unsafe)).toThrowError(
      expect.objectContaining({ code: "CUSTOMER_IDENTITY_FORBIDDEN" }),
    );
  });

  it("supports explicit no-branch read-only tasks", () => {
    const spec = createTaskSpecification(
      specificationInput({
        taskId: "DAB-1-PILOT-001",
        taskType: "read_only",
        branchMode: "no_branch",
        intendedBranch: null,
      }),
    );
    expect(spec.intendedBranch).toBeNull();
    expect(spec.branchMode).toBe("no_branch");
  });
});

describe("DAB-2A approvals and stale-state safeguards", () => {
  it("keeps all authorization categories independent", () => {
    expect(new Set(AUTHORIZATION_CATEGORIES).size).toBe(10);
    const specification = createTaskSpecification(specificationInput());
    const approval = createApprovalRecord({
      specification,
      categories: ["scope"],
      decidingActor: matthew,
      decision: "approved",
      decidedAt: T0,
      rationale: "scope only",
      idempotencyKey: "scope-only",
    });
    expect(() =>
      assertApprovalUsable({
        approval,
        specification,
        category: "editing",
        observedGitSha: SHA,
        now: T1,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "WRONG_AUTHORIZATION_CATEGORY" }),
    );
  });

  it("rejects non-human material-action approvers", () => {
    expect(() =>
      createApprovalRecord({
        specification: createTaskSpecification(specificationInput()),
        categories: ["editing"],
        decidingActor: reviewer,
        decision: "approved",
        decidedAt: T0,
        rationale: "not final authority",
        idempotencyKey: "reviewer-approval",
      }),
    ).toThrowError(expect.objectContaining({ code: "UNAUTHORIZED_APPROVER" }));
  });

  it("rejects an unconfigured human authority identity", () => {
    const otherHuman: TrustedDevelopmentActor = {
      ...matthew,
      actorId: "github:not-matthew",
      displayName: "Unconfigured Human",
    };
    expect(() =>
      createApprovalRecord({
        specification: createTaskSpecification(specificationInput()),
        categories: ["scope"],
        decidingActor: otherHuman,
        decision: "approved",
        decidedAt: T0,
        rationale: "not the configured authority",
        idempotencyKey: "other-human",
      }),
    ).toThrowError(expect.objectContaining({ code: "UNAUTHORIZED_APPROVER" }));
  });

  it("rejects wrong SHA and accepts the exact approved SHA", () => {
    const { store } = register();
    const task = store.getTask("DAB-2A");
    expect(() =>
      store.decideApproval({
        taskId: "DAB-2A",
        categories: ["scope"],
        decidingActor: matthew,
        decision: "approved",
        observedGitSha: OTHER_SHA,
        decidedAt: T0,
        rationale: "wrong SHA",
        expectedTaskVersion: task.version,
        idempotencyKey: "wrong-sha",
      }),
    ).toThrowError(expect.objectContaining({ code: "STALE_GIT_SHA" }));
    expect(approve(store, "DAB-2A", ["scope"]).expectedGitSha).toBe(SHA);
  });

  it("rejects expired, revoked, and rejected approval decisions", () => {
    const specification = createTaskSpecification(specificationInput());
    for (const decision of ["revoked", "rejected"] as const) {
      const approval = createApprovalRecord({
        specification,
        categories: ["scope"],
        decidingActor: matthew,
        decision,
        decidedAt: T0,
        rationale: decision,
        idempotencyKey: decision,
      });
      expect(() =>
        assertApprovalUsable({
          approval,
          specification,
          category: "scope",
          observedGitSha: SHA,
          now: T1,
        }),
      ).toThrowError(expect.objectContaining({ code: "APPROVAL_NOT_USABLE" }));
    }
    const expired = createApprovalRecord({
      specification,
      categories: ["scope"],
      decidingActor: matthew,
      decision: "approved",
      decidedAt: T0,
      expiresAt: T1,
      rationale: "bounded window",
      idempotencyKey: "expired",
    });
    expect(() =>
      assertApprovalUsable({
        approval: expired,
        specification,
        category: "scope",
        observedGitSha: SHA,
        now: T1,
      }),
    ).toThrowError(expect.objectContaining({ code: "APPROVAL_EXPIRED" }));
  });

  it("invalidates approvals when the specification revision changes", () => {
    const { store, specification } = register();
    approve(store, "DAB-2A", ["scope"]);
    const next = reviseTaskSpecification(
      specification,
      specificationInput({ revision: 2, title: "Revised DAB-2A" }),
    );
    store.reviseTask({
      specification: next,
      actor: matthew,
      expectedTaskVersion: store.getTask("DAB-2A").version,
      timestamp: T2,
      idempotencyKey: "revise",
    });
    expect(() =>
      store.transitionTask({
        taskId: "DAB-2A",
        nextState: "approved",
        actor: matthew,
        observedGitSha: SHA,
        expectedTaskVersion: store.getTask("DAB-2A").version,
        reasonCode: "old approval",
        timestamp: T2,
        idempotencyKey: "stale-transition",
      }),
    ).toThrowError(expect.objectContaining({ code: "STALE_APPROVAL" }));
  });

  it("invalidates approvals when the specification hash changes", () => {
    const original = createTaskSpecification(specificationInput());
    const changed = createTaskSpecification(
      specificationInput({ title: "Changed without carrying approval" }),
    );
    const approval = createApprovalRecord({
      specification: original,
      categories: ["scope"],
      decidingActor: matthew,
      decision: "approved",
      decidedAt: T0,
      rationale: "original only",
      idempotencyKey: "original",
    });
    expect(() =>
      assertApprovalUsable({
        approval,
        specification: changed,
        category: "scope",
        observedGitSha: SHA,
        now: T1,
      }),
    ).toThrowError(expect.objectContaining({ code: "STALE_APPROVAL" }));
  });

  it("makes approval decisions idempotent without duplicating audit events", () => {
    const { store } = register();
    const task = store.getTask("DAB-2A");
    const input = {
      taskId: "DAB-2A",
      categories: ["scope"] as const,
      decidingActor: matthew,
      decision: "approved" as const,
      observedGitSha: SHA,
      decidedAt: T1,
      rationale: "exact approval",
      expectedTaskVersion: task.version,
      idempotencyKey: "same-approval",
    };
    const first = store.decideApproval(input);
    const eventCount = store.getEvents("DAB-2A").length;
    expect(store.decideApproval(input)).toBe(first);
    expect(store.getEvents("DAB-2A")).toHaveLength(eventCount);
  });

  it("keeps approval decision state separate from lifecycle state", () => {
    const { store } = register();
    approve(store, "DAB-2A", ["scope"]);
    expect(store.getTask("DAB-2A").state).toBe("proposed");
  });
});

describe("DAB-2A lifecycle, claims, and leases", () => {
  it("allows the validated lifecycle and rejects invalid transitions", () => {
    const store = makeApprovedStore();
    let task = store.getTask("DAB-2A");
    task = store.claimTask({
      taskId: "DAB-2A",
      actor: alex,
      observedGitSha: SHA,
      expectedTaskVersion: task.version,
      claimedAt: T1,
      leaseDurationMs: 600_000,
      idempotencyKey: "claim",
    });
    for (const [nextState, actor, key] of [
      ["in_progress", alex, "start"],
      ["review_requested", alex, "review"],
      ["verified", reviewer, "verify"],
      ["completed", matthew, "complete"],
    ] as const) {
      task = store.transitionTask({
        taskId: "DAB-2A",
        nextState,
        actor,
        observedGitSha: SHA,
        expectedTaskVersion: task.version,
        reasonCode: key,
        timestamp: T2,
        idempotencyKey: `transition:${key}`,
      });
    }
    expect(task.state).toBe("completed");
    expect(() =>
      assertValidTransition("completed", "in_progress"),
    ).toThrowError(
      expect.objectContaining({ code: "INVALID_TASK_TRANSITION" }),
    );
  });

  it("rejects claims without scope approval", () => {
    const { store } = register();
    expect(() =>
      store.claimTask({
        taskId: "DAB-2A",
        actor: alex,
        observedGitSha: SHA,
        expectedTaskVersion: 1,
        claimedAt: T1,
        leaseDurationMs: 60_000,
        idempotencyKey: "claim-unapproved",
      }),
    ).toThrowError(expect.objectContaining({ code: "TASK_NOT_CLAIMABLE" }));
  });

  it("rejects duplicate active claims atomically", () => {
    const store = makeApprovedStore();
    const first = store.claimTask({
      taskId: "DAB-2A",
      actor: alex,
      observedGitSha: SHA,
      expectedTaskVersion: store.getTask("DAB-2A").version,
      claimedAt: T1,
      leaseDurationMs: 60_000,
      idempotencyKey: "claim-first",
    });
    expect(first.claim?.owner.actorId).toBe(alex.actorId);
    expect(() =>
      store.claimTask({
        taskId: "DAB-2A",
        actor: secondAgent,
        observedGitSha: SHA,
        expectedTaskVersion: first.version,
        claimedAt: T1,
        leaseDurationMs: 60_000,
        idempotencyKey: "claim-second",
      }),
    ).toThrowError();
  });

  it("renews only the owner lease with the current version", () => {
    const store = makeApprovedStore();
    let task = store.claimTask({
      taskId: "DAB-2A",
      actor: alex,
      observedGitSha: SHA,
      expectedTaskVersion: store.getTask("DAB-2A").version,
      claimedAt: T0,
      leaseDurationMs: 600_000,
      idempotencyKey: "claim-renew",
    });
    task = store.renewClaim({
      taskId: "DAB-2A",
      actor: alex,
      expectedTaskVersion: task.version,
      expectedLeaseVersion: 1,
      renewedAt: T1,
      leaseDurationMs: 600_000,
      idempotencyKey: "renew",
    });
    expect(task.claim?.leaseVersion).toBe(2);
    expect(() =>
      store.renewClaim({
        taskId: "DAB-2A",
        actor: secondAgent,
        expectedTaskVersion: task.version,
        expectedLeaseVersion: 2,
        renewedAt: T2,
        leaseDurationMs: 600_000,
        idempotencyKey: "renew-other",
      }),
    ).toThrowError(
      expect.objectContaining({ code: "CLAIM_OWNED_BY_ANOTHER_ACTOR" }),
    );
  });

  it("requires explicit recovery after lease expiration and never steals an active lease", () => {
    const store = makeApprovedStore();
    let task = store.claimTask({
      taskId: "DAB-2A",
      actor: alex,
      observedGitSha: SHA,
      expectedTaskVersion: store.getTask("DAB-2A").version,
      claimedAt: T0,
      leaseDurationMs: 1_000,
      idempotencyKey: "short-claim",
    });
    expect(() =>
      store.recoverExpiredClaim({
        taskId: "DAB-2A",
        actor: secondAgent,
        expectedTaskVersion: task.version,
        recoveredAt: "2026-07-13T18:00:00.500Z",
        idempotencyKey: "early-recovery",
      }),
    ).toThrowError(
      expect.objectContaining({ code: "ACTIVE_CLAIM_NOT_STEALABLE" }),
    );
    task = store.recoverExpiredClaim({
      taskId: "DAB-2A",
      actor: secondAgent,
      expectedTaskVersion: task.version,
      recoveredAt: T1,
      idempotencyKey: "expired-recovery",
    });
    expect(task.state).toBe("approved");
    expect(task.claim).toBeNull();
    task = store.claimTask({
      taskId: "DAB-2A",
      actor: secondAgent,
      observedGitSha: SHA,
      expectedTaskVersion: task.version,
      claimedAt: T1,
      leaseDurationMs: 60_000,
      idempotencyKey: "reclaimed",
    });
    expect(task.claim?.owner.actorId).toBe(secondAgent.actorId);
  });

  it("rejects stale task and lease versions", () => {
    const store = makeApprovedStore();
    const task = store.claimTask({
      taskId: "DAB-2A",
      actor: alex,
      observedGitSha: SHA,
      expectedTaskVersion: store.getTask("DAB-2A").version,
      claimedAt: T0,
      leaseDurationMs: 600_000,
      idempotencyKey: "version-claim",
    });
    expect(() =>
      store.renewClaim({
        taskId: "DAB-2A",
        actor: alex,
        expectedTaskVersion: task.version - 1,
        expectedLeaseVersion: 1,
        renewedAt: T1,
        leaseDurationMs: 60_000,
        idempotencyKey: "stale-task",
      }),
    ).toThrowError(expect.objectContaining({ code: "STALE_TASK_VERSION" }));
    expect(() =>
      store.renewClaim({
        taskId: "DAB-2A",
        actor: alex,
        expectedTaskVersion: task.version,
        expectedLeaseVersion: 99,
        renewedAt: T1,
        leaseDurationMs: 60_000,
        idempotencyKey: "stale-lease",
      }),
    ).toThrowError(expect.objectContaining({ code: "STALE_LEASE_VERSION" }));
  });
});

describe("DAB-2A events, milestones, reports, and pilot fixtures", () => {
  it("keeps append-only deterministic event history and idempotent replay", () => {
    const { store, task } = register();
    const events = store.getEvents("DAB-2A");
    expect(events).toHaveLength(1);
    expect(events[0].eventId).toMatch(/^event_[0-9a-f]{64}$/);
    expect(Object.isFrozen(events[0])).toBe(true);
    store.registerTask({
      specification: task.specification,
      actor: matthew,
      timestamp: T0,
      idempotencyKey: "register:DAB-2A",
    });
    expect(store.getEvents("DAB-2A")).toEqual(events);
  });

  it("uses not-applicable milestones for read-only no-branch tasks", () => {
    const spec = createTaskSpecification(
      specificationInput({
        taskId: "DAB-1-PILOT-001",
        taskType: "read_only",
        branchMode: "no_branch",
        intendedBranch: null,
      }),
    );
    const { store } = register(
      new InMemoryDevelopmentCoordinationStore(),
      spec,
    );
    expect(
      store
        .getTask(spec.taskId)
        .milestones.every((milestone) => milestone.status === "not_applicable"),
    ).toBe(true);
    expect(() =>
      createMilestoneRecord({
        specification: spec,
        kind: "committed",
        status: "verified",
        evidence: "abc",
        actor: matthew,
        recordedAt: T0,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "MILESTONE_NOT_APPLICABLE" }),
    );
  });

  it("records verified milestones as facts with evidence", () => {
    const store = makeApprovedStore();
    const task = store.getTask("DAB-2A");
    const updated = store.recordMilestone({
      taskId: "DAB-2A",
      kind: "committed",
      status: "verified",
      evidence: "commit 123",
      actor: matthew,
      expectedTaskVersion: task.version,
      recordedAt: T2,
      idempotencyKey: "milestone:commit",
    });
    expect(
      updated.milestones.find((milestone) => milestone.kind === "committed"),
    ).toMatchObject({ status: "verified", evidence: "commit 123" });
  });

  it("accepts bounded completion reports and rejects unauthorized files", () => {
    const store = makeApprovedStore();
    const task = store.getTask("DAB-2A");
    const report: CompletionReportInput = {
      taskId: "DAB-2A",
      specificationRevision: task.specification.revision,
      specificationHash: task.specification.specificationHash,
      startingGitState: SHA,
      scopeCompleted: ["pure state machine"],
      filesChanged: ["lib/development-control/src/index.ts"],
      verificationResults: [
        { name: "focused tests", result: "passed", detail: "all passed" },
      ],
      securityScans: [
        {
          name: "credential scan",
          result: "passed",
          detail: "zero assignment-pattern hits",
        },
      ],
      acceptedLimitations: ["in-memory only"],
      documentationAffected: ["ADR-009"],
      finalGitState: "uncommitted branch",
      milestones: task.milestones,
      blockers: [],
      recommendedNextTask: null,
    };
    expect(
      store.submitCompletionReport({
        report,
        actor: alex,
        expectedTaskVersion: task.version,
        submittedAt: T2,
        idempotencyKey: "report",
      }),
    ).toEqual(report);
    expect(() =>
      store.submitCompletionReport({
        report: { ...report, filesChanged: ["unauthorized.ts"] },
        actor: alex,
        expectedTaskVersion: store.getTask("DAB-2A").version,
        submittedAt: T2,
        idempotencyKey: "bad-file-report",
      }),
    ).toThrowError(expect.objectContaining({ code: "UNAUTHORIZED_FILE" }));
  });

  it("rejects sensitive data, raw environment values, transcripts, and unbounded output", () => {
    const task = createTaskSpecification(specificationInput());
    const base = {
      taskId: task.taskId,
      specificationRevision: task.revision,
      specificationHash: task.specificationHash,
      startingGitState: SHA,
      scopeCompleted: [],
      filesChanged: [],
      verificationResults: [],
      securityScans: [],
      acceptedLimitations: [],
      documentationAffected: [],
      finalGitState: SHA,
      milestones: [],
      blockers: [],
      recommendedNextTask: null,
    } satisfies CompletionReportInput;
    const prohibitedEnvironmentAssignment =
      ["DATABASE", "URL"].join("_") + "=" + "redacted";
    expect(() =>
      validateCompletionReport({
        ...base,
        blockers: [prohibitedEnvironmentAssignment],
      }),
    ).toThrowError(
      expect.objectContaining({ code: "SENSITIVE_DATA_REJECTED" }),
    );
    expect(() =>
      validateCompletionReport({
        ...base,
        shellOutput: "raw",
      } as CompletionReportInput),
    ).toThrowError(
      expect.objectContaining({ code: "PROHIBITED_REPORT_FIELD" }),
    );
    expect(() =>
      validateCompletionReport({ ...base, blockers: ["x".repeat(2_001)] }),
    ).toThrowError(expect.objectContaining({ code: "UNBOUNDED_REPORT" }));
  });

  it("rejects customer identity on development actors", () => {
    const unsafeActor = { ...alex, clientId: "customer-tenant" };
    const store = new InMemoryDevelopmentCoordinationStore();
    expect(() =>
      store.registerTask({
        specification: createTaskSpecification(
          specificationInput({ taskId: "UNSAFE-ACTOR" }),
        ),
        actor: unsafeActor,
        timestamp: T0,
        idempotencyKey: "unsafe-actor",
      }),
    ).toThrowError(
      expect.objectContaining({ code: "CUSTOMER_IDENTITY_FORBIDDEN" }),
    );
  });

  it("models both DAB-1 pilot fixtures without a production bridge", () => {
    const pilot1 = createTaskSpecification(
      specificationInput({
        taskId: "DAB-1-PILOT-001",
        title: "Validate DAB-1 workflow",
        taskType: "read_only",
        branchMode: "no_branch",
        intendedBranch: null,
        authorizedFiles: [],
      }),
    );
    const pilot2 = createTaskSpecification(
      specificationInput({
        taskId: "DAB-1-PILOT-002",
        title: "Reconcile DAB-1 post-merge documentation",
        taskType: "documentation",
        intendedBranch: "docs/dab1-post-merge-reconciliation",
        authorizedFiles: ["CHANGELOG.md", "ROADMAP.md", "SESSION_HANDOFF.md"],
      }),
    );
    expect(pilot1.branchMode).toBe("no_branch");
    expect(pilot2.authorizedFiles).toEqual([
      "CHANGELOG.md",
      "ROADMAP.md",
      "SESSION_HANDOFF.md",
    ]);
    expect(
      [pilot1, pilot2].every(
        (fixture) => !("tenantId" in fixture) && !("provider" in fixture),
      ),
    ).toBe(true);
  });
});

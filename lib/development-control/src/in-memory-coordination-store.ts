import {
  DAB2A_AUTHORITY_POLICY,
  assertApprovalUsable,
  createApprovalRecord,
} from "./authorization";
import { createClaimLease, isLeaseExpired, renewClaimLease } from "./claims";
import { validateCompletionReport } from "./completion-report";
import { createAuditEvent, validateActor } from "./events";
import { assertValidTransition } from "./lifecycle";
import { createMilestoneRecord, initialMilestones } from "./milestones";
import { deterministicHash } from "./specification";
import {
  DevelopmentControlError,
  type ApprovalDecision,
  type ApprovalRecord,
  type AuditEvent,
  type AuthorizationCategory,
  type ClaimLease,
  type CompletionReportInput,
  type DevelopmentAuthorityPolicy,
  type MilestoneKind,
  type MilestoneRecord,
  type MilestoneStatus,
  type TaskRecord,
  type TaskSpecification,
  type TaskState,
  type TrustedDevelopmentActor,
} from "./types";

interface MutableTask {
  specification: TaskSpecification;
  state: TaskState;
  version: number;
  claim: ClaimLease | null;
  milestones: MilestoneRecord[];
}

interface IdempotentResult {
  readonly fingerprint: string;
  readonly value: unknown;
}

const TRANSITION_CATEGORY: Partial<
  Record<`${TaskState}->${TaskState}`, AuthorizationCategory>
> = {
  "proposed->approved": "scope",
  "claimed->in_progress": "editing",
  "in_progress->review_requested": "editing",
  "review_requested->in_progress": "editing",
  "review_requested->verified": "scope",
  "verified->in_progress": "editing",
  "verified->completed": "scope",
  "blocked->approved": "scope",
  "blocked->in_progress": "editing",
};

export class InMemoryDevelopmentCoordinationStore {
  private readonly tasks = new Map<string, MutableTask>();
  private readonly approvals = new Map<string, ApprovalRecord[]>();
  private readonly events = new Map<string, AuditEvent[]>();
  private readonly reports = new Map<string, Readonly<CompletionReportInput>>();
  private readonly idempotency = new Map<string, IdempotentResult>();

  constructor(
    private readonly authorityPolicy: DevelopmentAuthorityPolicy = DAB2A_AUTHORITY_POLICY,
  ) {}

  private idempotent<T>(key: string, input: unknown, operation: () => T): T {
    if (!key.trim() || key.length > 200)
      throw new DevelopmentControlError(
        "INVALID_IDEMPOTENCY_KEY",
        "bounded idempotency key is required",
      );
    const fingerprint = deterministicHash(input, "request");
    const existing = this.idempotency.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw new DevelopmentControlError(
          "IDEMPOTENCY_CONFLICT",
          "idempotency key was reused for different input",
        );
      return existing.value as T;
    }
    const value = operation();
    this.idempotency.set(key, { fingerprint, value });
    return value;
  }

  private mutableTask(taskId: string): MutableTask {
    const task = this.tasks.get(taskId);
    if (!task)
      throw new DevelopmentControlError(
        "TASK_NOT_FOUND",
        `task ${taskId} was not found`,
      );
    return task;
  }

  private snapshot(task: MutableTask): TaskRecord {
    return Object.freeze({
      specification: task.specification,
      state: task.state,
      version: task.version,
      claim: task.claim,
      milestones: Object.freeze([...task.milestones]),
    });
  }

  private assertVersion(task: MutableTask, expectedVersion: number): void {
    if (task.version !== expectedVersion)
      throw new DevelopmentControlError(
        "STALE_TASK_VERSION",
        `expected task version ${expectedVersion}, found ${task.version}`,
      );
  }

  private appendEvent(
    task: MutableTask,
    input: Omit<Parameters<typeof createAuditEvent>[0], "task">,
  ): AuditEvent {
    const event = createAuditEvent({ ...input, task: this.snapshot(task) });
    const list = this.events.get(task.specification.taskId) ?? [];
    if (!list.some((candidate) => candidate.eventId === event.eventId))
      list.push(event);
    this.events.set(task.specification.taskId, list);
    return event;
  }

  private latestApproval(
    task: MutableTask,
    category: AuthorizationCategory,
  ): ApprovalRecord {
    const candidates = (
      this.approvals.get(task.specification.taskId) ?? []
    ).filter((record) => record.categories.includes(category));
    const approval = candidates.at(-1);
    if (!approval)
      throw new DevelopmentControlError(
        "APPROVAL_REQUIRED",
        `${category} approval is required`,
      );
    return approval;
  }

  private assertAuthorized(
    task: MutableTask,
    category: AuthorizationCategory,
    observedGitSha: string,
    now: string,
  ): ApprovalRecord {
    const approval = this.latestApproval(task, category);
    assertApprovalUsable({
      approval,
      specification: task.specification,
      category,
      observedGitSha,
      now,
    });
    return approval;
  }

  registerTask(input: {
    specification: TaskSpecification;
    actor: TrustedDevelopmentActor;
    timestamp: string;
    idempotencyKey: string;
  }): TaskRecord {
    return this.idempotent(input.idempotencyKey, input, () => {
      validateActor(input.actor);
      if (this.tasks.has(input.specification.taskId))
        throw new DevelopmentControlError(
          "TASK_ALREADY_EXISTS",
          "task already exists",
        );
      const task: MutableTask = {
        specification: input.specification,
        state: "proposed",
        version: 1,
        claim: null,
        milestones: [
          ...initialMilestones(input.specification, input.timestamp),
        ],
      };
      this.tasks.set(input.specification.taskId, task);
      this.appendEvent(task, {
        priorState: null,
        newState: "proposed",
        actor: input.actor,
        reasonCode: "task_registered",
        expectedGitSha: input.specification.expectedOriginMainSha,
        observedGitSha: null,
        correlationKey: input.idempotencyKey,
        timestamp: input.timestamp,
      });
      return this.snapshot(task);
    });
  }

  reviseTask(input: {
    specification: TaskSpecification;
    actor: TrustedDevelopmentActor;
    expectedTaskVersion: number;
    timestamp: string;
    idempotencyKey: string;
  }): TaskRecord {
    return this.idempotent(input.idempotencyKey, input, () => {
      validateActor(input.actor);
      if (input.actor.actorType !== "human_authority")
        throw new DevelopmentControlError(
          "UNAUTHORIZED_ACTOR",
          "only human authority may replace the active specification",
        );
      const task = this.mutableTask(input.specification.taskId);
      this.assertVersion(task, input.expectedTaskVersion);
      if (
        input.specification.revision !== task.specification.revision + 1 ||
        input.specification.specificationHash ===
          task.specification.specificationHash
      ) {
        throw new DevelopmentControlError(
          "INVALID_SPECIFICATION_REVISION",
          "replacement specification must be the next distinct revision",
        );
      }
      const prior = task.state;
      task.specification = input.specification;
      task.state = "proposed";
      task.claim = null;
      task.milestones = [
        ...initialMilestones(input.specification, input.timestamp),
      ];
      task.version += 1;
      this.appendEvent(task, {
        priorState: prior,
        newState: "proposed",
        actor: input.actor,
        reasonCode: "specification_revised",
        expectedGitSha: input.specification.expectedOriginMainSha,
        observedGitSha: null,
        correlationKey: input.idempotencyKey,
        timestamp: input.timestamp,
      });
      return this.snapshot(task);
    });
  }

  decideApproval(input: {
    taskId: string;
    categories: readonly AuthorizationCategory[];
    decidingActor: TrustedDevelopmentActor;
    decision: ApprovalDecision;
    observedGitSha: string;
    decidedAt: string;
    expiresAt?: string | null;
    constraints?: readonly string[];
    rationale: string;
    expectedTaskVersion: number;
    idempotencyKey: string;
  }): ApprovalRecord {
    return this.idempotent(input.idempotencyKey, input, () => {
      const task = this.mutableTask(input.taskId);
      this.assertVersion(task, input.expectedTaskVersion);
      if (input.observedGitSha !== task.specification.expectedOriginMainSha)
        throw new DevelopmentControlError(
          "STALE_GIT_SHA",
          "approval observed the wrong origin/main SHA",
        );
      const approval = createApprovalRecord({
        specification: task.specification,
        categories: input.categories,
        decidingActor: input.decidingActor,
        decision: input.decision,
        decidedAt: input.decidedAt,
        expiresAt: input.expiresAt,
        constraints: input.constraints,
        rationale: input.rationale,
        idempotencyKey: input.idempotencyKey,
        authorityPolicy: this.authorityPolicy,
      });
      const records = this.approvals.get(input.taskId) ?? [];
      records.push(approval);
      this.approvals.set(input.taskId, records);
      task.version += 1;
      this.appendEvent(task, {
        priorState: task.state,
        newState: task.state,
        actor: input.decidingActor,
        reasonCode: `approval_${input.decision}`,
        expectedGitSha: task.specification.expectedOriginMainSha,
        observedGitSha: input.observedGitSha,
        correlationKey: input.idempotencyKey,
        metadata: { categories: [...approval.categories].join(",") },
        timestamp: input.decidedAt,
      });
      return approval;
    });
  }

  transitionTask(input: {
    taskId: string;
    nextState: TaskState;
    actor: TrustedDevelopmentActor;
    observedGitSha: string;
    expectedTaskVersion: number;
    reasonCode: string;
    timestamp: string;
    idempotencyKey: string;
  }): TaskRecord {
    return this.idempotent(input.idempotencyKey, input, () => {
      validateActor(input.actor);
      const task = this.mutableTask(input.taskId);
      this.assertVersion(task, input.expectedTaskVersion);
      assertValidTransition(task.state, input.nextState);
      if (input.observedGitSha !== task.specification.expectedOriginMainSha)
        throw new DevelopmentControlError(
          "STALE_GIT_SHA",
          "transition observed the wrong origin/main SHA",
        );
      const category = TRANSITION_CATEGORY[`${task.state}->${input.nextState}`];
      if (category)
        this.assertAuthorized(
          task,
          category,
          input.observedGitSha,
          input.timestamp,
        );
      if (
        ["in_progress", "review_requested"].includes(input.nextState) &&
        task.claim?.owner.actorId !== input.actor.actorId
      ) {
        throw new DevelopmentControlError(
          "CLAIM_OWNED_BY_ANOTHER_ACTOR",
          "active claim owner must perform implementation transition",
        );
      }
      const prior = task.state;
      task.state = input.nextState;
      task.version += 1;
      this.appendEvent(task, {
        priorState: prior,
        newState: input.nextState,
        actor: input.actor,
        reasonCode: input.reasonCode,
        expectedGitSha: task.specification.expectedOriginMainSha,
        observedGitSha: input.observedGitSha,
        correlationKey: input.idempotencyKey,
        timestamp: input.timestamp,
      });
      return this.snapshot(task);
    });
  }

  claimTask(input: {
    taskId: string;
    actor: TrustedDevelopmentActor;
    observedGitSha: string;
    expectedTaskVersion: number;
    claimedAt: string;
    leaseDurationMs: number;
    idempotencyKey: string;
  }): TaskRecord {
    return this.idempotent(input.idempotencyKey, input, () => {
      const task = this.mutableTask(input.taskId);
      this.assertVersion(task, input.expectedTaskVersion);
      if (task.state !== "approved")
        throw new DevelopmentControlError(
          "TASK_NOT_CLAIMABLE",
          "task must be approved before claim",
        );
      this.assertAuthorized(
        task,
        "scope",
        input.observedGitSha,
        input.claimedAt,
      );
      if (task.claim) {
        if (isLeaseExpired(task.claim, input.claimedAt))
          throw new DevelopmentControlError(
            "EXPIRED_CLAIM_REQUIRES_RECOVERY",
            "expired claim requires explicit recovery before another claim",
          );
        throw new DevelopmentControlError(
          "DUPLICATE_ACTIVE_CLAIM",
          "task already has an active claimant",
        );
      }
      const prior = task.state;
      task.claim = createClaimLease({
        taskId: input.taskId,
        owner: input.actor,
        claimedAt: input.claimedAt,
        durationMs: input.leaseDurationMs,
      });
      task.state = "claimed";
      task.version += 1;
      this.appendEvent(task, {
        priorState: prior,
        newState: "claimed",
        actor: input.actor,
        reasonCode: "task_claimed",
        expectedGitSha: task.specification.expectedOriginMainSha,
        observedGitSha: input.observedGitSha,
        correlationKey: input.idempotencyKey,
        metadata: {
          leaseVersion: task.claim.leaseVersion,
          expiresAt: task.claim.expiresAt,
        },
        timestamp: input.claimedAt,
      });
      return this.snapshot(task);
    });
  }

  renewClaim(input: {
    taskId: string;
    actor: TrustedDevelopmentActor;
    expectedTaskVersion: number;
    expectedLeaseVersion: number;
    renewedAt: string;
    leaseDurationMs: number;
    idempotencyKey: string;
  }): TaskRecord {
    return this.idempotent(input.idempotencyKey, input, () => {
      const task = this.mutableTask(input.taskId);
      this.assertVersion(task, input.expectedTaskVersion);
      if (!task.claim)
        throw new DevelopmentControlError(
          "CLAIM_NOT_FOUND",
          "task has no active claim",
        );
      task.claim = renewClaimLease({
        lease: task.claim,
        owner: input.actor,
        expectedLeaseVersion: input.expectedLeaseVersion,
        renewedAt: input.renewedAt,
        durationMs: input.leaseDurationMs,
      });
      task.version += 1;
      this.appendEvent(task, {
        priorState: task.state,
        newState: task.state,
        actor: input.actor,
        reasonCode: "claim_renewed",
        correlationKey: input.idempotencyKey,
        metadata: {
          leaseVersion: task.claim.leaseVersion,
          expiresAt: task.claim.expiresAt,
        },
        timestamp: input.renewedAt,
      });
      return this.snapshot(task);
    });
  }

  recoverExpiredClaim(input: {
    taskId: string;
    actor: TrustedDevelopmentActor;
    expectedTaskVersion: number;
    recoveredAt: string;
    idempotencyKey: string;
  }): TaskRecord {
    return this.idempotent(input.idempotencyKey, input, () => {
      validateActor(input.actor);
      const task = this.mutableTask(input.taskId);
      this.assertVersion(task, input.expectedTaskVersion);
      if (!task.claim)
        throw new DevelopmentControlError(
          "CLAIM_NOT_FOUND",
          "task has no claim to recover",
        );
      if (!isLeaseExpired(task.claim, input.recoveredAt))
        throw new DevelopmentControlError(
          "ACTIVE_CLAIM_NOT_STEALABLE",
          "active leases cannot be stolen or recovered",
        );
      const prior = task.state;
      task.claim = null;
      task.state = "approved";
      task.version += 1;
      this.appendEvent(task, {
        priorState: prior,
        newState: "approved",
        actor: input.actor,
        reasonCode: "expired_claim_recovered",
        correlationKey: input.idempotencyKey,
        timestamp: input.recoveredAt,
      });
      return this.snapshot(task);
    });
  }

  releaseClaim(input: {
    taskId: string;
    actor: TrustedDevelopmentActor;
    expectedTaskVersion: number;
    releasedAt: string;
    idempotencyKey: string;
  }): TaskRecord {
    return this.idempotent(input.idempotencyKey, input, () => {
      validateActor(input.actor);
      const task = this.mutableTask(input.taskId);
      this.assertVersion(task, input.expectedTaskVersion);
      if (!task.claim)
        throw new DevelopmentControlError(
          "CLAIM_NOT_FOUND",
          "task has no active claim",
        );
      if (task.claim.owner.actorId !== input.actor.actorId)
        throw new DevelopmentControlError(
          "CLAIM_OWNED_BY_ANOTHER_ACTOR",
          "only the owner may release an active claim",
        );
      const prior = task.state;
      task.claim = null;
      task.state = "approved";
      task.version += 1;
      this.appendEvent(task, {
        priorState: prior,
        newState: "approved",
        actor: input.actor,
        reasonCode: "claim_released",
        correlationKey: input.idempotencyKey,
        timestamp: input.releasedAt,
      });
      return this.snapshot(task);
    });
  }

  recordMilestone(input: {
    taskId: string;
    kind: MilestoneKind;
    status: MilestoneStatus;
    evidence?: string | null;
    actor: TrustedDevelopmentActor;
    expectedTaskVersion: number;
    recordedAt: string;
    idempotencyKey: string;
  }): TaskRecord {
    return this.idempotent(input.idempotencyKey, input, () => {
      const task = this.mutableTask(input.taskId);
      this.assertVersion(task, input.expectedTaskVersion);
      const milestone = createMilestoneRecord({
        specification: task.specification,
        kind: input.kind,
        status: input.status,
        evidence: input.evidence,
        actor: input.actor,
        recordedAt: input.recordedAt,
      });
      task.milestones = task.milestones.map((record) =>
        record.kind === input.kind ? milestone : record,
      );
      task.version += 1;
      this.appendEvent(task, {
        priorState: task.state,
        newState: task.state,
        actor: input.actor,
        reasonCode: "milestone_recorded",
        correlationKey: input.idempotencyKey,
        metadata: { milestone: input.kind, status: input.status },
        timestamp: input.recordedAt,
      });
      return this.snapshot(task);
    });
  }

  submitCompletionReport(input: {
    report: CompletionReportInput;
    actor: TrustedDevelopmentActor;
    expectedTaskVersion: number;
    submittedAt: string;
    idempotencyKey: string;
  }): Readonly<CompletionReportInput> {
    return this.idempotent(input.idempotencyKey, input, () => {
      validateActor(input.actor);
      const task = this.mutableTask(input.report.taskId);
      this.assertVersion(task, input.expectedTaskVersion);
      if (
        input.report.specificationRevision !== task.specification.revision ||
        input.report.specificationHash !== task.specification.specificationHash
      )
        throw new DevelopmentControlError(
          "STALE_COMPLETION_REPORT",
          "completion report does not bind to active specification",
        );
      const unauthorized = input.report.filesChanged.filter(
        (file) => !task.specification.authorizedFiles.includes(file),
      );
      if (unauthorized.length)
        throw new DevelopmentControlError(
          "UNAUTHORIZED_FILE",
          `completion report contains unauthorized files: ${unauthorized.join(", ")}`,
        );
      const report = validateCompletionReport(input.report);
      this.reports.set(input.report.taskId, report);
      task.version += 1;
      this.appendEvent(task, {
        priorState: task.state,
        newState: task.state,
        actor: input.actor,
        reasonCode: "completion_report_submitted",
        correlationKey: input.idempotencyKey,
        metadata: {
          filesChanged: input.report.filesChanged.length,
          verificationResults: input.report.verificationResults.length,
        },
        timestamp: input.submittedAt,
      });
      return report;
    });
  }

  getTask(taskId: string): TaskRecord {
    return this.snapshot(this.mutableTask(taskId));
  }

  getApprovals(taskId: string): readonly ApprovalRecord[] {
    return Object.freeze([...(this.approvals.get(taskId) ?? [])]);
  }

  getEvents(taskId: string): readonly AuditEvent[] {
    return Object.freeze([...(this.events.get(taskId) ?? [])]);
  }

  getCompletionReport(taskId: string): Readonly<CompletionReportInput> | null {
    return this.reports.get(taskId) ?? null;
  }
}

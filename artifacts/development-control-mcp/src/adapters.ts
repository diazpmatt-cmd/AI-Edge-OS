import type {
  ApprovalRecord,
  AuditEvent,
  DevelopmentCoordinationStore,
  TaskRecord,
  TaskSpecification,
} from "@workspace/development-control";
import type {
  BridgeGitEvidenceReadResult,
  BridgeGitEvidenceReader,
} from "@workspace/development-control-store";

async function resolved<T>(value: T | Promise<T>): Promise<T> { return value }

export class CanonicalBridgeReadAdapter {
  constructor(
    private readonly coordination: DevelopmentCoordinationStore,
    private readonly gitEvidence: BridgeGitEvidenceReader,
  ) {}

  async getTask(taskId: string): Promise<TaskRecord> {
    return resolved(this.coordination.getTask(taskId));
  }

  async getApprovals(taskId: string): Promise<readonly ApprovalRecord[]> {
    return resolved(this.coordination.getApprovals(taskId, { limit: 50 }));
  }

  async getSpecificationRevisions(taskId: string): Promise<readonly TaskSpecification[]> {
    return resolved(this.coordination.getSpecificationRevisions(taskId, { limit: 20 }));
  }

  async getLatestEvents(taskId: string): Promise<readonly AuditEvent[]> {
    const events = await resolved(this.coordination.getEvents(taskId, { limit: 100 }));
    return Object.freeze(events.slice(-10));
  }

  async getGitEvidence(input: {
    readonly repositoryId: string;
    readonly taskId: string;
    readonly specificationRevision: number;
    readonly specificationHash: string;
    readonly expectedOriginMainSha: string;
  }): Promise<BridgeGitEvidenceReadResult> {
    return this.gitEvidence.readBoundEvidence({ ...input, limit: 20 });
  }
}

export function projectTask(task: TaskRecord): Readonly<Record<string, unknown>> {
  return Object.freeze({
    taskId: task.specification.taskId,
    title: task.specification.title,
    state: task.state,
    version: task.version,
    priority: task.specification.priority,
    taskType: task.specification.taskType,
    branchMode: task.specification.branchMode,
    intendedBranch: task.specification.intendedBranch,
    specificationRevision: task.specification.revision,
    specificationHash: task.specification.specificationHash,
    expectedOriginMainSha: task.specification.expectedOriginMainSha,
  });
}

export function projectSpecifications(
  specifications: readonly TaskSpecification[],
): Readonly<{ revisions: readonly Readonly<Record<string, unknown>>[] }> {
  return Object.freeze({
    revisions: Object.freeze(specifications.map((specification) => Object.freeze({
      taskId: specification.taskId,
      revision: specification.revision,
      specificationHash: specification.specificationHash,
      expectedOriginMainSha: specification.expectedOriginMainSha,
      intendedBranch: specification.intendedBranch,
      authorizedScope: Object.freeze([...specification.authorizedScope]),
      authorizedFiles: Object.freeze([...specification.authorizedFiles]),
      explicitExclusions: Object.freeze([...specification.explicitExclusions]),
    }))),
  });
}

export function projectApprovals(
  approvals: readonly ApprovalRecord[],
): Readonly<{ decisions: readonly Readonly<Record<string, unknown>>[] }> {
  return Object.freeze({
    decisions: Object.freeze(approvals.map((approval) => Object.freeze({
      approvalId: approval.approvalId,
      taskId: approval.taskId,
      specificationRevision: approval.specificationRevision,
      specificationHash: approval.specificationHash,
      expectedGitSha: approval.expectedGitSha,
      categories: Object.freeze([...approval.categories]),
      decision: approval.decision,
      decidingActorId: approval.decidingActor.actorId,
      decidingActorType: approval.decidingActor.actorType,
      attributable: approval.decidingActor.verified,
      decidedAt: approval.decidedAt,
      expiresAt: approval.expiresAt,
    }))),
  });
}

export function projectProgress(input: {
  readonly task: TaskRecord;
  readonly events: readonly AuditEvent[];
  readonly correlationId: string;
  readonly reasonCodes: readonly string[];
}): Readonly<Record<string, unknown>> {
  return Object.freeze({
    task: projectTask(input.task),
    events: Object.freeze(input.events.map((event) => Object.freeze({
      eventId: event.eventId,
      priorState: event.priorState,
      newState: event.newState,
      reasonCode: event.reasonCode,
      actorId: event.actor.actorId,
      timestamp: event.timestamp,
      correlationKey: event.correlationKey,
      specificationRevision: event.specificationRevision,
      specificationHash: event.specificationHash,
    }))),
    correlationId: input.correlationId,
    policyReasonCodes: Object.freeze([...input.reasonCodes]),
  });
}

import {
  DevelopmentControlError,
  type ApprovalRecord,
  type AuditEvent,
  type ClaimLease,
  type CompletionReportInput,
  type MilestoneRecord,
  type TaskRecord,
  type TaskSpecification,
  type TaskState,
} from "@workspace/development-control";

export function freezeSpecification(
  specification: TaskSpecification,
): TaskSpecification {
  return Object.freeze({ ...specification });
}

export function freezeApproval(record: ApprovalRecord): ApprovalRecord {
  return Object.freeze({
    ...record,
    categories: Object.freeze([...record.categories]),
    constraints: Object.freeze([...record.constraints]),
    decidingActor: Object.freeze({ ...record.decidingActor }),
  });
}

export function freezeEvent(event: AuditEvent): AuditEvent {
  return Object.freeze({
    ...event,
    actor: Object.freeze({ ...event.actor }),
    metadata: Object.freeze({ ...event.metadata }),
  });
}

export function freezeMilestone(record: MilestoneRecord): MilestoneRecord {
  return Object.freeze({
    ...record,
    verifiedBy: record.verifiedBy
      ? Object.freeze({ ...record.verifiedBy })
      : null,
  });
}

export function freezeReport(
  report: CompletionReportInput,
): Readonly<CompletionReportInput> {
  return Object.freeze({ ...report });
}

export function taskRecordFromPersistence(input: {
  specification: TaskSpecification;
  state: string;
  version: number;
  claim: ClaimLease | null;
  milestones: readonly MilestoneRecord[];
}): TaskRecord {
  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new DevelopmentControlError(
      "INVALID_PERSISTED_TASK",
      "persisted task version is invalid",
    );
  }
  return Object.freeze({
    specification: freezeSpecification(input.specification),
    state: input.state as TaskState,
    version: input.version,
    claim: input.claim
      ? Object.freeze({
          ...input.claim,
          owner: Object.freeze({ ...input.claim.owner }),
        })
      : null,
    milestones: Object.freeze(input.milestones.map(freezeMilestone)),
  });
}

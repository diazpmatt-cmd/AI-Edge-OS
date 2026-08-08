import type {
  DevelopmentCoordinationStore,
  MilestoneKind,
  TaskRecord,
  TrustedDevelopmentActor,
} from "@workspace/development-control";

export async function recordVerifiedDabEngineeringMilestone(input: {
  store: DevelopmentCoordinationStore;
  task: TaskRecord;
  kind: Extract<MilestoneKind, "committed" | "pushed" | "pull_request_opened" | "merged">;
  evidenceRef: string;
  actor: TrustedDevelopmentActor;
  recordedAt: string;
  idempotencyKey: string;
}): Promise<TaskRecord> {
  const evidence = input.evidenceRef.trim();
  if (!evidence || evidence.length > 500) throw new Error("DAB_ENGINEERING_MILESTONE_EVIDENCE_INVALID");
  if (!input.actor.verified || !input.actor.developmentControl) throw new Error("DAB_ENGINEERING_MILESTONE_ACTOR_UNVERIFIED");
  return await input.store.recordMilestone({
    taskId: input.task.specification.taskId,
    kind: input.kind,
    status: "verified",
    evidence,
    actor: input.actor,
    expectedTaskVersion: input.task.version,
    recordedAt: input.recordedAt,
    idempotencyKey: input.idempotencyKey,
  });
}

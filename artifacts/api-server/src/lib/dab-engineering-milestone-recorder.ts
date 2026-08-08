export type DabEngineeringMilestoneKind = "committed" | "pushed" | "pull_request_opened" | "merged";
export type DabTrustedActorLike = Readonly<{ actorId: string; displayName: string; actorType: string; verified: boolean; developmentControl: true }>;
export type DabTaskLike = Readonly<{ specification: Readonly<{ taskId: string }>; version: number }>;
export interface DabCanonicalMilestoneStoreLike<TTask extends DabTaskLike = DabTaskLike> {
  recordMilestone(input: {
    taskId: string;
    kind: DabEngineeringMilestoneKind;
    status: "verified";
    evidence: string;
    actor: DabTrustedActorLike;
    expectedTaskVersion: number;
    recordedAt: string;
    idempotencyKey: string;
  }): TTask | Promise<TTask>;
}

/** Structural adapter for the canonical DevelopmentCoordinationStore.recordMilestone contract. */
export async function recordVerifiedDabEngineeringMilestone<TTask extends DabTaskLike>(input: {
  store: DabCanonicalMilestoneStoreLike<TTask>;
  task: TTask;
  kind: DabEngineeringMilestoneKind;
  evidenceRef: string;
  actor: DabTrustedActorLike;
  recordedAt: string;
  idempotencyKey: string;
}): Promise<TTask> {
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

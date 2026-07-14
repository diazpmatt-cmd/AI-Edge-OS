import {
  DAB2A_AUTHORITY_POLICY,
  DevelopmentControlError,
  TRANSITION_AUTHORIZATION_CATEGORY,
  assertApprovalUsable,
  assertValidTransition,
  createApprovalRecord,
  createAuditEvent,
  createClaimLease,
  createMilestoneRecord,
  deterministicHash,
  initialMilestones,
  isLeaseExpired,
  renewClaimLease,
  validateActor,
  validateCompletionReport,
  type ApprovalRecord,
  type AuditEvent,
  type AuthorizationCategory,
  type ClaimLease,
  type CompletionReportInput,
  type CoordinationHistoryPageOptions,
  type DecideApprovalInput,
  type DevelopmentAuthorityPolicy,
  type DevelopmentCoordinationStore,
  type ClaimTaskInput,
  type RecoverExpiredClaimInput,
  type RecordMilestoneInput,
  type RegisterTaskInput,
  type ReleaseClaimInput,
  type RenewClaimInput,
  type ReviseTaskInput,
  type SubmitCompletionReportInput,
  type TaskRecord,
  type TaskSpecification,
  type TransitionTaskInput,
  type TrustedDevelopmentActor,
  normalizeCoordinationHistoryPage,
} from "@workspace/development-control";
import { and, asc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  freezeApproval,
  freezeEvent,
  freezeReport,
  freezeSpecification,
  taskRecordFromPersistence,
} from "./mappers.js";
import * as schema from "./schema.js";

type Database = NodePgDatabase<typeof schema>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const {
  developmentActorIdentitiesTable,
  developmentAuditEventsTable,
  developmentAuthorizationDecisionsTable,
  developmentCompletionReportsTable,
  developmentIdempotencyRecordsTable,
  developmentMilestonesTable,
  developmentTaskClaimsTable,
  developmentTaskSpecificationsTable,
  developmentTasksTable,
} = schema;

function validateIdempotencyKey(key: string): void {
  if (!key.trim() || key.length > 200) {
    throw new DevelopmentControlError(
      "INVALID_IDEMPOTENCY_KEY",
      "bounded idempotency key is required",
    );
  }
}

function assertTaskVersion(task: TaskRecord, expected: number): void {
  if (task.version !== expected) {
    throw new DevelopmentControlError(
      "STALE_TASK_VERSION",
      `expected task version ${expected}, found ${task.version}`,
    );
  }
}

function milestoneId(
  taskId: string,
  specificationHash: string,
  record: TaskRecord["milestones"][number],
): string {
  return deterministicHash(
    { taskId, specificationHash, ...record },
    "milestone",
  );
}

function reportId(
  report: CompletionReportInput,
  actor: TrustedDevelopmentActor,
  submittedAt: string,
): string {
  return deterministicHash(
    { report, actorId: actor.actorId, submittedAt },
    "report",
  );
}

export class PostgresDevelopmentCoordinationStore
  implements DevelopmentCoordinationStore
{
  constructor(
    private readonly db: Database,
    private readonly authorityPolicy: DevelopmentAuthorityPolicy = DAB2A_AUTHORITY_POLICY,
  ) {}

  private async databaseNow(tx: Transaction): Promise<string> {
    const result = await tx.execute<{ now: Date }>(
      sql`SELECT clock_timestamp() AS now`,
    );
    return result.rows[0].now.toISOString();
  }

  private async observeActor(
    tx: Transaction,
    actor: TrustedDevelopmentActor,
    observedAt: string,
  ): Promise<void> {
    validateActor(actor);
    const timestamp = new Date(observedAt);
    await tx
      .insert(developmentActorIdentitiesTable)
      .values({
        actorId: actor.actorId,
        displayName: actor.displayName,
        actorType: actor.actorType,
        verified: actor.verified,
        actorSnapshot: actor,
        firstObservedAt: timestamp,
        lastObservedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: developmentActorIdentitiesTable.actorId,
        set: {
          displayName: actor.displayName,
          actorType: actor.actorType,
          verified: actor.verified,
          actorSnapshot: actor,
          lastObservedAt: timestamp,
        },
      });
  }

  private async idempotent<T>(
    operation: string,
    taskId: string,
    key: string,
    input: unknown,
    work: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    validateIdempotencyKey(key);
    const fingerprint = deterministicHash(input, "request");
    const lockKey = `${operation}|${taskId}|${key}`;
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`,
      );
      const [existing] = await tx
        .select()
        .from(developmentIdempotencyRecordsTable)
        .where(
          and(
            eq(developmentIdempotencyRecordsTable.operation, operation),
            eq(developmentIdempotencyRecordsTable.taskId, taskId),
            eq(developmentIdempotencyRecordsTable.idempotencyKey, key),
          ),
        )
        .limit(1);
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) {
          throw new DevelopmentControlError(
            "IDEMPOTENCY_CONFLICT",
            "idempotency key was reused for different input",
          );
        }
        return existing.result as T;
      }
      const value = await work(tx);
      await tx.insert(developmentIdempotencyRecordsTable).values({
        operation,
        taskId,
        idempotencyKey: key,
        requestFingerprint: fingerprint,
        result: value,
        createdAt: new Date(await this.databaseNow(tx)),
      });
      return value;
    });
  }

  private async loadTask(
    executor: Database | Transaction,
    taskId: string,
    lock = false,
  ): Promise<TaskRecord> {
    const query = executor
      .select()
      .from(developmentTasksTable)
      .where(eq(developmentTasksTable.taskId, taskId));
    const rows = lock ? await query.for("update").limit(1) : await query.limit(1);
    const taskRow = rows[0];
    if (!taskRow) {
      throw new DevelopmentControlError("TASK_NOT_FOUND", `task ${taskId} was not found`);
    }
    const [specificationRow] = await executor
      .select()
      .from(developmentTaskSpecificationsTable)
      .where(
        and(
          eq(developmentTaskSpecificationsTable.taskId, taskId),
          eq(
            developmentTaskSpecificationsTable.revision,
            taskRow.activeRevision,
          ),
        ),
      )
      .limit(1);
    if (!specificationRow) {
      throw new DevelopmentControlError(
        "INVALID_PERSISTED_TASK",
        "active specification revision is missing",
      );
    }
    const [claimRow] = await executor
      .select()
      .from(developmentTaskClaimsTable)
      .where(eq(developmentTaskClaimsTable.taskId, taskId))
      .limit(1);
    const milestoneRows = await executor
      .select()
      .from(developmentMilestonesTable)
      .where(
        and(
          eq(developmentMilestonesTable.taskId, taskId),
          eq(developmentMilestonesTable.current, true),
        ),
      )
      .orderBy(asc(developmentMilestonesTable.kind));
    const claim: ClaimLease | null = claimRow
      ? Object.freeze({
          taskId,
          owner: Object.freeze({ ...claimRow.ownerSnapshot }),
          claimedAt: claimRow.claimedAt.toISOString(),
          expiresAt: claimRow.expiresAt.toISOString(),
          leaseVersion: claimRow.leaseVersion,
        })
      : null;
    return taskRecordFromPersistence({
      specification: specificationRow.specification,
      state: taskRow.state,
      version: taskRow.version,
      claim,
      milestones: milestoneRows.map((row) => row.record),
    });
  }

  private async appendEvent(
    tx: Transaction,
    task: TaskRecord,
    sequence: number,
    input: Omit<Parameters<typeof createAuditEvent>[0], "task">,
  ): Promise<AuditEvent> {
    const event = createAuditEvent({ ...input, task });
    await this.observeActor(tx, event.actor, event.timestamp);
    await tx.insert(developmentAuditEventsTable).values({
      eventId: event.eventId,
      taskId: event.taskId,
      sequence,
      priorState: event.priorState,
      newState: event.newState,
      actorId: event.actor.actorId,
      actorSnapshot: event.actor,
      reasonCode: event.reasonCode,
      expectedGitSha: event.expectedGitSha,
      observedGitSha: event.observedGitSha,
      specificationRevision: event.specificationRevision,
      specificationHash: event.specificationHash,
      correlationKey: event.correlationKey,
      metadata: event.metadata,
      occurredAt: new Date(event.timestamp),
      event,
    });
    return event;
  }

  private async replaceMilestones(
    tx: Transaction,
    taskId: string,
    specificationHash: string,
    milestones: readonly TaskRecord["milestones"][number][],
  ): Promise<void> {
    await tx
      .update(developmentMilestonesTable)
      .set({ current: false })
      .where(
        and(
          eq(developmentMilestonesTable.taskId, taskId),
          eq(developmentMilestonesTable.current, true),
        ),
      );
    for (const milestone of milestones) {
      if (milestone.verifiedBy) {
        await this.observeActor(tx, milestone.verifiedBy, milestone.recordedAt);
      }
      await tx.insert(developmentMilestonesTable).values({
        milestoneId: milestoneId(taskId, specificationHash, milestone),
        taskId,
        kind: milestone.kind,
        status: milestone.status,
        evidence: milestone.evidence,
        verifiedByActorId: milestone.verifiedBy?.actorId ?? null,
        record: milestone,
        recordedAt: new Date(milestone.recordedAt),
        current: true,
      });
    }
  }

  private async approvalsFor(
    executor: Database | Transaction,
    taskId: string,
  ): Promise<readonly ApprovalRecord[]> {
    const rows = await executor
      .select({ record: developmentAuthorizationDecisionsTable.record })
      .from(developmentAuthorizationDecisionsTable)
      .where(eq(developmentAuthorizationDecisionsTable.taskId, taskId))
      .orderBy(
        asc(developmentAuthorizationDecisionsTable.decisionSequence),
        asc(developmentAuthorizationDecisionsTable.approvalId),
      );
    return Object.freeze(rows.map((row) => freezeApproval(row.record)));
  }

  private async assertAuthorized(
    tx: Transaction,
    task: TaskRecord,
    category: AuthorizationCategory,
    observedGitSha: string,
    now: string,
  ): Promise<void> {
    const approvals = (await this.approvalsFor(tx, task.specification.taskId)).filter(
      (record) => record.categories.includes(category),
    );
    const approval = approvals.at(-1);
    if (!approval) {
      throw new DevelopmentControlError(
        "APPROVAL_REQUIRED",
        `${category} approval is required`,
      );
    }
    assertApprovalUsable({
      approval,
      specification: task.specification,
      category,
      observedGitSha,
      now,
    });
  }

  async registerTask(input: RegisterTaskInput): Promise<TaskRecord> {
    return this.idempotent(
      "register_task",
      input.specification.taskId,
      input.idempotencyKey,
      input,
      async (tx) => {
        validateActor(input.actor);
        const [existing] = await tx
          .select({ taskId: developmentTasksTable.taskId })
          .from(developmentTasksTable)
          .where(eq(developmentTasksTable.taskId, input.specification.taskId))
          .limit(1);
        if (existing) {
          throw new DevelopmentControlError("TASK_ALREADY_EXISTS", "task already exists");
        }
        const timestamp = new Date(input.timestamp).toISOString();
        const milestones = initialMilestones(input.specification, timestamp);
        await this.observeActor(tx, input.actor, timestamp);
        await tx.insert(developmentTasksTable).values({
          taskId: input.specification.taskId,
          activeRevision: input.specification.revision,
          specificationHash: input.specification.specificationHash,
          state: "proposed",
          version: 1,
          createdAt: new Date(timestamp),
          updatedAt: new Date(timestamp),
        });
        await tx.insert(developmentTaskSpecificationsTable).values({
          taskId: input.specification.taskId,
          revision: input.specification.revision,
          specificationHash: input.specification.specificationHash,
          expectedOriginMainSha: input.specification.expectedOriginMainSha,
          specification: input.specification,
          recordedAt: new Date(timestamp),
        });
        const task = taskRecordFromPersistence({
          specification: input.specification,
          state: "proposed",
          version: 1,
          claim: null,
          milestones,
        });
        await this.replaceMilestones(
          tx,
          input.specification.taskId,
          input.specification.specificationHash,
          milestones,
        );
        await this.appendEvent(tx, task, 1, {
          priorState: null,
          newState: "proposed",
          actor: input.actor,
          reasonCode: "task_registered",
          expectedGitSha: input.specification.expectedOriginMainSha,
          observedGitSha: null,
          correlationKey: input.idempotencyKey,
          timestamp,
        });
        return task;
      },
    );
  }

  async reviseTask(input: ReviseTaskInput): Promise<TaskRecord> {
    return this.idempotent(
      "revise_task",
      input.specification.taskId,
      input.idempotencyKey,
      input,
      async (tx) => {
        validateActor(input.actor);
        if (input.actor.actorType !== "human_authority") {
          throw new DevelopmentControlError(
            "UNAUTHORIZED_ACTOR",
            "only human authority may replace the active specification",
          );
        }
        const current = await this.loadTask(tx, input.specification.taskId, true);
        assertTaskVersion(current, input.expectedTaskVersion);
        if (
          input.specification.revision !== current.specification.revision + 1 ||
          input.specification.specificationHash === current.specification.specificationHash
        ) {
          throw new DevelopmentControlError(
            "INVALID_SPECIFICATION_REVISION",
            "replacement specification must be the next distinct revision",
          );
        }
        const timestamp = new Date(input.timestamp).toISOString();
        const nextVersion = current.version + 1;
        const milestones = initialMilestones(input.specification, timestamp);
        await this.observeActor(tx, input.actor, timestamp);
        await tx.insert(developmentTaskSpecificationsTable).values({
          taskId: input.specification.taskId,
          revision: input.specification.revision,
          specificationHash: input.specification.specificationHash,
          expectedOriginMainSha: input.specification.expectedOriginMainSha,
          specification: input.specification,
          recordedAt: new Date(timestamp),
        });
        await tx
          .delete(developmentTaskClaimsTable)
          .where(eq(developmentTaskClaimsTable.taskId, input.specification.taskId));
        await tx
          .update(developmentTasksTable)
          .set({
            activeRevision: input.specification.revision,
            specificationHash: input.specification.specificationHash,
            state: "proposed",
            version: nextVersion,
            updatedAt: new Date(timestamp),
          })
          .where(
            and(
              eq(developmentTasksTable.taskId, input.specification.taskId),
              eq(developmentTasksTable.version, current.version),
            ),
          );
        await this.replaceMilestones(
          tx,
          input.specification.taskId,
          input.specification.specificationHash,
          milestones,
        );
        const revised = taskRecordFromPersistence({
          specification: input.specification,
          state: "proposed",
          version: nextVersion,
          claim: null,
          milestones,
        });
        await this.appendEvent(tx, revised, nextVersion, {
          priorState: current.state,
          newState: "proposed",
          actor: input.actor,
          reasonCode: "specification_revised",
          expectedGitSha: input.specification.expectedOriginMainSha,
          observedGitSha: null,
          correlationKey: input.idempotencyKey,
          timestamp,
        });
        return revised;
      },
    );
  }

  async decideApproval(input: DecideApprovalInput): Promise<ApprovalRecord> {
    return this.idempotent(
      "decide_approval",
      input.taskId,
      input.idempotencyKey,
      input,
      async (tx) => {
        const task = await this.loadTask(tx, input.taskId, true);
        assertTaskVersion(task, input.expectedTaskVersion);
        if (input.observedGitSha !== task.specification.expectedOriginMainSha) {
          throw new DevelopmentControlError(
            "STALE_GIT_SHA",
            "approval observed the wrong origin/main SHA",
          );
        }
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
        const existing = await this.approvalsFor(tx, input.taskId);
        const nextVersion = task.version + 1;
        await this.observeActor(tx, input.decidingActor, approval.decidedAt);
        await tx.insert(developmentAuthorizationDecisionsTable).values({
          approvalId: approval.approvalId,
          taskId: approval.taskId,
          decisionSequence: existing.length + 1,
          specificationRevision: approval.specificationRevision,
          specificationHash: approval.specificationHash,
          expectedGitSha: approval.expectedGitSha,
          categories: approval.categories,
          decidingActorId: approval.decidingActor.actorId,
          decidingActor: approval.decidingActor,
          decision: approval.decision,
          decidedAt: new Date(approval.decidedAt),
          expiresAt: approval.expiresAt ? new Date(approval.expiresAt) : null,
          constraints: approval.constraints,
          rationale: approval.rationale,
          idempotencyKey: approval.idempotencyKey,
          record: approval,
        });
        await tx
          .update(developmentTasksTable)
          .set({ version: nextVersion, updatedAt: new Date(approval.decidedAt) })
          .where(
            and(
              eq(developmentTasksTable.taskId, input.taskId),
              eq(developmentTasksTable.version, task.version),
            ),
          );
        const updated = Object.freeze({ ...task, version: nextVersion });
        await this.appendEvent(tx, updated, nextVersion, {
          priorState: task.state,
          newState: task.state,
          actor: input.decidingActor,
          reasonCode: `approval_${input.decision}`,
          expectedGitSha: task.specification.expectedOriginMainSha,
          observedGitSha: input.observedGitSha,
          correlationKey: input.idempotencyKey,
          metadata: { categories: [...approval.categories].join(",") },
          timestamp: approval.decidedAt,
        });
        return freezeApproval(approval);
      },
    );
  }

  async transitionTask(input: TransitionTaskInput): Promise<TaskRecord> {
    return this.idempotent(
      "transition_task",
      input.taskId,
      input.idempotencyKey,
      input,
      async (tx) => {
        validateActor(input.actor);
        const task = await this.loadTask(tx, input.taskId, true);
        assertTaskVersion(task, input.expectedTaskVersion);
        assertValidTransition(task.state, input.nextState);
        if (input.observedGitSha !== task.specification.expectedOriginMainSha) {
          throw new DevelopmentControlError(
            "STALE_GIT_SHA",
            "transition observed the wrong origin/main SHA",
          );
        }
        const category =
          TRANSITION_AUTHORIZATION_CATEGORY[`${task.state}->${input.nextState}`];
        if (category) {
          await this.assertAuthorized(
            tx,
            task,
            category,
            input.observedGitSha,
            input.timestamp,
          );
        }
        if (
          ["in_progress", "review_requested"].includes(input.nextState) &&
          task.claim?.owner.actorId !== input.actor.actorId
        ) {
          throw new DevelopmentControlError(
            "CLAIM_OWNED_BY_ANOTHER_ACTOR",
            "active claim owner must perform implementation transition",
          );
        }
        const timestamp = new Date(input.timestamp).toISOString();
        const nextVersion = task.version + 1;
        await this.observeActor(tx, input.actor, timestamp);
        await tx
          .update(developmentTasksTable)
          .set({
            state: input.nextState,
            version: nextVersion,
            updatedAt: new Date(timestamp),
          })
          .where(
            and(
              eq(developmentTasksTable.taskId, input.taskId),
              eq(developmentTasksTable.version, task.version),
            ),
          );
        const updated = Object.freeze({
          ...task,
          state: input.nextState,
          version: nextVersion,
        });
        await this.appendEvent(tx, updated, nextVersion, {
          priorState: task.state,
          newState: input.nextState,
          actor: input.actor,
          reasonCode: input.reasonCode,
          expectedGitSha: task.specification.expectedOriginMainSha,
          observedGitSha: input.observedGitSha,
          correlationKey: input.idempotencyKey,
          timestamp,
        });
        return updated;
      },
    );
  }

  async claimTask(input: ClaimTaskInput): Promise<TaskRecord> {
    return this.idempotent(
      "claim_task",
      input.taskId,
      input.idempotencyKey,
      input,
      async (tx) => {
        const task = await this.loadTask(tx, input.taskId, true);
        assertTaskVersion(task, input.expectedTaskVersion);
        if (task.state !== "approved") {
          throw new DevelopmentControlError(
            "TASK_NOT_CLAIMABLE",
            "task must be approved before claim",
          );
        }
        const now = await this.databaseNow(tx);
        await this.assertAuthorized(
          tx,
          task,
          "scope",
          input.observedGitSha,
          now,
        );
        if (task.claim) {
          if (isLeaseExpired(task.claim, now)) {
            throw new DevelopmentControlError(
              "EXPIRED_CLAIM_REQUIRES_RECOVERY",
              "expired claim requires explicit recovery before another claim",
            );
          }
          throw new DevelopmentControlError(
            "DUPLICATE_ACTIVE_CLAIM",
            "task already has an active claimant",
          );
        }
        const claim = createClaimLease({
          taskId: input.taskId,
          owner: input.actor,
          claimedAt: now,
          durationMs: input.leaseDurationMs,
        });
        const nextVersion = task.version + 1;
        await this.observeActor(tx, input.actor, now);
        await tx.insert(developmentTaskClaimsTable).values({
          taskId: input.taskId,
          ownerActorId: input.actor.actorId,
          ownerSnapshot: input.actor,
          claimedAt: new Date(claim.claimedAt),
          expiresAt: new Date(claim.expiresAt),
          leaseVersion: claim.leaseVersion,
        });
        await tx
          .update(developmentTasksTable)
          .set({ state: "claimed", version: nextVersion, updatedAt: new Date(now) })
          .where(
            and(
              eq(developmentTasksTable.taskId, input.taskId),
              eq(developmentTasksTable.version, task.version),
            ),
          );
        const updated = Object.freeze({
          ...task,
          state: "claimed" as const,
          version: nextVersion,
          claim,
        });
        await this.appendEvent(tx, updated, nextVersion, {
          priorState: task.state,
          newState: "claimed",
          actor: input.actor,
          reasonCode: "task_claimed",
          expectedGitSha: task.specification.expectedOriginMainSha,
          observedGitSha: input.observedGitSha,
          correlationKey: input.idempotencyKey,
          metadata: { leaseVersion: claim.leaseVersion, expiresAt: claim.expiresAt },
          timestamp: now,
        });
        return updated;
      },
    );
  }

  async renewClaim(input: RenewClaimInput): Promise<TaskRecord> {
    return this.idempotent(
      "renew_claim",
      input.taskId,
      input.idempotencyKey,
      input,
      async (tx) => {
        const task = await this.loadTask(tx, input.taskId, true);
        assertTaskVersion(task, input.expectedTaskVersion);
        if (!task.claim) {
          throw new DevelopmentControlError("CLAIM_NOT_FOUND", "task has no active claim");
        }
        const now = await this.databaseNow(tx);
        const claim = renewClaimLease({
          lease: task.claim,
          owner: input.actor,
          expectedLeaseVersion: input.expectedLeaseVersion,
          renewedAt: now,
          durationMs: input.leaseDurationMs,
        });
        const nextVersion = task.version + 1;
        await this.observeActor(tx, input.actor, now);
        await tx
          .update(developmentTaskClaimsTable)
          .set({
            ownerActorId: input.actor.actorId,
            ownerSnapshot: input.actor,
            claimedAt: new Date(claim.claimedAt),
            expiresAt: new Date(claim.expiresAt),
            leaseVersion: claim.leaseVersion,
          })
          .where(
            and(
              eq(developmentTaskClaimsTable.taskId, input.taskId),
              eq(developmentTaskClaimsTable.leaseVersion, input.expectedLeaseVersion),
            ),
          );
        await tx
          .update(developmentTasksTable)
          .set({ version: nextVersion, updatedAt: new Date(now) })
          .where(
            and(
              eq(developmentTasksTable.taskId, input.taskId),
              eq(developmentTasksTable.version, task.version),
            ),
          );
        const updated = Object.freeze({ ...task, version: nextVersion, claim });
        await this.appendEvent(tx, updated, nextVersion, {
          priorState: task.state,
          newState: task.state,
          actor: input.actor,
          reasonCode: "claim_renewed",
          correlationKey: input.idempotencyKey,
          metadata: { leaseVersion: claim.leaseVersion, expiresAt: claim.expiresAt },
          timestamp: now,
        });
        return updated;
      },
    );
  }

  async recoverExpiredClaim(input: RecoverExpiredClaimInput): Promise<TaskRecord> {
    return this.idempotent(
      "recover_expired_claim",
      input.taskId,
      input.idempotencyKey,
      input,
      async (tx) => {
        validateActor(input.actor);
        const task = await this.loadTask(tx, input.taskId, true);
        assertTaskVersion(task, input.expectedTaskVersion);
        if (!task.claim) {
          throw new DevelopmentControlError("CLAIM_NOT_FOUND", "task has no claim to recover");
        }
        const now = await this.databaseNow(tx);
        if (!isLeaseExpired(task.claim, now)) {
          throw new DevelopmentControlError(
            "ACTIVE_CLAIM_NOT_STEALABLE",
            "active leases cannot be stolen or recovered",
          );
        }
        const nextVersion = task.version + 1;
        await this.observeActor(tx, input.actor, now);
        await tx
          .delete(developmentTaskClaimsTable)
          .where(eq(developmentTaskClaimsTable.taskId, input.taskId));
        await tx
          .update(developmentTasksTable)
          .set({ state: "approved", version: nextVersion, updatedAt: new Date(now) })
          .where(
            and(
              eq(developmentTasksTable.taskId, input.taskId),
              eq(developmentTasksTable.version, task.version),
            ),
          );
        const updated = Object.freeze({
          ...task,
          state: "approved" as const,
          version: nextVersion,
          claim: null,
        });
        await this.appendEvent(tx, updated, nextVersion, {
          priorState: task.state,
          newState: "approved",
          actor: input.actor,
          reasonCode: "expired_claim_recovered",
          correlationKey: input.idempotencyKey,
          timestamp: now,
        });
        return updated;
      },
    );
  }

  async releaseClaim(input: ReleaseClaimInput): Promise<TaskRecord> {
    return this.idempotent(
      "release_claim",
      input.taskId,
      input.idempotencyKey,
      input,
      async (tx) => {
        validateActor(input.actor);
        const task = await this.loadTask(tx, input.taskId, true);
        assertTaskVersion(task, input.expectedTaskVersion);
        if (!task.claim) {
          throw new DevelopmentControlError("CLAIM_NOT_FOUND", "task has no active claim");
        }
        if (task.claim.owner.actorId !== input.actor.actorId) {
          throw new DevelopmentControlError(
            "CLAIM_OWNED_BY_ANOTHER_ACTOR",
            "only the owner may release an active claim",
          );
        }
        const now = await this.databaseNow(tx);
        const nextVersion = task.version + 1;
        await this.observeActor(tx, input.actor, now);
        await tx
          .delete(developmentTaskClaimsTable)
          .where(eq(developmentTaskClaimsTable.taskId, input.taskId));
        await tx
          .update(developmentTasksTable)
          .set({ state: "approved", version: nextVersion, updatedAt: new Date(now) })
          .where(
            and(
              eq(developmentTasksTable.taskId, input.taskId),
              eq(developmentTasksTable.version, task.version),
            ),
          );
        const updated = Object.freeze({
          ...task,
          state: "approved" as const,
          version: nextVersion,
          claim: null,
        });
        await this.appendEvent(tx, updated, nextVersion, {
          priorState: task.state,
          newState: "approved",
          actor: input.actor,
          reasonCode: "claim_released",
          correlationKey: input.idempotencyKey,
          timestamp: now,
        });
        return updated;
      },
    );
  }

  async recordMilestone(input: RecordMilestoneInput): Promise<TaskRecord> {
    return this.idempotent(
      "record_milestone",
      input.taskId,
      input.idempotencyKey,
      input,
      async (tx) => {
        const task = await this.loadTask(tx, input.taskId, true);
        assertTaskVersion(task, input.expectedTaskVersion);
        const now = await this.databaseNow(tx);
        const milestone = createMilestoneRecord({
          specification: task.specification,
          kind: input.kind,
          status: input.status,
          evidence: input.evidence,
          actor: input.actor,
          recordedAt: now,
        });
        const milestones = task.milestones.map((record) =>
          record.kind === input.kind ? milestone : record,
        );
        const nextVersion = task.version + 1;
        await this.observeActor(tx, input.actor, now);
        await tx
          .update(developmentMilestonesTable)
          .set({ current: false })
          .where(
            and(
              eq(developmentMilestonesTable.taskId, input.taskId),
              eq(developmentMilestonesTable.kind, input.kind),
              eq(developmentMilestonesTable.current, true),
            ),
          );
        await tx.insert(developmentMilestonesTable).values({
          milestoneId: milestoneId(input.taskId, task.specification.specificationHash, milestone),
          taskId: input.taskId,
          kind: milestone.kind,
          status: milestone.status,
          evidence: milestone.evidence,
          verifiedByActorId: milestone.verifiedBy?.actorId ?? null,
          record: milestone,
          recordedAt: new Date(milestone.recordedAt),
          current: true,
        });
        await tx
          .update(developmentTasksTable)
          .set({ version: nextVersion, updatedAt: new Date(now) })
          .where(
            and(
              eq(developmentTasksTable.taskId, input.taskId),
              eq(developmentTasksTable.version, task.version),
            ),
          );
        const updated = Object.freeze({
          ...task,
          version: nextVersion,
          milestones: Object.freeze(milestones),
        });
        await this.appendEvent(tx, updated, nextVersion, {
          priorState: task.state,
          newState: task.state,
          actor: input.actor,
          reasonCode: "milestone_recorded",
          correlationKey: input.idempotencyKey,
          metadata: { milestone: input.kind, status: input.status },
          timestamp: now,
        });
        return updated;
      },
    );
  }

  async submitCompletionReport(
    input: SubmitCompletionReportInput,
  ): Promise<Readonly<CompletionReportInput>> {
    return this.idempotent(
      "submit_completion_report",
      input.report.taskId,
      input.idempotencyKey,
      input,
      async (tx) => {
        validateActor(input.actor);
        const task = await this.loadTask(tx, input.report.taskId, true);
        assertTaskVersion(task, input.expectedTaskVersion);
        if (
          input.report.specificationRevision !== task.specification.revision ||
          input.report.specificationHash !== task.specification.specificationHash
        ) {
          throw new DevelopmentControlError(
            "STALE_COMPLETION_REPORT",
            "completion report does not bind to active specification",
          );
        }
        const unauthorized = input.report.filesChanged.filter(
          (file) => !task.specification.authorizedFiles.includes(file),
        );
        if (unauthorized.length) {
          throw new DevelopmentControlError(
            "UNAUTHORIZED_FILE",
            `completion report contains unauthorized files: ${unauthorized.join(", ")}`,
          );
        }
        const report = validateCompletionReport(input.report);
        const now = await this.databaseNow(tx);
        const nextVersion = task.version + 1;
        await this.observeActor(tx, input.actor, now);
        await tx
          .update(developmentCompletionReportsTable)
          .set({ current: false })
          .where(
            and(
              eq(developmentCompletionReportsTable.taskId, input.report.taskId),
              eq(developmentCompletionReportsTable.current, true),
            ),
          );
        await tx.insert(developmentCompletionReportsTable).values({
          reportId: reportId(input.report, input.actor, now),
          taskId: input.report.taskId,
          specificationRevision: report.specificationRevision,
          specificationHash: report.specificationHash,
          submittedByActorId: input.actor.actorId,
          submittedBy: input.actor,
          report,
          submittedAt: new Date(now),
          current: true,
        });
        await tx
          .update(developmentTasksTable)
          .set({ version: nextVersion, updatedAt: new Date(now) })
          .where(
            and(
              eq(developmentTasksTable.taskId, input.report.taskId),
              eq(developmentTasksTable.version, task.version),
            ),
          );
        const updated = Object.freeze({ ...task, version: nextVersion });
        await this.appendEvent(tx, updated, nextVersion, {
          priorState: task.state,
          newState: task.state,
          actor: input.actor,
          reasonCode: "completion_report_submitted",
          correlationKey: input.idempotencyKey,
          metadata: {
            filesChanged: report.filesChanged.length,
            verificationResults: report.verificationResults.length,
          },
          timestamp: now,
        });
        return freezeReport(report);
      },
    );
  }

  async getTask(taskId: string): Promise<TaskRecord> {
    return this.loadTask(this.db, taskId);
  }

  async getApprovals(
    taskId: string,
    options?: CoordinationHistoryPageOptions,
  ): Promise<readonly ApprovalRecord[]> {
    await this.getTask(taskId);
    const page = normalizeCoordinationHistoryPage(options);
    const approvals = await this.approvalsFor(this.db, taskId);
    return Object.freeze(
      approvals.slice(page.offset, page.offset + page.limit),
    );
  }

  async getEvents(
    taskId: string,
    options?: CoordinationHistoryPageOptions,
  ): Promise<readonly AuditEvent[]> {
    await this.getTask(taskId);
    const page = normalizeCoordinationHistoryPage(options);
    const rows = await this.db
      .select({ event: developmentAuditEventsTable.event })
      .from(developmentAuditEventsTable)
      .where(eq(developmentAuditEventsTable.taskId, taskId))
      .orderBy(
        asc(developmentAuditEventsTable.sequence),
        asc(developmentAuditEventsTable.eventId),
      )
      .limit(page.limit)
      .offset(page.offset);
    return Object.freeze(rows.map((row) => freezeEvent(row.event)));
  }

  async getCompletionReport(
    taskId: string,
  ): Promise<Readonly<CompletionReportInput> | null> {
    await this.getTask(taskId);
    const [row] = await this.db
      .select({ report: developmentCompletionReportsTable.report })
      .from(developmentCompletionReportsTable)
      .where(
        and(
          eq(developmentCompletionReportsTable.taskId, taskId),
          eq(developmentCompletionReportsTable.current, true),
        ),
      )
      .limit(1);
    return row ? freezeReport(row.report) : null;
  }

  async getSpecificationRevisions(
    taskId: string,
    options?: CoordinationHistoryPageOptions,
  ): Promise<readonly TaskSpecification[]> {
    await this.getTask(taskId);
    const page = normalizeCoordinationHistoryPage(options);
    const rows = await this.db
      .select({ specification: developmentTaskSpecificationsTable.specification })
      .from(developmentTaskSpecificationsTable)
      .where(eq(developmentTaskSpecificationsTable.taskId, taskId))
      .orderBy(asc(developmentTaskSpecificationsTable.revision))
      .limit(page.limit)
      .offset(page.offset);
    return Object.freeze(
      rows.map((row) => freezeSpecification(row.specification)),
    );
  }

  async getCompletionReports(
    taskId: string,
    options?: CoordinationHistoryPageOptions,
  ): Promise<readonly Readonly<CompletionReportInput>[]> {
    await this.getTask(taskId);
    const page = normalizeCoordinationHistoryPage(options);
    const rows = await this.db
      .select({ report: developmentCompletionReportsTable.report })
      .from(developmentCompletionReportsTable)
      .where(eq(developmentCompletionReportsTable.taskId, taskId))
      .orderBy(
        asc(developmentCompletionReportsTable.submittedAt),
        asc(developmentCompletionReportsTable.reportId),
      )
      .limit(page.limit)
      .offset(page.offset);
    return Object.freeze(rows.map((row) => freezeReport(row.report)));
  }
}

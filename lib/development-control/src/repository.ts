import type {
  ApprovalDecision,
  ApprovalRecord,
  AuditEvent,
  AuthorizationCategory,
  CompletionReportInput,
  MilestoneKind,
  MilestoneStatus,
  TaskRecord,
  TaskSpecification,
  TaskState,
  TrustedDevelopmentActor,
} from "./types.js";
import { DevelopmentControlError } from "./types.js";

export type CoordinationResult<T> = T | Promise<T>;
export const MAX_COORDINATION_HISTORY_PAGE_SIZE = 100;

export interface CoordinationHistoryPageOptions {
  readonly limit?: number;
  readonly offset?: number;
}

export function normalizeCoordinationHistoryPage(
  options: CoordinationHistoryPageOptions = {},
): Readonly<{ limit: number; offset: number }> {
  const limit = options.limit ?? MAX_COORDINATION_HISTORY_PAGE_SIZE;
  const offset = options.offset ?? 0;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_COORDINATION_HISTORY_PAGE_SIZE ||
    !Number.isInteger(offset) ||
    offset < 0
  ) {
    throw new DevelopmentControlError(
      "INVALID_HISTORY_PAGE",
      `history page requires limit 1-${MAX_COORDINATION_HISTORY_PAGE_SIZE} and a nonnegative offset`,
    );
  }
  return Object.freeze({ limit, offset });
}

export const TRANSITION_AUTHORIZATION_CATEGORY: Readonly<
  Partial<Record<`${TaskState}->${TaskState}`, AuthorizationCategory>>
> = Object.freeze({
  "proposed->approved": "scope",
  "claimed->in_progress": "editing",
  "in_progress->review_requested": "editing",
  "review_requested->in_progress": "editing",
  "review_requested->verified": "scope",
  "verified->in_progress": "editing",
  "verified->completed": "scope",
  "blocked->approved": "scope",
  "blocked->in_progress": "editing",
});

export interface RegisterTaskInput {
  readonly specification: TaskSpecification;
  readonly actor: TrustedDevelopmentActor;
  readonly timestamp: string;
  readonly idempotencyKey: string;
}

export interface ReviseTaskInput {
  readonly specification: TaskSpecification;
  readonly actor: TrustedDevelopmentActor;
  readonly expectedTaskVersion: number;
  readonly timestamp: string;
  readonly idempotencyKey: string;
}

export interface DecideApprovalInput {
  readonly taskId: string;
  readonly categories: readonly AuthorizationCategory[];
  readonly decidingActor: TrustedDevelopmentActor;
  readonly decision: ApprovalDecision;
  readonly observedGitSha: string;
  readonly decidedAt: string;
  readonly expiresAt?: string | null;
  readonly constraints?: readonly string[];
  readonly rationale: string;
  readonly expectedTaskVersion: number;
  readonly idempotencyKey: string;
}

export interface TransitionTaskInput {
  readonly taskId: string;
  readonly nextState: TaskState;
  readonly actor: TrustedDevelopmentActor;
  readonly observedGitSha: string;
  readonly expectedTaskVersion: number;
  readonly reasonCode: string;
  readonly timestamp: string;
  readonly idempotencyKey: string;
}

export interface ClaimTaskInput {
  readonly taskId: string;
  readonly actor: TrustedDevelopmentActor;
  readonly observedGitSha: string;
  readonly expectedTaskVersion: number;
  readonly claimedAt: string;
  readonly leaseDurationMs: number;
  readonly idempotencyKey: string;
}

export interface RenewClaimInput {
  readonly taskId: string;
  readonly actor: TrustedDevelopmentActor;
  readonly expectedTaskVersion: number;
  readonly expectedLeaseVersion: number;
  readonly renewedAt: string;
  readonly leaseDurationMs: number;
  readonly idempotencyKey: string;
}

export interface RecoverExpiredClaimInput {
  readonly taskId: string;
  readonly actor: TrustedDevelopmentActor;
  readonly expectedTaskVersion: number;
  readonly recoveredAt: string;
  readonly idempotencyKey: string;
}

export interface ReleaseClaimInput {
  readonly taskId: string;
  readonly actor: TrustedDevelopmentActor;
  readonly expectedTaskVersion: number;
  readonly releasedAt: string;
  readonly idempotencyKey: string;
}

export interface RecordMilestoneInput {
  readonly taskId: string;
  readonly kind: MilestoneKind;
  readonly status: MilestoneStatus;
  readonly evidence?: string | null;
  readonly actor: TrustedDevelopmentActor;
  readonly expectedTaskVersion: number;
  readonly recordedAt: string;
  readonly idempotencyKey: string;
}

export interface SubmitCompletionReportInput {
  readonly report: CompletionReportInput;
  readonly actor: TrustedDevelopmentActor;
  readonly expectedTaskVersion: number;
  readonly submittedAt: string;
  readonly idempotencyKey: string;
}

/**
 * Canonical DAB-2A coordination behavior. Implementations may be synchronous
 * (the reference in-memory store) or asynchronous (durable PostgreSQL).
 */
export interface DevelopmentCoordinationStore {
  registerTask(input: RegisterTaskInput): CoordinationResult<TaskRecord>;
  reviseTask(input: ReviseTaskInput): CoordinationResult<TaskRecord>;
  decideApproval(input: DecideApprovalInput): CoordinationResult<ApprovalRecord>;
  transitionTask(input: TransitionTaskInput): CoordinationResult<TaskRecord>;
  claimTask(input: ClaimTaskInput): CoordinationResult<TaskRecord>;
  renewClaim(input: RenewClaimInput): CoordinationResult<TaskRecord>;
  recoverExpiredClaim(
    input: RecoverExpiredClaimInput,
  ): CoordinationResult<TaskRecord>;
  releaseClaim(input: ReleaseClaimInput): CoordinationResult<TaskRecord>;
  recordMilestone(input: RecordMilestoneInput): CoordinationResult<TaskRecord>;
  submitCompletionReport(
    input: SubmitCompletionReportInput,
  ): CoordinationResult<Readonly<CompletionReportInput>>;
  getTask(taskId: string): CoordinationResult<TaskRecord>;
  getApprovals(
    taskId: string,
    options?: CoordinationHistoryPageOptions,
  ): CoordinationResult<readonly ApprovalRecord[]>;
  getEvents(
    taskId: string,
    options?: CoordinationHistoryPageOptions,
  ): CoordinationResult<readonly AuditEvent[]>;
  getCompletionReport(
    taskId: string,
  ): CoordinationResult<Readonly<CompletionReportInput> | null>;
  getSpecificationRevisions(
    taskId: string,
    options?: CoordinationHistoryPageOptions,
  ): CoordinationResult<readonly TaskSpecification[]>;
  getCompletionReports(
    taskId: string,
    options?: CoordinationHistoryPageOptions,
  ): CoordinationResult<readonly Readonly<CompletionReportInput>[]>;
}

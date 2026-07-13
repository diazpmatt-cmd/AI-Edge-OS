export const AUTHORIZATION_CATEGORIES = [
  "scope",
  "editing",
  "committing",
  "pushing",
  "pull_request_creation",
  "merging",
  "deployment",
  "credentials",
  "paid_providers",
  "external_actions",
] as const;

export type AuthorizationCategory = (typeof AUTHORIZATION_CATEGORIES)[number];

export const ACTOR_TYPES = [
  "human_authority",
  "architect_reviewer",
  "codex_implementer",
  "bounded_sub_agent",
  "read_only_automation",
] as const;

export type ActorType = (typeof ACTOR_TYPES)[number];

export interface TrustedDevelopmentActor {
  readonly actorId: string;
  readonly displayName: string;
  readonly actorType: ActorType;
  readonly verified: boolean;
  readonly developmentControl: true;
}

export interface DevelopmentAuthorityPolicy {
  readonly materialAuthorityActorId: string;
}

export type TaskType =
  | "implementation"
  | "documentation"
  | "read_only"
  | "verification";
export type TaskPriority = "critical" | "high" | "medium" | "low";
export type BranchMode = "dedicated_branch" | "no_branch";

export interface DevelopmentReference {
  readonly kind: "issue" | "commit" | "pull_request" | "report" | "adr";
  readonly value: string;
}

export interface TaskSpecificationInput {
  readonly taskId: string;
  readonly title: string;
  readonly taskType: TaskType;
  readonly revision: number;
  readonly expectedOriginMainSha: string;
  readonly branchMode: BranchMode;
  readonly intendedBranch: string | null;
  readonly priority: TaskPriority;
  readonly dependencies: readonly string[];
  readonly origin: string;
  readonly proposedAgent: string;
  readonly authorizedScope: readonly string[];
  readonly authorizedFiles: readonly string[];
  readonly explicitExclusions: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly verificationRequirements: readonly string[];
  readonly documentationRequirements: readonly string[];
  readonly references: readonly DevelopmentReference[];
}

export interface TaskSpecification extends TaskSpecificationInput {
  readonly specificationHash: string;
}

export const TASK_STATES = [
  "proposed",
  "approved",
  "claimed",
  "in_progress",
  "review_requested",
  "verified",
  "completed",
  "blocked",
  "rejected",
  "cancelled",
] as const;

export type TaskState = (typeof TASK_STATES)[number];
export type ApprovalDecision =
  | "proposed"
  | "approved"
  | "rejected"
  | "revoked"
  | "expired";

export interface ApprovalRecord {
  readonly approvalId: string;
  readonly taskId: string;
  readonly specificationRevision: number;
  readonly specificationHash: string;
  readonly expectedGitSha: string;
  readonly categories: readonly AuthorizationCategory[];
  readonly decidingActor: TrustedDevelopmentActor;
  readonly decision: ApprovalDecision;
  readonly decidedAt: string;
  readonly expiresAt: string | null;
  readonly constraints: readonly string[];
  readonly rationale: string;
  readonly idempotencyKey: string;
}

export interface ClaimLease {
  readonly taskId: string;
  readonly owner: TrustedDevelopmentActor;
  readonly claimedAt: string;
  readonly expiresAt: string;
  readonly leaseVersion: number;
}

export interface AuditEvent {
  readonly eventId: string;
  readonly taskId: string;
  readonly priorState: TaskState | null;
  readonly newState: TaskState;
  readonly actor: TrustedDevelopmentActor;
  readonly reasonCode: string;
  readonly expectedGitSha: string | null;
  readonly observedGitSha: string | null;
  readonly specificationRevision: number;
  readonly specificationHash: string;
  readonly correlationKey: string;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
  readonly timestamp: string;
}

export type MilestoneKind =
  | "committed"
  | "pushed"
  | "pull_request_opened"
  | "merged"
  | "deployed";
export type MilestoneStatus = "verified" | "not_verified" | "not_applicable";

export interface MilestoneRecord {
  readonly kind: MilestoneKind;
  readonly status: MilestoneStatus;
  readonly evidence: string | null;
  readonly verifiedBy: TrustedDevelopmentActor | null;
  readonly recordedAt: string;
}

export interface VerificationResult {
  readonly name: string;
  readonly result: "passed" | "failed" | "skipped" | "accepted_limitation";
  readonly detail: string;
}

export interface CompletionReportInput {
  readonly taskId: string;
  readonly specificationRevision: number;
  readonly specificationHash: string;
  readonly startingGitState: string;
  readonly scopeCompleted: readonly string[];
  readonly filesChanged: readonly string[];
  readonly verificationResults: readonly VerificationResult[];
  readonly securityScans: readonly VerificationResult[];
  readonly acceptedLimitations: readonly string[];
  readonly documentationAffected: readonly string[];
  readonly finalGitState: string;
  readonly milestones: readonly MilestoneRecord[];
  readonly blockers: readonly string[];
  readonly recommendedNextTask: string | null;
}

export interface TaskRecord {
  readonly specification: TaskSpecification;
  readonly state: TaskState;
  readonly version: number;
  readonly claim: ClaimLease | null;
  readonly milestones: readonly MilestoneRecord[];
}

export class DevelopmentControlError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DevelopmentControlError";
  }
}

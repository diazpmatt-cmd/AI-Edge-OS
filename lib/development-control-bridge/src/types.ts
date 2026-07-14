import type {
  ActorType,
  ApprovalRecord,
  AuthorizationCategory,
  TaskSpecification,
} from "@workspace/development-control";

export const BRIDGE_OPERATIONS = [
  "get_task",
  "get_specification_revisions",
  "get_authorization_decisions",
  "get_events",
  "get_completion_reports",
  "get_milestones",
  "get_verified_git_evidence",
  "get_reconciliation_diagnostics",
  "register_proposal",
  "claim_approved_task",
  "renew_claim",
  "release_claim",
  "transition_to_in_progress",
  "request_review",
  "submit_completion_report",
  "verify_task",
  "complete_task",
  "record_milestone",
  "record_authorization_decision",
  "recover_expired_claim",
] as const;

export type BridgeOperation = (typeof BRIDGE_OPERATIONS)[number];
export type BridgeWorkloadActorType = Exclude<
  ActorType,
  "human_authority" | "architect_reviewer"
>;
export type BridgePrincipalStatus = "active" | "revoked" | "unknown";

export interface BridgePrincipalInput {
  readonly issuer: string;
  readonly subject: string;
  readonly audience: string;
  readonly credentialReferenceId: string;
  readonly verifiedAt: string;
  readonly expiresAt: string;
  readonly status: BridgePrincipalStatus;
  readonly actorType: BridgeWorkloadActorType;
}

export interface BridgePrincipal extends BridgePrincipalInput {
  readonly principalId: string;
}

export interface BridgeRequestEnvelopeInput {
  readonly repositoryId: string;
  readonly taskId: string;
  readonly specificationRevision: number;
  readonly specificationHash: string;
  readonly expectedOriginMainSha: string;
  readonly operation: BridgeOperation;
  readonly authorizationCategory: AuthorizationCategory;
  readonly principal: BridgePrincipal;
  readonly nonce: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
}

export interface BridgeRequestEnvelope extends BridgeRequestEnvelopeInput {
  readonly requestFingerprint: string;
}

export type BridgeOperationAvailability =
  | "read_only"
  | "modeled_write"
  | "deferred";

export interface BridgeOperationPolicy {
  readonly operation: BridgeOperation;
  readonly availability: BridgeOperationAvailability;
  readonly authorizationCategory: AuthorizationCategory;
  readonly humanApprovalRequired: boolean;
  readonly description: string;
}

export type BridgeGitEvidenceStatus =
  | "verified"
  | "stale"
  | "unavailable"
  | "ambiguous"
  | "edited"
  | "deleted";
export type BridgeNonceStatus = "unused" | "used" | "unknown";
export type BridgeIdempotencyStatus = "absent" | "matching" | "conflicting";

export interface BridgeIdempotencyObservation {
  readonly status: BridgeIdempotencyStatus;
  readonly requestFingerprint: string | null;
}

export interface BridgePolicyInput {
  readonly request: BridgeRequestEnvelope;
  readonly specification: TaskSpecification;
  readonly approvals: readonly ApprovalRecord[];
  readonly expectedRepositoryId: string;
  readonly expectedHumanAuthorityActorId: string;
  readonly observedGitSha: string | null;
  readonly gitEvidenceStatus: BridgeGitEvidenceStatus;
  readonly nonceStatus: BridgeNonceStatus;
  readonly idempotency: BridgeIdempotencyObservation;
  readonly now: string;
}

export const BRIDGE_POLICY_REASON_CODES = [
  "ALLOWED",
  "APPROVAL_EXPIRED",
  "APPROVAL_MISSING",
  "APPROVAL_NOT_USABLE",
  "APPROVER_IDENTITY_MISMATCH",
  "AUTHORIZATION_CATEGORY_MISMATCH",
  "GIT_EVIDENCE_AMBIGUOUS",
  "GIT_EVIDENCE_DELETED",
  "GIT_EVIDENCE_EDITED",
  "GIT_EVIDENCE_STALE",
  "GIT_EVIDENCE_UNAVAILABLE",
  "GIT_SHA_MISMATCH",
  "IDEMPOTENCY_CONFLICT",
  "IDEMPOTENCY_EVIDENCE_MISMATCH",
  "NONCE_REPLAYED",
  "NONCE_STATUS_UNAVAILABLE",
  "OPERATION_DEFERRED",
  "POLICY_TIME_INVALID",
  "PRINCIPAL_EXPIRED",
  "PRINCIPAL_NOT_ACTIVE",
  "PRINCIPAL_NOT_YET_VERIFIED",
  "REPOSITORY_MISMATCH",
  "REQUEST_EXPIRED",
  "REQUEST_NOT_YET_VALID",
  "SELF_APPROVAL_FORBIDDEN",
  "SPECIFICATION_HASH_MISMATCH",
  "SPECIFICATION_REVISION_MISMATCH",
  "TASK_MISMATCH",
  "UNSUPPORTED_OPERATION",
  "WRONG_AUTHORIZATION_CATEGORY",
] as const;

export type BridgePolicyReasonCode =
  (typeof BRIDGE_POLICY_REASON_CODES)[number];
export type BridgePolicyDecisionStatus = "allowed" | "denied" | "deferred";

export interface BridgePolicyDecision {
  readonly status: BridgePolicyDecisionStatus;
  readonly operation: BridgeOperation;
  readonly authorizationCategory: AuthorizationCategory;
  readonly humanApprovalRequired: boolean;
  readonly reasonCodes: readonly BridgePolicyReasonCode[];
  readonly requestFingerprint: string;
  readonly taskReference: Readonly<{
    taskId: string;
    specificationRevision: number;
    specificationHash: string;
    expectedOriginMainSha: string;
  }>;
}

export class DevelopmentControlBridgeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DevelopmentControlBridgeError";
  }
}

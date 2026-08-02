export const PROVIDER_IDS = ["gcp", "meta", "hetzner"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const OPERATION_CLASSIFICATIONS = ["read", "diagnostic", "mutation"] as const;
export type OperationClassification = (typeof OPERATION_CLASSIFICATIONS)[number];

export const AUTHORIZATION_CLASSES = [
  "read_scope",
  "diagnostic_execution",
  "configuration_mutation",
  "iam_mutation",
  "credential_rotation",
  "deletion",
  "billing",
  "emergency_action",
] as const;
export type AuthorizationClass = (typeof AUTHORIZATION_CLASSES)[number];

export type ProviderOperation =
  | "get_project"
  | "list_workload_identity_pools"
  | "describe_x509_provider"
  | "check_service_account_iam"
  | "check_bucket_permissions"
  | "inspect_bucket_cors"
  | "read_recent_logs"
  | "check_api_quotas"
  | "test_wif_authentication"
  | "test_sign_blob"
  | "test_storage_access"
  | "enable_required_api"
  | "replace_bucket_cors"
  | "correct_service_account_iam"
  | "update_x509_trust_anchor"
  | "rotate_client_certificate";

export interface RegisteredResource {
  readonly provider: ProviderId;
  readonly resourceId: string;
  readonly resourceType: string;
  readonly canonicalName: string;
  readonly allowedOperations: readonly ProviderOperation[];
  readonly environment: "production" | "staging" | "development";
  readonly enabled: boolean;
}

export interface ProviderPrincipal {
  readonly principalId: string;
  readonly actorType: "human_authority" | "workload" | "read_only_automation";
  readonly issuer: string;
  readonly subject: string;
  readonly verified: boolean;
  readonly expiresAt: string;
  readonly revocationGeneration: number;
}

export interface ProviderRequestEnvelope {
  readonly provider: ProviderId;
  readonly operation: ProviderOperation;
  readonly resourceId: string;
  readonly principal: ProviderPrincipal;
  readonly authorizationClass: AuthorizationClass;
  readonly nonce: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
}

export interface ProviderApprovalBinding {
  readonly approvalId: string;
  readonly humanAuthorityActorId: string;
  readonly provider: ProviderId;
  readonly operation: ProviderOperation;
  readonly resourceId: string;
  readonly authorizationClass: AuthorizationClass;
  readonly changeRevision: number;
  readonly changeHash: string;
  readonly approvedAt: string;
  readonly expiresAt: string;
}

export interface ProviderEvidence {
  readonly evidenceId: string;
  readonly provider: ProviderId;
  readonly resourceId: string;
  readonly observedAt: string;
  readonly source: string;
  readonly stateHash: string;
  readonly summary: string;
}

export interface ProviderFinding {
  readonly findingId: string;
  readonly severity: "info" | "warning" | "critical";
  readonly code: string;
  readonly evidenceIds: readonly string[];
  readonly summary: string;
}

export interface ProviderRecommendation {
  readonly recommendationId: string;
  readonly findingIds: readonly string[];
  readonly operation: ProviderOperation;
  readonly authorizationClass: AuthorizationClass;
  readonly rationale: string;
}

export interface ProviderExecutionResult {
  readonly status: "not_executed" | "succeeded" | "failed";
  readonly operation: ProviderOperation;
  readonly resourceId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly resultCode: string;
  readonly summary: string;
}

export interface ProviderVerificationResult {
  readonly status: "not_run" | "verified" | "failed";
  readonly observedStateHash: string | null;
  readonly evidenceIds: readonly string[];
  readonly summary: string;
}

export interface ProviderRollbackResult {
  readonly status: "not_required" | "not_run" | "succeeded" | "failed";
  readonly observedStateHash: string | null;
  readonly summary: string;
}

export interface ProviderChangeEnvelope {
  readonly changeId: string;
  readonly revision: number;
  readonly provider: ProviderId;
  readonly operation: ProviderOperation;
  readonly resourceId: string;
  readonly authorizationClass: AuthorizationClass;
  readonly beforeStateHash: string;
  readonly desiredStateHash: string;
  readonly reason: string;
  readonly evidenceIds: readonly string[];
  readonly preconditions: readonly string[];
  readonly verificationPlan: readonly string[];
  readonly rollbackPlan: readonly string[];
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly state: "proposed" | "approved" | "executing" | "verified" | "rolled_back" | "failed";
  readonly changeHash: string;
}

export type ProviderPolicyReasonCode =
  | "ALLOWED"
  | "PROVIDER_UNKNOWN"
  | "OPERATION_UNKNOWN"
  | "RESOURCE_UNKNOWN"
  | "RESOURCE_DISABLED"
  | "OPERATION_RESOURCE_MISMATCH"
  | "PRINCIPAL_UNVERIFIED"
  | "PRINCIPAL_EXPIRED"
  | "WORKLOAD_CANNOT_APPROVE"
  | "AUTHORIZATION_CLASS_MISMATCH"
  | "REQUEST_TIME_INVALID"
  | "REQUEST_WINDOW_TOO_LONG"
  | "NONCE_REPLAYED"
  | "IDEMPOTENCY_CONFLICT"
  | "CHANGE_REQUIRED"
  | "CHANGE_MISMATCH"
  | "CHANGE_EXPIRED"
  | "BEFORE_STATE_STALE"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_MISMATCH"
  | "HIGH_RISK_NOT_ALLOWLISTED";

export interface ProviderPolicyDecision {
  readonly status: "allowed" | "denied";
  readonly reasonCodes: readonly ProviderPolicyReasonCode[];
  readonly requestFingerprint: string;
  readonly resourceId: string;
  readonly operation: ProviderOperation;
}

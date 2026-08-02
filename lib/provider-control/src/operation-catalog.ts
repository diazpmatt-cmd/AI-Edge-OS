import type { AuthorizationClass, OperationClassification, ProviderOperation } from "./types.js";

export interface ProviderOperationPolicy {
  readonly operation: ProviderOperation;
  readonly classification: OperationClassification;
  readonly authorizationClass: AuthorizationClass;
  readonly humanApprovalRequired: boolean;
  readonly highRisk: boolean;
}

const entry = (
  operation: ProviderOperation,
  classification: OperationClassification,
  authorizationClass: AuthorizationClass,
  highRisk = false,
): ProviderOperationPolicy => Object.freeze({
  operation,
  classification,
  authorizationClass,
  humanApprovalRequired: classification === "mutation",
  highRisk,
});

export const PROVIDER_OPERATION_CATALOG: Readonly<Record<ProviderOperation, ProviderOperationPolicy>> = Object.freeze({
  get_project: entry("get_project", "read", "read_scope"),
  list_workload_identity_pools: entry("list_workload_identity_pools", "read", "read_scope"),
  describe_x509_provider: entry("describe_x509_provider", "read", "read_scope"),
  check_service_account_iam: entry("check_service_account_iam", "read", "read_scope"),
  check_bucket_permissions: entry("check_bucket_permissions", "read", "read_scope"),
  inspect_bucket_cors: entry("inspect_bucket_cors", "read", "read_scope"),
  read_recent_logs: entry("read_recent_logs", "read", "read_scope"),
  check_api_quotas: entry("check_api_quotas", "read", "read_scope"),
  test_wif_authentication: entry("test_wif_authentication", "diagnostic", "diagnostic_execution"),
  test_sign_blob: entry("test_sign_blob", "diagnostic", "diagnostic_execution"),
  test_storage_access: entry("test_storage_access", "diagnostic", "diagnostic_execution"),
  enable_required_api: entry("enable_required_api", "mutation", "configuration_mutation"),
  replace_bucket_cors: entry("replace_bucket_cors", "mutation", "configuration_mutation"),
  correct_service_account_iam: entry("correct_service_account_iam", "mutation", "iam_mutation", true),
  update_x509_trust_anchor: entry("update_x509_trust_anchor", "mutation", "credential_rotation", true),
  rotate_client_certificate: entry("rotate_client_certificate", "mutation", "credential_rotation", true),
});

export function getProviderOperationPolicy(operation: ProviderOperation): ProviderOperationPolicy {
  return PROVIDER_OPERATION_CATALOG[operation];
}

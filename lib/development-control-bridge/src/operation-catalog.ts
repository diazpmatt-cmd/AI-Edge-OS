import type { AuthorizationCategory } from "@workspace/development-control";
import {
  BRIDGE_OPERATIONS,
  DevelopmentControlBridgeError,
  type BridgeOperation,
  type BridgeOperationPolicy,
} from "./types.js";

function policy(
  operation: BridgeOperation,
  availability: BridgeOperationPolicy["availability"],
  authorizationCategory: AuthorizationCategory,
  description: string,
): BridgeOperationPolicy {
  return Object.freeze({
    operation,
    availability,
    authorizationCategory,
    humanApprovalRequired: true,
    description,
  });
}

export const BRIDGE_OPERATION_CATALOG: Readonly<
  Record<BridgeOperation, BridgeOperationPolicy>
> = Object.freeze({
  get_task: policy("get_task", "read_only", "scope", "Read one bounded task projection."),
  get_specification_revisions: policy("get_specification_revisions", "read_only", "scope", "Read bounded task specification history."),
  get_authorization_decisions: policy("get_authorization_decisions", "read_only", "scope", "Read bounded authorization decision history."),
  get_events: policy("get_events", "read_only", "scope", "Read bounded audit events."),
  get_completion_reports: policy("get_completion_reports", "read_only", "scope", "Read bounded completion-report history."),
  get_milestones: policy("get_milestones", "read_only", "scope", "Read factual milestone projections."),
  get_verified_git_evidence: policy("get_verified_git_evidence", "read_only", "scope", "Read bounded verified Git evidence."),
  get_reconciliation_diagnostics: policy("get_reconciliation_diagnostics", "read_only", "scope", "Read bounded reconciliation diagnostics."),
  register_proposal: policy("register_proposal", "modeled_write", "scope", "Model registering a Proposed task without granting approval."),
  claim_approved_task: policy("claim_approved_task", "modeled_write", "scope", "Model claiming an exactly approved task with a bounded lease."),
  renew_claim: policy("renew_claim", "modeled_write", "scope", "Model renewal by the verified claim owner."),
  release_claim: policy("release_claim", "modeled_write", "scope", "Model release by the verified claim owner."),
  transition_to_in_progress: policy("transition_to_in_progress", "modeled_write", "editing", "Model an editing-authorized transition to in progress."),
  request_review: policy("request_review", "modeled_write", "editing", "Model an editing-authorized review request."),
  submit_completion_report: policy("submit_completion_report", "modeled_write", "scope", "Model a bounded completion-report submission."),

  apply_prepared_artifact: policy(
    "apply_prepared_artifact",
    "bounded_execution",
    "editing",
    "Apply only the exact verified prepared artifact through the bounded repository adapter.",
  ),
  commit_applied_artifact: policy(
    "commit_applied_artifact",
    "bounded_execution",
    "committing",
    "Commit only the exact verified applied state.",
  ),
  push_committed_artifact: policy(
    "push_committed_artifact",
    "bounded_execution",
    "pushing",
    "Push only the exact verified commit to its bound non-default branch.",
  ),
  create_pull_request: policy(
    "create_pull_request",
    "bounded_execution",
    "pull_request_creation",
    "Create exactly one pull request from the verified pushed branch to the bound base.",
  ),
  reconcile_trusted_ci: policy(
    "reconcile_trusted_ci",
    "read_only",
    "scope",
    "Reconcile only allowlisted trusted CI facts for the exact PR head and base.",
  ),
  merge_pull_request: policy(
    "merge_pull_request",
    "bounded_execution",
    "merging",
    "Merge exactly one verified green pull request under independent merge authorization.",
  ),
  verify_post_merge: policy(
    "verify_post_merge",
    "read_only",
    "scope",
    "Verify the exact merged result and approved tree on the default branch.",
  ),

  verify_task: policy("verify_task", "deferred", "scope", "Human verification remains unavailable to a workload bridge."),
  complete_task: policy("complete_task", "deferred", "scope", "Human completion remains unavailable to a workload bridge."),
  record_milestone: policy("record_milestone", "deferred", "scope", "Generic milestone recording remains deferred; factual engineering milestones must come from bounded adapter receipts."),
  record_authorization_decision: policy("record_authorization_decision", "deferred", "scope", "A workload may not record material human authorization."),
  recover_expired_claim: policy("recover_expired_claim", "deferred", "scope", "Operator claim recovery remains unavailable to a workload bridge."),
});

export const BRIDGE_OPERATION_AUTHORIZATION_MATRIX: Readonly<
  Record<BridgeOperation, AuthorizationCategory>
> = Object.freeze(
  Object.fromEntries(
    BRIDGE_OPERATIONS.map((operation) => [
      operation,
      BRIDGE_OPERATION_CATALOG[operation].authorizationCategory,
    ]),
  ) as Record<BridgeOperation, AuthorizationCategory>,
);

export function getBridgeOperationPolicy(
  operation: BridgeOperation,
): BridgeOperationPolicy {
  const operationPolicy = BRIDGE_OPERATION_CATALOG[operation];
  if (!operationPolicy) {
    throw new DevelopmentControlBridgeError(
      "UNSUPPORTED_OPERATION",
      "bridge operation is not allowlisted",
    );
  }
  return operationPolicy;
}

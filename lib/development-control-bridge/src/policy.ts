import {
  DevelopmentControlError,
  assertApprovalUsable,
  type ApprovalRecord,
} from "@workspace/development-control";
import { getBridgeOperationPolicy } from "./operation-catalog";
import type {
  BridgePolicyDecision,
  BridgePolicyInput,
  BridgePolicyReasonCode,
} from "./types";

const GIT_STATUS_REASON: Readonly<
  Record<Exclude<BridgePolicyInput["gitEvidenceStatus"], "verified">, BridgePolicyReasonCode>
> = Object.freeze({
  stale: "GIT_EVIDENCE_STALE",
  unavailable: "GIT_EVIDENCE_UNAVAILABLE",
  ambiguous: "GIT_EVIDENCE_AMBIGUOUS",
  edited: "GIT_EVIDENCE_EDITED",
  deleted: "GIT_EVIDENCE_DELETED",
});

function add(
  reasons: Set<BridgePolicyReasonCode>,
  reason: BridgePolicyReasonCode,
): void {
  reasons.add(reason);
}

function latestApproval(
  approvals: readonly ApprovalRecord[],
  category: BridgePolicyInput["request"]["authorizationCategory"],
): ApprovalRecord | null {
  return (
    approvals
      .filter((approval) => approval.categories.includes(category))
      .slice()
      .sort((left, right) =>
        `${left.decidedAt}:${left.approvalId}`.localeCompare(
          `${right.decidedAt}:${right.approvalId}`,
        ),
      )
      .at(-1) ?? null
  );
}

function mapApprovalError(
  error: unknown,
  reasons: Set<BridgePolicyReasonCode>,
): void {
  if (!(error instanceof DevelopmentControlError)) {
    add(reasons, "APPROVAL_NOT_USABLE");
    return;
  }
  const mapped: Readonly<Record<string, BridgePolicyReasonCode>> = {
    APPROVAL_EXPIRED: "APPROVAL_EXPIRED",
    APPROVAL_NOT_USABLE: "APPROVAL_NOT_USABLE",
    STALE_APPROVAL: "APPROVAL_NOT_USABLE",
    STALE_GIT_SHA: "GIT_SHA_MISMATCH",
    WRONG_AUTHORIZATION_CATEGORY: "WRONG_AUTHORIZATION_CATEGORY",
  };
  add(reasons, mapped[error.code] ?? "APPROVAL_NOT_USABLE");
}

export function evaluateBridgePolicy(
  input: BridgePolicyInput,
): BridgePolicyDecision {
  const { request, specification } = input;
  const operationPolicy = getBridgeOperationPolicy(request.operation);
  const reasons = new Set<BridgePolicyReasonCode>();
  const now = Date.parse(input.now);

  if (!Number.isFinite(now)) add(reasons, "POLICY_TIME_INVALID");

  if (request.repositoryId !== input.expectedRepositoryId) {
    add(reasons, "REPOSITORY_MISMATCH");
  }
  if (request.taskId !== specification.taskId) add(reasons, "TASK_MISMATCH");
  if (request.specificationRevision !== specification.revision) {
    add(reasons, "SPECIFICATION_REVISION_MISMATCH");
  }
  if (request.specificationHash !== specification.specificationHash) {
    add(reasons, "SPECIFICATION_HASH_MISMATCH");
  }
  if (
    request.expectedOriginMainSha !== specification.expectedOriginMainSha ||
    input.observedGitSha !== specification.expectedOriginMainSha
  ) {
    add(reasons, "GIT_SHA_MISMATCH");
  }
  if (input.gitEvidenceStatus !== "verified") {
    add(reasons, GIT_STATUS_REASON[input.gitEvidenceStatus]);
  }
  if (request.authorizationCategory !== operationPolicy.authorizationCategory) {
    add(reasons, "AUTHORIZATION_CATEGORY_MISMATCH");
  }
  if (request.principal.status !== "active") {
    add(reasons, "PRINCIPAL_NOT_ACTIVE");
  }
  if (now < Date.parse(request.principal.verifiedAt)) {
    add(reasons, "PRINCIPAL_NOT_YET_VERIFIED");
  }
  if (now >= Date.parse(request.principal.expiresAt)) {
    add(reasons, "PRINCIPAL_EXPIRED");
  }
  if (now < Date.parse(request.issuedAt)) add(reasons, "REQUEST_NOT_YET_VALID");
  if (now >= Date.parse(request.expiresAt)) add(reasons, "REQUEST_EXPIRED");
  if (input.nonceStatus === "used") add(reasons, "NONCE_REPLAYED");
  if (input.nonceStatus === "unknown") add(reasons, "NONCE_STATUS_UNAVAILABLE");
  if (input.idempotency.status === "conflicting") {
    add(reasons, "IDEMPOTENCY_CONFLICT");
  }
  if (
    (input.idempotency.status === "matching" &&
      input.idempotency.requestFingerprint !== request.requestFingerprint) ||
    (input.idempotency.status === "absent" &&
      input.idempotency.requestFingerprint !== null)
  ) {
    add(reasons, "IDEMPOTENCY_EVIDENCE_MISMATCH");
  }

  const approval = latestApproval(input.approvals, operationPolicy.authorizationCategory);
  if (!approval) {
    add(reasons, "APPROVAL_MISSING");
  } else {
    if (
      approval.decidingActor.actorType !== "human_authority" ||
      !approval.decidingActor.verified
    ) {
      add(reasons, "APPROVAL_NOT_USABLE");
    }
    if (
      approval.decidingActor.actorId !== input.expectedHumanAuthorityActorId
    ) {
      add(reasons, "APPROVER_IDENTITY_MISMATCH");
    }
    if (
      approval.decidingActor.actorId === request.principal.principalId ||
      approval.decidingActor.actorId === request.principal.subject
    ) {
      add(reasons, "SELF_APPROVAL_FORBIDDEN");
    }
    try {
      assertApprovalUsable({
        approval,
        specification,
        category: operationPolicy.authorizationCategory,
        observedGitSha: input.observedGitSha ?? "",
        now: input.now,
      });
    } catch (error) {
      mapApprovalError(error, reasons);
    }
  }

  if (operationPolicy.availability === "deferred") {
    add(reasons, "OPERATION_DEFERRED");
  }
  const sortedReasons = Object.freeze([...reasons].sort());
  const onlyDeferred =
    sortedReasons.length === 1 && sortedReasons[0] === "OPERATION_DEFERRED";
  const status =
    sortedReasons.length === 0
      ? "allowed"
      : onlyDeferred
        ? "deferred"
        : "denied";
  return Object.freeze({
    status,
    operation: request.operation,
    authorizationCategory: operationPolicy.authorizationCategory,
    humanApprovalRequired: operationPolicy.humanApprovalRequired,
    reasonCodes: sortedReasons.length === 0 ? Object.freeze(["ALLOWED"] as const) : sortedReasons,
    requestFingerprint: request.requestFingerprint,
    taskReference: Object.freeze({
      taskId: specification.taskId,
      specificationRevision: specification.revision,
      specificationHash: specification.specificationHash,
      expectedOriginMainSha: specification.expectedOriginMainSha,
    }),
  });
}

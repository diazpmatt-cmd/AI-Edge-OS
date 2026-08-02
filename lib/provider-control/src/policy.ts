import { getProviderOperationPolicy } from "./operation-catalog.js";
import type { ProviderResourceRegistry } from "./resource-registry.js";
import type {
  ProviderApprovalBinding,
  ProviderChangeEnvelope,
  ProviderPolicyDecision,
  ProviderPolicyReasonCode,
  ProviderRequestEnvelope,
} from "./types.js";

const MAX_REQUEST_WINDOW_MS = 15 * 60 * 1_000;

export function evaluateProviderPolicy(input: {
  readonly request: ProviderRequestEnvelope;
  readonly registry: ProviderResourceRegistry;
  readonly now: string;
  readonly nonceStatus: "unused" | "replayed";
  readonly idempotencyStatus: "absent" | "matching" | "conflicting";
  readonly observedBeforeStateHash?: string | null;
  readonly change?: ProviderChangeEnvelope | null;
  readonly approval?: ProviderApprovalBinding | null;
  readonly allowlistedHighRiskOperations?: readonly string[];
}): ProviderPolicyDecision {
  const reasons: ProviderPolicyReasonCode[] = [];
  const policy = getProviderOperationPolicy(input.request.operation);
  const resource = input.registry.get(input.request.provider, input.request.resourceId);
  const now = Date.parse(input.now);
  const issued = Date.parse(input.request.issuedAt);
  const expires = Date.parse(input.request.expiresAt);
  const principalExpires = Date.parse(input.request.principal.expiresAt);

  if (!resource) reasons.push("RESOURCE_UNKNOWN");
  else {
    if (!resource.enabled) reasons.push("RESOURCE_DISABLED");
    if (!resource.allowedOperations.includes(input.request.operation)) reasons.push("OPERATION_RESOURCE_MISMATCH");
  }
  if (!input.request.principal.verified) reasons.push("PRINCIPAL_UNVERIFIED");
  if (!Number.isFinite(principalExpires) || principalExpires <= now) reasons.push("PRINCIPAL_EXPIRED");
  if (!Number.isFinite(now) || !Number.isFinite(issued) || !Number.isFinite(expires) || issued > now || expires <= now) {
    reasons.push("REQUEST_TIME_INVALID");
  } else if (expires - issued > MAX_REQUEST_WINDOW_MS) {
    reasons.push("REQUEST_WINDOW_TOO_LONG");
  }
  if (input.nonceStatus === "replayed") reasons.push("NONCE_REPLAYED");
  if (input.idempotencyStatus === "conflicting") reasons.push("IDEMPOTENCY_CONFLICT");
  if (policy.authorizationClass !== input.request.authorizationClass) reasons.push("AUTHORIZATION_CLASS_MISMATCH");

  if (policy.classification === "mutation") {
    const change = input.change;
    const approval = input.approval;
    if (!change) reasons.push("CHANGE_REQUIRED");
    else {
      if (
        change.provider !== input.request.provider ||
        change.operation !== input.request.operation ||
        change.resourceId !== input.request.resourceId ||
        change.authorizationClass !== input.request.authorizationClass
      ) reasons.push("CHANGE_MISMATCH");
      if (Date.parse(change.expiresAt) <= now) reasons.push("CHANGE_EXPIRED");
      if (input.observedBeforeStateHash !== change.beforeStateHash) reasons.push("BEFORE_STATE_STALE");
      if (!approval) reasons.push("APPROVAL_REQUIRED");
      else if (
        approval.provider !== change.provider ||
        approval.operation !== change.operation ||
        approval.resourceId !== change.resourceId ||
        approval.authorizationClass !== change.authorizationClass ||
        approval.changeRevision !== change.revision ||
        approval.changeHash !== change.changeHash ||
        Date.parse(approval.expiresAt) <= now
      ) reasons.push("APPROVAL_MISMATCH");
      if (input.request.principal.actorType !== "human_authority" && approval?.humanAuthorityActorId === input.request.principal.principalId) {
        reasons.push("WORKLOAD_CANNOT_APPROVE");
      }
    }
    if (policy.highRisk && !input.allowlistedHighRiskOperations?.includes(input.request.operation)) {
      reasons.push("HIGH_RISK_NOT_ALLOWLISTED");
    }
  }

  const unique = [...new Set<ProviderPolicyReasonCode>(reasons)].sort();
  const reasonCodes: readonly ProviderPolicyReasonCode[] = Object.freeze(
    unique.length === 0 ? ["ALLOWED"] : unique,
  );
  return Object.freeze({
    status: unique.length === 0 ? "allowed" : "denied",
    reasonCodes,
    requestFingerprint: input.request.requestFingerprint,
    resourceId: input.request.resourceId,
    operation: input.request.operation,
  });
}

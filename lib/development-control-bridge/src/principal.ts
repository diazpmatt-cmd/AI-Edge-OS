import {
  deterministicHash,
  type ActorType,
} from "@workspace/development-control";
import {
  DevelopmentControlBridgeError,
  type BridgePrincipal,
  type BridgePrincipalInput,
  type BridgeWorkloadActorType,
} from "./types";

const MAX_IDENTITY_FIELD = 300;
const WORKLOAD_ACTOR_TYPES = new Set<ActorType>([
  "codex_implementer",
  "bounded_sub_agent",
  "read_only_automation",
]);
const FORBIDDEN_KEYS = [
  "token",
  "secret",
  "password",
  "privateKey",
  "environment",
  "env",
  "clientId",
  "tenantId",
  "metadata",
] as const;

function fail(code: string, message: string): never {
  throw new DevelopmentControlBridgeError(code, message);
}

function bounded(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_IDENTITY_FIELD) {
    fail("INVALID_PRINCIPAL", `${field} must contain 1-${MAX_IDENTITY_FIELD} characters`);
  }
  return normalized;
}

function isoTimestamp(value: string, field: string): string {
  const timestamp = new Date(value);
  if (!value.trim() || Number.isNaN(timestamp.valueOf())) {
    fail("INVALID_PRINCIPAL_TIME", `${field} must be an ISO timestamp`);
  }
  return timestamp.toISOString();
}

function rejectForbiddenProperties(input: object): void {
  for (const key of FORBIDDEN_KEYS) {
    if (key in input) {
      fail("SENSITIVE_PRINCIPAL_FIELD", `${key} is forbidden in a bridge principal`);
    }
  }
}

export function createBridgePrincipal(
  input: BridgePrincipalInput,
): BridgePrincipal {
  rejectForbiddenProperties(input);
  if (!WORKLOAD_ACTOR_TYPES.has(input.actorType)) {
    fail("HUMAN_PRINCIPAL_FORBIDDEN", "bridge principals must be workload identities");
  }
  if (!["active", "revoked", "unknown"].includes(input.status)) {
    fail("INVALID_PRINCIPAL_STATUS", "principal status is invalid");
  }
  const verifiedAt = isoTimestamp(input.verifiedAt, "verifiedAt");
  const expiresAt = isoTimestamp(input.expiresAt, "expiresAt");
  if (Date.parse(expiresAt) <= Date.parse(verifiedAt)) {
    fail("INVALID_PRINCIPAL_TIME", "principal expiry must follow verification");
  }
  const normalized = {
    issuer: bounded(input.issuer, "issuer"),
    subject: bounded(input.subject, "subject"),
    audience: bounded(input.audience, "audience"),
    credentialReferenceId: bounded(
      input.credentialReferenceId,
      "credentialReferenceId",
    ),
    verifiedAt,
    expiresAt,
    status: input.status,
    actorType: input.actorType as BridgeWorkloadActorType,
  };
  return Object.freeze({
    ...normalized,
    principalId: deterministicHash(normalized, "bridge_principal"),
  });
}

export function assertBridgePrincipal(principal: BridgePrincipal): void {
  rejectForbiddenProperties(principal);
  const recreated = createBridgePrincipal({
    issuer: principal.issuer,
    subject: principal.subject,
    audience: principal.audience,
    credentialReferenceId: principal.credentialReferenceId,
    verifiedAt: principal.verifiedAt,
    expiresAt: principal.expiresAt,
    status: principal.status,
    actorType: principal.actorType,
  });
  if (
    recreated.principalId !== principal.principalId ||
    recreated.issuer !== principal.issuer ||
    recreated.subject !== principal.subject ||
    recreated.audience !== principal.audience ||
    recreated.credentialReferenceId !== principal.credentialReferenceId ||
    recreated.verifiedAt !== principal.verifiedAt ||
    recreated.expiresAt !== principal.expiresAt
  ) {
    fail(
      "PRINCIPAL_INTEGRITY_MISMATCH",
      "principal fields do not reproduce the verified principal identifier",
    );
  }
}

import {
  AUTHORIZATION_CATEGORIES,
  deterministicHash,
  type AuthorizationCategory,
} from "@workspace/development-control";
import {
  BRIDGE_OPERATIONS,
  DevelopmentControlBridgeError,
  type BridgeOperation,
  type BridgeRequestEnvelope,
  type BridgeRequestEnvelopeInput,
} from "./types";
import { assertBridgePrincipal } from "./principal";

export const MAX_BRIDGE_REQUEST_LIFETIME_MS = 15 * 60 * 1_000;
const MAX_REFERENCE_FIELD = 300;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const SPECIFICATION_HASH_PATTERN = /^spec_[0-9a-f]{64}$/;
const REPOSITORY_ID_PATTERN = /^[1-9][0-9]{0,19}$/;
const FORBIDDEN_KEYS = [
  "token",
  "secret",
  "password",
  "environment",
  "env",
  "clientId",
  "tenantId",
  "metadata",
  "payload",
] as const;

function fail(code: string, message: string): never {
  throw new DevelopmentControlBridgeError(code, message);
}

function bounded(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_REFERENCE_FIELD) {
    fail("INVALID_REQUEST_ENVELOPE", `${field} must contain 1-${MAX_REFERENCE_FIELD} characters`);
  }
  return normalized;
}

function isoTimestamp(value: string, field: string): string {
  const timestamp = new Date(value);
  if (!value.trim() || Number.isNaN(timestamp.valueOf())) {
    fail("INVALID_REQUEST_TIME", `${field} must be an ISO timestamp`);
  }
  return timestamp.toISOString();
}

function rejectForbiddenProperties(input: object): void {
  for (const key of FORBIDDEN_KEYS) {
    if (key in input) {
      fail("SENSITIVE_REQUEST_FIELD", `${key} is forbidden in a bridge request`);
    }
  }
}

export function createBridgeRequestEnvelope(
  input: BridgeRequestEnvelopeInput,
): BridgeRequestEnvelope {
  rejectForbiddenProperties(input);
  assertBridgePrincipal(input.principal);
  const operations = new Set<BridgeOperation>(BRIDGE_OPERATIONS);
  const categories = new Set<AuthorizationCategory>(AUTHORIZATION_CATEGORIES);
  if (!operations.has(input.operation)) {
    fail("UNSUPPORTED_OPERATION", "bridge operation is not allowlisted");
  }
  if (!categories.has(input.authorizationCategory)) {
    fail("INVALID_AUTHORIZATION_CATEGORY", "authorization category is invalid");
  }
  if (!REPOSITORY_ID_PATTERN.test(input.repositoryId)) {
    fail("INVALID_REPOSITORY_ID", "repositoryId must be a stable numeric identifier");
  }
  if (!Number.isInteger(input.specificationRevision) || input.specificationRevision < 1) {
    fail("INVALID_SPECIFICATION_REVISION", "specification revision must be positive");
  }
  if (!SPECIFICATION_HASH_PATTERN.test(input.specificationHash)) {
    fail("INVALID_SPECIFICATION_HASH", "specification hash is invalid");
  }
  const expectedOriginMainSha = input.expectedOriginMainSha.toLowerCase();
  if (!SHA_PATTERN.test(expectedOriginMainSha)) {
    fail("INVALID_GIT_SHA", "expected origin/main SHA is invalid");
  }
  const issuedAt = isoTimestamp(input.issuedAt, "issuedAt");
  const expiresAt = isoTimestamp(input.expiresAt, "expiresAt");
  const lifetime = Date.parse(expiresAt) - Date.parse(issuedAt);
  if (lifetime <= 0 || lifetime > MAX_BRIDGE_REQUEST_LIFETIME_MS) {
    fail("INVALID_REQUEST_LIFETIME", "request lifetime must be positive and at most 15 minutes");
  }
  const normalized = {
    repositoryId: input.repositoryId,
    taskId: bounded(input.taskId, "taskId"),
    specificationRevision: input.specificationRevision,
    specificationHash: input.specificationHash,
    expectedOriginMainSha,
    operation: input.operation,
    authorizationCategory: input.authorizationCategory,
    principal: input.principal,
    nonce: bounded(input.nonce, "nonce"),
    issuedAt,
    expiresAt,
    correlationId: bounded(input.correlationId, "correlationId"),
    idempotencyKey: bounded(input.idempotencyKey, "idempotencyKey"),
  };
  return Object.freeze({
    ...normalized,
    requestFingerprint: deterministicHash(normalized, "bridge_request"),
  });
}

import test from "node:test";
import assert from "node:assert/strict";
import {
  createProviderRequestEnvelope,
  evaluateProviderPolicy,
  providerControlFixturePrincipal,
  providerControlFixtureReadRequest,
  providerControlFixtureRegistry,
  PROVIDER_CONTROL_FIXTURE_NOW,
} from "../.test-dist/index.js";

const evaluate = (request, overrides = {}) => evaluateProviderPolicy({
  request,
  registry: providerControlFixtureRegistry,
  now: PROVIDER_CONTROL_FIXTURE_NOW,
  nonceStatus: "unused",
  idempotencyStatus: "absent",
  ...overrides,
});

test("allows an exact registered read", () => {
  assert.deepEqual(evaluate(providerControlFixtureReadRequest), {
    status: "allowed",
    reasonCodes: ["ALLOWED"],
    requestFingerprint: providerControlFixtureReadRequest.requestFingerprint,
    resourceId: providerControlFixtureReadRequest.resourceId,
    operation: providerControlFixtureReadRequest.operation,
  });
});

test("rejects an unregistered resource", () => {
  const request = createProviderRequestEnvelope({
    provider: providerControlFixtureReadRequest.provider,
    operation: providerControlFixtureReadRequest.operation,
    resourceId: "project/unregistered-project",
    principal: providerControlFixtureReadRequest.principal,
    authorizationClass: providerControlFixtureReadRequest.authorizationClass,
    nonce: "fixture-nonce-unregistered",
    issuedAt: providerControlFixtureReadRequest.issuedAt,
    expiresAt: providerControlFixtureReadRequest.expiresAt,
    correlationId: "fixture-correlation-unregistered",
    idempotencyKey: "fixture-idempotency-unregistered",
  });
  assert.ok(evaluate(request).reasonCodes.includes("RESOURCE_UNKNOWN"));
});

test("rejects replay and idempotency conflict", () => {
  const result = evaluate(providerControlFixtureReadRequest, {
    nonceStatus: "replayed",
    idempotencyStatus: "conflicting",
  });
  assert.equal(result.status, "denied");
  assert.ok(result.reasonCodes.includes("NONCE_REPLAYED"));
  assert.ok(result.reasonCodes.includes("IDEMPOTENCY_CONFLICT"));
});

test("rejects an unverified workload", () => {
  const request = createProviderRequestEnvelope({
    provider: "gcp",
    operation: "get_project",
    resourceId: "project/example-project",
    principal: { ...providerControlFixturePrincipal, verified: false },
    authorizationClass: "read_scope",
    nonce: "fixture-nonce-unverified",
    issuedAt: "2026-08-02T20:59:00.000Z",
    expiresAt: "2026-08-02T21:05:00.000Z",
    correlationId: "fixture-correlation-unverified",
    idempotencyKey: "fixture-idempotency-unverified",
  });
  assert.ok(evaluate(request).reasonCodes.includes("PRINCIPAL_UNVERIFIED"));
});

test("requires a change envelope for mutations", () => {
  const request = createProviderRequestEnvelope({
    provider: "gcp",
    operation: "enable_required_api",
    resourceId: "project/example-project",
    principal: providerControlFixturePrincipal,
    authorizationClass: "configuration_mutation",
    nonce: "fixture-nonce-mutation",
    issuedAt: "2026-08-02T20:59:00.000Z",
    expiresAt: "2026-08-02T21:05:00.000Z",
    correlationId: "fixture-correlation-mutation",
    idempotencyKey: "fixture-idempotency-mutation",
  });
  assert.ok(evaluate(request).reasonCodes.includes("CHANGE_REQUIRED"));
});

import { describe, expect, it } from "vitest";
import {
  createProviderRequestEnvelope,
  evaluateProviderPolicy,
  providerControlFixturePrincipal,
  providerControlFixtureReadRequest,
  providerControlFixtureRegistry,
  PROVIDER_CONTROL_FIXTURE_NOW,
} from "../index.js";

describe("provider-control policy", () => {
  it("allows an exact registered read", () => {
    expect(evaluateProviderPolicy({
      request: providerControlFixtureReadRequest,
      registry: providerControlFixtureRegistry,
      now: PROVIDER_CONTROL_FIXTURE_NOW,
      nonceStatus: "unused",
      idempotencyStatus: "absent",
    })).toMatchObject({ status: "allowed", reasonCodes: ["ALLOWED"] });
  });

  it("rejects an unregistered resource", () => {
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
    expect(evaluateProviderPolicy({
      request,
      registry: providerControlFixtureRegistry,
      now: PROVIDER_CONTROL_FIXTURE_NOW,
      nonceStatus: "unused",
      idempotencyStatus: "absent",
    }).reasonCodes).toContain("RESOURCE_UNKNOWN");
  });

  it("rejects replay and idempotency conflict", () => {
    const result = evaluateProviderPolicy({
      request: providerControlFixtureReadRequest,
      registry: providerControlFixtureRegistry,
      now: PROVIDER_CONTROL_FIXTURE_NOW,
      nonceStatus: "replayed",
      idempotencyStatus: "conflicting",
    });
    expect(result.status).toBe("denied");
    expect(result.reasonCodes).toEqual(expect.arrayContaining(["NONCE_REPLAYED", "IDEMPOTENCY_CONFLICT"]));
  });

  it("rejects an unverified workload", () => {
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
    expect(evaluateProviderPolicy({
      request,
      registry: providerControlFixtureRegistry,
      now: PROVIDER_CONTROL_FIXTURE_NOW,
      nonceStatus: "unused",
      idempotencyStatus: "absent",
    }).reasonCodes).toContain("PRINCIPAL_UNVERIFIED");
  });

  it("requires a change and approval for mutations", () => {
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
    expect(evaluateProviderPolicy({
      request,
      registry: providerControlFixtureRegistry,
      now: PROVIDER_CONTROL_FIXTURE_NOW,
      nonceStatus: "unused",
      idempotencyStatus: "absent",
    }).reasonCodes).toEqual(expect.arrayContaining(["CHANGE_REQUIRED"]));
  });
});

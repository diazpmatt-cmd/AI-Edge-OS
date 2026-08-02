import { createProviderChangeEnvelope } from "./change-envelope.js";
import { createProviderRequestEnvelope } from "./request-envelope.js";
import { createRegisteredResource, ProviderResourceRegistry } from "./resource-registry.js";

export const PROVIDER_CONTROL_FIXTURE_NOW = "2026-08-02T21:00:00.000Z";

export const providerControlFixtureResource = createRegisteredResource({
  provider: "gcp",
  resourceId: "project/example-project",
  resourceType: "gcp/project",
  canonicalName: "Synthetic Google Cloud project",
  environment: "development",
  enabled: true,
  allowedOperations: ["get_project", "check_api_quotas", "enable_required_api"],
});

export const providerControlFixtureRegistry = new ProviderResourceRegistry([
  providerControlFixtureResource,
]);

export const providerControlFixturePrincipal = Object.freeze({
  principalId: "workload:fixture-reader",
  actorType: "read_only_automation" as const,
  issuer: "https://issuer.example.invalid",
  subject: "fixture-reader",
  verified: true,
  expiresAt: "2026-08-02T21:10:00.000Z",
  revocationGeneration: 1,
});

export const providerControlFixtureReadRequest = createProviderRequestEnvelope({
  provider: "gcp",
  operation: "get_project",
  resourceId: providerControlFixtureResource.resourceId,
  principal: providerControlFixturePrincipal,
  authorizationClass: "read_scope",
  nonce: "fixture-nonce-1",
  issuedAt: "2026-08-02T20:59:00.000Z",
  expiresAt: "2026-08-02T21:05:00.000Z",
  correlationId: "fixture-correlation-1",
  idempotencyKey: "fixture-idempotency-1",
});

export const providerControlFixtureChange = createProviderChangeEnvelope({
  changeId: "change-fixture-1",
  revision: 1,
  provider: "gcp",
  operation: "enable_required_api",
  resourceId: providerControlFixtureResource.resourceId,
  authorizationClass: "configuration_mutation",
  beforeStateHash: "state_before_fixture",
  desiredStateHash: "state_desired_fixture",
  reason: "Synthetic fixture only",
  evidenceIds: ["evidence-fixture-1"],
  preconditions: ["current state hash matches"],
  verificationPlan: ["verify desired state hash"],
  rollbackPlan: ["restore prior state"],
  createdAt: "2026-08-02T20:55:00.000Z",
  expiresAt: "2026-08-02T21:30:00.000Z",
  state: "approved",
});

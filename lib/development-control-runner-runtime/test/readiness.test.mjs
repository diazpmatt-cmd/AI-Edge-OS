import assert from "node:assert/strict";
import test from "node:test";
import { evaluateActivationReadiness } from "../.test-dist/readiness.js";

const NOW = "2026-08-02T22:58:00.000Z";

function evidence(overrides = {}) {
  return {
    ready: true,
    evidenceRef: "evidence:test",
    observedAt: "2026-08-02T22:57:30.000Z",
    ...overrides,
  };
}

function manifest(overrides = {}) {
  return {
    runtimeId: "dab-runtime-1",
    environment: "staging",
    evaluatedAt: NOW,
    evidenceMaxAgeSeconds: 300,
    durableStore: evidence({ evidenceRef: "evidence:store" }),
    migrations: evidence({ evidenceRef: "evidence:migrations" }),
    schedulerHost: evidence({ evidenceRef: "evidence:scheduler" }),
    heartbeatPersistence: evidence({ evidenceRef: "evidence:heartbeat" }),
    killSwitch: evidence({ evidenceRef: "evidence:kill-switch" }),
    policyVersion: "policy-v1",
    supportedPolicyVersions: ["policy-v1"],
    allowedOperations: ["claim_approved_task", "stop"],
    capabilities: {
      credentialsEnabled: false,
      gitWritesEnabled: false,
      deploymentEnabled: false,
      providerWritesEnabled: false,
      paidProvidersEnabled: false,
      externalActionsEnabled: false,
    },
    ...overrides,
  };
}

test("returns ready for a complete planner-only staging manifest", () => {
  const result = evaluateActivationReadiness(manifest());
  assert.equal(result.status, "ready");
  assert.deepEqual(result.blockers, []);
  assert.match(result.fingerprint, /^readiness_[0-9a-f]{8}$/);
});

test("returns deterministic fingerprints for equivalent manifests", () => {
  const left = evaluateActivationReadiness(manifest({ supportedPolicyVersions: ["policy-v2", "policy-v1"] }));
  const right = evaluateActivationReadiness(manifest({ supportedPolicyVersions: ["policy-v1", "policy-v2"] }));
  assert.equal(left.fingerprint, right.fingerprint);
});

test("blocks each missing readiness dependency", () => {
  const cases = [
    ["durableStore", "STORE_NOT_READY"],
    ["migrations", "MIGRATIONS_NOT_READY"],
    ["schedulerHost", "SCHEDULER_NOT_READY"],
    ["heartbeatPersistence", "HEARTBEAT_NOT_READY"],
    ["killSwitch", "KILL_SWITCH_NOT_READY"],
  ];
  for (const [field, blocker] of cases) {
    const result = evaluateActivationReadiness(manifest({ [field]: evidence({ ready: false }) }));
    assert.equal(result.status, "blocked");
    assert.ok(result.blockers.includes(blocker));
  }
});

test("blocks stale evidence", () => {
  const result = evaluateActivationReadiness(manifest({
    durableStore: evidence({ observedAt: "2026-08-02T22:40:00.000Z" }),
  }));
  assert.ok(result.blockers.includes("STALE_EVIDENCE"));
});

test("blocks unsupported policy and excessive operations", () => {
  const result = evaluateActivationReadiness(manifest({
    policyVersion: "policy-v2",
    allowedOperations: ["claim_approved_task", "deploy_everything"],
  }));
  assert.ok(result.blockers.includes("POLICY_VERSION_UNSUPPORTED"));
  assert.ok(result.blockers.includes("OPERATION_SET_EXCESSIVE"));
});

test("blocks all mutation and external capabilities", () => {
  const result = evaluateActivationReadiness(manifest({
    capabilities: {
      credentialsEnabled: true,
      gitWritesEnabled: true,
      deploymentEnabled: true,
      providerWritesEnabled: true,
      paidProvidersEnabled: true,
      externalActionsEnabled: true,
    },
  }));
  for (const blocker of [
    "CREDENTIALS_ENABLED",
    "GIT_WRITES_ENABLED",
    "DEPLOYMENT_ENABLED",
    "PROVIDER_WRITES_ENABLED",
    "PAID_PROVIDERS_ENABLED",
    "EXTERNAL_ACTIONS_ENABLED",
  ]) {
    assert.ok(result.blockers.includes(blocker));
  }
});

test("requires separate authorization for production", () => {
  const blocked = evaluateActivationReadiness(manifest({ environment: "production" }));
  assert.ok(blocked.blockers.includes("PRODUCTION_AUTHORIZATION_MISSING"));

  const authorized = evaluateActivationReadiness(manifest({
    environment: "production",
    activationAuthorizationRef: "authorization:separate-production-approval",
  }));
  assert.equal(authorized.status, "ready");
});

test("blocks contradictory provider-write state", () => {
  const result = evaluateActivationReadiness(manifest({
    capabilities: {
      credentialsEnabled: false,
      gitWritesEnabled: false,
      deploymentEnabled: false,
      providerWritesEnabled: true,
      paidProvidersEnabled: false,
      externalActionsEnabled: false,
    },
  }));
  assert.ok(result.blockers.includes("CONTRADICTORY_STATE"));
});

test("invalid future evidence and duplicate operations fail closed", () => {
  const result = evaluateActivationReadiness(manifest({
    killSwitch: evidence({ observedAt: "2026-08-02T23:58:00.000Z" }),
    allowedOperations: ["stop", "stop"],
  }));
  assert.ok(result.blockers.includes("INVALID_MANIFEST"));
  assert.ok(result.blockers.includes("OPERATION_SET_EXCESSIVE"));
});

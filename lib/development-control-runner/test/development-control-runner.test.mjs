import assert from "node:assert/strict";
import test from "node:test";
import { planNextOperation, RUNNER_OPERATION_CATEGORIES } from "../.test-dist/index.js";

const base = {
  taskId: "META-1A",
  priority: 10,
  createdAt: "2026-08-02T00:00:00Z",
  state: "approved",
  specificationRevision: 1,
  specificationHash: "spec_meta",
  observedSpecificationRevision: 1,
  observedSpecificationHash: "spec_meta",
  expectedSha: "a".repeat(40),
  approvals: [{ category: "scope", approved: true }],
  lease: null,
  gitEvidence: { available: true, expectedSha: "a".repeat(40), observedSha: "a".repeat(40) },
  policyDecision: "allowed",
};

const input = (tasks, extra = {}) => ({ actorId: "runner-1", now: "2026-08-02T22:00:00Z", killSwitch: false, tasks, ...extra });

test("selects one deterministic highest-priority task", () => {
  const lower = { ...base, taskId: "GCP-1B", priority: 1 };
  const forward = planNextOperation(input([lower, base]));
  const reverse = planNextOperation(input([base, lower]));
  assert.deepEqual(forward, reverse);
  assert.equal(forward.taskId, "META-1A");
  assert.equal(forward.operation, "claim_approved_task");
});

test("requires independent categories", () => {
  const task = { ...base, state: "claimed", lease: { ownerId: "runner-1", expiresAt: "2026-08-03T00:00:00Z", version: 1 } };
  assert.equal(planNextOperation(input([task])).stopCode, "CATEGORY_MISSING");
  const allowed = { ...task, approvals: [...task.approvals, { category: "editing", approved: true }] };
  assert.equal(planNextOperation(input([allowed])).operation, "transition_to_in_progress");
});

test("fails closed on stale specification and SHA", () => {
  assert.equal(planNextOperation(input([{ ...base, observedSpecificationHash: "stale" }])).stopCode, "STALE_SPECIFICATION");
  assert.equal(planNextOperation(input([{ ...base, gitEvidence: { ...base.gitEvidence, observedSha: "b".repeat(40) } }])).stopCode, "STALE_SHA");
});

test("protects leases", () => {
  const foreign = { ...base, state: "claimed", lease: { ownerId: "other", expiresAt: "2026-08-03T00:00:00Z", version: 1 } };
  assert.equal(planNextOperation(input([foreign])).stopCode, "ACTIVE_FOREIGN_LEASE");
  const expired = { ...foreign, lease: { ...foreign.lease, expiresAt: "2026-08-01T00:00:00Z" } };
  assert.equal(planNextOperation(input([expired])).stopCode, "LEASE_EXPIRED_REQUIRES_RECOVERY");
});

test("stops for policy, human, evidence, kill switch, and idempotency conflict", () => {
  assert.equal(planNextOperation(input([{ ...base, policyDecision: "denied" }])).stopCode, "POLICY_DENIED");
  assert.equal(planNextOperation(input([{ ...base, humanRequired: true }])).stopCode, "HUMAN_REQUIRED");
  assert.equal(planNextOperation(input([{ ...base, gitEvidence: { ...base.gitEvidence, available: false } }])).stopCode, "GIT_EVIDENCE_UNAVAILABLE");
  assert.equal(planNextOperation(input([base], { killSwitch: true })).stopCode, "KILL_SWITCH_ACTIVE");
  assert.equal(planNextOperation(input([{ ...base, idempotency: { key: "k", fingerprint: "one", observedFingerprint: "two" } }])).stopCode, "IDEMPOTENCY_CONFLICT");
});

test("operation catalog is bounded and contains no execution capability", () => {
  assert.deepEqual(Object.keys(RUNNER_OPERATION_CATEGORIES).sort(), [
    "claim_approved_task", "complete_task", "release_claim", "renew_claim", "request_review",
    "submit_completion_report", "transition_to_in_progress", "verify_task",
  ]);
  const serialized = JSON.stringify(RUNNER_OPERATION_CATEGORIES);
  for (const forbidden of ["shell", "filesystem", "credential", "deploy", "http", "database"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

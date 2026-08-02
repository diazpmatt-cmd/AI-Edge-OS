import assert from "node:assert/strict";
import test from "node:test";
import { createRunnerRuntime } from "../.test-dist/index.js";

const NOW = "2026-08-02T22:40:00.000Z";
const request = { cycleKey: "cycle-001", actorId: "runner-1", killSwitch: false };

function task(overrides = {}) {
  return {
    taskId: "DAB-4B-test",
    priority: 100,
    createdAt: "2026-08-02T22:00:00.000Z",
    state: "approved",
    specificationRevision: 1,
    specificationHash: "spec_test",
    observedSpecificationRevision: 1,
    observedSpecificationHash: "spec_test",
    expectedSha: "4149b62f4339950474f0f68384a27a3d6324cd69",
    approvals: [{ category: "scope", approved: true }],
    gitEvidence: { available: true, observedSha: "4149b62f4339950474f0f68384a27a3d6324cd69" },
    policyDecision: "allowed",
    ...overrides,
  };
}

function planner(input) {
  if (input.killSwitch) {
    return { taskId: null, operation: "stop", stopCode: "KILL_SWITCH_ACTIVE", requiredCategories: [], fingerprint: "plan_kill" };
  }
  const selected = input.tasks[0];
  if (!selected || selected.approvals.length === 0) {
    return { taskId: selected?.taskId ?? null, operation: "stop", stopCode: "APPROVAL_MISSING", requiredCategories: [], fingerprint: "plan_stop" };
  }
  return { taskId: selected.taskId, operation: "claim_approved_task", stopCode: null, requiredCategories: ["scope"], fingerprint: "plan_claim" };
}

function ports(options = {}) {
  let prior = null;
  const appended = [];
  const counts = { tasks: 0, lease: 0, prior: 0, plan: 0 };
  const reads = {
    async readTasks() {
      counts.tasks += 1;
      if (options.readError) throw new Error("unavailable");
      return options.tasks ?? [task()];
    },
    async readCycleLease() {
      counts.lease += 1;
      if (options.readError) throw new Error("unavailable");
      return {
        available: options.ownerId !== undefined,
        ownerId: options.ownerId ?? null,
        expiresAt: options.ownerId !== undefined ? "2026-08-02T23:40:00.000Z" : null,
      };
    },
    async readPriorCycle() {
      counts.prior += 1;
      if (options.readError) throw new Error("unavailable");
      return prior;
    },
  };
  const writes = {
    async appendCycle(record) {
      if (options.writeError) throw new Error("write failed");
      appended.push(record);
      prior = { cycleKey: record.cycleKey, inputFingerprint: record.inputFingerprint, result: record };
    },
  };
  const plan = (input) => {
    counts.plan += 1;
    return planner(input);
  };
  return { reads, writes, plan, appended, counts };
}

function runtime(fake) {
  return createRunnerRuntime({ reads: fake.reads, writes: fake.writes, plan: fake.plan, now: () => NOW });
}

test("plans and persists exactly one cycle result", async () => {
  const fake = ports();
  const result = await runtime(fake).runCycle(request);
  assert.equal(result.operation, "claim_approved_task");
  assert.equal(result.outcome, "planned");
  assert.equal(fake.appended.length, 1);
  assert.equal(fake.counts.plan, 1);
});

test("persists explicit stop decisions", async () => {
  const fake = ports({ tasks: [task({ approvals: [] })] });
  const result = await runtime(fake).runCycle(request);
  assert.equal(result.operation, "stop");
  assert.equal(result.stopCode, "APPROVAL_MISSING");
  assert.equal(result.outcome, "stopped");
  assert.equal(fake.appended.length, 1);
});

test("exact replay returns prior result without planning or appending again", async () => {
  const fake = ports();
  const service = runtime(fake);
  const first = await service.runCycle(request);
  const second = await service.runCycle(request);
  assert.deepEqual(second, first);
  assert.equal(fake.appended.length, 1);
  assert.equal(fake.counts.plan, 1);
});

test("conflicting cycle reuse fails closed", async () => {
  const fake = ports();
  const service = runtime(fake);
  await service.runCycle(request);
  fake.reads.readTasks = async () => [task({ priority: 101 })];
  const conflict = await service.runCycle(request);
  assert.equal(conflict.failureCode, "IDEMPOTENCY_CONFLICT");
  assert.equal(fake.appended.length, 1);
});

test("active foreign cycle fails before planning", async () => {
  const fake = ports({ ownerId: "runner-2" });
  const result = await runtime(fake).runCycle(request);
  assert.equal(result.failureCode, "ACTIVE_FOREIGN_CYCLE");
  assert.equal(fake.counts.plan, 0);
  assert.equal(fake.appended.length, 0);
});

test("unavailable reads fail closed", async () => {
  const fake = ports({ readError: true });
  const result = await runtime(fake).runCycle(request);
  assert.equal(result.failureCode, "READ_UNAVAILABLE");
  assert.equal(fake.counts.plan, 0);
});

test("failed persistence never claims success", async () => {
  const fake = ports({ writeError: true });
  const result = await runtime(fake).runCycle(request);
  assert.equal(result.failureCode, "PERSISTENCE_FAILED");
  assert.equal(fake.appended.length, 0);
});

test("kill switch produces one persisted stop", async () => {
  const fake = ports();
  const result = await runtime(fake).runCycle({ ...request, killSwitch: true });
  assert.equal(result.operation, "stop");
  assert.equal(result.stopCode, "KILL_SWITCH_ACTIVE");
  assert.equal(fake.appended.length, 1);
});

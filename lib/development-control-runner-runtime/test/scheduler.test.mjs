import assert from "node:assert/strict";
import test from "node:test";
import { createWakeupController } from "../.test-dist/scheduler.js";

const NOW = "2026-08-02T22:50:00.000Z";
const policy = {
  scheduleId: "dab-main",
  actorId: "runner-1",
  intervalMs: 60_000,
  backoffBaseMs: 30_000,
  backoffMaxMs: 240_000,
  paused: false,
  killSwitch: false,
};
const prior = { lastDueSlot: null, lastCompletedAt: null, inProgressCycleKey: null, consecutiveFailures: 0 };

function record(overrides = {}) {
  return {
    cycleKey: "dab-main:1",
    actorId: "runner-1",
    startedAt: NOW,
    completedAt: NOW,
    taskId: "task-1",
    operation: "claim_approved_task",
    stopCode: null,
    requiredCategories: ["scope"],
    planFingerprint: "plan_1",
    inputFingerprint: "cycle_1",
    outcome: "planned",
    ...overrides,
  };
}

function controller(result = record()) {
  const calls = [];
  return {
    calls,
    service: createWakeupController({ async runCycle(request) { calls.push(request); return result; } }),
  };
}

test("invokes one cycle when the current slot is due", async () => {
  const fake = controller();
  const result = await fake.service.tick({ now: NOW, policy, prior });
  assert.equal(result.due, true);
  assert.equal(result.reasonCode, "CYCLE_COMPLETED");
  assert.equal(fake.calls.length, 1);
  assert.equal(result.attemptedCycleKey, fake.calls[0].cycleKey);
});

test("does not repeat an already evaluated slot", async () => {
  const slot = Math.floor(Date.parse(NOW) / policy.intervalMs);
  const fake = controller();
  const result = await fake.service.tick({ now: NOW, policy, prior: { ...prior, lastDueSlot: slot } });
  assert.equal(result.reasonCode, "NOT_YET_DUE");
  assert.equal(fake.calls.length, 0);
});

test("pause and kill switch suppress cycle invocation", async () => {
  const paused = controller();
  const pausedResult = await paused.service.tick({ now: NOW, policy: { ...policy, paused: true }, prior });
  assert.equal(pausedResult.reasonCode, "PAUSED");
  assert.equal(paused.calls.length, 0);

  const killed = controller();
  const killedResult = await killed.service.tick({ now: NOW, policy: { ...policy, killSwitch: true }, prior });
  assert.equal(killedResult.reasonCode, "KILL_SWITCH_ACTIVE");
  assert.equal(killed.calls.length, 0);
});

test("active prior cycle suppresses overlap", async () => {
  const fake = controller();
  const result = await fake.service.tick({ now: NOW, policy, prior: { ...prior, inProgressCycleKey: "dab-main:old" } });
  assert.equal(result.reasonCode, "PRIOR_CYCLE_IN_PROGRESS");
  assert.equal(fake.calls.length, 0);
});

test("bounded exponential backoff suppresses early retries", async () => {
  const fake = controller();
  const result = await fake.service.tick({
    now: NOW,
    policy,
    prior: { ...prior, lastCompletedAt: "2026-08-02T22:49:30.000Z", consecutiveFailures: 3 },
  });
  assert.equal(result.reasonCode, "BACKOFF_ACTIVE");
  assert.equal(result.nextEligibleAt, "2026-08-02T22:51:30.000Z");
  assert.equal(fake.calls.length, 0);
});

test("classifies stopped and failed cycles truthfully", async () => {
  const stopped = controller(record({ operation: "stop", stopCode: "HUMAN_REQUIRED", outcome: "stopped" }));
  const stoppedResult = await stopped.service.tick({ now: NOW, policy, prior });
  assert.equal(stoppedResult.reasonCode, "CYCLE_STOPPED");

  const failed = controller({ cycleKey: "dab-main:1", failureCode: "READ_UNAVAILABLE", inputFingerprint: null });
  const failedResult = await failed.service.tick({ now: NOW, policy, prior });
  assert.equal(failedResult.reasonCode, "CYCLE_FAILED");
});

test("invalid schedule and invalid time fail closed", async () => {
  const fake = controller();
  const invalidSchedule = await fake.service.tick({ now: NOW, policy: { ...policy, intervalMs: 10 }, prior });
  assert.equal(invalidSchedule.reasonCode, "INVALID_SCHEDULE");
  const invalidTime = await fake.service.tick({ now: "not-a-time", policy, prior });
  assert.equal(invalidTime.reasonCode, "INVALID_SCHEDULE");
  assert.equal(fake.calls.length, 0);
});

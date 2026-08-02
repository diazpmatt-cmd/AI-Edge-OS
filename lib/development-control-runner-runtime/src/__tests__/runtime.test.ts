import { describe, expect, it, vi } from "vitest";
import type { TaskSnapshot } from "@workspace/development-control-runner";
import {
  createRunnerRuntime,
  type PriorCycleRecord,
  type RunnerCycleRecord,
  type RunnerRuntimeReadPort,
  type RunnerRuntimeWritePort,
} from "../index.js";

const NOW = "2026-08-02T22:40:00.000Z";

function task(overrides: Partial<TaskSnapshot> = {}): TaskSnapshot {
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
    gitEvidence: {
      available: true,
      expectedSha: "4149b62f4339950474f0f68384a27a3d6324cd69",
      observedSha: "4149b62f4339950474f0f68384a27a3d6324cd69",
    },
    policyDecision: "allowed",
    ...overrides,
  };
}

function ports(options: {
  tasks?: readonly TaskSnapshot[];
  ownerId?: string | null;
  readError?: boolean;
  writeError?: boolean;
} = {}) {
  let prior: PriorCycleRecord | null = null;
  const appended: RunnerCycleRecord[] = [];
  const reads: RunnerRuntimeReadPort = {
    async readTasks() {
      if (options.readError) throw new Error("unavailable");
      return options.tasks ?? [task()];
    },
    async readCycleLease() {
      if (options.readError) throw new Error("unavailable");
      return {
        available: options.ownerId !== undefined,
        ownerId: options.ownerId ?? null,
        expiresAt: options.ownerId !== undefined ? "2026-08-02T23:40:00.000Z" : null,
      };
    },
    async readPriorCycle() {
      if (options.readError) throw new Error("unavailable");
      return prior;
    },
  };
  const writes: RunnerRuntimeWritePort = {
    async appendCycle(record) {
      if (options.writeError) throw new Error("write failed");
      appended.push(record);
      prior = { cycleKey: record.cycleKey, inputFingerprint: record.inputFingerprint, result: record };
    },
  };
  return { reads, writes, appended, setPrior(value: PriorCycleRecord | null) { prior = value; } };
}

const request = { cycleKey: "cycle-001", actorId: "runner-1", killSwitch: false } as const;

describe("DAB-4B runner runtime", () => {
  it("plans and persists exactly one bounded cycle result", async () => {
    const fake = ports();
    const runtime = createRunnerRuntime({ reads: fake.reads, writes: fake.writes, now: () => NOW });
    const result = await runtime.runCycle(request);

    expect(result).toMatchObject({
      cycleKey: "cycle-001",
      taskId: "DAB-4B-test",
      operation: "claim_approved_task",
      outcome: "planned",
    });
    expect(fake.appended).toHaveLength(1);
    expect(fake.appended[0]).toEqual(result);
  });

  it("persists a bounded stop decision", async () => {
    const fake = ports({ tasks: [task({ approvals: [] })] });
    const runtime = createRunnerRuntime({ reads: fake.reads, writes: fake.writes, now: () => NOW });
    const result = await runtime.runCycle(request);

    expect(result).toMatchObject({ operation: "stop", stopCode: "APPROVAL_MISSING", outcome: "stopped" });
    expect(fake.appended).toHaveLength(1);
  });

  it("returns an exact replay without appending again", async () => {
    const fake = ports();
    const runtime = createRunnerRuntime({ reads: fake.reads, writes: fake.writes, now: () => NOW });
    const first = await runtime.runCycle(request);
    const second = await runtime.runCycle(request);

    expect(second).toEqual(first);
    expect(fake.appended).toHaveLength(1);
  });

  it("fails closed on conflicting cycle-key reuse", async () => {
    const fake = ports();
    const runtime = createRunnerRuntime({ reads: fake.reads, writes: fake.writes, now: () => NOW });
    const first = await runtime.runCycle(request);
    expect("inputFingerprint" in first).toBe(true);

    const changedRuntime = createRunnerRuntime({
      reads: { ...fake.reads, readTasks: async () => [task({ priority: 101 })] },
      writes: fake.writes,
      now: () => NOW,
    });
    const conflict = await changedRuntime.runCycle(request);
    expect(conflict).toMatchObject({ failureCode: "IDEMPOTENCY_CONFLICT" });
    expect(fake.appended).toHaveLength(1);
  });

  it("fails closed when another actor owns the active cycle", async () => {
    const fake = ports({ ownerId: "runner-2" });
    const runtime = createRunnerRuntime({ reads: fake.reads, writes: fake.writes, now: () => NOW });
    const result = await runtime.runCycle(request);

    expect(result).toEqual({ cycleKey: "cycle-001", failureCode: "ACTIVE_FOREIGN_CYCLE", inputFingerprint: null });
    expect(fake.appended).toHaveLength(0);
  });

  it("fails closed when reads are unavailable", async () => {
    const fake = ports({ readError: true });
    const runtime = createRunnerRuntime({ reads: fake.reads, writes: fake.writes, now: () => NOW });
    await expect(runtime.runCycle(request)).resolves.toEqual({
      cycleKey: "cycle-001",
      failureCode: "READ_UNAVAILABLE",
      inputFingerprint: null,
    });
  });

  it("returns a bounded persistence failure without claiming success", async () => {
    const fake = ports({ writeError: true });
    const runtime = createRunnerRuntime({ reads: fake.reads, writes: fake.writes, now: () => NOW });
    const result = await runtime.runCycle(request);

    expect(result).toMatchObject({ failureCode: "PERSISTENCE_FAILED" });
    expect(fake.appended).toHaveLength(0);
  });

  it("passes the kill switch through to the planner and persists the stop", async () => {
    const fake = ports();
    const runtime = createRunnerRuntime({ reads: fake.reads, writes: fake.writes, now: () => NOW });
    const result = await runtime.runCycle({ ...request, killSwitch: true });

    expect(result).toMatchObject({ operation: "stop", stopCode: "KILL_SWITCH_ACTIVE", taskId: null });
    expect(fake.appended).toHaveLength(1);
  });

  it("invokes the planner inputs through each read port once per fresh cycle", async () => {
    const fake = ports();
    const readTasks = vi.spyOn(fake.reads, "readTasks");
    const readLease = vi.spyOn(fake.reads, "readCycleLease");
    const readPrior = vi.spyOn(fake.reads, "readPriorCycle");
    const runtime = createRunnerRuntime({ reads: fake.reads, writes: fake.writes, now: () => NOW });

    await runtime.runCycle(request);
    expect(readTasks).toHaveBeenCalledTimes(1);
    expect(readLease).toHaveBeenCalledTimes(1);
    expect(readPrior).toHaveBeenCalledTimes(1);
  });
});

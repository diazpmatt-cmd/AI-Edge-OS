import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createInterruptibleWait,
  runLeadEmailWorkerLoop,
  type WorkerWaitResult,
} from "../lib/lead-email-worker-runtime.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Lead Bridge worker loop", () => {
  it("runs exactly one successful poll in one-cycle mode", async () => {
    const pollOnce = vi.fn(async () => ({ ingested: 1 }));
    const onSuccess = vi.fn();
    const wait = vi.fn(async (): Promise<WorkerWaitResult> => "elapsed");

    await runLeadEmailWorkerLoop({
      runOnce: true,
      pollMs: 60_000,
      maxBackoffMs: 600_000,
      shouldStop: () => false,
      pollOnce,
      onSuccess,
      onFailure: vi.fn(),
      wait,
    });

    expect(pollOnce).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith({ ingested: 1 });
    expect(wait).not.toHaveBeenCalled();
  });

  it("records a one-cycle failure once and then rejects", async () => {
    const failure = new Error("controlled failure");
    const onFailure = vi.fn();

    await expect(runLeadEmailWorkerLoop({
      runOnce: true,
      pollMs: 60_000,
      maxBackoffMs: 600_000,
      shouldStop: () => false,
      pollOnce: vi.fn(async () => { throw failure; }),
      onSuccess: vi.fn(),
      onFailure,
      wait: vi.fn(async (): Promise<WorkerWaitResult> => "elapsed"),
    })).rejects.toThrow("controlled failure");

    expect(onFailure).toHaveBeenCalledWith(failure, 1, 60_000);
  });

  it("applies exponential retry delays and resets after a success", async () => {
    let attempt = 0;
    let stopping = false;
    const waits: number[] = [];
    const failures: Array<{ count: number; retryMs: number }> = [];

    await runLeadEmailWorkerLoop({
      runOnce: false,
      pollMs: 60_000,
      maxBackoffMs: 600_000,
      shouldStop: () => stopping,
      pollOnce: async () => {
        attempt += 1;
        if (attempt <= 2) throw new Error(`failure-${attempt}`);
        return { attempt };
      },
      onSuccess: () => {
        stopping = true;
      },
      onFailure: (_error, count, retryMs) => {
        failures.push({ count, retryMs });
      },
      wait: async (milliseconds) => {
        waits.push(milliseconds);
        return "elapsed";
      },
    });

    expect(attempt).toBe(3);
    expect(failures).toEqual([
      { count: 1, retryMs: 60_000 },
      { count: 2, retryMs: 120_000 },
    ]);
    expect(waits).toEqual([60_000, 120_000]);
  });

  it("stops without another poll when shutdown interrupts the wait", async () => {
    const pollOnce = vi.fn(async () => ({ ingested: 0 }));

    await runLeadEmailWorkerLoop({
      runOnce: false,
      pollMs: 60_000,
      maxBackoffMs: 600_000,
      shouldStop: () => false,
      pollOnce,
      onSuccess: vi.fn(),
      onFailure: vi.fn(),
      wait: vi.fn(async (): Promise<WorkerWaitResult> => "stopped"),
    });

    expect(pollOnce).toHaveBeenCalledTimes(1);
  });
});

describe("Lead Bridge interruptible wait", () => {
  it("returns stopped immediately when the stop signal has resolved", async () => {
    const wait = createInterruptibleWait(Promise.resolve());
    await expect(wait(60_000)).resolves.toBe("stopped");
  });

  it("returns elapsed when the timer completes first", async () => {
    vi.useFakeTimers();
    const wait = createInterruptibleWait(new Promise<void>(() => undefined));
    const operation = wait(1_000);
    const assertion = expect(operation).resolves.toBe("elapsed");
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
  });
});

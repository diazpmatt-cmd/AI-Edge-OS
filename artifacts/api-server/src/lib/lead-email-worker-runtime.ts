import { computeRetryDelayMs } from "./lead-email-worker-policy.js";

export type WorkerWaitResult = "elapsed" | "stopped";

export type WorkerLoopOptions<T> = {
  runOnce: boolean;
  pollMs: number;
  maxBackoffMs: number;
  shouldStop: () => boolean;
  pollOnce: () => Promise<T>;
  onSuccess: (result: T) => Promise<void> | void;
  onFailure: (error: unknown, consecutiveFailures: number, retryMs: number) => Promise<void> | void;
  wait: (milliseconds: number) => Promise<WorkerWaitResult>;
};

export async function runLeadEmailWorkerLoop<T>(options: WorkerLoopOptions<T>): Promise<void> {
  let consecutiveFailures = 0;

  while (!options.shouldStop()) {
    try {
      const result = await options.pollOnce();
      consecutiveFailures = 0;
      await options.onSuccess(result);
      if (options.runOnce || options.shouldStop()) return;
      if (await options.wait(options.pollMs) === "stopped") return;
    } catch (error) {
      consecutiveFailures += 1;
      const retryMs = computeRetryDelayMs(
        consecutiveFailures,
        options.pollMs,
        options.maxBackoffMs,
      );
      await options.onFailure(error, consecutiveFailures, retryMs);
      if (options.runOnce) throw error;
      if (options.shouldStop()) return;
      if (await options.wait(retryMs) === "stopped") return;
    }
  }
}

export function createInterruptibleWait(stopSignal: Promise<void>) {
  return async (milliseconds: number): Promise<WorkerWaitResult> => {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new Error("wait milliseconds must be a non-negative finite number");
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        new Promise<WorkerWaitResult>((resolve) => {
          timer = setTimeout(() => resolve("elapsed"), milliseconds);
        }),
        stopSignal.then<WorkerWaitResult>(() => "stopped"),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}

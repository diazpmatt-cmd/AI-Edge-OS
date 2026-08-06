import { describe, expect, it } from "vitest";
import {
  claimWeeklyExecution,
  completeWeeklyExecution,
  failWeeklyExecution,
} from "../lib/apollos-weekly-execution";

describe("Apollos weekly execution state rules", () => {
  it("claims only an approved batch and increments attempts", () => {
    expect(
      claimWeeklyExecution({
        status: "approved",
        attempts: 0,
        maxAttempts: 3,
      }),
    ).toMatchObject({
      nextStatus: "executing",
      attempts: 1,
      terminal: false,
      reasonCode: "APOLLOS_WEEKLY_EXECUTION_CLAIMED",
    });
  });

  it("refuses pending, rejected, and already executing batches", () => {
    for (const status of ["pending_review", "rejected", "executing", "executed"]) {
      expect(() =>
        claimWeeklyExecution({ status, attempts: 0, maxAttempts: 3 }),
      ).toThrow("APOLLOS_WEEKLY_NOT_APPROVED");
    }
  });

  it("requeues a bounded failure before the attempt ceiling", () => {
    expect(
      failWeeklyExecution({ attempts: 1, maxAttempts: 3 }),
    ).toMatchObject({
      nextStatus: "approved",
      terminal: false,
      reasonCode: "APOLLOS_WEEKLY_RETRY_QUEUED",
    });
  });

  it("fails closed when retries are exhausted", () => {
    expect(
      failWeeklyExecution({ attempts: 3, maxAttempts: 3 }),
    ).toMatchObject({
      nextStatus: "failed",
      terminal: true,
      reasonCode: "APOLLOS_WEEKLY_RETRIES_EXHAUSTED",
    });
  });

  it("marks a fully verified batch executed", () => {
    expect(completeWeeklyExecution()).toMatchObject({
      nextStatus: "executed",
      terminal: true,
      reasonCode: "APOLLOS_WEEKLY_EXECUTION_COMPLETE",
    });
  });

  it("rejects malformed retry configuration", () => {
    expect(() =>
      claimWeeklyExecution({
        status: "approved",
        attempts: -1,
        maxAttempts: 3,
      }),
    ).toThrow("APOLLOS_WEEKLY_RETRY_CONFIG_INVALID");
    expect(() =>
      failWeeklyExecution({ attempts: 1, maxAttempts: 0 }),
    ).toThrow("APOLLOS_WEEKLY_RETRY_CONFIG_INVALID");
  });
});

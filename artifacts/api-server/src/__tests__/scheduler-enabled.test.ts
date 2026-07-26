import { describe, expect, it } from "vitest";
import { isSchedulerEnabled } from "../lib/scheduler-enabled.js";

describe("scheduler master switch", () => {
  it("fails closed when the variable is absent", () => {
    expect(isSchedulerEnabled({})).toBe(false);
  });

  it("only enables scheduling for an exact true value", () => {
    expect(isSchedulerEnabled({ SCHEDULER_ENABLED: "true" })).toBe(true);
    expect(isSchedulerEnabled({ SCHEDULER_ENABLED: "TRUE" })).toBe(false);
    expect(isSchedulerEnabled({ SCHEDULER_ENABLED: "1" })).toBe(false);
    expect(isSchedulerEnabled({ SCHEDULER_ENABLED: "false" })).toBe(false);
  });
});

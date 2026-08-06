import { describe, expect, it } from "vitest";
import { readApollosRepairWorkerConfig } from "../lib/apollos-repair-worker-config";

describe("readApollosRepairWorkerConfig", () => {
  it("defaults disabled and killed", () => {
    expect(readApollosRepairWorkerConfig({})).toEqual({
      enabled: false,
      killSwitch: true,
      runtimeId: "apollos-repair-production-1",
      intervalMs: 15_000,
      leaseMs: 120_000,
      maxAttempts: 1,
    });
  });

  it("accepts an explicitly enabled bounded configuration", () => {
    expect(readApollosRepairWorkerConfig({
      APOLLOS_REPAIR_WORKER_ENABLED: "true",
      APOLLOS_REPAIR_KILL_SWITCH: "false",
      APOLLOS_REPAIR_RUNTIME_ID: "repair-runtime-2",
      APOLLOS_REPAIR_INTERVAL_MS: "5000",
      APOLLOS_REPAIR_LEASE_MS: "60000",
      APOLLOS_REPAIR_MAX_ATTEMPTS: "2",
    })).toMatchObject({
      enabled: true,
      killSwitch: false,
      runtimeId: "repair-runtime-2",
      intervalMs: 5000,
      leaseMs: 60000,
      maxAttempts: 2,
    });
  });

  it.each([
    ["APOLLOS_REPAIR_INTERVAL_MS", "999", "APOLLOS_REPAIR_INTERVAL_INVALID"],
    ["APOLLOS_REPAIR_LEASE_MS", "29999", "APOLLOS_REPAIR_LEASE_INVALID"],
    ["APOLLOS_REPAIR_MAX_ATTEMPTS", "4", "APOLLOS_REPAIR_ATTEMPTS_INVALID"],
    ["APOLLOS_REPAIR_MAX_ATTEMPTS", "1.5", "APOLLOS_REPAIR_ATTEMPTS_INVALID"],
  ])("rejects invalid %s", (name, value, code) => {
    expect(() => readApollosRepairWorkerConfig({ [name]: value }))
      .toThrow(code);
  });

  it("rejects an unsafe runtime identifier", () => {
    expect(() => readApollosRepairWorkerConfig({
      APOLLOS_REPAIR_RUNTIME_ID: "../escape",
    })).toThrow("APOLLOS_REPAIR_RUNTIME_ID_INVALID");
  });

  it("freezes the resulting configuration", () => {
    expect(Object.isFrozen(readApollosRepairWorkerConfig({}))).toBe(true);
  });
});

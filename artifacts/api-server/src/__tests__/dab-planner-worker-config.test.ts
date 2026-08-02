import { describe, expect, it } from "vitest";
import { readDabPlannerWorkerConfig } from "../lib/dab-planner-worker-config.js";

describe("DAB planner worker configuration", () => {
  it("is inert and kill-switched by default", () => {
    const config = readDabPlannerWorkerConfig({});
    expect(config.enabled).toBe(false);
    expect(config.killSwitch).toBe(true);
  });

  it("requires an explicit activation authorization when enabled", () => {
    expect(() => readDabPlannerWorkerConfig({
      DAB_PLANNER_WORKER_ENABLED: "true",
    })).toThrow("DAB_PLANNER_ACTIVATION_AUTHORIZATION_REQUIRED");
  });

  it("accepts the bounded planner-only production profile", () => {
    const config = readDabPlannerWorkerConfig({
      DAB_PLANNER_WORKER_ENABLED: "true",
      DAB_PLANNER_KILL_SWITCH: "false",
      DAB_PLANNER_ACTIVATION_AUTHORIZATION_REF: "github:issue:94",
      DAB_PLANNER_INTERVAL_MS: "60000",
      DAB_PLANNER_LEASE_MS: "120000",
    });
    expect(config).toMatchObject({
      enabled: true,
      killSwitch: false,
      intervalMs: 60000,
      leaseMs: 120000,
      activationAuthorizationRef: "github:issue:94",
    });
  });

  it("rejects unsafe cadence and malformed booleans", () => {
    expect(() => readDabPlannerWorkerConfig({
      DAB_PLANNER_INTERVAL_MS: "999",
    })).toThrow("DAB_PLANNER_INVALID_INTEGER");
    expect(() => readDabPlannerWorkerConfig({
      DAB_PLANNER_KILL_SWITCH: "off",
    })).toThrow("DAB_PLANNER_INVALID_BOOLEAN");
  });
});

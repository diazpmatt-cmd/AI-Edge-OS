import { describe, expect, it } from "vitest";
import {
  APOLLOS_REPAIR_ADAPTER_POLICIES,
  buildApollosRepairAdapterStatus,
} from "../lib/apollos-repair-adapters";

describe("buildApollosRepairAdapterStatus", () => {
  it("reports default evidence adapters as ready when their handlers exist", () => {
    const status = buildApollosRepairAdapterStatus({}, [
      "preserve-render-inputs",
      "preserve-binding-evidence",
      "find-earliest-failure",
      "collect-causal-evidence",
    ]);
    expect(status.find((item) => item.stepKey === "preserve-render-inputs"))
      .toMatchObject({
        state: "ready",
        reasonCode: "APOLLOS_REPAIR_ADAPTER_READY",
        handlerRegistered: true,
      });
  });

  it("reports future adapters as disabled without leaking environment values", () => {
    const status = buildApollosRepairAdapterStatus({}, []);
    const renderer = status.find(
      (item) => item.stepKey === "prepare-renderer-fix",
    );
    expect(renderer).toMatchObject({
      state: "disabled",
      reasonCode: "APOLLOS_REPAIR_ADAPTER_DISABLED",
      handlerRegistered: false,
      requiresApproval: true,
      enableEnvironmentVariable:
        "APOLLOS_REPAIR_ADAPTER_RENDERER_CHANGE_ENABLED",
    });
    expect(JSON.stringify(renderer)).not.toContain("secret");
  });

  it("distinguishes a missing handler from a disabled adapter", () => {
    const status = buildApollosRepairAdapterStatus(
      { APOLLOS_REPAIR_ADAPTER_UPSTREAM_PROBE_ENABLED: "true" },
      [],
    );
    expect(status.find((item) => item.stepKey === "probe-upstream-health"))
      .toMatchObject({
        state: "blocked",
        reasonCode: "APOLLOS_REPAIR_ADAPTER_HANDLER_MISSING",
      });
  });

  it("gives the kill switch precedence over enablement and handler presence", () => {
    const status = buildApollosRepairAdapterStatus(
      {
        APOLLOS_REPAIR_ADAPTER_UPSTREAM_PROBE_ENABLED: "true",
        APOLLOS_REPAIR_ADAPTER_PROBE_UPSTREAM_HEALTH_KILL_SWITCH: "true",
      },
      ["probe-upstream-health"],
    );
    expect(status.find((item) => item.stepKey === "probe-upstream-health"))
      .toMatchObject({
        state: "blocked",
        reasonCode: "APOLLOS_REPAIR_ADAPTER_KILL_SWITCH",
        handlerRegistered: true,
      });
  });

  it("returns immutable status in the same order as the policy registry", () => {
    const status = buildApollosRepairAdapterStatus({}, []);
    expect(status.map((item) => item.stepKey)).toEqual(
      APOLLOS_REPAIR_ADAPTER_POLICIES.map((item) => item.stepKey),
    );
    expect(Object.isFrozen(status)).toBe(true);
    expect(status.every(Object.isFrozen)).toBe(true);
  });
});

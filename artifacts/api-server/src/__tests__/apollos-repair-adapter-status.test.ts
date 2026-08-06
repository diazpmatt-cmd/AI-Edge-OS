import { describe, expect, it } from "vitest";
import {
  APOLLOS_REPAIR_ADAPTER_POLICIES,
  APOLLOS_REPAIR_INSPECTION_ADAPTER_KEYS,
  assertApollosRepairHandlerContract,
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

  it("publishes safe lease inspection as a default read-only adapter", () => {
    const status = buildApollosRepairAdapterStatus(
      {},
      [...APOLLOS_REPAIR_INSPECTION_ADAPTER_KEYS],
    );
    expect(status.find((item) => item.stepKey === "inspect-lease-owner"))
      .toMatchObject({
        state: "ready",
        reasonCode: "APOLLOS_REPAIR_ADAPTER_READY",
        requiresApproval: false,
        handlerRegistered: true,
      });
  });

  it("publishes expired-lease recovery as a bounded checkpoint resume", () => {
    const status = buildApollosRepairAdapterStatus(
      {},
      [...APOLLOS_REPAIR_INSPECTION_ADAPTER_KEYS],
    );
    expect(status.find((item) => item.stepKey === "recover-expired-lease"))
      .toMatchObject({
        state: "ready",
        reasonCode: "APOLLOS_REPAIR_ADAPTER_READY",
        effect: "checkpoint_resume",
        requiresApproval: false,
      });
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

  it("accepts exactly the implemented inspection handler contract", () => {
    const handlers = Object.fromEntries(
      APOLLOS_REPAIR_INSPECTION_ADAPTER_KEYS.map((key) => [
        key,
        async () => ({ verified: true, evidence: {} }),
      ]),
    );
    expect(() => assertApollosRepairHandlerContract(handlers)).not.toThrow();
  });

  it("fails closed when handlers drift from the published contract", () => {
    expect(() =>
      assertApollosRepairHandlerContract({
        "preserve-render-inputs": async () => ({
          verified: true,
          evidence: {},
        }),
        "unpublished-handler": async () => ({
          verified: true,
          evidence: {},
        }),
      }),
    ).toThrow("APOLLOS_REPAIR_HANDLER_CONTRACT_MISMATCH");
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

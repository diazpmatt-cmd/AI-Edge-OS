import { describe, expect, it } from "vitest";
import { classifyDabRuntimeStatus } from "../lib/dab-runtime-status";

const base = {
  enabled: true,
  now: "2026-08-02T23:40:00.000Z",
  intervalMs: 60_000,
  staleAfterMs: 180_000,
  readinessStatus: "ready" as const,
};

describe("classifyDabRuntimeStatus", () => {
  it("reports disabled before considering heartbeat state", () => {
    expect(classifyDabRuntimeStatus({
      ...base,
      enabled: false,
      heartbeatObservedAt: "2026-08-02T23:39:30.000Z",
    }).status).toBe("disabled");
  });

  it("reports uninitialized without a valid heartbeat", () => {
    expect(classifyDabRuntimeStatus({
      ...base,
      heartbeatObservedAt: null,
    }).status).toBe("uninitialized");
  });

  it("reports blocked when the latest readiness decision is blocked", () => {
    expect(classifyDabRuntimeStatus({
      ...base,
      readinessStatus: "blocked",
      heartbeatObservedAt: "2026-08-02T23:39:30.000Z",
    }).status).toBe("blocked");
  });

  it("reports stale after the bounded threshold", () => {
    const decision = classifyDabRuntimeStatus({
      ...base,
      heartbeatObservedAt: "2026-08-02T23:36:59.000Z",
    });
    expect(decision.status).toBe("stale");
    expect(decision.ageMs).toBe(181_000);
  });

  it("reports healthy inside the threshold", () => {
    const decision = classifyDabRuntimeStatus({
      ...base,
      heartbeatObservedAt: "2026-08-02T23:39:00.000Z",
    });
    expect(decision.status).toBe("healthy");
    expect(decision.ageMs).toBe(60_000);
  });

  it("fails uninitialized for invalid threshold bounds", () => {
    expect(classifyDabRuntimeStatus({
      ...base,
      staleAfterMs: 60_000,
      heartbeatObservedAt: "2026-08-02T23:39:30.000Z",
    }).status).toBe("uninitialized");
  });
});

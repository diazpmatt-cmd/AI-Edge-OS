import { describe, expect, it } from "vitest";
import { buildApollosCapabilities } from "../lib/apollos-capabilities";

const ready = {
  agentWorkerEnabled: true,
  agentProviderEnabled: true,
  agentKillSwitch: false,
  aiCredentialPresent: true,
  preparationWorkerEnabled: true,
  preparationKillSwitch: false,
  publishingWorkerEnabled: true,
  publishingKillSwitch: false,
  schedulerSecretPresent: true,
};

function byId(input = ready) {
  return Object.fromEntries(
    buildApollosCapabilities(input).map((item) => [item.id, item]),
  );
}

describe("buildApollosCapabilities", () => {
  it("reports all guarded capabilities ready with complete configuration", () => {
    const result = byId();
    expect(result.diagnose.state).toBe("ready");
    expect(result.recommend.reasonCode).toBe("APOLLOS_RECOMMENDATIONS_READY");
    expect(result.prepare.reasonCode).toBe("APOLLOS_PREPARATION_READY");
    expect(result.publish.reasonCode).toBe("APOLLOS_PUBLISHING_READY");
  });

  it("keeps read-only diagnosis available when AI credentials are missing", () => {
    const result = byId({ ...ready, aiCredentialPresent: false });
    expect(result.diagnose.state).toBe("ready");
    expect(result.recommend).toMatchObject({
      state: "blocked",
      reasonCode: "APOLLOS_AI_CREDENTIAL_MISSING",
    });
    expect(result.prepare.state).toBe("degraded");
  });

  it("reports deliberate worker shutdowns as disabled", () => {
    const result = byId({
      ...ready,
      agentWorkerEnabled: false,
      preparationWorkerEnabled: false,
      publishingWorkerEnabled: false,
    });
    expect(result.recommend.state).toBe("disabled");
    expect(result.prepare.state).toBe("disabled");
    expect(result.publish.state).toBe("disabled");
  });

  it("distinguishes kill switches from disabled workers", () => {
    const result = byId({
      ...ready,
      agentKillSwitch: true,
      preparationKillSwitch: true,
      publishingKillSwitch: true,
    });
    expect(result.recommend.reasonCode).toBe("APOLLOS_AGENT_KILL_SWITCH");
    expect(result.prepare.reasonCode).toBe("APOLLOS_PREPARATION_KILL_SWITCH");
    expect(result.publish.reasonCode).toBe("APOLLOS_PUBLISHING_KILL_SWITCH");
  });

  it("blocks publishing when the internal scheduler credential is absent", () => {
    const result = byId({ ...ready, schedulerSecretPresent: false });
    expect(result.publish).toMatchObject({
      state: "blocked",
      reasonCode: "APOLLOS_SCHEDULER_SECRET_MISSING",
      requiresApproval: true,
    });
  });

  it("never marks mutating capabilities as approval-free", () => {
    const result = buildApollosCapabilities(ready);
    expect(result.find((item) => item.id === "diagnose")?.requiresApproval).toBe(false);
    expect(result.find((item) => item.id === "prepare")?.requiresApproval).toBe(true);
    expect(result.find((item) => item.id === "publish")?.requiresApproval).toBe(true);
  });

  it("returns immutable capability records", () => {
    const result = buildApollosCapabilities(ready);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.every(Object.isFrozen)).toBe(true);
  });
});

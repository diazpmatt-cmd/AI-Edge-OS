import { describe, expect, it } from "vitest";
import { buildReferralPilotDeliveryReadiness } from "./referral-pilot-readiness.js";
import type { ReferralDeliveryConfig } from "./referral-delivery.js";

function config(overrides: Partial<ReferralDeliveryConfig> = {}): ReferralDeliveryConfig {
  return {
    enabled: false,
    mode: "dry_run",
    emergencyStop: true,
    allowlist: new Set<string>(),
    hourlyLimit: 5,
    ...overrides,
  };
}

describe("Referral controlled-pilot readiness", () => {
  it("fails closed under the default delivery configuration", () => {
    expect(buildReferralPilotDeliveryReadiness(config())).toEqual({
      dryRunAvailable: true,
      liveDeliveryEnabled: false,
      liveModeEnabled: false,
      emergencyStopEngaged: true,
      allowlistConfigured: false,
      allowlistCount: 0,
      hourlyLimit: 5,
      environmentGateOpen: false,
      blockers: [
        "delivery_disabled",
        "emergency_stop",
        "live_mode_not_enabled",
        "pilot_allowlist_empty",
      ],
    });
  });

  it("opens only the environment gate when all live environment controls are configured", () => {
    const readiness = buildReferralPilotDeliveryReadiness(config({
      enabled: true,
      mode: "live",
      emergencyStop: false,
      allowlist: new Set(["2515550101", "person@example.com"]),
      hourlyLimit: 3,
    }));

    expect(readiness).toMatchObject({
      liveDeliveryEnabled: true,
      liveModeEnabled: true,
      emergencyStopEngaged: false,
      allowlistConfigured: true,
      allowlistCount: 2,
      hourlyLimit: 3,
      environmentGateOpen: true,
      blockers: [],
    });
  });

  it("does not expose allowlisted destination values", () => {
    const readiness = buildReferralPilotDeliveryReadiness(config({
      allowlist: new Set(["2515550101", "person@example.com"]),
    }));
    const serialized = JSON.stringify(readiness);

    expect(serialized).not.toContain("2515550101");
    expect(serialized).not.toContain("person@example.com");
    expect(readiness.allowlistCount).toBe(2);
  });

  it("keeps the environment closed if emergency stop remains engaged", () => {
    const readiness = buildReferralPilotDeliveryReadiness(config({
      enabled: true,
      mode: "live",
      emergencyStop: true,
      allowlist: new Set(["2515550101"]),
    }));

    expect(readiness.environmentGateOpen).toBe(false);
    expect(readiness.blockers).toEqual(["emergency_stop"]);
  });
});

import { describe, expect, it } from "vitest";
import { buildReferralReadiness } from "../lib/referral-readiness.js";

describe("RGE-8 operational readiness", () => {
  const safe = {
    deliveryEnabled: false,
    deliveryMode: "dry_run" as const,
    emergencyStop: true,
    schedulerEnabled: false,
    openFraudReviews: 0,
    pendingRewards: 0,
    failedDeliveries: 0,
    productionAcceptedMilestones: 2,
    totalMilestones: 8,
  };

  it("reports all fail-closed safety controls", () => {
    expect(buildReferralReadiness(safe).safety).toEqual({
      dryRunDefault: true,
      emergencyStopEngaged: true,
      schedulerDisabled: true,
      liveDeliveryDisabled: true,
    });
  });

  it("does not call local completion production acceptance", () => {
    const report = buildReferralReadiness(safe);
    expect(report.productionAcceptance.complete).toBe(false);
    expect(report.blockers).toContain("production_acceptance_incomplete");
  });

  it("never authorizes autonomous operation", () => {
    expect(buildReferralReadiness(safe).readyForAutonomousOperation).toBe(false);
  });
});

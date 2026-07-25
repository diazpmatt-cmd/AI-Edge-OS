import { describe, expect, it } from "vitest";
import { buildReferralEconomics } from "../lib/referral-reporting.js";

describe("RGE-6 referral reporting", () => {
  const base = {
    programId: 1,
    programName: "Neighbor Referral",
    invitations: 10,
    referrals: 5,
    conversions: 2,
    pendingRewards: 1,
    fulfilledRewards: 1,
    rewardCost: 25,
  };

  it("calculates conversion rate from measured referrals", () => {
    expect(
      buildReferralEconomics({ ...base, attributedRevenue: null })
        .conversionRate,
    ).toBe(40);
  });

  it("keeps missing attributed revenue unavailable", () => {
    const report = buildReferralEconomics({
      ...base,
      attributedRevenue: null,
    });
    expect(report.attributedRevenue).toBeNull();
    expect(report.roi).toBeNull();
    expect(report.revenueStatus).toBe("unavailable");
  });

  it("calculates ROI only from measured revenue", () => {
    const report = buildReferralEconomics({
      ...base,
      attributedRevenue: 100,
    });
    expect(report.roi).toBe(300);
    expect(report.revenueStatus).toBe("measured");
  });

  it("does not fabricate ROI when reward cost is zero", () => {
    expect(
      buildReferralEconomics({
        ...base,
        rewardCost: 0,
        attributedRevenue: 100,
      }).roi,
    ).toBeNull();
  });
});

export interface ReferralProgramMetrics {
  programId: number | null;
  programName: string;
  invitations: number;
  referrals: number;
  conversions: number;
  pendingRewards: number;
  fulfilledRewards: number;
  rewardCost: number;
  attributedRevenue: number | null;
}

export function buildReferralEconomics(metrics: ReferralProgramMetrics) {
  const conversionRate =
    metrics.referrals > 0
      ? Math.round((metrics.conversions / metrics.referrals) * 10_000) / 100
      : 0;
  const roi =
    metrics.attributedRevenue === null
      ? null
      : metrics.rewardCost > 0
        ? Math.round(
            ((metrics.attributedRevenue - metrics.rewardCost) /
              metrics.rewardCost) *
              10_000,
          ) / 100
        : null;
  return {
    ...metrics,
    conversionRate,
    roi,
    revenueStatus:
      metrics.attributedRevenue === null ? "unavailable" : "measured",
  };
}

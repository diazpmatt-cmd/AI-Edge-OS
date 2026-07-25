export interface ReferralReadinessInput {
  deliveryEnabled: boolean;
  deliveryMode: "dry_run" | "live";
  emergencyStop: boolean;
  schedulerEnabled: boolean;
  openFraudReviews: number;
  pendingRewards: number;
  failedDeliveries: number;
  productionAcceptedMilestones: number;
  totalMilestones: number;
}

export function buildReferralReadiness(input: ReferralReadinessInput) {
  const safety = {
    dryRunDefault: input.deliveryMode === "dry_run",
    emergencyStopEngaged: input.emergencyStop,
    schedulerDisabled: !input.schedulerEnabled,
    liveDeliveryDisabled: !input.deliveryEnabled,
  };
  const blockers = [
    input.openFraudReviews > 0 ? "open_fraud_reviews" : null,
    input.pendingRewards > 0 ? "pending_reward_reviews" : null,
    input.failedDeliveries > 0 ? "failed_delivery_attempts" : null,
    input.productionAcceptedMilestones < input.totalMilestones
      ? "production_acceptance_incomplete"
      : null,
  ].filter(Boolean);
  return {
    safety,
    queues: {
      openFraudReviews: input.openFraudReviews,
      pendingRewards: input.pendingRewards,
      failedDeliveries: input.failedDeliveries,
    },
    productionAcceptance: {
      accepted: input.productionAcceptedMilestones,
      total: input.totalMilestones,
      complete: input.productionAcceptedMilestones === input.totalMilestones,
    },
    blockers,
    readyForAutonomousOperation: false,
  };
}

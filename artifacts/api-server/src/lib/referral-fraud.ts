export type ReferralRiskReason =
  | "duplicate_identity"
  | "repeated_destination"
  | "suspicious_velocity"
  | "self_referral"
  | "reward_stacking"
  | "repeated_fingerprint";

export interface ReferralRiskMetrics {
  duplicateIdentityCount: number;
  repeatedDestinationCount: number;
  recentReferrerCount: number;
  selfReferral: boolean;
  activeRewardCount: number;
  // Null means the tenant has no lawfully collected fingerprint evidence.
  fingerprintCount: number | null;
}

export interface ReferralRiskSignal {
  reason: ReferralRiskReason;
  points: number;
  evidence: Record<string, number | boolean | string>;
}

export interface ReferralRiskAssessment {
  score: number;
  signals: ReferralRiskSignal[];
  fingerprintEvaluation: "evaluated" | "not_available";
}

export function evaluateReferralRisk(
  metrics: ReferralRiskMetrics,
): ReferralRiskAssessment {
  const signals: ReferralRiskSignal[] = [];
  if (metrics.duplicateIdentityCount > 1) {
    signals.push({
      reason: "duplicate_identity",
      points: Math.min(30, 12 + (metrics.duplicateIdentityCount - 2) * 6),
      evidence: { matchingReferralCount: metrics.duplicateIdentityCount },
    });
  }
  if (metrics.repeatedDestinationCount >= 3) {
    signals.push({
      reason: "repeated_destination",
      points: Math.min(20, 10 + (metrics.repeatedDestinationCount - 3) * 3),
      evidence: { matchingInvitationCount: metrics.repeatedDestinationCount },
    });
  }
  if (metrics.recentReferrerCount >= 4) {
    signals.push({
      reason: "suspicious_velocity",
      points: Math.min(25, 10 + (metrics.recentReferrerCount - 4) * 5),
      evidence: {
        referralsFromIdentityIn24Hours: metrics.recentReferrerCount,
        windowHours: 24,
      },
    });
  }
  if (metrics.selfReferral) {
    signals.push({
      reason: "self_referral",
      points: 35,
      evidence: { normalizedIdentityOverlap: true },
    });
  }
  if (metrics.activeRewardCount >= 3) {
    signals.push({
      reason: "reward_stacking",
      points: Math.min(30, 15 + (metrics.activeRewardCount - 3) * 5),
      evidence: { activeRewardCount: metrics.activeRewardCount },
    });
  }
  if (metrics.fingerprintCount !== null && metrics.fingerprintCount >= 3) {
    signals.push({
      reason: "repeated_fingerprint",
      points: Math.min(25, 10 + (metrics.fingerprintCount - 3) * 5),
      evidence: { matchingPrivacySafeFingerprintCount: metrics.fingerprintCount },
    });
  }
  return {
    score: Math.min(
      100,
      signals.reduce((total, signal) => total + signal.points, 0),
    ),
    signals,
    fingerprintEvaluation:
      metrics.fingerprintCount === null ? "not_available" : "evaluated",
  };
}

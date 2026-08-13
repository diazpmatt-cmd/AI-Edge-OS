import type { ReferralDeliveryConfig } from "./referral-delivery.js";

export interface ReferralPilotDeliveryReadiness {
  dryRunAvailable: true;
  liveDeliveryEnabled: boolean;
  liveModeEnabled: boolean;
  emergencyStopEngaged: boolean;
  allowlistConfigured: boolean;
  allowlistCount: number;
  hourlyLimit: number;
  environmentGateOpen: boolean;
  blockers: string[];
}

/**
 * Returns a non-secret operational summary of the referral delivery environment.
 * Never expose allowlisted destinations or credentials through readiness.
 * `environmentGateOpen` is not permission to send; each live destination still
 * must pass the per-delivery allowlist/consent/idempotency gates.
 */
export function buildReferralPilotDeliveryReadiness(
  config: ReferralDeliveryConfig,
): ReferralPilotDeliveryReadiness {
  const liveModeEnabled = config.mode === "live";
  const allowlistCount = config.allowlist.size;
  const allowlistConfigured = allowlistCount > 0;

  const blockers = [
    !config.enabled ? "delivery_disabled" : null,
    config.emergencyStop ? "emergency_stop" : null,
    !liveModeEnabled ? "live_mode_not_enabled" : null,
    !allowlistConfigured ? "pilot_allowlist_empty" : null,
  ].filter((value): value is string => Boolean(value));

  return {
    dryRunAvailable: true,
    liveDeliveryEnabled: config.enabled,
    liveModeEnabled,
    emergencyStopEngaged: config.emergencyStop,
    allowlistConfigured,
    allowlistCount,
    hourlyLimit: config.hourlyLimit,
    environmentGateOpen: blockers.length === 0,
    blockers,
  };
}

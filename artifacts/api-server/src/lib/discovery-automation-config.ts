/**
 * Phase C7 — Discovery Automation Configuration
 *
 * Reads automation settings from environment variables.
 * Disabled by default — automation does NOT start unless
 * DISCOVERY_AUTOMATION_ENABLED=true is explicitly set.
 *
 * Invalid values fail safe (use defaults or disable).
 * No secrets are exposed. Injectable for tests.
 */

export interface DiscoveryAutomationConfig {
  /** Master switch. Default: false. */
  enabled: boolean;
  /** Scheduler polling interval in ms. Default: 60_000 (1 min). */
  pollIntervalMs: number;
  /** Leadership lease duration in ms. Default: 120_000 (2 min). */
  leadershipLeaseDurationMs: number;
  /** Per-occurrence claim lease duration in ms. Default: 300_000 (5 min). */
  claimLeaseDurationMs: number;
  /** Max due schedules claimed per scheduler tick. Default: 5. */
  maxSchedulesPerTick: number;
  /** Max catch-up occurrences dispatched per tick. Default: 3. */
  maxCatchUpExecutions: number;
  /** Emergency stop for all automation. Default: false. */
  globalEmergencyPause: boolean;
  /** Whether the stale-run recovery scan is enabled. Default: true. */
  recoveryEnabled: boolean;
  /** Recovery scan interval in ms. Default: 300_000 (5 min). */
  recoveryScanIntervalMs: number;
  /** Max stale runs reconciled per scan. Default: 10. */
  maxStaleRunsPerScan: number;
}

function parseBool(raw: string | undefined, defaultVal: boolean): boolean {
  if (raw === undefined) return defaultVal;
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return defaultVal;
}

function parseInt10(raw: string | undefined, defaultVal: number, min: number, max: number): number {
  if (raw === undefined) return defaultVal;
  const n = parseInt(raw.trim(), 10);
  if (isNaN(n) || n < min || n > max) return defaultVal;
  return n;
}

export function loadDiscoveryAutomationConfig(
  env: Record<string, string | undefined> = process.env,
): DiscoveryAutomationConfig {
  return {
    enabled:                   parseBool(env.DISCOVERY_AUTOMATION_ENABLED, false),
    pollIntervalMs:            parseInt10(env.DISCOVERY_SCHEDULER_POLL_MS, 60_000, 5_000, 3_600_000),
    leadershipLeaseDurationMs: parseInt10(env.DISCOVERY_SCHEDULER_LEADER_LEASE_MS, 120_000, 10_000, 3_600_000),
    claimLeaseDurationMs:      parseInt10(env.DISCOVERY_SCHEDULER_CLAIM_LEASE_MS, 300_000, 10_000, 7_200_000),
    maxSchedulesPerTick:       parseInt10(env.DISCOVERY_SCHEDULER_MAX_CLAIMS, 5, 1, 100),
    maxCatchUpExecutions:      parseInt10(env.DISCOVERY_SCHEDULER_MAX_CATCHUP, 3, 1, 50),
    globalEmergencyPause:      parseBool(env.DISCOVERY_AUTOMATION_EMERGENCY_PAUSE, false),
    recoveryEnabled:           parseBool(env.DISCOVERY_RECOVERY_ENABLED, true),
    recoveryScanIntervalMs:    parseInt10(env.DISCOVERY_RECOVERY_INTERVAL_MS, 300_000, 30_000, 3_600_000),
    maxStaleRunsPerScan:       parseInt10(env.DISCOVERY_RECOVERY_MAX_STALE, 10, 1, 100),
  };
}

export const DEFAULT_AUTOMATION_CONFIG: Readonly<DiscoveryAutomationConfig> =
  loadDiscoveryAutomationConfig({});

/**
 * Health summary for the automation system.
 * Never exposes secrets, tokens, or internal owner IDs.
 */
export interface AutomationHealthSummary {
  configured:         boolean;
  enabled:            boolean;
  globalPause:        boolean;
  recoveryEnabled:    boolean;
  pollIntervalMs:     number;
  maxSchedulesPerTick: number;
  maxCatchUpExecutions: number;
}

export function describeAutomationConfig(
  cfg: DiscoveryAutomationConfig,
): AutomationHealthSummary {
  return {
    configured:          true,
    enabled:             cfg.enabled,
    globalPause:         cfg.globalEmergencyPause,
    recoveryEnabled:     cfg.recoveryEnabled,
    pollIntervalMs:      cfg.pollIntervalMs,
    maxSchedulesPerTick: cfg.maxSchedulesPerTick,
    maxCatchUpExecutions: cfg.maxCatchUpExecutions,
  };
}

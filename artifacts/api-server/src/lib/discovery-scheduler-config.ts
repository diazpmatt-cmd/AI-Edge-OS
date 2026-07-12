/**
 * C7 Discovery Scheduler — Automation Configuration
 *
 * Disabled by default. Every field has a conservative safe default.
 * Runtime enablement requires DISCOVERY_SCHEDULER_ENABLED=true explicitly.
 *
 * No secrets, credentials, or tenant data are stored here.
 */

export interface SchedulerAutomationConfig {
  /** Master on/off switch. MUST default to false. */
  enabled:              boolean;
  /** How often the scheduler tick runs (ms). Default: 60 s. */
  tickIntervalMs:       number;
  /** How long a leadership lease is held before expiry (ms). Default: 90 s. */
  leadershipTtlMs:      number;
  /** Max schedules to claim and dispatch per tick. Bounds concurrent load. */
  maxSchedulesPerTick:  number;
  /** How long a claimed occurrence's claim is valid before it is recoverable (ms). Default: 5 min. */
  claimTtlMs:           number;
  /**
   * When true, all scheduled runs execute in dry mode regardless of schedule.executionMode.
   * Safe guard for staging / initial rollout — does not call providers.
   */
  dryRunOverride:       boolean;
  /** Consecutive-failure threshold before a schedule is auto-paused. */
  pauseThreshold:       number;
  /** Consecutive-failure threshold before a schedule is error-blocked. */
  errorBlockThreshold:  number;
}

export const DEFAULT_SCHEDULER_CONFIG: Readonly<SchedulerAutomationConfig> = {
  enabled:             false,
  tickIntervalMs:      60_000,
  leadershipTtlMs:     90_000,
  maxSchedulesPerTick: 10,
  claimTtlMs:          5 * 60 * 1000,
  dryRunOverride:      false,
  pauseThreshold:      3,
  errorBlockThreshold: 10,
};

export interface SchedulerConfigValidationResult {
  valid:  boolean;
  errors: string[];
}

export function validateSchedulerConfig(
  cfg: SchedulerAutomationConfig,
): SchedulerConfigValidationResult {
  const errors: string[] = [];

  if (cfg.tickIntervalMs < 5_000) {
    errors.push("tickIntervalMs must be ≥5000ms (5 seconds)");
  }
  if (cfg.leadershipTtlMs < cfg.tickIntervalMs) {
    errors.push("leadershipTtlMs must be ≥ tickIntervalMs to prevent leadership churn");
  }
  if (cfg.maxSchedulesPerTick < 1 || cfg.maxSchedulesPerTick > 100) {
    errors.push("maxSchedulesPerTick must be between 1 and 100");
  }
  if (cfg.claimTtlMs < 60_000) {
    errors.push("claimTtlMs must be ≥60000ms (1 minute)");
  }
  if (cfg.pauseThreshold < 1) {
    errors.push("pauseThreshold must be ≥1");
  }
  if (cfg.errorBlockThreshold <= cfg.pauseThreshold) {
    errors.push("errorBlockThreshold must be > pauseThreshold");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Load scheduler config from environment variables.
 * All values fall back to DEFAULT_SCHEDULER_CONFIG when the env var is absent or invalid.
 * The scheduler remains DISABLED unless DISCOVERY_SCHEDULER_ENABLED=true is set explicitly.
 */
export function loadSchedulerConfig(): SchedulerAutomationConfig {
  function safeInt(raw: string | undefined, fallback: number): number {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  return {
    enabled:             process.env.DISCOVERY_SCHEDULER_ENABLED === "true",
    tickIntervalMs:      safeInt(process.env.DISCOVERY_SCHEDULER_TICK_MS,           DEFAULT_SCHEDULER_CONFIG.tickIntervalMs),
    leadershipTtlMs:     safeInt(process.env.DISCOVERY_SCHEDULER_LEADERSHIP_TTL_MS, DEFAULT_SCHEDULER_CONFIG.leadershipTtlMs),
    maxSchedulesPerTick: safeInt(process.env.DISCOVERY_SCHEDULER_MAX_PER_TICK,      DEFAULT_SCHEDULER_CONFIG.maxSchedulesPerTick),
    claimTtlMs:          safeInt(process.env.DISCOVERY_SCHEDULER_CLAIM_TTL_MS,      DEFAULT_SCHEDULER_CONFIG.claimTtlMs),
    dryRunOverride:      process.env.DISCOVERY_SCHEDULER_DRY_OVERRIDE === "true",
    pauseThreshold:      safeInt(process.env.DISCOVERY_SCHEDULER_PAUSE_THRESHOLD,   DEFAULT_SCHEDULER_CONFIG.pauseThreshold),
    errorBlockThreshold: safeInt(process.env.DISCOVERY_SCHEDULER_ERROR_BLOCK_THRESHOLD, DEFAULT_SCHEDULER_CONFIG.errorBlockThreshold),
  };
}

/**
 * C7 Discovery Scheduler — Runtime Loop
 *
 * Wraps runSchedulerTick() in a setInterval loop. Disabled by default —
 * will not start unless config.enabled === true.
 *
 * Usage (api-server startup):
 *
 *   import { createDiscoverySchedulerRuntime } from "./lib/discovery-scheduler-runtime.js";
 *   const discoveryScheduler = createDiscoverySchedulerRuntime();
 *   if (process.env.DISCOVERY_SCHEDULER_ENABLED === "true") {
 *     discoveryScheduler.start();
 *   }
 *
 * The runtime never starts automatically on import.
 */

import { createHash } from "node:crypto";
import { hostname } from "node:os";
import { pool as defaultPool } from "@workspace/db";
import {
  loadSchedulerConfig,
  validateSchedulerConfig,
  DEFAULT_SCHEDULER_CONFIG,
} from "./discovery-scheduler-config.js";
import type { SchedulerAutomationConfig } from "./discovery-scheduler-config.js";
import { runSchedulerTick } from "./discovery-scheduler-tick.js";
import { DiscoveryExecutionService } from "./discovery-execution-service.js";
import type { SchedulerTickSummary } from "@workspace/db";

type Pool = typeof defaultPool;

// ── State ─────────────────────────────────────────────────────────────────────

export interface SchedulerRuntimeState {
  running:          boolean;
  enabled:          boolean;
  ownerId:          string;
  tickCount:        number;
  lastTickAt:       Date | null;
  lastTickSummary:  SchedulerTickSummary | null;
  lastError:        string | null;
}

// ── Runtime ───────────────────────────────────────────────────────────────────

export interface DiscoverySchedulerRuntime {
  start():           void;
  stop():            void;
  getState():        SchedulerRuntimeState;
  runOnce():         Promise<SchedulerTickSummary>;
}

export function createDiscoverySchedulerRuntime(
  overrideConfig?:   SchedulerAutomationConfig,
  overridePool?:     Pool,
  overrideService?:  DiscoveryExecutionService,
): DiscoverySchedulerRuntime {
  const config  = overrideConfig  ?? loadSchedulerConfig();
  const pool    = overridePool    ?? defaultPool;
  const service = overrideService ?? new DiscoveryExecutionService();

  const ownerId = deriveRuntimeOwnerId();

  let timer:   ReturnType<typeof setInterval> | null = null;
  const state: SchedulerRuntimeState = {
    running:         false,
    enabled:         config.enabled,
    ownerId,
    tickCount:       0,
    lastTickAt:      null,
    lastTickSummary: null,
    lastError:       null,
  };

  async function tick(): Promise<void> {
    try {
      const summary = await runSchedulerTick({ pool, config, executionService: service, ownerId });
      state.tickCount       += 1;
      state.lastTickAt       = new Date();
      state.lastTickSummary  = summary;
      state.lastError        = null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      state.lastError = msg;
      console.error("[DISCOVERY-SCHEDULER-RUNTIME] tick error:", msg);
    }
  }

  return {
    start(): void {
      if (!config.enabled) {
        console.warn(
          "[DISCOVERY-SCHEDULER-RUNTIME] start() called but scheduler is disabled. " +
          "Set DISCOVERY_SCHEDULER_ENABLED=true to enable.",
        );
        return;
      }
      if (state.running) {
        console.warn("[DISCOVERY-SCHEDULER-RUNTIME] already running — ignoring duplicate start()");
        return;
      }

      const validation = validateSchedulerConfig(config);
      if (!validation.valid) {
        console.error(
          "[DISCOVERY-SCHEDULER-RUNTIME] invalid config — scheduler not started:",
          validation.errors,
        );
        return;
      }

      state.running = true;
      console.log(
        `[DISCOVERY-SCHEDULER-RUNTIME] starting (ownerId=${ownerId}, ` +
        `tickInterval=${config.tickIntervalMs}ms, dryOverride=${config.dryRunOverride})`,
      );

      void tick();
      timer = setInterval(() => { void tick(); }, config.tickIntervalMs);
    },

    stop(): void {
      if (!state.running) return;
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      state.running = false;
      console.log("[DISCOVERY-SCHEDULER-RUNTIME] stopped");
    },

    getState(): SchedulerRuntimeState {
      return { ...state };
    },

    async runOnce(): Promise<SchedulerTickSummary> {
      const summary = await runSchedulerTick({ pool, config, executionService: service, ownerId });
      state.tickCount       += 1;
      state.lastTickAt       = new Date();
      state.lastTickSummary  = summary;
      return summary;
    },
  };
}

// ── Internal ──────────────────────────────────────────────────────────────────

function deriveRuntimeOwnerId(): string {
  const host   = (() => { try { return hostname(); } catch { return "unknown"; } })();
  const seed   = `${host}::${process.pid}::${Date.now()}`;
  const hash   = createHash("sha256").update(seed).digest("hex");
  return `runtime::${hash.slice(0, 16)}`;
}

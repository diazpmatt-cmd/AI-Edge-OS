/**
 * C8R-9 — Unit tests for the backlink scheduler config pure functions.
 *
 * The monitor itself (runBacklinkSchedulerMonitor) performs DB + fetch I/O,
 * so it is integration-tested indirectly via the route behavioral pattern.
 * Here we test the pure config functions it depends on from @workspace/db.
 */

import { describe, test, expect } from "vitest";
import {
  parseBacklinkScheduleFrequency,
  isBacklinkScheduleFrequency,
  calcNextRunAt,
  backoffMs,
  shouldAutoDisable,
  calcNextRetryAt,
  parseBacklinkSchedulerEnvConfig,
  DEFAULT_BACKLINK_SCHEDULER_CONFIG,
  BACKLINK_SCHEDULE_FREQUENCY_HOURS,
  scoreHistoryRetentionCutoff,
  BACKLINK_SCORE_HISTORY_RETENTION_DAYS,
} from "@workspace/db";

// ── isBacklinkScheduleFrequency ───────────────────────────────────────────────

describe("isBacklinkScheduleFrequency", () => {
  test("daily is valid", () => expect(isBacklinkScheduleFrequency("daily")).toBe(true));
  test("weekly is valid", () => expect(isBacklinkScheduleFrequency("weekly")).toBe(true));
  test("biweekly is valid", () => expect(isBacklinkScheduleFrequency("biweekly")).toBe(true));
  test("monthly is not valid", () => expect(isBacklinkScheduleFrequency("monthly")).toBe(false));
  test("empty string is not valid", () => expect(isBacklinkScheduleFrequency("")).toBe(false));
  test("null is not valid", () => expect(isBacklinkScheduleFrequency(null)).toBe(false));
  test("number is not valid", () => expect(isBacklinkScheduleFrequency(7)).toBe(false));
});

// ── parseBacklinkScheduleFrequency ───────────────────────────────────────────

describe("parseBacklinkScheduleFrequency", () => {
  test("returns daily for 'daily'", () => expect(parseBacklinkScheduleFrequency("daily")).toBe("daily"));
  test("returns weekly for 'weekly'", () => expect(parseBacklinkScheduleFrequency("weekly")).toBe("weekly"));
  test("returns biweekly for 'biweekly'", () => expect(parseBacklinkScheduleFrequency("biweekly")).toBe("biweekly"));
  test("falls back to weekly for null", () => expect(parseBacklinkScheduleFrequency(null)).toBe("weekly"));
  test("falls back to weekly for undefined", () => expect(parseBacklinkScheduleFrequency(undefined)).toBe("weekly"));
  test("falls back to weekly for unknown string", () => expect(parseBacklinkScheduleFrequency("monthly")).toBe("weekly"));
  test("falls back to weekly for empty string", () => expect(parseBacklinkScheduleFrequency("")).toBe("weekly"));
});

// ── calcNextRunAt ─────────────────────────────────────────────────────────────

describe("calcNextRunAt", () => {
  const base = new Date("2026-07-19T10:00:00Z");

  test("daily adds 24 hours", () => {
    const next = calcNextRunAt("daily", base);
    const diff  = next.getTime() - base.getTime();
    expect(diff).toBe(BACKLINK_SCHEDULE_FREQUENCY_HOURS.daily * 60 * 60 * 1000);
  });
  test("weekly adds 168 hours", () => {
    const next = calcNextRunAt("weekly", base);
    const diff  = next.getTime() - base.getTime();
    expect(diff).toBe(BACKLINK_SCHEDULE_FREQUENCY_HOURS.weekly * 60 * 60 * 1000);
  });
  test("biweekly adds 336 hours", () => {
    const next = calcNextRunAt("biweekly", base);
    const diff  = next.getTime() - base.getTime();
    expect(diff).toBe(BACKLINK_SCHEDULE_FREQUENCY_HOURS.biweekly * 60 * 60 * 1000);
  });
  test("result is always strictly after the reference date", () => {
    for (const freq of ["daily", "weekly", "biweekly"] as const) {
      expect(calcNextRunAt(freq, base).getTime()).toBeGreaterThan(base.getTime());
    }
  });
  test("does not mutate the input date", () => {
    const frozen = new Date("2026-07-19T10:00:00Z");
    calcNextRunAt("weekly", frozen);
    expect(frozen.toISOString()).toBe("2026-07-19T10:00:00.000Z");
  });
});

// ── backoffMs ─────────────────────────────────────────────────────────────────

describe("backoffMs", () => {
  const BASE = 30 * 60 * 1000;   // 30 min
  const CAP  = 6 * 60 * 60 * 1000; // 6 h

  test("0 failures returns base delay", () => {
    expect(backoffMs(0)).toBe(BASE);
  });
  test("1 failure returns base delay (2^0 = 1)", () => {
    expect(backoffMs(1)).toBe(BASE);
  });
  test("2 failures returns 2× base", () => {
    expect(backoffMs(2)).toBe(BASE * 2);
  });
  test("3 failures returns 4× base", () => {
    expect(backoffMs(3)).toBe(BASE * 4);
  });
  test("large failure count is capped at maxMs", () => {
    expect(backoffMs(20)).toBe(CAP);
  });
  test("custom base and cap are respected", () => {
    const customBase = 10_000;
    const customCap  = 30_000;
    expect(backoffMs(3, customBase, customCap)).toBe(customCap);
  });
  test("negative failure count behaves like 0", () => {
    expect(backoffMs(-1)).toBe(BASE);
  });
  test("result is always positive", () => {
    for (let i = 0; i < 10; i++) {
      expect(backoffMs(i)).toBeGreaterThan(0);
    }
  });
});

// ── shouldAutoDisable ─────────────────────────────────────────────────────────

describe("shouldAutoDisable", () => {
  test("fires when failures === maxRetries", () => {
    expect(shouldAutoDisable(3, 3)).toBe(true);
  });
  test("fires when failures exceed maxRetries", () => {
    expect(shouldAutoDisable(5, 3)).toBe(true);
  });
  test("does not fire when failures are below maxRetries", () => {
    expect(shouldAutoDisable(2, 3)).toBe(false);
  });
  test("fires at failure=1 when maxRetries=1", () => {
    expect(shouldAutoDisable(1, 1)).toBe(true);
  });
  test("does not fire at failure=0 regardless of maxRetries", () => {
    expect(shouldAutoDisable(0, 1)).toBe(false);
  });
  test("treats maxRetries=0 as effectively 1 (minimum 1)", () => {
    expect(shouldAutoDisable(1, 0)).toBe(true);
  });
  test("does not fire at failure=0 with maxRetries=0", () => {
    expect(shouldAutoDisable(0, 0)).toBe(false);
  });
});

// ── calcNextRetryAt ───────────────────────────────────────────────────────────

describe("calcNextRetryAt", () => {
  const now = new Date("2026-07-19T12:00:00Z");

  test("returns null when auto-disable fires", () => {
    expect(calcNextRetryAt(3, 3, now)).toBeNull();
  });
  test("returns a future date when below maxRetries", () => {
    const next = calcNextRetryAt(1, 3, now);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThan(now.getTime());
  });
  test("delay increases with consecutive failures", () => {
    const next1 = calcNextRetryAt(1, 5, now)!.getTime() - now.getTime();
    const next2 = calcNextRetryAt(2, 5, now)!.getTime() - now.getTime();
    expect(next2).toBeGreaterThan(next1);
  });
});

// ── parseBacklinkSchedulerEnvConfig ──────────────────────────────────────────

describe("parseBacklinkSchedulerEnvConfig", () => {
  test("enabled defaults to false when env var absent", () => {
    const cfg = parseBacklinkSchedulerEnvConfig({});
    expect(cfg.enabled).toBe(false);
  });
  test("enabled=true when env var set to 'true'", () => {
    const cfg = parseBacklinkSchedulerEnvConfig({ BACKLINK_SCHEDULER_ENABLED: "true" });
    expect(cfg.enabled).toBe(true);
  });
  test("enabled=false for any other value", () => {
    const cfg = parseBacklinkSchedulerEnvConfig({ BACKLINK_SCHEDULER_ENABLED: "yes" });
    expect(cfg.enabled).toBe(false);
  });
  test("tickIntervalMs falls back to default for invalid input", () => {
    const cfg = parseBacklinkSchedulerEnvConfig({ BACKLINK_SCHEDULER_TICK_MS: "abc" });
    expect(cfg.tickIntervalMs).toBe(DEFAULT_BACKLINK_SCHEDULER_CONFIG.tickIntervalMs);
  });
  test("tickIntervalMs is parsed when valid", () => {
    const cfg = parseBacklinkSchedulerEnvConfig({ BACKLINK_SCHEDULER_TICK_MS: "60000" });
    expect(cfg.tickIntervalMs).toBe(60000);
  });
  test("maxPerTick falls back to default for zero", () => {
    const cfg = parseBacklinkSchedulerEnvConfig({ BACKLINK_SCHEDULER_MAX_PER_TICK: "0" });
    expect(cfg.maxPerTick).toBe(DEFAULT_BACKLINK_SCHEDULER_CONFIG.maxPerTick);
  });
  test("maxPerTick is parsed when positive", () => {
    const cfg = parseBacklinkSchedulerEnvConfig({ BACKLINK_SCHEDULER_MAX_PER_TICK: "10" });
    expect(cfg.maxPerTick).toBe(10);
  });
  test("all defaults match DEFAULT_BACKLINK_SCHEDULER_CONFIG", () => {
    const cfg = parseBacklinkSchedulerEnvConfig({});
    expect(cfg).toMatchObject(DEFAULT_BACKLINK_SCHEDULER_CONFIG);
  });
});

// ── scoreHistoryRetentionCutoff ───────────────────────────────────────────────

describe("scoreHistoryRetentionCutoff", () => {
  test("returns a date 90 days before 'now'", () => {
    const now    = new Date("2026-07-19T00:00:00Z");
    const cutoff = scoreHistoryRetentionCutoff(now);
    const diff   = now.getTime() - cutoff.getTime();
    const days   = diff / (24 * 60 * 60 * 1000);
    expect(Math.round(days)).toBe(BACKLINK_SCORE_HISTORY_RETENTION_DAYS);
  });
  test("does not mutate the input date", () => {
    const now = new Date("2026-07-19T12:00:00Z");
    scoreHistoryRetentionCutoff(now);
    expect(now.toISOString()).toBe("2026-07-19T12:00:00.000Z");
  });
  test("cutoff is always before now", () => {
    const now = new Date();
    expect(scoreHistoryRetentionCutoff(now).getTime()).toBeLessThan(now.getTime());
  });
});

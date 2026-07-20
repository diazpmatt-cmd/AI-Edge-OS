/**
 * C9R-5 — Unit tests for AI Visibility Scheduler config pure functions.
 *
 * Tests all exported pure helpers from ai-visibility-scan-history-types.ts
 * (exported via @workspace/db).  No DB or fetch I/O — pure function tests only.
 */

import { describe, test, expect } from "vitest";
import {
  parseAiScheduleFrequency,
  calcAiVisibilityNextRunAt,
  aiVisibilityBackoffMs,
  aiVisibilityShouldAutoDisable,
  parseAiVisibilitySchedulerEnvConfig,
} from "@workspace/db";

// ── parseAiScheduleFrequency ──────────────────────────────────────────────────

describe("parseAiScheduleFrequency", () => {
  test("returns daily for 'daily'",     () => expect(parseAiScheduleFrequency("daily")).toBe("daily"));
  test("returns weekly for 'weekly'",   () => expect(parseAiScheduleFrequency("weekly")).toBe("weekly"));
  test("returns biweekly for 'biweekly'", () => expect(parseAiScheduleFrequency("biweekly")).toBe("biweekly"));
  test("returns monthly for 'monthly'", () => expect(parseAiScheduleFrequency("monthly")).toBe("monthly"));
  test("falls back to weekly for unknown string", () => expect(parseAiScheduleFrequency("hourly")).toBe("weekly"));
  test("falls back to weekly for empty string",   () => expect(parseAiScheduleFrequency("")).toBe("weekly"));
  test("falls back to weekly for null-ish value", () => expect(parseAiScheduleFrequency("DAILY")).toBe("weekly"));
});

// ── calcAiVisibilityNextRunAt ─────────────────────────────────────────────────

describe("calcAiVisibilityNextRunAt", () => {
  const base = new Date("2026-07-19T10:00:00Z");

  test("daily adds 24 h", () => {
    const diff = calcAiVisibilityNextRunAt("daily", base).getTime() - base.getTime();
    expect(diff).toBe(24 * 60 * 60 * 1000);
  });

  test("weekly adds 7 days", () => {
    const diff = calcAiVisibilityNextRunAt("weekly", base).getTime() - base.getTime();
    expect(diff).toBe(7 * 24 * 60 * 60 * 1000);
  });

  test("biweekly adds 14 days", () => {
    const diff = calcAiVisibilityNextRunAt("biweekly", base).getTime() - base.getTime();
    expect(diff).toBe(14 * 24 * 60 * 60 * 1000);
  });

  test("monthly adds 30 days", () => {
    const diff = calcAiVisibilityNextRunAt("monthly", base).getTime() - base.getTime();
    expect(diff).toBe(30 * 24 * 60 * 60 * 1000);
  });

  test("result is always strictly after base date", () => {
    for (const freq of ["daily", "weekly", "biweekly", "monthly"] as const) {
      expect(calcAiVisibilityNextRunAt(freq, base).getTime()).toBeGreaterThan(base.getTime());
    }
  });

  test("does not mutate input date", () => {
    const frozen = new Date("2026-07-19T10:00:00Z");
    calcAiVisibilityNextRunAt("weekly", frozen);
    expect(frozen.toISOString()).toBe("2026-07-19T10:00:00.000Z");
  });
});

// ── aiVisibilityBackoffMs ─────────────────────────────────────────────────────

describe("aiVisibilityBackoffMs", () => {
  test("1 failure → 2 min", () => {
    expect(aiVisibilityBackoffMs(1)).toBe(2 * 60 * 1000);
  });
  test("2 failures → 4 min", () => {
    expect(aiVisibilityBackoffMs(2)).toBe(4 * 60 * 1000);
  });
  test("3 failures → 8 min", () => {
    expect(aiVisibilityBackoffMs(3)).toBe(8 * 60 * 1000);
  });
  test("clamped at 8 consecutive failures max (2^8 × 60s = 256 min)", () => {
    const maxCap = Math.pow(2, 8) * 60 * 1000; // 15360000 ms
    expect(aiVisibilityBackoffMs(100)).toBe(maxCap);
    expect(aiVisibilityBackoffMs(9)).toBe(maxCap);
    expect(aiVisibilityBackoffMs(8)).toBe(maxCap);
  });
  test("0 failures → 1 min (2^0 * 60 * 1000)", () => {
    expect(aiVisibilityBackoffMs(0)).toBe(1 * 60 * 1000);
  });
});

// ── aiVisibilityShouldAutoDisable ─────────────────────────────────────────────

describe("aiVisibilityShouldAutoDisable", () => {
  test("false when failures below maxRetries",    () => expect(aiVisibilityShouldAutoDisable(2, 3)).toBe(false));
  test("true when failures equals maxRetries",    () => expect(aiVisibilityShouldAutoDisable(3, 3)).toBe(true));
  test("true when failures exceeds maxRetries",   () => expect(aiVisibilityShouldAutoDisable(5, 3)).toBe(true));
  test("false when maxRetries is 0 but failures also 0", () => expect(aiVisibilityShouldAutoDisable(0, 0)).toBe(true));
});

// ── parseAiVisibilitySchedulerEnvConfig ──────────────────────────────────────

describe("parseAiVisibilitySchedulerEnvConfig", () => {
  test("enabled is false by default", () => {
    delete process.env.AI_VISIBILITY_SCHEDULER_ENABLED;
    const cfg = parseAiVisibilitySchedulerEnvConfig();
    expect(cfg.enabled).toBe(false);
  });

  test("enabled is true when env var is 'true'", () => {
    process.env.AI_VISIBILITY_SCHEDULER_ENABLED = "true";
    const cfg = parseAiVisibilitySchedulerEnvConfig();
    expect(cfg.enabled).toBe(true);
    delete process.env.AI_VISIBILITY_SCHEDULER_ENABLED;
  });

  test("maxPerTick defaults to 5", () => {
    delete process.env.AI_VISIBILITY_SCHEDULER_MAX_PER_TICK;
    const cfg = parseAiVisibilitySchedulerEnvConfig();
    expect(cfg.maxPerTick).toBe(5);
  });

  test("maxPerTick is clamped to 20", () => {
    process.env.AI_VISIBILITY_SCHEDULER_MAX_PER_TICK = "999";
    const cfg = parseAiVisibilitySchedulerEnvConfig();
    expect(cfg.maxPerTick).toBe(20);
    delete process.env.AI_VISIBILITY_SCHEDULER_MAX_PER_TICK;
  });

  test("maxPerTick is clamped to minimum 1", () => {
    process.env.AI_VISIBILITY_SCHEDULER_MAX_PER_TICK = "0";
    const cfg = parseAiVisibilitySchedulerEnvConfig();
    expect(cfg.maxPerTick).toBe(1);
    delete process.env.AI_VISIBILITY_SCHEDULER_MAX_PER_TICK;
  });
});

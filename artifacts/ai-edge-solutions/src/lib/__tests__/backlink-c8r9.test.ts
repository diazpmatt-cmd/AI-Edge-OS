/**
 * C8R-9 — Pure-function unit tests for backlink scheduler config and history helpers.
 *
 * All tests are hermetic — no DB, no network, no imports from @workspace/db.
 * Tests cover functions exported from:
 *   - artifacts/ai-edge-solutions/src/lib/backlink-ui-helpers.ts
 *   - lib/db/src/backlink-scheduler-config.ts   (via helpers re-export)
 *   - lib/db/src/backlink-history.ts            (via helpers re-export)
 */

import { describe, test, expect } from "vitest";
import {
  formatRelativeTime,
  scheduleFrequencyLabel,
  scheduledRunStatusConfig,
  buildSparklinePoints,
  formatScoreDelta,
  providerHealthColor,
} from "../backlink-ui-helpers";

// ── formatRelativeTime ─────────────────────────────────────────────────────────

describe("formatRelativeTime", () => {
  test("returns Never for null", () => {
    expect(formatRelativeTime(null)).toBe("Never");
  });
  test("returns Never for undefined", () => {
    expect(formatRelativeTime(undefined)).toBe("Never");
  });
  test("returns Unknown for invalid date string", () => {
    expect(formatRelativeTime("not-a-date")).toBe("Unknown");
  });
  test("returns Just now for timestamps within 60 seconds", () => {
    const ts = new Date(Date.now() - 30 * 1000).toISOString();
    expect(formatRelativeTime(ts)).toBe("Just now");
  });
  test("returns minutes ago for recent timestamps", () => {
    const ts = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(ts)).toBe("5m ago");
  });
  test("returns hours ago for same-day timestamps", () => {
    const ts = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(ts)).toBe("3h ago");
  });
  test("returns days ago for recent past", () => {
    const ts = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(ts)).toBe("5d ago");
  });
  test("returns months ago for old timestamps", () => {
    const ts = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(ts)).toBe("2mo ago");
  });
  test("accepts a Date object", () => {
    const d = new Date(Date.now() - 2 * 60 * 1000);
    expect(formatRelativeTime(d)).toBe("2m ago");
  });
});

// ── scheduleFrequencyLabel ────────────────────────────────────────────────────

describe("scheduleFrequencyLabel", () => {
  test("maps daily correctly", () => {
    expect(scheduleFrequencyLabel("daily")).toBe("Daily");
  });
  test("maps weekly correctly", () => {
    expect(scheduleFrequencyLabel("weekly")).toBe("Weekly");
  });
  test("maps biweekly correctly", () => {
    expect(scheduleFrequencyLabel("biweekly")).toBe("Every 2 Weeks");
  });
  test("returns unknown values as-is", () => {
    expect(scheduleFrequencyLabel("monthly")).toBe("monthly");
  });
  test("returns Not set for null", () => {
    expect(scheduleFrequencyLabel(null)).toBe("Not set");
  });
  test("returns Not set for undefined", () => {
    expect(scheduleFrequencyLabel(undefined)).toBe("Not set");
  });
  test("returns Not set for empty string", () => {
    expect(scheduleFrequencyLabel("")).toBe("Not set");
  });
});

// ── scheduledRunStatusConfig ──────────────────────────────────────────────────

describe("scheduledRunStatusConfig", () => {
  test("succeeded has green colour", () => {
    const cfg = scheduledRunStatusConfig("succeeded");
    expect(cfg.color).toBe("#22C55E");
    expect(cfg.icon).toBe("✓");
    expect(cfg.label).toBe("Succeeded");
  });
  test("failed has red colour", () => {
    const cfg = scheduledRunStatusConfig("failed");
    expect(cfg.color).toBe("#EF4444");
    expect(cfg.icon).toBe("✕");
  });
  test("provider_unavailable has amber colour", () => {
    const cfg = scheduledRunStatusConfig("provider_unavailable");
    expect(cfg.color).toBe("#F59E0B");
    expect(cfg.icon).toBe("⚠");
  });
  test("null returns neutral colour", () => {
    const cfg = scheduledRunStatusConfig(null);
    expect(cfg.color).toBe("#475569");
  });
  test("unknown status returns the status as label", () => {
    const cfg = scheduledRunStatusConfig("custom_status");
    expect(cfg.label).toBe("custom_status");
  });
});

// ── buildSparklinePoints ──────────────────────────────────────────────────────

describe("buildSparklinePoints", () => {
  test("empty array returns empty string", () => {
    expect(buildSparklinePoints([], 100, 40)).toBe("");
  });
  test("single value returns horizontal line", () => {
    const pts = buildSparklinePoints([50], 100, 40);
    expect(pts).toBe("0,20 100,20");
  });
  test("two-value increasing series produces valid points", () => {
    const pts = buildSparklinePoints([0, 100], 100, 40);
    const parts = pts.split(" ");
    expect(parts).toHaveLength(2);
    const [x0, y0] = parts[0]!.split(",").map(Number);
    const [x1, y1] = parts[1]!.split(",").map(Number);
    expect(x0).toBe(0);
    expect(x1).toBe(100);
    expect(y0).toBeGreaterThan(y1!); // 0 is below 100 in SVG (inverted y-axis)
  });
  test("all-equal values produce a flat line", () => {
    const pts = buildSparklinePoints([30, 30, 30], 100, 40);
    const rows = pts.split(" ").map(p => p.split(",").map(Number));
    const ys   = rows.map(r => r[1]);
    expect(ys.every(y => y === ys[0]!)).toBe(true);
  });
  test("produces correct number of points for N-element input", () => {
    const pts = buildSparklinePoints([10, 20, 30, 40, 50], 200, 50);
    const count = pts.split(" ").length;
    expect(count).toBe(5);
  });
  test("all x coordinates are within viewport width", () => {
    const pts = buildSparklinePoints([5, 10, 15], 200, 50);
    const xs  = pts.split(" ").map(p => Number(p.split(",")[0]!));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(200);
  });
  test("all y coordinates are within viewport height", () => {
    const pts = buildSparklinePoints([0, 50, 100], 100, 40);
    const ys  = pts.split(" ").map(p => Number(p.split(",")[1]!));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(40);
  });
});

// ── formatScoreDelta ──────────────────────────────────────────────────────────

describe("formatScoreDelta", () => {
  test("positive delta shows + prefix", () => {
    expect(formatScoreDelta(5)).toBe("+5");
  });
  test("negative delta shows - prefix", () => {
    expect(formatScoreDelta(-3)).toBe("-3");
  });
  test("zero delta shows ±0", () => {
    expect(formatScoreDelta(0)).toBe("±0");
  });
  test("large positive value", () => {
    expect(formatScoreDelta(42)).toBe("+42");
  });
  test("large negative value", () => {
    expect(formatScoreDelta(-100)).toBe("-100");
  });
});

// ── providerHealthColor ───────────────────────────────────────────────────────

describe("providerHealthColor", () => {
  test("ready maps to green", () => {
    expect(providerHealthColor("ready")).toBe("#22C55E");
  });
  test("degraded maps to amber", () => {
    expect(providerHealthColor("degraded")).toBe("#F59E0B");
  });
  test("unavailable maps to red", () => {
    expect(providerHealthColor("unavailable")).toBe("#EF4444");
  });
  test("undefined maps to neutral grey", () => {
    expect(providerHealthColor(undefined)).toBe("#64748B");
  });
  test("unknown status maps to neutral grey", () => {
    expect(providerHealthColor("checking")).toBe("#64748B");
  });
});

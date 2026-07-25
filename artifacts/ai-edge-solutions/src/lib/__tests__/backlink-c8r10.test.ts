/**
 * C8R-10 — Authority & Backlink v1 Acceptance: Frontend Hardening Tests
 *
 * Tests added during the v1 acceptance audit:
 *   1. runStatusColor maps "succeeded" (not "completed") — BUG-3 fix
 *   2. buildSparklinePoints boundary conditions
 *   3. formatRelativeTime robustness
 *   4. providerHealthColor exhaustive coverage
 *   5. computeBacklinkScore edge cases
 *   6. scheduleFrequencyLabel all values
 *   7. scheduledRunStatusConfig all statuses
 *   8. formatScoreDelta signed formatting
 */

import { describe, test, expect, vi, afterEach } from "vitest";
import {
  runStatusColor,
  buildSparklinePoints,
  formatRelativeTime,
  providerHealthColor,
  computeBacklinkScore,
  scheduleFrequencyLabel,
  scheduledRunStatusConfig,
  formatScoreDelta,
  wfStatusColor,
  attainabilityColor,
  oppCategoryLabel,
  isPageEnd,
  shortRunId,
  formatRunSummary,
} from "../backlink-ui-helpers";

// ── runStatusColor ─────────────────────────────────────────────────────────────

describe("runStatusColor (C8R-10 BUG-3 fix)", () => {
  test("'succeeded' returns green (#22C55E)", () => {
    expect(runStatusColor("succeeded")).toBe("#22C55E");
  });
  test("'completed' still returns green for backward compat", () => {
    expect(runStatusColor("completed")).toBe("#22C55E");
  });
  test("'failed' returns red", () => {
    expect(runStatusColor("failed")).toBe("#EF4444");
  });
  test("'running' returns blue", () => {
    expect(runStatusColor("running")).toBe("#38BDF8");
  });
  test("'in_progress' returns blue", () => {
    expect(runStatusColor("in_progress")).toBe("#38BDF8");
  });
  test("unknown status returns slate", () => {
    expect(runStatusColor("unknown")).toBe("#64748B");
    expect(runStatusColor("")).toBe("#64748B");
  });
});

// ── buildSparklinePoints ───────────────────────────────────────────────────────

describe("buildSparklinePoints", () => {
  test("empty array returns empty string", () => {
    expect(buildSparklinePoints([], 100, 40)).toBe("");
  });
  test("single value returns a flat horizontal line", () => {
    const pts = buildSparklinePoints([50], 100, 40);
    expect(pts).toBe("0,20 100,20");
  });
  test("two equal values returns a flat line", () => {
    const pts = buildSparklinePoints([10, 10], 100, 40);
    expect(pts).toContain(",");
    expect(pts.split(" ")).toHaveLength(2);
  });
  test("ascending values produce decreasing y coordinates (SVG y-down)", () => {
    const pts = buildSparklinePoints([0, 100], 100, 40);
    const [, p2] = pts.split(" ");
    const y2 = parseInt(p2!.split(",")[1]!);
    expect(y2).toBe(0);
  });
  test("produces correct point count for N values", () => {
    const pts = buildSparklinePoints([1, 2, 3, 4, 5], 200, 50);
    expect(pts.split(" ")).toHaveLength(5);
  });
  test("all x coordinates are within [0, width]", () => {
    const pts = buildSparklinePoints([10, 20, 30, 40, 50], 200, 50);
    for (const pt of pts.split(" ")) {
      const x = parseInt(pt.split(",")[0]!);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(200);
    }
  });
});

// ── formatRelativeTime ────────────────────────────────────────────────────────

describe("formatRelativeTime", () => {
  afterEach(() => vi.useRealTimers());

  test("null → 'Never'", () => {
    expect(formatRelativeTime(null)).toBe("Never");
  });
  test("undefined → 'Never'", () => {
    expect(formatRelativeTime(undefined)).toBe("Never");
  });
  test("invalid ISO → 'Unknown'", () => {
    expect(formatRelativeTime("not-a-date")).toBe("Unknown");
  });
  test("< 60s → 'Just now'", () => {
    vi.useFakeTimers();
    const now = new Date("2026-07-19T12:00:30Z");
    vi.setSystemTime(new Date("2026-07-19T12:00:55Z"));
    expect(formatRelativeTime(now)).toBe("Just now");
  });
  test("60–3599s → '14m ago' style", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-19T12:15:00Z"));
    expect(formatRelativeTime("2026-07-19T12:00:00Z")).toBe("15m ago");
  });
  test("3600–86399s → '3h ago' style", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-19T15:00:00Z"));
    expect(formatRelativeTime("2026-07-19T12:00:00Z")).toBe("3h ago");
  });
  test("1–29 days → '5d ago' style", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T12:00:00Z"));
    expect(formatRelativeTime("2026-07-19T12:00:00Z")).toBe("5d ago");
  });
  test(">= 30 days → 'Nmo ago' style", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-19T12:00:00Z"));
    expect(formatRelativeTime("2026-07-19T12:00:00Z")).toBe("1mo ago");
  });
});

// ── providerHealthColor ───────────────────────────────────────────────────────

describe("providerHealthColor", () => {
  test("'ready' → green", () => {
    expect(providerHealthColor("ready")).toBe("#22C55E");
  });
  test("'degraded' → amber", () => {
    expect(providerHealthColor("degraded")).toBe("#F59E0B");
  });
  test("'unavailable' → red", () => {
    expect(providerHealthColor("unavailable")).toBe("#EF4444");
  });
  test("unknown → slate", () => {
    expect(providerHealthColor(undefined)).toBe("#64748B");
    expect(providerHealthColor("unknown")).toBe("#64748B");
  });
});

// ── computeBacklinkScore ──────────────────────────────────────────────────────

describe("computeBacklinkScore", () => {
  test("empty array → 0", () => {
    expect(computeBacklinkScore([])).toBe(0);
  });
  test("single item returns its attainability", () => {
    expect(computeBacklinkScore([{ opportunity: { attainability: 70 } }])).toBe(70);
  });
  test("average of two items", () => {
    expect(computeBacklinkScore([
      { opportunity: { attainability: 60 } },
      { opportunity: { attainability: 80 } },
    ])).toBe(70);
  });
  test("result capped at 100", () => {
    expect(computeBacklinkScore([
      { opportunity: { attainability: 100 } },
      { opportunity: { attainability: 100 } },
    ])).toBe(100);
  });
  test("fractional average is rounded to nearest integer", () => {
    expect(computeBacklinkScore([
      { opportunity: { attainability: 33 } },
      { opportunity: { attainability: 34 } },
    ])).toBe(34);
  });
});

// ── scheduleFrequencyLabel ────────────────────────────────────────────────────

describe("scheduleFrequencyLabel", () => {
  test("null → 'Not set'", () => {
    expect(scheduleFrequencyLabel(null)).toBe("Not set");
  });
  test("undefined → 'Not set'", () => {
    expect(scheduleFrequencyLabel(undefined)).toBe("Not set");
  });
  test("'daily' → 'Daily'", () => {
    expect(scheduleFrequencyLabel("daily")).toBe("Daily");
  });
  test("'weekly' → 'Weekly'", () => {
    expect(scheduleFrequencyLabel("weekly")).toBe("Weekly");
  });
  test("'biweekly' → 'Every 2 Weeks'", () => {
    expect(scheduleFrequencyLabel("biweekly")).toBe("Every 2 Weeks");
  });
  test("unknown → returns input verbatim", () => {
    expect(scheduleFrequencyLabel("monthly")).toBe("monthly");
  });
});

// ── scheduledRunStatusConfig ──────────────────────────────────────────────────

describe("scheduledRunStatusConfig", () => {
  test("null/undefined → unknown config", () => {
    const cfg = scheduledRunStatusConfig(null);
    expect(cfg.label).toBe("Not run yet");
  });
  test("'succeeded' → green ✓", () => {
    const cfg = scheduledRunStatusConfig("succeeded");
    expect(cfg.color).toBe("#22C55E");
    expect(cfg.icon).toBe("✓");
  });
  test("'failed' → red ✕", () => {
    const cfg = scheduledRunStatusConfig("failed");
    expect(cfg.color).toBe("#EF4444");
    expect(cfg.icon).toBe("✕");
  });
  test("'provider_unavailable' → amber ⚠", () => {
    const cfg = scheduledRunStatusConfig("provider_unavailable");
    expect(cfg.color).toBe("#F59E0B");
    expect(cfg.icon).toBe("⚠");
  });
  test("unknown status → slate with the raw status as label", () => {
    const cfg = scheduledRunStatusConfig("pending");
    expect(cfg.color).toBe("#475569");
    expect(cfg.label).toBe("pending");
  });
});

// ── formatScoreDelta ──────────────────────────────────────────────────────────

describe("formatScoreDelta", () => {
  test("positive delta → '+N'", () => {
    expect(formatScoreDelta(5)).toBe("+5");
  });
  test("negative delta → '-N'", () => {
    expect(formatScoreDelta(-3)).toBe("-3");
  });
  test("zero delta → '±0'", () => {
    expect(formatScoreDelta(0)).toBe("±0");
  });
  test("+1 and -1 edge cases", () => {
    expect(formatScoreDelta(1)).toBe("+1");
    expect(formatScoreDelta(-1)).toBe("-1");
  });
});

// ── Misc helpers ──────────────────────────────────────────────────────────────

describe("wfStatusColor", () => {
  test("'won' → green", () => expect(wfStatusColor("won")).toBe("#22C55E"));
  test("'pursuing' → blue", () => expect(wfStatusColor("pursuing")).toBe("#38BDF8"));
  test("'rejected' → red", () => expect(wfStatusColor("rejected")).toBe("#EF4444"));
  test("unknown → slate", () => expect(wfStatusColor("unknown")).toBe("#64748B"));
});

describe("attainabilityColor", () => {
  test(">= 70 → green", () => expect(attainabilityColor(70)).toBe("#22C55E"));
  test(">= 40 → amber", () => expect(attainabilityColor(55)).toBe("#F59E0B"));
  test("< 40 → slate", () => expect(attainabilityColor(30)).toBe("#94A3B8"));
  test("100 → green", () => expect(attainabilityColor(100)).toBe("#22C55E"));
  test("0 → slate", () => expect(attainabilityColor(0)).toBe("#94A3B8"));
});

describe("oppCategoryLabel", () => {
  test("splits on underscore and title-cases each word", () => {
    expect(oppCategoryLabel("citation_directory")).toBe("Citation Directory");
    expect(oppCategoryLabel("local_partnership")).toBe("Local Partnership");
    expect(oppCategoryLabel("competitor_link_gap")).toBe("Competitor Link Gap");
  });
  test("single word is title-cased", () => {
    expect(oppCategoryLabel("guest")).toBe("Guest");
  });
});

describe("isPageEnd", () => {
  test("itemCount < pageSize → true (last page)", () => {
    expect(isPageEnd(15, 20)).toBe(true);
  });
  test("itemCount === pageSize → false (more pages)", () => {
    expect(isPageEnd(20, 20)).toBe(false);
  });
  test("itemCount = 0 → true", () => {
    expect(isPageEnd(0, 20)).toBe(true);
  });
});

describe("shortRunId", () => {
  test("truncates long IDs to 8 chars + ellipsis", () => {
    expect(shortRunId("abcdefghijklmnop")).toBe("abcdefgh…");
  });
  test("passes short IDs through unchanged", () => {
    expect(shortRunId("abc")).toBe("abc");
  });
  test("exactly 8 chars → unchanged", () => {
    expect(shortRunId("abcdefgh")).toBe("abcdefgh");
  });
});

describe("formatRunSummary", () => {
  test("formats accepted/rejected/observed", () => {
    const s = formatRunSummary({ counts_accepted: 10, counts_rejected: 2, counts_observed: 12 });
    expect(s).toBe("10 accepted · 2 rejected (12 observed)");
  });
  test("null values default to 0", () => {
    const s = formatRunSummary({ counts_accepted: null, counts_rejected: null, counts_observed: null });
    expect(s).toBe("0 accepted · 0 rejected (0 observed)");
  });
});

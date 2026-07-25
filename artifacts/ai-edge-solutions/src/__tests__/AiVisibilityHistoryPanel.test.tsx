/**
 * C9R-5 — Unit tests for AiVisibilityHistoryPanel pure helper functions.
 *
 * Tests the exported pure utilities that power the panel display logic.
 * No DOM rendering, no API calls.
 */

import { describe, test, expect } from "vitest";
import {
  statusColor,
  statusLabel,
  formatDuration,
  buildSparkPoints,
  deriveTrend,
} from "../components/AiVisibilityHistoryPanel";

// ── Types used in fixtures ────────────────────────────────────────────────────

type ScanStub = {
  scanId: string; clientId: string; triggerSource: "manual" | "scheduled";
  provider: string; model: string; status: "running" | "completed" | "failed";
  queryCount: number; completedCount: number; failedCount: number;
  mentionCount: number; mentionRate: number;
  competitorMentionCount: number | null; citationCount: number | null;
  startedAt: string; completedAt: string | null;
  durationMs: number | null; errorMessage: string | null; evidenceHref: string;
};

function makeScan(overrides: Partial<ScanStub> = {}): ScanStub {
  return {
    scanId:                 "scan-001",
    clientId:               "client-001",
    triggerSource:          "manual",
    provider:               "openai",
    model:                  "gpt-4o-mini",
    status:                 "completed",
    queryCount:             10,
    completedCount:         10,
    failedCount:            0,
    mentionCount:           4,
    mentionRate:            0.4,
    competitorMentionCount: null,
    citationCount:          null,
    startedAt:              "2026-07-01T10:00:00Z",
    completedAt:            "2026-07-01T10:01:00Z",
    durationMs:             60000,
    errorMessage:           null,
    evidenceHref:           "/api/ai-visibility/query-scan/evidence/scan-001",
    ...overrides,
  };
}

// ── statusColor ───────────────────────────────────────────────────────────────

describe("statusColor", () => {
  test("completed → green", ()  => expect(statusColor("completed")).toBe("#22C55E"));
  test("failed → red",    ()    => expect(statusColor("failed")).toBe("#EF4444"));
  test("running → amber", ()    => expect(statusColor("running")).toBe("#F59E0B"));
  test("unknown → amber", ()    => expect(statusColor("unknown")).toBe("#F59E0B"));
});

// ── statusLabel ───────────────────────────────────────────────────────────────

describe("statusLabel", () => {
  test("completed → Completed", () => expect(statusLabel("completed")).toBe("Completed"));
  test("failed → Failed",       () => expect(statusLabel("failed")).toBe("Failed"));
  test("running → Running",     () => expect(statusLabel("running")).toBe("Running"));
  test("unknown → Running",     () => expect(statusLabel("unknown")).toBe("Running"));
});

// ── formatDuration ────────────────────────────────────────────────────────────

describe("formatDuration", () => {
  test("null → —",          () => expect(formatDuration(null)).toBe("—"));
  test("500ms → '500ms'",   () => expect(formatDuration(500)).toBe("500ms"));
  test("5000 → '5.0s'",     () => expect(formatDuration(5000)).toBe("5.0s"));
  test("61000 → '1.0m'",    () => expect(formatDuration(61000)).toBe("1.0m"));
  test("0 → '0ms'",         () => expect(formatDuration(0)).toBe("0ms"));
  test("59999 → ends in s", () => expect(formatDuration(59999)).toMatch(/s$/));
});

// ── buildSparkPoints ──────────────────────────────────────────────────────────

describe("buildSparkPoints", () => {
  test("returns empty array when < 2 completed scans", () => {
    const pts = buildSparkPoints([makeScan()], 240, 52);
    expect(pts).toHaveLength(0);
  });

  test("returns empty array for non-completed scans", () => {
    const scans = [
      makeScan({ status: "failed" }),
      makeScan({ scanId: "s2", status: "running" }),
    ];
    expect(buildSparkPoints(scans, 240, 52)).toHaveLength(0);
  });

  test("returns one point per completed scan (up to 20)", () => {
    const scans = Array.from({ length: 5 }, (_, i) =>
      makeScan({ scanId: `s${i}`, startedAt: `2026-07-0${i + 1}T10:00:00Z` }),
    );
    const pts = buildSparkPoints(scans, 240, 52);
    expect(pts).toHaveLength(5);
  });

  test("caps at 20 most recent scans", () => {
    const scans = Array.from({ length: 30 }, (_, i) =>
      makeScan({ scanId: `s${i}`, startedAt: `2026-06-${String(i + 1).padStart(2, "0")}T10:00:00Z` }),
    );
    const pts = buildSparkPoints(scans, 240, 52);
    expect(pts).toHaveLength(20);
  });

  test("x coordinates increase left to right (chronological)", () => {
    const scans = [
      makeScan({ scanId: "s1", startedAt: "2026-07-01T10:00:00Z", mentionRate: 0.2 }),
      makeScan({ scanId: "s2", startedAt: "2026-07-08T10:00:00Z", mentionRate: 0.6 }),
    ];
    const pts = buildSparkPoints(scans, 240, 52);
    expect(pts[0].x).toBeLessThan(pts[1].x);
  });

  test("y coordinates are within the viewport height", () => {
    const H = 52;
    const scans = Array.from({ length: 4 }, (_, i) =>
      makeScan({ scanId: `s${i}`, startedAt: `2026-07-0${i + 1}T10:00:00Z`, mentionRate: i * 0.2 }),
    );
    const pts = buildSparkPoints(scans, 240, H);
    for (const pt of pts) {
      expect(pt.y).toBeGreaterThanOrEqual(0);
      expect(pt.y).toBeLessThanOrEqual(H);
    }
  });

  test("each point carries the scan's mention rate", () => {
    const scans = [
      makeScan({ scanId: "s1", startedAt: "2026-07-01T10:00:00Z", mentionRate: 0.3 }),
      makeScan({ scanId: "s2", startedAt: "2026-07-08T10:00:00Z", mentionRate: 0.7 }),
    ];
    const pts = buildSparkPoints(scans, 240, 52);
    expect(pts[0].rate).toBe(0.3);
    expect(pts[1].rate).toBe(0.7);
  });
});

// ── deriveTrend ───────────────────────────────────────────────────────────────

describe("deriveTrend", () => {
  test("empty array → insufficient_data", () => {
    expect(deriveTrend([])).toBe("insufficient_data");
  });

  test("single completed scan → insufficient_data", () => {
    expect(deriveTrend([makeScan()])).toBe("insufficient_data");
  });

  test("no completed scans → insufficient_data", () => {
    const scans = [makeScan({ status: "failed" }), makeScan({ scanId: "s2", status: "running" })];
    expect(deriveTrend(scans)).toBe("insufficient_data");
  });

  test("strong improvement → 'up'", () => {
    const scans = [
      makeScan({ scanId: "s1", startedAt: "2026-07-08T10:00:00Z", mentionRate: 0.4 }),
      makeScan({ scanId: "s2", startedAt: "2026-07-01T10:00:00Z", mentionRate: 0.2 }),
    ];
    expect(deriveTrend(scans)).toBe("up");
  });

  test("strong decline → 'down'", () => {
    const scans = [
      makeScan({ scanId: "s1", startedAt: "2026-07-08T10:00:00Z", mentionRate: 0.2 }),
      makeScan({ scanId: "s2", startedAt: "2026-07-01T10:00:00Z", mentionRate: 0.5 }),
    ];
    expect(deriveTrend(scans)).toBe("down");
  });

  test("minimal change → 'stable'", () => {
    const scans = [
      makeScan({ scanId: "s1", startedAt: "2026-07-08T10:00:00Z", mentionRate: 0.401 }),
      makeScan({ scanId: "s2", startedAt: "2026-07-01T10:00:00Z", mentionRate: 0.4 }),
    ];
    expect(deriveTrend(scans)).toBe("stable");
  });

  test("earliest rate 0, latest > 0 → 'up'", () => {
    const scans = [
      makeScan({ scanId: "s1", startedAt: "2026-07-08T10:00:00Z", mentionRate: 0.3 }),
      makeScan({ scanId: "s2", startedAt: "2026-07-01T10:00:00Z", mentionRate: 0.0 }),
    ];
    expect(deriveTrend(scans)).toBe("up");
  });
});

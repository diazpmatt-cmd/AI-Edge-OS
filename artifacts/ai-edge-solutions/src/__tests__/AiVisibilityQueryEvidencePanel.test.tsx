import { describe, it, expect } from "vitest";
import {
  getMentionBadgeConfig,
  getFailureLabel,
  formatScanTimestamp,
  getScanStatusConfig,
  computeScanMentionRate,
} from "../components/AiVisibilityQueryEvidencePanel";
import type { QEScan } from "../components/AiVisibilityQueryEvidencePanel";

// ── getMentionBadgeConfig ─────────────────────────────────────────────────────

describe("getMentionBadgeConfig", () => {
  it("returns red badge when not mentioned", () => {
    const cfg = getMentionBadgeConfig(false, null);
    expect(cfg.label).toBe("Not mentioned");
    expect(cfg.color).toBe("#EF4444");
  });

  it("returns green badge for exact match", () => {
    const cfg = getMentionBadgeConfig(true, "exact");
    expect(cfg.label).toBe("Exact match");
    expect(cfg.color).toBe("#22C55E");
  });

  it("returns lime badge for normalized match", () => {
    const cfg = getMentionBadgeConfig(true, "normalized");
    expect(cfg.label).toBe("Fuzzy match");
    expect(cfg.color).toBe("#84CC16");
  });

  it("returns blue badge for domain match", () => {
    const cfg = getMentionBadgeConfig(true, "domain");
    expect(cfg.label).toBe("Domain match");
    expect(cfg.color).toBe("#3B82F6");
  });

  it("returns purple badge for phone match", () => {
    const cfg = getMentionBadgeConfig(true, "phone");
    expect(cfg.label).toBe("Phone match");
    expect(cfg.color).toBe("#8B5CF6");
  });

  it("returns red badge for mentioned=true with unknown type", () => {
    const cfg = getMentionBadgeConfig(true, "unknown_type");
    expect(cfg.color).toBe("#EF4444");
  });
});

// ── getFailureLabel ───────────────────────────────────────────────────────────

describe("getFailureLabel", () => {
  it("maps timeout", () => { expect(getFailureLabel("timeout")).toBe("Timed out"); });
  it("maps auth_failure", () => { expect(getFailureLabel("auth_failure")).toBe("Auth failure"); });
  it("maps rate_limit", () => { expect(getFailureLabel("rate_limit")).toBe("Rate limited"); });
  it("maps not_configured", () => { expect(getFailureLabel("not_configured")).toBe("Provider not configured"); });
  it("maps provider_error", () => { expect(getFailureLabel("provider_error")).toBe("Provider error"); });
  it("returns reason verbatim for unknown codes", () => { expect(getFailureLabel("custom_error")).toBe("custom_error"); });
  it("returns Unknown error for null", () => { expect(getFailureLabel(null)).toBe("Unknown error"); });
});

// ── formatScanTimestamp ────────────────────────────────────────────────────────

describe("formatScanTimestamp", () => {
  it("returns — for null", () => {
    expect(formatScanTimestamp(null)).toBe("—");
  });

  it("returns a non-empty string for a valid ISO timestamp", () => {
    const result = formatScanTimestamp("2026-07-19T12:00:00Z");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe("—");
  });
});

// ── getScanStatusConfig ────────────────────────────────────────────────────────

describe("getScanStatusConfig", () => {
  it("returns green for completed", () => {
    const cfg = getScanStatusConfig("completed");
    expect(cfg.label).toBe("Completed");
    expect(cfg.color).toBe("#22C55E");
  });

  it("returns amber for running", () => {
    const cfg = getScanStatusConfig("running");
    expect(cfg.label).toBe("Running");
    expect(cfg.color).toBe("#F59E0B");
  });

  it("returns red for failed", () => {
    const cfg = getScanStatusConfig("failed");
    expect(cfg.label).toBe("Failed");
    expect(cfg.color).toBe("#EF4444");
  });

  it("returns grey for unknown status", () => {
    const cfg = getScanStatusConfig("pending");
    expect(cfg.label).toBe("pending");
    expect(cfg.color).toBe("#9CA3AF");
  });
});

// ── computeScanMentionRate ────────────────────────────────────────────────────

describe("computeScanMentionRate", () => {
  const baseScan: QEScan = {
    id: "s1", clientId: "c1", status: "completed", provider: "openai",
    model: "gpt-4o-mini", queryCount: 8, completedCount: 8, mentionCount: 2,
    error: null, startedAt: "2026-07-19T12:00:00Z", completedAt: "2026-07-19T12:01:00Z",
  };

  it("computes 25% when 2 of 8 mentioned", () => {
    expect(computeScanMentionRate(baseScan)).toBe("25%");
  });

  it("returns 0% when mentionCount is 0", () => {
    expect(computeScanMentionRate({ ...baseScan, mentionCount: 0 })).toBe("0%");
  });

  it("returns 100% when all queries mentioned", () => {
    expect(computeScanMentionRate({ ...baseScan, mentionCount: 8 })).toBe("100%");
  });

  it("returns 0% when completedCount is 0 (no divide by zero)", () => {
    expect(computeScanMentionRate({ ...baseScan, completedCount: 0, mentionCount: 0 })).toBe("0%");
  });
});

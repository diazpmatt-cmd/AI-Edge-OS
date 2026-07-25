import { describe, it, expect } from "vitest";
import {
  wfStatusColor,
  oppCategoryLabel,
  attainabilityColor,
  computeBacklinkScore,
  formatRunSummary,
  isPageEnd,
  shortRunId,
  runStatusColor,
  WORKFLOW_STATUS_COLORS,
  BACKLINK_OPPORTUNITY_CATEGORIES,
  BACKLINK_WORKFLOW_STATUSES,
  OPP_PAGE_SIZE,
} from "../backlink-ui-helpers";

// ── wfStatusColor ─────────────────────────────────────────────────────────────

describe("wfStatusColor", () => {
  it("returns green for won",         () => expect(wfStatusColor("won")).toBe("#22C55E"));
  it("returns blue for pursuing",     () => expect(wfStatusColor("pursuing")).toBe("#38BDF8"));
  it("returns blue for approved",     () => expect(wfStatusColor("approved")).toBe("#38BDF8"));
  it("returns amber for reviewing",   () => expect(wfStatusColor("reviewing")).toBe("#F59E0B"));
  it("returns red for rejected",      () => expect(wfStatusColor("rejected")).toBe("#EF4444"));
  it("returns red for expired",       () => expect(wfStatusColor("expired")).toBe("#EF4444"));
  it("returns slate for discovered",  () => expect(wfStatusColor("discovered")).toBe("#64748B"));
  it("returns slate for unknown",     () => expect(wfStatusColor("unknown_status")).toBe("#64748B"));
  it("covers all canonical statuses", () => {
    const canonicalStatuses = ["won", "pursuing", "approved", "reviewing", "rejected", "expired", "discovered"];
    canonicalStatuses.forEach(s => expect(WORKFLOW_STATUS_COLORS[s]).toBeDefined());
  });
  it("is consistent with WORKFLOW_STATUS_COLORS map", () => {
    expect(wfStatusColor("won")).toBe(WORKFLOW_STATUS_COLORS["won"]);
    expect(wfStatusColor("rejected")).toBe(WORKFLOW_STATUS_COLORS["rejected"]);
  });
});

// ── oppCategoryLabel ──────────────────────────────────────────────────────────

describe("oppCategoryLabel", () => {
  it("capitalises single word", () =>
    expect(oppCategoryLabel("backlinks")).toBe("Backlinks"));
  it("formats competitor_link_gap", () =>
    expect(oppCategoryLabel("competitor_link_gap")).toBe("Competitor Link Gap"));
  it("formats citation_directory", () =>
    expect(oppCategoryLabel("citation_directory")).toBe("Citation Directory"));
  it("formats local_partnership", () =>
    expect(oppCategoryLabel("local_partnership")).toBe("Local Partnership"));
  it("formats sponsorship_organization", () =>
    expect(oppCategoryLabel("sponsorship_organization")).toBe("Sponsorship Organization"));
  it("formats niche_industry_link", () =>
    expect(oppCategoryLabel("niche_industry_link")).toBe("Niche Industry Link"));
  it("formats linkable_asset_content_gap (longest category)", () =>
    expect(oppCategoryLabel("linkable_asset_content_gap")).toBe("Linkable Asset Content Gap"));
  it("handles empty string gracefully", () =>
    expect(oppCategoryLabel("")).toBe(""));
  it("covers all canonical categories without throwing", () => {
    BACKLINK_OPPORTUNITY_CATEGORIES.forEach(cat => {
      expect(() => oppCategoryLabel(cat)).not.toThrow();
      expect(oppCategoryLabel(cat).length).toBeGreaterThan(0);
    });
  });
});

// ── attainabilityColor ────────────────────────────────────────────────────────

describe("attainabilityColor", () => {
  it("returns green at exactly 70",   () => expect(attainabilityColor(70)).toBe("#22C55E"));
  it("returns green above 70",        () => expect(attainabilityColor(100)).toBe("#22C55E"));
  it("returns green at 85",           () => expect(attainabilityColor(85)).toBe("#22C55E"));
  it("returns amber at exactly 40",   () => expect(attainabilityColor(40)).toBe("#F59E0B"));
  it("returns amber between 40-69",   () => expect(attainabilityColor(55)).toBe("#F59E0B"));
  it("returns amber at 69",           () => expect(attainabilityColor(69)).toBe("#F59E0B"));
  it("returns slate below 40",        () => expect(attainabilityColor(39)).toBe("#94A3B8"));
  it("returns slate at 0",            () => expect(attainabilityColor(0)).toBe("#94A3B8"));
  it("returns slate at 1",            () => expect(attainabilityColor(1)).toBe("#94A3B8"));
});

// ── computeBacklinkScore ──────────────────────────────────────────────────────

describe("computeBacklinkScore", () => {
  it("returns 0 for empty array", () =>
    expect(computeBacklinkScore([])).toBe(0));

  it("returns the single item value", () =>
    expect(computeBacklinkScore([{ opportunity: { attainability: 60 } }])).toBe(60));

  it("averages two items", () =>
    expect(computeBacklinkScore([
      { opportunity: { attainability: 50 } },
      { opportunity: { attainability: 70 } },
    ])).toBe(60));

  it("averages three items", () =>
    expect(computeBacklinkScore([
      { opportunity: { attainability: 30 } },
      { opportunity: { attainability: 60 } },
      { opportunity: { attainability: 90 } },
    ])).toBe(60));

  it("caps at 100", () =>
    expect(computeBacklinkScore([{ opportunity: { attainability: 110 } }])).toBe(100));

  it("rounds fractional averages", () =>
    expect(computeBacklinkScore([
      { opportunity: { attainability: 33 } },
      { opportunity: { attainability: 34 } },
    ])).toBe(34));  // Math.round(33.5) = 34

  it("handles all-zero attainability", () =>
    expect(computeBacklinkScore([
      { opportunity: { attainability: 0 } },
      { opportunity: { attainability: 0 } },
    ])).toBe(0));
});

// ── formatRunSummary ──────────────────────────────────────────────────────────

describe("formatRunSummary", () => {
  it("formats a full run correctly", () =>
    expect(formatRunSummary({ counts_accepted: 5, counts_rejected: 2, counts_observed: 10 }))
      .toBe("5 accepted · 2 rejected (10 observed)"));

  it("handles null counts as zero", () =>
    expect(formatRunSummary({ counts_accepted: null, counts_rejected: null, counts_observed: null }))
      .toBe("0 accepted · 0 rejected (0 observed)"));

  it("handles missing keys as zero", () =>
    expect(formatRunSummary({}))
      .toBe("0 accepted · 0 rejected (0 observed)"));

  it("handles partial nulls", () =>
    expect(formatRunSummary({ counts_accepted: 3, counts_rejected: null, counts_observed: 8 }))
      .toBe("3 accepted · 0 rejected (8 observed)"));
});

// ── isPageEnd ─────────────────────────────────────────────────────────────────

describe("isPageEnd", () => {
  it("detects end when items < pageSize", () => expect(isPageEnd(5, 20)).toBe(true));
  it("detects end when items = 0",        () => expect(isPageEnd(0, 20)).toBe(true));
  it("not end when items = pageSize",     () => expect(isPageEnd(20, 20)).toBe(false));
  it("not end when items > pageSize",     () => expect(isPageEnd(25, 20)).toBe(false));
  it("works with OPP_PAGE_SIZE constant", () => {
    expect(isPageEnd(OPP_PAGE_SIZE - 1, OPP_PAGE_SIZE)).toBe(true);
    expect(isPageEnd(OPP_PAGE_SIZE,     OPP_PAGE_SIZE)).toBe(false);
  });
});

// ── shortRunId ────────────────────────────────────────────────────────────────

describe("shortRunId", () => {
  it("truncates long IDs",     () => expect(shortRunId("abcdef1234567890")).toBe("abcdef12…"));
  it("passes through short IDs", () => expect(shortRunId("abc123")).toBe("abc123"));
  it("passes through 8-char IDs exactly", () => expect(shortRunId("12345678")).toBe("12345678"));
  it("truncates 9-char IDs",   () => expect(shortRunId("123456789")).toBe("12345678…"));
});

// ── runStatusColor ────────────────────────────────────────────────────────────

describe("runStatusColor", () => {
  it("returns green for completed",     () => expect(runStatusColor("completed")).toBe("#22C55E"));
  it("returns red for failed",          () => expect(runStatusColor("failed")).toBe("#EF4444"));
  it("returns blue for in_progress",    () => expect(runStatusColor("in_progress")).toBe("#38BDF8"));
  it("returns blue for running",        () => expect(runStatusColor("running")).toBe("#38BDF8"));
  it("returns slate for unknown",       () => expect(runStatusColor("unknown")).toBe("#64748B"));
  it("returns slate for empty string",  () => expect(runStatusColor("")).toBe("#64748B"));
});

// ── Constants ─────────────────────────────────────────────────────────────────

describe("BACKLINK_OPPORTUNITY_CATEGORIES", () => {
  it("contains 10 categories", () => expect(BACKLINK_OPPORTUNITY_CATEGORIES.length).toBe(10));
  it("includes competitor_link_gap",           () => expect(BACKLINK_OPPORTUNITY_CATEGORIES).toContain("competitor_link_gap"));
  it("includes citation_directory",            () => expect(BACKLINK_OPPORTUNITY_CATEGORIES).toContain("citation_directory"));
  it("includes linkable_asset_content_gap",    () => expect(BACKLINK_OPPORTUNITY_CATEGORIES).toContain("linkable_asset_content_gap"));
  it("has no duplicate values", () => {
    const unique = new Set(BACKLINK_OPPORTUNITY_CATEGORIES);
    expect(unique.size).toBe(BACKLINK_OPPORTUNITY_CATEGORIES.length);
  });
});

describe("BACKLINK_WORKFLOW_STATUSES", () => {
  it("contains 7 statuses", () => expect(BACKLINK_WORKFLOW_STATUSES.length).toBe(7));
  it("includes all FSM states", () => {
    const required = ["discovered", "reviewing", "approved", "pursuing", "won", "rejected", "expired"];
    required.forEach(s => expect(BACKLINK_WORKFLOW_STATUSES).toContain(s));
  });
  it("has no duplicate values", () => {
    const unique = new Set(BACKLINK_WORKFLOW_STATUSES);
    expect(unique.size).toBe(BACKLINK_WORKFLOW_STATUSES.length);
  });
});

describe("OPP_PAGE_SIZE", () => {
  it("is a positive integer", () => {
    expect(typeof OPP_PAGE_SIZE).toBe("number");
    expect(OPP_PAGE_SIZE).toBeGreaterThan(0);
    expect(Number.isInteger(OPP_PAGE_SIZE)).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import type { GapSignal, GapsResponse } from "../lib/types";

function gapsFromResponse(data: GapsResponse): GapSignal[] {
  return data.hasData ? data.gaps : [];
}

function isUnknownCompetitor(gap: GapSignal): boolean {
  return gap.competitorName == null;
}

function unresolvableCount(gaps: GapSignal[]): number {
  return gaps.filter((g) => g.competitorName == null).length;
}

function showsEmptyState(gaps: GapSignal[]): boolean {
  return gaps.length === 0;
}

function showsWarningBanner(gaps: GapSignal[]): boolean {
  return unresolvableCount(gaps) > 0;
}

const makeGap = (overrides: Partial<GapSignal> = {}): GapSignal => ({
  id: "gap-1",
  keyword: "pest control near me",
  competitorName: "Acme Pest",
  competitorRank: 3,
  volumeEstimate: 1200,
  geographicScope: "local",
  status: "active",
  ...overrides,
});

describe("Keyword Gaps — empty state", () => {
  it("shows empty state when API returns hasData: false", () => {
    const response: GapsResponse = { hasData: false, gaps: [], count: 0 };
    const gaps = gapsFromResponse(response);
    expect(showsEmptyState(gaps)).toBe(true);
  });

  it("shows empty state when API returns hasData: true but gaps array is empty", () => {
    const response: GapsResponse = { hasData: true, gaps: [], count: 0 };
    const gaps = gapsFromResponse(response);
    expect(showsEmptyState(gaps)).toBe(true);
  });

  it("does NOT show empty state when gaps are present", () => {
    const response: GapsResponse = {
      hasData: true,
      gaps: [makeGap()],
      count: 1,
    };
    const gaps = gapsFromResponse(response);
    expect(showsEmptyState(gaps)).toBe(false);
  });

  it("discards gaps array contents when hasData is false", () => {
    const response: GapsResponse = {
      hasData: false,
      gaps: [makeGap()],
      count: 1,
    };
    const gaps = gapsFromResponse(response);
    expect(gaps).toHaveLength(0);
  });
});

describe("Keyword Gaps — unknown competitor label", () => {
  it("marks a gap as unknown when competitorName is null", () => {
    const gap = makeGap({ competitorName: null });
    expect(isUnknownCompetitor(gap)).toBe(true);
  });

  it("marks a gap as unknown when competitorName is undefined (null coercion)", () => {
    const gap = makeGap({ competitorName: undefined as unknown as null });
    expect(isUnknownCompetitor(gap)).toBe(true);
  });

  it("does NOT mark a gap as unknown when competitorName is a non-empty string", () => {
    const gap = makeGap({ competitorName: "Rival Exterminators" });
    expect(isUnknownCompetitor(gap)).toBe(false);
  });

  it("does NOT mark a gap as unknown when competitorName is an empty string", () => {
    const gap = makeGap({ competitorName: "" });
    expect(isUnknownCompetitor(gap)).toBe(false);
  });
});

describe("Keyword Gaps — unresolvable warning banner", () => {
  it("shows warning banner when one gap has an unknown competitor", () => {
    const gaps = [makeGap({ competitorName: null })];
    expect(showsWarningBanner(gaps)).toBe(true);
  });

  it("shows warning banner when multiple gaps have unknown competitors", () => {
    const gaps = [
      makeGap({ id: "g1", competitorName: null }),
      makeGap({ id: "g2", competitorName: null }),
      makeGap({ id: "g3", competitorName: "Known Corp" }),
    ];
    expect(showsWarningBanner(gaps)).toBe(true);
    expect(unresolvableCount(gaps)).toBe(2);
  });

  it("does NOT show warning banner when all gaps have known competitors", () => {
    const gaps = [
      makeGap({ id: "g1", competitorName: "Acme" }),
      makeGap({ id: "g2", competitorName: "Rival" }),
    ];
    expect(showsWarningBanner(gaps)).toBe(false);
  });

  it("does NOT show warning banner when gaps list is empty", () => {
    expect(showsWarningBanner([])).toBe(false);
  });

  it("counts only null-named gaps when computing unresolvableCount", () => {
    const gaps = [
      makeGap({ id: "g1", competitorName: null }),
      makeGap({ id: "g2", competitorName: "Known" }),
      makeGap({ id: "g3", competitorName: null }),
    ];
    expect(unresolvableCount(gaps)).toBe(2);
  });
});

describe("Keyword Gaps — response transformation invariants", () => {
  it("preserves all gap items when hasData is true", () => {
    const response: GapsResponse = {
      hasData: true,
      gaps: [makeGap({ id: "g1" }), makeGap({ id: "g2" })],
      count: 2,
    };
    expect(gapsFromResponse(response)).toHaveLength(2);
  });

  it("returns an empty array (not the original array) when hasData is false", () => {
    const originalGaps = [makeGap()];
    const response: GapsResponse = {
      hasData: false,
      gaps: originalGaps,
      count: 1,
    };
    const result = gapsFromResponse(response);
    expect(result).not.toBe(originalGaps);
    expect(result).toHaveLength(0);
  });
});

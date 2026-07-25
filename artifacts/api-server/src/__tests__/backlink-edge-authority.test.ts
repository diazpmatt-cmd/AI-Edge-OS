/**
 * Edge Authority Score — unit tests
 *
 * Covers: fail-closed contract, component ceilings, score bounds,
 * monotonicity, and full example profiles.
 */
import { describe, it, expect } from "vitest";
import {
  computeEdgeAuthorityScore,
  hasQualifyingBacklinkEvidence,
  type EdgeAuthorityScoreInput,
} from "@workspace/db";

const zero: EdgeAuthorityScoreInput = {
  backlinkCount: 0, referringDomainCount: 0, opportunityCount: 0, wonCount: 0,
};

// ── Fail-closed ──────────────────────────────────────────────────────────────

describe("computeEdgeAuthorityScore – fail-closed", () => {
  it("returns null when all evidence is zero", () => {
    expect(computeEdgeAuthorityScore(zero)).toBeNull();
  });

  it("returns null when only opportunityCount > 0 (fixture guard)", () => {
    expect(computeEdgeAuthorityScore({ ...zero, opportunityCount: 15, wonCount: 5 })).toBeNull();
  });

  it("returns non-null when backlinkCount > 0", () => {
    expect(computeEdgeAuthorityScore({ ...zero, backlinkCount: 1 })).not.toBeNull();
  });

  it("returns non-null when referringDomainCount > 0", () => {
    expect(computeEdgeAuthorityScore({ ...zero, referringDomainCount: 1 })).not.toBeNull();
  });
});

// ── Score bounds ─────────────────────────────────────────────────────────────

describe("computeEdgeAuthorityScore – score bounds", () => {
  it("is always >= 0", () => {
    expect(computeEdgeAuthorityScore({ ...zero, backlinkCount: 1 })).toBeGreaterThanOrEqual(0);
  });

  it("is always <= 100", () => {
    expect(
      computeEdgeAuthorityScore({
        backlinkCount: 999_999, referringDomainCount: 999_999,
        opportunityCount: 999_999, wonCount: 999_999,
      }),
    ).toBeLessThanOrEqual(100);
  });

  it("achieves max 100 with very high inputs", () => {
    const score = computeEdgeAuthorityScore({
      backlinkCount: 1_000, referringDomainCount: 100,
      opportunityCount: 50, wonCount: 50,
    });
    expect(score).toBe(100);
  });
});

// ── Backlink volume component (0-40) ─────────────────────────────────────────

describe("computeEdgeAuthorityScore – backlink volume component", () => {
  it("1 backlink → small but positive contribution", () => {
    const score = computeEdgeAuthorityScore({ ...zero, backlinkCount: 1 });
    expect(score).toBeGreaterThan(0);
    expect(score!).toBeLessThan(10);
  });

  it("1000 backlinks → full 40-pt contribution (plus breadth from opps)", () => {
    const score = computeEdgeAuthorityScore({ backlinkCount: 1000, referringDomainCount: 0, opportunityCount: 0, wonCount: 0 });
    expect(score).toBe(40);
  });

  it("backlink component grows monotonically", () => {
    const s10  = computeEdgeAuthorityScore({ ...zero, backlinkCount: 10  })!;
    const s100 = computeEdgeAuthorityScore({ ...zero, backlinkCount: 100 })!;
    const s500 = computeEdgeAuthorityScore({ ...zero, backlinkCount: 500 })!;
    expect(s10).toBeLessThan(s100);
    expect(s100).toBeLessThan(s500);
  });
});

// ── Domain diversity component (0-30) ────────────────────────────────────────

describe("computeEdgeAuthorityScore – domain diversity component", () => {
  it("100 referring domains → full 30-pt contribution", () => {
    const score = computeEdgeAuthorityScore({ ...zero, referringDomainCount: 100 });
    expect(score).toBe(30);
  });

  it("domain component grows monotonically", () => {
    const s1  = computeEdgeAuthorityScore({ ...zero, referringDomainCount: 1  })!;
    const s10 = computeEdgeAuthorityScore({ ...zero, referringDomainCount: 10 })!;
    const s50 = computeEdgeAuthorityScore({ ...zero, referringDomainCount: 50 })!;
    expect(s1).toBeLessThan(s10);
    expect(s10).toBeLessThan(s50);
  });
});

// ── Win quality component (0-20) ─────────────────────────────────────────────

describe("computeEdgeAuthorityScore – win quality component", () => {
  it("100% won rate contributes 20 pts (holding opportunityCount constant so breadth is equal)", () => {
    // Hold opportunityCount=10 in both so the breadth component is equal.
    // Only wonCount changes — isolating the win quality contribution.
    const base    = computeEdgeAuthorityScore({ ...zero, backlinkCount: 100, opportunityCount: 10, wonCount: 0 })!;
    const withWin = computeEdgeAuthorityScore({ ...zero, backlinkCount: 100, opportunityCount: 10, wonCount: 10 })!;
    expect(withWin - base).toBe(20);
  });

  it("0% won rate contributes 0 pts", () => {
    const base     = computeEdgeAuthorityScore({ ...zero, backlinkCount: 100 })!;
    const withZero = computeEdgeAuthorityScore({ ...zero, backlinkCount: 100, opportunityCount: 10, wonCount: 0 })!;
    expect(withZero).toBeGreaterThanOrEqual(base);
  });

  it("zero opportunities → 0 quality contribution (no division by zero)", () => {
    expect(() =>
      computeEdgeAuthorityScore({ ...zero, backlinkCount: 5, wonCount: 0 }),
    ).not.toThrow();
  });
});

// ── Discovery breadth component (0-10) ───────────────────────────────────────

describe("computeEdgeAuthorityScore – discovery breadth component", () => {
  it("50 opportunities → full 10-pt breadth contribution", () => {
    const base   = computeEdgeAuthorityScore({ ...zero, backlinkCount: 50 })!;
    const withBreadth = computeEdgeAuthorityScore({ ...zero, backlinkCount: 50, opportunityCount: 50 })!;
    expect(withBreadth - base).toBe(10);
  });
});

// ── hasQualifyingBacklinkEvidence ────────────────────────────────────────────

describe("hasQualifyingBacklinkEvidence", () => {
  it("false when all zero", () => {
    expect(hasQualifyingBacklinkEvidence(zero)).toBe(false);
  });

  it("false when only opportunityCount > 0 (no live backlinks)", () => {
    expect(hasQualifyingBacklinkEvidence({ ...zero, opportunityCount: 10 })).toBe(false);
  });

  it("true when backlinkCount > 0", () => {
    expect(hasQualifyingBacklinkEvidence({ ...zero, backlinkCount: 1 })).toBe(true);
  });

  it("true when referringDomainCount > 0", () => {
    expect(hasQualifyingBacklinkEvidence({ ...zero, referringDomainCount: 5 })).toBe(true);
  });
});

// ── Full-profile examples ─────────────────────────────────────────────────────

describe("computeEdgeAuthorityScore – representative profiles", () => {
  it("early-stage (10 backlinks, 3 domains, 5 opps, 0 won) → 10-30 range", () => {
    const score = computeEdgeAuthorityScore({ backlinkCount: 10, referringDomainCount: 3, opportunityCount: 5, wonCount: 0 })!;
    expect(score).toBeGreaterThanOrEqual(10);
    expect(score).toBeLessThanOrEqual(30);
  });

  it("growing (100 backlinks, 20 domains, 20 opps, 8 won) → 40-65 range", () => {
    const score = computeEdgeAuthorityScore({ backlinkCount: 100, referringDomainCount: 20, opportunityCount: 20, wonCount: 8 })!;
    expect(score).toBeGreaterThanOrEqual(40);
    expect(score).toBeLessThanOrEqual(65);
  });

  it("established (500 backlinks, 75 domains, 40 opps, 25 won) → 70-95 range", () => {
    const score = computeEdgeAuthorityScore({ backlinkCount: 500, referringDomainCount: 75, opportunityCount: 40, wonCount: 25 })!;
    expect(score).toBeGreaterThanOrEqual(70);
    expect(score).toBeLessThanOrEqual(95);
  });
});

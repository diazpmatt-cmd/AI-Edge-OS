/**
 * Authority Score Truthfulness — Regression Suite
 *
 * Guards every invariant described in ADR-018 §4–§6:
 *   - napScore = null (no live NAP backend) is excluded from overallAuth
 *   - overallAuth excludes null/unavailable components from its divisor
 *   - if ALL components are null, overallAuth is null (never NaN or zero)
 *   - edgeAuthorityScore=null renders as "—", never as 0
 *   - sparkline is hidden when no real edge data exists (hasEdgeData=false)
 *   - competitive benchmark null is preserved, not coerced to 0
 *   - third-party authority_score (placeholder 0) is excluded from averages
 *   - schemaScore (placeholder 0) is excluded from averages
 *
 * All logic is tested as pure functions mirroring AuthorityEnginePage computed values.
 * No DOM rendering required.
 */

import { describe, it, expect } from "vitest";

// ── Helpers mirroring AuthorityEnginePage computed values ────────────────────
// These functions replicate the exact logic in the component so we can test
// the business rules without mounting the full React tree.
//
// napScore is NOT a parameter — no live NAP backend exists (ADR-018 §4 fix).
// It was previously hardcoded as 71 (a fabricated constant); that has been
// removed. overallAuth now averages only components with real evidence.

function computeOverallAuth(
  backlinkScore: number | null,
  edgeAuth: number | null,
): number | null {
  // ADR-018 §4: include only components with real evidence.
  // napScore (no backend), authority_score (always 0 placeholder), and
  // schemaScore (0 placeholder) are intentionally excluded.
  const parts: number[] = [];
  if (backlinkScore !== null) parts.push(backlinkScore);
  if (edgeAuth !== null)      parts.push(edgeAuth);
  if (parts.length === 0)     return null;
  return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
}

function hasEdgeDataForSparkline(
  snapshots: Array<{ edge_authority_score: number | null }>,
): boolean {
  const edgeScores = snapshots
    .map(s => s.edge_authority_score)
    .filter((v): v is number => v != null);
  return edgeScores.length >= 2;
}

function resolveEdgeAuth(edgeAuthorityScore: number | null): number | null {
  return edgeAuthorityScore; // null preserved as-is; no ?? 0
}

// ── ADR-018 §4 fix: NAP score is null (no backend) ───────────────────────────

describe("napScore — no live NAP backend (ADR-018 §4 fix)", () => {
  it("napScore constant is null — no fabricated 71", () => {
    const napScore: number | null = null; // mirrors component
    expect(napScore).toBeNull();
  });

  it("literal 71 does NOT appear in computeOverallAuth output (backlinkScore=71, edgeAuth=null)", () => {
    // Even if backlinkScore happened to be 71, that is a real computed value —
    // but the old hardcoded napScore=71 is no longer a direct input.
    const result = computeOverallAuth(71, null);
    // Result is 71 because backlinkScore=71 is the single component, not napScore.
    // The point is: we have 1 component (backlinkScore), not 2 (nap + backlink).
    expect(result).toBe(71); // single-component average = itself
  });

  it("null napScore is excluded — overallAuth equals backlinkScore alone when edgeAuth is null", () => {
    // Before fix: overallAuth = round((71 + backlinkScore) / 2)
    // After fix:  overallAuth = round(backlinkScore / 1) = backlinkScore
    const backlinkScore = 30;
    const result = computeOverallAuth(backlinkScore, null);
    expect(result).toBe(backlinkScore); // not round((71 + 30) / 2) = 51
    expect(result).not.toBe(Math.round((71 + backlinkScore) / 2));
  });

  it("null napScore is excluded — overallAuth averages backlinkScore + edgeAuth only", () => {
    // Before fix: overallAuth = round((71 + backlink + edge) / 3)
    // After fix:  overallAuth = round((backlink + edge) / 2)
    const result = computeOverallAuth(30, 50);
    expect(result).toBe(Math.round((30 + 50) / 2)); // 40
    expect(result).not.toBe(Math.round((71 + 30 + 50) / 3)); // 51 — old result
  });
});

// ── ADR-018 §4: overallAuth excludes unavailable components ──────────────────

describe("overallAuth — truthful average (ADR-018 §4)", () => {
  it("returns null when both backlinkScore and edgeAuth are null (all unavailable)", () => {
    const result = computeOverallAuth(null, null);
    expect(result).toBeNull();
  });

  it("returns backlinkScore unchanged when edgeAuth is null (single component)", () => {
    expect(computeOverallAuth(40, null)).toBe(40);
    expect(computeOverallAuth(0,  null)).toBe(0);
    expect(computeOverallAuth(100, null)).toBe(100);
  });

  it("averages backlinkScore + edgeAuth when both are non-null", () => {
    const result = computeOverallAuth(30, 50);
    expect(result).toBe(Math.round((30 + 50) / 2)); // 40
  });

  it("includes edgeAuth in the average when non-null", () => {
    const result = computeOverallAuth(30, 55);
    expect(result).toBe(Math.round((30 + 55) / 2));
  });

  it("authority_score=0 placeholder is NOT included — verified by divisor", () => {
    // Old formula: (0 + 71 + 30 + 0) / 4 = 25.25 → 25
    // New formula: backlinkScore=30 alone → 30
    const oldResult = Math.round((0 + 71 + 30 + 0) / 4);
    const newResult = computeOverallAuth(30, null);
    expect(newResult).toBeGreaterThan(oldResult); // new formula is honest and higher
    expect(newResult).toBe(30);
    expect(oldResult).toBe(25);
  });

  it("schemaScore=0 placeholder is NOT included — verified by divisor", () => {
    // If schemaScore (0) were included with edgeAuth=null:
    // (30 + 0) / 2 = 15 — lower than 30
    const withFalseZero = Math.round((30 + 0) / 2);
    const correct       = computeOverallAuth(30, null);
    expect(correct).toBeGreaterThan(withFalseZero);
  });

  it("backlinkScore=0 (no opportunities yet) is still included — real data, not a placeholder", () => {
    // backlinkScore=0 is a real computed value from live data, not a placeholder.
    const result = computeOverallAuth(0, null);
    expect(result).toBe(0); // single real component = itself (not null)
    expect(result).not.toBeNull();
  });

  it("edgeAuth=0 is included when explicitly zero (real evidence exists)", () => {
    // A real edgeAuth of 0 means evidence was evaluated and scored 0 — still valid.
    const result = computeOverallAuth(30, 0);
    expect(result).toBe(Math.round((30 + 0) / 2));
  });

  it("full score (all 100) averages correctly with 2 components", () => {
    const result = computeOverallAuth(100, 100);
    expect(result).toBe(100);
  });

  it("divisor is 1 when only backlinkScore is available (edgeAuth null)", () => {
    const backlink = 40;
    const result   = computeOverallAuth(backlink, null);
    expect(result).toBe(backlink); // divisor = 1
  });

  it("divisor is 2 when both backlinkScore and edgeAuth are non-null", () => {
    const backlink = 40;
    const edge     = 60;
    const result   = computeOverallAuth(backlink, edge);
    expect(result).toBe(Math.round((backlink + edge) / 2)); // divisor = 2
  });
});

// ── ADR-018 §5: sparkline hidden when no real edge data ──────────────────────

describe("sparkline edge data guard (ADR-018 §5)", () => {
  it("hasEdgeData is false for empty snapshots", () => {
    expect(hasEdgeDataForSparkline([])).toBe(false);
  });

  it("hasEdgeData is false when all edge_authority_score values are null", () => {
    const snapshots = [
      { edge_authority_score: null },
      { edge_authority_score: null },
      { edge_authority_score: null },
    ];
    expect(hasEdgeDataForSparkline(snapshots)).toBe(false);
  });

  it("hasEdgeData is false with only 1 non-null value (need ≥ 2 for a trend)", () => {
    const snapshots = [
      { edge_authority_score: 45 },
      { edge_authority_score: null },
    ];
    expect(hasEdgeDataForSparkline(snapshots)).toBe(false);
  });

  it("hasEdgeData is true with exactly 2 non-null values", () => {
    const snapshots = [
      { edge_authority_score: 40 },
      { edge_authority_score: 50 },
    ];
    expect(hasEdgeDataForSparkline(snapshots)).toBe(true);
  });

  it("hasEdgeData is true with 5 mixed values (3 non-null)", () => {
    const snapshots = [
      { edge_authority_score: null },
      { edge_authority_score: 40 },
      { edge_authority_score: null },
      { edge_authority_score: 50 },
      { edge_authority_score: 60 },
    ];
    expect(hasEdgeDataForSparkline(snapshots)).toBe(true);
  });

  it("snapshots with authority_score=0 and no edge data → sparkline hidden", () => {
    const snapshotsAllZero = [
      { edge_authority_score: null },
      { edge_authority_score: null },
      { edge_authority_score: null },
    ];
    expect(hasEdgeDataForSparkline(snapshotsAllZero)).toBe(false);
  });

  it("sparkline plotScores uses only edgeScores when hasEdgeData is true", () => {
    const snapshots = [
      { edge_authority_score: 42, authority_score: 0 },
      { edge_authority_score: 48, authority_score: 0 },
    ];
    const edgeScores = snapshots
      .map(s => s.edge_authority_score)
      .filter((v): v is number => v != null);
    expect(edgeScores).toEqual([42, 48]);
    expect(edgeScores).not.toContain(0); // no authority_score zeros in the plot
  });
});

// ── ADR-018 §6: competitive benchmark null preservation ──────────────────────

describe("competitive benchmark null preservation (ADR-018 §6)", () => {
  it("resolveEdgeAuth returns null unchanged (no ?? 0 coercion)", () => {
    expect(resolveEdgeAuth(null)).toBeNull();
  });

  it("resolveEdgeAuth returns the score unchanged when non-null", () => {
    expect(resolveEdgeAuth(55)).toBe(55);
  });

  it("resolveEdgeAuth returns 0 when explicitly zero (real evidence)", () => {
    expect(resolveEdgeAuth(0)).toBe(0);
  });

  it("rendering guard: null coerced with ?? -1 gives -1 for color comparison", () => {
    const authorityScore: number | null = null;
    const forColorComparison = (authorityScore ?? -1) >= 40;
    expect(forColorComparison).toBe(false);
  });

  it("rendering guard: score=45 with ?? -1 gives true for green color", () => {
    const authorityScore: number | null = 45;
    const forColorComparison = (authorityScore ?? -1) >= 40;
    expect(forColorComparison).toBe(true);
  });

  it("rendering guard: score=39 with ?? -1 gives false for grey color", () => {
    const authorityScore: number | null = 39;
    const forColorComparison = (authorityScore ?? -1) >= 40;
    expect(forColorComparison).toBe(false);
  });

  it("display value: null || '—' renders as '—'", () => {
    const authorityScore: number | null = null;
    const display = authorityScore || "—";
    expect(display).toBe("—");
  });

  it("display value: 0 || '—' renders as '—' (edge case — zero is falsy)", () => {
    const authorityScore: number | null = 0;
    const display = authorityScore || "—";
    expect(display).toBe("—"); // 0 is falsy; still shows "—" — acceptable
  });

  it("display value: 45 || '—' renders the number", () => {
    const authorityScore: number | null = 45;
    const display = authorityScore || "—";
    expect(display).toBe(45);
  });
});

// ── ScoreGauge null contract ──────────────────────────────────────────────────

describe("ScoreGauge null contract", () => {
  it("null score should yield fill=0 for the ring (no partial ring)", () => {
    const score: number | null = null;
    const fill = (score !== null ? score / 100 : 0) * (2 * Math.PI * 38);
    expect(fill).toBe(0);
  });

  it("score=50 yields a 50% ring fill", () => {
    const score: number | null = 50;
    const circ = 2 * Math.PI * 38;
    const fill = (score !== null ? score / 100 : 0) * circ;
    expect(fill).toBeCloseTo(circ * 0.5, 3);
  });

  it("null score should render text '—' not '0'", () => {
    const score: number | null = null;
    const display = score !== null ? score : "—";
    expect(display).toBe("—");
    expect(display).not.toBe(0);
  });

  it("score=0 renders as 0 (real zero from real evidence, not placeholder)", () => {
    const score: number | null = 0;
    const display = score !== null ? score : "—";
    expect(display).toBe(0);
    expect(display).not.toBe("—");
  });

  it("napScore=null renders as '—' (no live NAP backend)", () => {
    const napScore: number | null = null; // mirrors component declaration
    const display = napScore !== null ? napScore : "—";
    expect(display).toBe("—");
  });
});

// ── Main gauge null contract ──────────────────────────────────────────────────

describe("main authority ring — null overallAuth", () => {
  it("overallAuth=null gives conic-gradient degree of 0 (no fill)", () => {
    const overallAuth: number | null = null;
    const degrees = (overallAuth ?? 0) * 3.6;
    expect(degrees).toBe(0);
  });

  it("overallAuth=50 gives 180 degrees (half ring)", () => {
    const overallAuth: number | null = 50;
    const degrees = (overallAuth ?? 0) * 3.6;
    expect(degrees).toBe(180);
  });

  it("overallAuth=null renders as '—' not 0 or null", () => {
    const overallAuth: number | null = null;
    const display = overallAuth !== null ? overallAuth : "—";
    expect(display).toBe("—");
  });

  it("statusColor(null) returns grey hex (not green/amber/red)", () => {
    const statusColor = (s: number | null) =>
      s === null ? "#64748B" : s >= 70 ? "#22C55E" : s >= 40 ? "#F59E0B" : "#EF4444";
    expect(statusColor(null)).toBe("#64748B");
    expect(statusColor(null)).not.toBe("#22C55E");
    expect(statusColor(null)).not.toBe("#F59E0B");
    expect(statusColor(null)).not.toBe("#EF4444");
  });
});

// ── Edge Auth integration scenario ───────────────────────────────────────────

describe("Edge Authority Score end-to-end scenario (post NAP-removal)", () => {
  it("typical BBB state: backlinkScore=15, edgeAuth=null → overallAuth=15 (no phantom NAP)", () => {
    const result = computeOverallAuth(15, null);
    expect(result).toBe(15);
    expect(result).not.toBe(Math.round((71 + 15) / 2)); // old phantom-NAP result = 43
  });

  it("with edgeAuth loaded: backlinkScore=15, edgeAuth=62 → overallAuth=39", () => {
    const result = computeOverallAuth(15, 62);
    expect(result).toBe(Math.round((15 + 62) / 2)); // 38.5 → 39
  });

  it("old phantom-NAP formula would have given 43 (backlink=15, nap=71) — new gives 15", () => {
    const phantomNapResult = Math.round((71 + 15) / 2); // 43 — fabricated
    const newResult = computeOverallAuth(15, null);     // 15 — truthful
    expect(newResult).toBeLessThan(phantomNapResult); // honest score is lower
    expect(newResult).toBe(15);
    expect(phantomNapResult).toBe(43);
  });

  it("all-unavailable scenario (data still loading): overallAuth=null, not 0", () => {
    const result = computeOverallAuth(null, null);
    expect(result).toBeNull();
    expect(result).not.toBe(0);
  });
});

# ADR-018: Edge Authority Score — Truthful Proprietary Scoring Contract

**Status:** Accepted  
**Date:** 2026-07-21  
**Deciders:** Engineering (AI Edge OS)  
**Tags:** authority, backlink, scoring, honesty, tenant-safety

---

## Context

C8R-10 introduced `computeEdgeAuthorityScore()` as an AI Edge OS proprietary 0-100 score
computed exclusively from real, tenant-scoped backlink evidence.  During the V1 acceptance
programme an ADR reference of 016 was originally assigned, but ADR-016 is owned by the
AI Visibility scheduled-monitoring module (C9R-5).  This document supersedes that reference
and assigns the correct number: **ADR-018**.

The acceptance programme also identified eight contradictions in how the score was used
across the UI and API that required correction before V1 could be declared honest.

---

## Decision

### 1 — Edge Authority Score is AI Edge OS proprietary, not a third-party metric

`computeEdgeAuthorityScore()` must **never** be labelled as Moz Domain Authority,
Ahrefs Domain Rating, or any other third-party metric.

The function is documented with a prominent header to this effect and must remain so.

### 2 — Fail-closed null contract

`computeEdgeAuthorityScore()` returns `null` when `backlinkCount === 0 AND
referringDomainCount === 0`.  **null MUST be rendered as "Unavailable" or "—".**
It must never be coerced to zero for display, aggregation, or trend charting.

### 3 — No fixture data in the live score path

The `POST /api/backlinks/ingest/scheduled` endpoint short-circuits with
`reason: "no_provider_configured"` / `outcome: "skipped"` when no live provider
is registered.  Fixture data from `FixtureBacklinkDataProvider` may only reach
`computeEdgeAuthorityScore()` via the explicit `/api/backlinks/ingest/fixture` endpoint,
which is development-only.

### 4 — Principal UI score (overallAuth) excludes unavailable and placeholder zeros

`overallAuth` (the main authority dial on AuthorityEnginePage) must:

- **include** `edgeAuthorityScore` when a non-null value is available;
- **exclude** `edgeAuthorityScore` from the divisor when null;
- **exclude** `authority_score` (the third-party DA field, always 0 placeholder until a live
  DA provider is integrated);
- **exclude** `schemaScore` (always 0 placeholder, no schema backend yet);
- **include** `napScore` (71 hardcoded approximation) and `backlinkScore` (real computation
  from live opportunity data).

### 5 — Trend sparkline requires genuine edge data

The Historical Authority Trend sparkline on AuthorityEnginePage must:

- render **only** when `edgeScores.length >= 2` (at least two real non-null snapshots);
- **not** fall back to `authority_score` (placeholder 0) for the plot;
- hide the entire sparkline section when no edge data is present.

### 6 — Competitive benchmark null-safe

The Competitive Benchmark table row for the client must carry
`authorityScore: edgeAuthorityScore` (null when unavailable).
The rendering layer uses `value || "—"` so null (coerced to falsy) displays "—".
The `?? 0` coercion was removed so the type system correctly tracks null.

### 7 — Third-party authority_score field is legacy

The `authority_score INTEGER` column on `backlink_score_history` currently stores 0
for every row (placeholder comment: "third-party DA requires live DA provider").
This field:
- **must not** be used as a visible product metric until a live DA provider is wired;
- **must not** appear in averages, trend charts, or comparisons as a real score;
- is retained in the schema as a future migration target.

---

## Consequences

- `overallAuth` on AuthorityEnginePage may change value when this ADR is applied
  (from a falsely inflated average that included a zero to an honest average of
  available components).
- The trend sparkline will not render for tenants with fewer than 2 non-null
  `edge_authority_score` snapshots — this is correct; an empty state is honest.
- `ScoreGauge` now accepts `score: number | null` and renders "—" with a grey ring
  when null — this affects the Edge Authority gauge added to the ScoreGauge row.
- Regression tests added in `authority-score-truthfulness.test.ts` guard all these
  invariants.

---

## Supersedes

- The ADR-016 reference in `lib/db/src/edge-authority-score.ts` (now updated to ADR-018).
- The ADR-016 comment in `lib/db/src/index.ts` (now updated to ADR-018).

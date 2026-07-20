# ADR-017 — Local-First Strategic Invariant: Baldwin County Before Expansion

**Date:** 2026-07-20
**Status:** ACCEPTED
**Deciders:** AI Edge OS product leadership
**Type:** Strategic / Scope governance

---

## Context

As AI Edge OS acquires more intelligence capabilities (AI visibility, competitor observation, search analytics, advertising measurement, conversion tracking), there is a natural pull toward expanding scope: broader geographies, more verticals, more markets. Without an explicit governing constraint, individual workstreams could drift toward generic, untargeted intelligence that does not produce measurable outcomes for the current paying tenant (Bed Bugs & Beyond).

BBB operates exclusively in Baldwin County, Alabama. Its business model depends on local service demand — pest control jobs booked and collected in that specific geography. Intelligence that does not connect to Baldwin County demand, qualified leads, booked jobs, or collected revenue does not serve the business.

---

## Decision

**The local-first strategic invariant is adopted as a permanent governing constraint:**

> Conquer Baldwin County first. Geographic expansion occurs only after AI Edge demonstrates repeatable, measurable, profitable growth for Bed Bugs & Beyond within Baldwin County.

This invariant governs all workstream prioritization, scope decisions, and feature additions.

---

## Consequences

### Required

1. **All active workstreams must connect to the Baldwin County growth stack.** The chain is: local service demand → qualified lead → booked job → completed service → collected revenue → profitability → operational capacity. A workstream that cannot trace a credible path to this chain is deferred or excluded.

2. **Geographic expansion is explicitly gated.** Stage 2 (adjacent Gulf Coast markets) requires affirmative evidence on eight criteria. Stage 3 requires Stage 2 evidence. Evidence is reviewed deliberately — not triggered automatically. See `AI-EDGE-OS-MASTER-ROADMAP.md §Geographic Expansion Gates`.

3. **International expansion is out of scope.** No workstream, feature, or recommendation may target geographies outside the authorized service area. This constraint does not require re-evaluation at any future date unless explicitly reopened by a new strategic decision.

4. **Excluded verticals are explicitly documented.** Retail pricing, Amazon consumer, stock market, app-store, and cross-retailer intelligence are out of scope for the local-first roadmap. They may become separate vertical modules only through a future roadmap decision with explicit approval.

5. **Tenant-authorization is the gate on all automation.** No service and no geography may appear in generated content, AI queries, recommendations, or reports unless it is in the tenant's authorized service list and authorized geography list. This applies to all seven Local-First Digital Intelligence workstreams.

### Permitted

- Expanding intelligence depth within Baldwin County (more signals, better attribution, finer geographic breakdown within authorized cities)
- Tracking competitor activity that is publicly observable and evidence-labeled
- Using third-party providers (DataForSEO, Similarweb-style workflows) within license scope, with provenance and confidence labels
- Proposing Stage 2 expansion when Stage 1 evidence criteria are met

### Explicitly prohibited

- Marketing termite services (not currently offered)
- Marketing whole-home bed bug heat-treatment (not offered)
- Generating content or queries for unauthorized locations or services
- Claiming prompt-level causation without direct evidence
- Using provider estimates without provenance, observation date, and confidence label
- Reproducing proprietary third-party scoring systems or interface designs

---

## Related Documents

- `docs/AI-EDGE-OS-MASTER-ROADMAP.md` — Baldwin County First invariant, Geographic Expansion Gates, Explicit Exclusions, Business Constraints, Similarweb-Inspired Boundary
- `docs/AI-VISIBILITY-PROVIDER-CONFIGURATION.md` — AI provider config and tenant isolation
- `docs/AI-VISIBILITY-ARCHITECTURE.md` — Tenant-safe read model and coverage state handling

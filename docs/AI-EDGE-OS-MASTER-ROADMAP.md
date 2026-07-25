# AI Edge OS — Master Roadmap

**Last updated:** 2026-07-21
**Deployed commit:** `e44141e5` (July 19, 2026)

---

## Strategic Invariant — Baldwin County First

> **Conquer Baldwin County first. Geographic expansion occurs only after AI Edge demonstrates repeatable, measurable, profitable growth for Bed Bugs & Beyond within Baldwin County.**

The active growth roadmap prioritizes:

1. Local service demand — real queries from real Baldwin County customers
2. Qualified leads — calls, forms, booked estimates
3. Booked jobs — confirmed service appointments
4. Completed work — delivered pest control services
5. Collected revenue — cash/card received
6. Profitability — revenue minus all acquisition, labor, and overhead costs
7. Operational capacity — response time, closing rate, crew bandwidth

International expansion is explicitly out of scope. Progression to adjacent markets (Stage 2) requires Stage 1 evidence. See Geographic Expansion Gates below.

---

## Completed Phases

### Discovery Engine (C1–C7)
- C1: Schema + repository layer
- C2: Pure discovery engine (8 source files, 221 tests)
- C3: Discovery persistence (DrizzleDiscoveryRepository)
- C4: DataForSEO provider
- C5: Expansion (capability, coverage, budget-guard, merger, enricher)
- C6: DiscoveryExecutionService + lifecycle governance (I1–I4)
- C7: Scheduler + OrchestrationMode

### BBB Autopilot (Phase A–C)
- Phase A1: ServiceRegistryProvider interface + BBB shim
- Phase B1: Clients table + pure resolution layer
- Phase B2: DB-backed service registry provider
- Phase B2.1: Typed registry failures (no silent fallbacks)
- Phase B3: Write-path tenant isolation
- Phase B4: Multi-tenant test patterns
- Phase C2: Pilot scheduler (autopilot_enabled='false' by default)
- Phase C7: Dry-run + OrchestrationMode separation

### GBP Engine (Phase 1–3)
- Phase 1: GBP audit infrastructure + 25 checks
- Phase 2: GBP Audit Engine (GbpLiveData interface, 15 evaluators, 4 parallel API calls)
- Phase 3: GBP Optimization Engine (6 endpoints, two-tab UI, priority scoring)
- Cooldown system (GbpCooldown replaces flat cooldownUntil)

### Authority & Backlink Engine (C8R-1 → C8R-10)
- C8R-1: Schema + backlink repository
- C8R-2 through C8R-5: Discovery → backlink bridge, scoring, opportunity UI
- C8R-6: Backlink API routes (5 routes)
- C8R-7: Frontend Authority Engine page
- C8R-8: Backlink provider readiness (Path B)
- C8R-9: Scheduled discovery + score history + historical analytics
- C8R-10: V1 acceptance audit (5 bugs fixed, ADR-015)

### AI Visibility Read Model (C8R-5)
- Pure computation layer complete: types, 6 adapters, composer, prioritizer, fixtures
- 60 tests: 32 frontend + 28 API provider
- ADR-007 accepted

### AI Visibility V1 — C9R-2 through C9R-5 ✅
- **C9R-1:** Assessment + architecture docs + roadmap (34%)
- **C9R-2:** `AiVisibilityExecutionService` + `ai_visibility_run_results` table + read-model API (54%)
- **C9R-3:** Frontend Opportunities tab + Coverage panel + legacy tab preserved (66%)
- **C9R-4:** Real AI query provider (OpenAI) + evidence panel + 7th adapter + 63 new tests (91%)
- **C9R-5:** Scheduled monitoring + run history + paginated history API + trend normalization + History tab + ADR-016 (97%)

### Infrastructure & Integrations
- Clerk auth (Replit-managed, pk_test_* confirmed operational in production)
- Facebook/Meta OAuth + dev-sync bridge
- YouTube OAuth (token expired in production — needs re-auth)
- TikTok OAuth
- GorillaDesk API (read-only: company, users, customers)
- Telnyx / Call Intelligence (calls + sms_conversations tables)
- Integration Health History (90-day auto-prune)
- Object Storage (wildcard routes fixed for path-to-regexp)

### Local Presence Engine
- Foundation: 10 new schema columns, adapter contracts, GBP bridge in getDashboard()
- Tenant IDOR guard (resolveAndValidateClientId)

### Competitor Intelligence (P1–P7)
- P1–P3: Entity model, discovery pipeline, dedup/upsert
- P4: Competitors tab UI (CompetitorCard, CompetitorsTab)
- P6.1: Score write-back (confidenceScore elevation)
- P6.2: Edge Authority Provider (isMock:false, path C)
- P6.3: AI Edge Visibility Provider (gap-derived competitor scores)
- P7: Edge Opportunities UI (OpportunityCenter, EdgeOpportunitiesPage)

---

## ✅ AI Visibility V1 — COMPLETE

**Status:** All 6 implementation phases complete. V1 at 100%.
**Completed:** 2026-07-20

| Phase | Status | Description |
|---|---|---|
| C9R-1 | ✅ COMPLETE | Assessment + architecture docs + roadmap |
| C9R-2 | ✅ COMPLETE | Execution service + persistence + API route |
| C9R-3 | ✅ COMPLETE | Frontend Opportunities tab + Coverage panel |
| C9R-4 | ✅ COMPLETE | Real AI query provider (OpenAI) + evidence panel |
| C9R-5 | ✅ COMPLETE | Scheduled monitoring + run history (ADR-016) |
| C9R-6 | ✅ COMPLETE | Review intelligence tenant safety |

**C9R-7:** ✅ COMPLETE — AI Visibility V1 Release Acceptance: **GO** (DP-001 PASS 2026-07-21)
Scan `d2e7852c`, 8/8 queries `success=true`, `trigger_source=manual`, HTTP 201 — all 12 acceptance criteria satisfied.

See [AI-VISIBILITY-V1-ROADMAP.md](AI-VISIBILITY-V1-ROADMAP.md) for full phase specs.

---

## Deferred / Post-V1 (Infrastructure)

- GBP Phase 2 pilot (blocked: GCP quota = 0 as of July 2026)
- CI/CD pipeline (currently manual-only Replit Deploy)
- Clerk pk_live_* key upgrade (currently pk_test_* in production, auth functional)
- YouTube OAuth re-authorization (invalid_grant in production)
- Google Search Console + Analytics ingestion (not_implemented)
- Multi-tenant admin dashboard
- AI answer monitoring V2 (real-time LLM polling)

---

## Local-First Digital Intelligence Expansion — Post-V1 Roadmap

The following workstreams extend AI Edge OS after AI Visibility V1 ships. All workstreams are scoped to Baldwin County and tenant-authorized services unless a Geographic Expansion Gate has been satisfied. All are documentation-only at this stage — no implementation has begun.

### WS-1: AI Traffic Attribution

Measure the actual customer journey that begins in an AI assistant and ends in collected revenue.

**Sources:**
- First-party server logs (request headers, referrer strings)
- Approved analytics connections (Google Analytics 4, Search Console where available)
- UTM parameters on AI referral landing pages
- Telnyx / call tracking (call-button + call-source attribution)
- Form submissions with source capture
- GorillaDesk CRM outcomes (booked job, completed job, invoice paid)
- Payment outcomes (collected revenue, payment method)

**AI platforms tracked:**
- ChatGPT / OpenAI
- Perplexity
- Gemini / Google AI Mode
- Microsoft Copilot
- Claude / Anthropic
- Grok / xAI
- DeepSeek
- Unknown / privacy-obscured AI traffic (must be labeled explicitly)

**Attribution signals:**
- First-touch (which AI platform originated the session)
- Assisted (AI platform contributed before conversion)
- Form attribution (which page + channel produced a form fill)
- Call attribution (which page + channel produced a call)
- Booked-job attribution (call/form → confirmed appointment)
- Completed-job attribution (appointment → service delivered)
- Collected-revenue attribution (service → payment received)

**Metrics:**
- Conversion rate by AI platform
- Revenue by AI platform
- Month-over-month trend per platform
- Correlation between AI visibility observations and actual customer activity

**Boundary:** Prompt-level causation may not be claimed unless supported by direct evidence (e.g., a user-supplied referral source or a confirmed UTM chain). Traffic volumes that cannot be attributed are labeled "unknown/privacy-obscured" — not estimated.

---

### WS-2: First-Party Traffic and Channel Intelligence

Understand every channel that delivers traffic, leads, and revenue to BBB — measured from first-party data.

**Channels:**
- Direct
- Organic search
- Social (Facebook, Instagram, TikTok, YouTube)
- Referrals (inbound links, partner sites)
- Advertising (Google Ads, Local Services Ads, Meta, TikTok, YouTube)
- Email
- AI (see WS-1)

**Dimensions:**
- Landing-page performance (entry page, exit page, engagement)
- Authorized-geography performance (Baldwin County city breakdown)
- Mobile vs. desktop
- New vs. returning visitors

**Conversion funnel:**
- Channel → lead (call or form)
- Channel → booked appointment
- Channel → completed service
- Channel → collected revenue

**Boundary:** First-party measured data must always be distinguished from provider estimates. Any provider estimate (e.g., impressions, reach) must carry provider provenance, observation date, and confidence label.

---

### WS-3: Baldwin County Search Intelligence

Understand what people in Baldwin County are searching for, where BBB ranks, and where gaps exist.

**Scope:**
- Service + city demand (keyword search volume by service × city)
- Search trends (seasonal, event-driven)
- Keyword research (new opportunities within authorized services)
- Keyword gaps (services or cities with search volume but no BBB presence)
- Rank tracking (organic position by service + city query)
- Local SERP tracking (map pack, People Also Ask, featured snippets)
- Competing pages (which pages outrank BBB and why)
- Content decay (BBB pages losing position over time)
- Geographic gaps (authorized Baldwin County cities with no ranked content)
- GBP visibility (profile completeness + map-pack appearance)
- AI-answer visibility by authorized Baldwin County location (from WS AI Visibility)

**Boundary:** Pages must not be generated for unauthorized locations or unavailable services. Tenant-authorized service and geography lists are the sole source of truth.

---

### WS-4: Local Competitor Intelligence Expansion

Extend the existing Competitor Intelligence engine (P1–P7) with broader observable signals.

**Scope:**
- Competitor website changes (new pages, removed pages, copy changes)
- Service and location pages (new service offerings, new city coverage)
- Organic keyword growth (new keywords entering top-20 positions)
- Backlink growth (new referring domains, lost referring domains)
- Review velocity (new review count per period, rating trend)
- GBP activity (post frequency, photo additions, Q&A)
- Advertising activity (observable paid search presence, ad copy changes)
- Public advertising creatives (from Google Ads Transparency Center, Meta Ad Library, TikTok Creative Center — public only)
- Social activity (post frequency, engagement trends)
- Referral sources (public backlink data)
- AI visibility (competitor mentions in AI assistant responses)
- Local share of voice (BBB vs. competitors in organic, map pack, AI answers)

**Boundary:** Any traffic, audience, or advertising-spend estimate sourced from a third-party provider (e.g., Similarweb, SEMrush) must include:
- Provider name
- Observation date
- Confidence label (estimated / measured / unavailable)

Competitor revenue or profit claims may not be made without direct evidence.

---

### WS-5: Advertising Intelligence

Measure and optimize paid acquisition when explicitly approved.

**Scope:**
- Authorized Google Ads data (via Google Ads API connection, tenant-approved)
- Local Services Ads (BBB profile, lead volume, lead quality)
- YouTube campaigns (view-through and click attribution)
- Meta / Instagram campaigns (click and conversion data)
- TikTok campaigns (click and conversion data)
- Other approved local channels (Nextdoor, Yelp, HomeAdvisor if activated)
- Public competitor ad libraries (Google Ads Transparency Center, Meta Ad Library, TikTok Creative Center — read-only, public data)
- Creative comparison (BBB creative vs. competitor creative — public data only)
- Geographic targeting (which Baldwin County cities are targeted, excluded, or missing)
- Search terms (queries triggering BBB ads, negative keyword opportunities)
- Negative keywords (what should be excluded)
- Creative fatigue (CTR decline over time for a given creative)

**Revenue attribution:**
- Cost per qualified lead (call or booked form)
- Cost per booked job (confirmed appointment)
- Collected revenue by campaign
- Profit by campaign (revenue minus campaign spend)

**Defaults and controls:**
- All advertising integrations default to **disabled**
- No campaign may be activated without: explicit user approval, defined budget controls, confirmed conversion tracking, and end-to-end revenue attribution
- Competitor spend and audience estimates from third-party providers must carry provenance and confidence labels

---

### WS-6: Conversion Intelligence

Identify where leads are lost between first contact and collected revenue.

**Scope:**
- Call-button monitoring (tap/click events, call completion vs. abandonment)
- Form monitoring (submission rate, field drop-off, error rate)
- Landing-page conversion (visits → calls, visits → forms)
- Missed calls (unanswered calls by time of day, day of week)
- Response time (time from inquiry to first contact attempt)
- Booking friction (estimate request → confirmed appointment rate)
- Abandoned estimates (estimates sent but never accepted)
- Follow-up performance (follow-up attempts vs. closed rate)

**Attribution:**
- Page / channel → call
- Page / channel → booked appointment
- Page / channel → completed service
- Page / channel → collected revenue

**Forward mapping:** This workstream maps to the future **Conversion Edge** capability. Conversion Edge will surface actionable recommendations (e.g., "Missed 3 calls on Saturday morning — add a call-back automation") with evidence, dates, and tenant scope.

---

### WS-7: Natural-Language Intelligence (Command Center)

Allow authorized users to ask evidence-backed questions about their business and receive answers with sources, dates, confidence levels, and tenant scope.

**Example queries:**
- Which service generated the most collected revenue this quarter?
- Which Baldwin County city is producing the most profitable demand?
- Which competitor gained visibility in the last 30 days?
- What content should be created next for Foley, AL?
- Did AI traffic from ChatGPT produce booked jobs this month?
- Which advertising campaign made money after cost?
- Where are we losing leads between the call and the booking?
- Which geography should be considered for Stage 2 expansion?

**Answer requirements:**
- Sources must be cited (first-party data, provider estimate, public record)
- Observation date must be stated
- Confidence level must be stated (measured / estimated / unavailable)
- Tenant scope must be explicit (answers are scoped to the authenticated tenant only)
- Claims requiring evidence must cite that evidence — no fabricated benchmarks

**Boundary:** This capability must not generate answers that assert causal relationships without supporting evidence. Correlation between AI visibility and customer activity is observable and may be stated; prompt-level causation may not be claimed.

---

## Geographic Expansion Gates

Progression through stages requires affirmative evidence on all criteria. Evidence review is a deliberate decision, not automatic.

### Stage 1 — Baldwin County (Active)

Current operating territory. All existing engines are scoped to Baldwin County and BBB's authorized service list.

Authorized cities (from `clients.service_areas`): Foley AL, Daphne AL, Loxley AL, Fairhope AL, Gulf Shores AL, Orange Beach AL, Summerdale AL, Spanish Fort AL, and remaining Baldwin County cities.

### Stage 2 — Adjacent Gulf Coast Markets (Gated)

Requires evidence of all of the following from Stage 1:

| Criterion | Measurement |
|---|---|
| Qualified demand | Consistent lead volume from an adjacent market with verifiable intent |
| Profitable acquisition | Cost per booked job ≤ target; margin positive after all costs |
| Fast response | Response time within SLA for all current Stage 1 jobs |
| Acceptable closing rate | Estimate-to-booked-job rate at or above internal threshold |
| Operational capacity | Crew bandwidth available without degrading Stage 1 service |
| Sustainable review growth | New reviews per month positive trend; rating stable or improving |
| Reliable attribution | Lead-to-revenue chain traceable for ≥ 80% of Stage 1 jobs |
| Positive collected revenue and margin | Net margin positive over trailing 90 days |

### Stage 3 — Additional Regional Markets (Gated)

Requires Stage 2 evidence of all criteria above applied to at least one Stage 2 market before Stage 3 is considered.

---

## Similarweb-Inspired Boundary

AI Edge OS may adopt useful Similarweb-style analytics workflows — competitor traffic insights, share-of-voice analysis, channel breakdown — but it must never copy, reproduce, or redistribute proprietary Similarweb data, scoring systems, methodologies, or interface designs.

All AI Edge data must come from:

| Source type | Requirement |
|---|---|
| First-party measured data | Directly observed from BBB's own properties and integrations |
| Public evidence | Publicly accessible without authentication or terms violation |
| Approved APIs | Connected via authorized integration with provider terms accepted |
| Licensed providers | Used within license scope (e.g., DataForSEO, Telnyx) |
| Evidence provenance | Every estimate must name its source |
| Observation dates | Every data point must carry the date it was observed |
| Confidence labels | Every estimate must be labeled: measured / estimated / unavailable |
| Explicit unavailable states | When data cannot be obtained, "unavailable" must be stated — not estimated or omitted |

---

## Business Constraints (Permanent)

These constraints apply to all engines, automations, and content generation, regardless of workstream:

| Constraint | Rule |
|---|---|
| Pest control scope | BBB offers pest control. Termites are excluded from active service marketing. |
| Termite positioning | Termite service may be coming soon but is not currently offered. Do not market it as available. |
| Whole-home heat treatment | No whole-home bed bug heat-treatment offering. Do not suggest or market it. |
| Fumigation | Fumigation is an active service. Valid for marketing and content. |
| Furniture / item treatment | Valid positioning for bed bug treatment. May be used in content and queries. |
| Automation tenant-authorization | All service and geography automation must remain tenant-authorized. No unauthorized service or city may appear in generated content, queries, or recommendations. |

---

## Explicit Exclusions (Local-First Roadmap)

The following are out of scope for the local-first BBB roadmap. They may become separate vertical modules only through a future roadmap decision with explicit user approval.

| Excluded scope | Reason |
|---|---|
| International expansion | Violates Baldwin County first invariant |
| Global country-level intelligence | Outside tenant scope |
| Retail pricing intelligence | Different vertical (product retail, not service) |
| Amazon consumer intelligence | Different channel and vertical |
| Stock market intelligence | Unrelated to local service business |
| Cross-retailer shopper behavior | Different vertical |
| App-store intelligence | Different distribution channel |
| Unapproved contact scraping | Privacy violation; not a licensed data source |
| Unsupported competitor revenue claims | No licensed provider; claims unsupported by evidence |

---

## Existing Engine Ownership (V1 Percentage Preservation)

These completion percentages are final and must not be modified by future documentation updates unless a new implementation phase closes a gap.

| Engine | V1 Status |
|---|---|
| Discovery Engine (C1–C7) | ✅ Complete |
| BBB Autopilot (A–C) | ✅ Complete (pilot disabled by default) |
| GBP Engine Phase 1–3 | ✅ Complete (Phase 2 pilot blocked by GCP quota) |
| Authority & Backlink Engine (C8R-1–C8R-10) | ✅ V1 Complete (ADR-015) |
| AI Visibility V1 (C9R-1–C9R-7) | ✅ 100% — **GO** (DP-001 PASS 2026-07-21) |
| Competitor Intelligence (P1–P7) | ✅ V1 Complete |
| Local Presence Engine | ✅ Foundation complete |
| Referral Growth Engine | 🟡 70% — RGE-1 enrollment/attribution implemented locally; production acceptance pending |
| AI Traffic Attribution (WS-1) | ⬜ Not started |
| Traffic & Channel Intelligence (WS-2) | ⬜ Not started |
| Baldwin County Search Intelligence (WS-3) | ⬜ Not started |
| Competitor Intelligence Expansion (WS-4) | ⬜ Not started |
| Advertising Intelligence (WS-5) | ⬜ Not started |
| Conversion Intelligence (WS-6) | ⬜ Not started |
| Natural-Language Command Center (WS-7) | ⬜ Not started |

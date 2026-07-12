---
name: Phase C1 Discovery Engine Architecture
description: Canonical design decisions for the Discovery Engine — provider interfaces, data model, opportunity scoring, pipeline stages, and what existing systems to reuse vs. consolidate.
---

## Core decisions

**Rule:** Discovery Engine MUST accept `ClientContentContext` as its primary input. No parallel context type.

**Rule:** `BBBService` fields (`seasonality`, `campaignGoals`, `revenueWeight`, `prohibitedClaims`, `generationAllowed`) are the source of truth for discovery intelligence — do NOT define a second service metadata structure.

**Rule:** `RegistryGate` runs before any signal becomes an opportunity. No opportunity for services where `generationAllowed: false`.

**Rule:** `discovery_snapshots` idempotency guard: ON CONFLICT on `(clientId, weekLabel)` — never run discovery twice per client per week.

**Rule:** All external data sources sit behind provider interfaces (`SearchDataProvider`, `PeopleAlsoAskProvider`, `TrendProvider`, `AISearchProvider`, `SocialListeningProvider`) — the pipeline never calls a provider directly.

## Existing systems to reuse (not replace)

- `ClientContentContext` + `ServiceRegistryProvider` — consumed by Discovery, not changed
- `ai_visibility_audits` table — schema unchanged; blobs upgraded with real data as providers come online
- `keywords` table — additive-only columns: `clientId`, `clusterId`, `signalSource`, `opportunityScore`, `seasonalWindow`
- `POST /ai/keywords` endpoint — preserved; implementation upgraded to call `SearchDataProvider` in Phase C7
- `localPresenceChannelsTable` — canonical for channel status; AI Visibility reads from it, not a parallel blob
- Existing 30-min content scheduler — discovery scheduler added alongside (Sunday 02:00 local), not replacing

## Consolidations (duplicates eliminated)

- Opportunity scoring: `competitorsJson` blob integer → `discovery_opportunities.scoreCard` (OpportunityScoreCard)
- Competitor scoring: AI Visibility demo blob → `DiscoveryOpportunity` with `type: "competitor_gap"`
- Channel status: `localPresenceChannelsTable` is canonical; `ai_visibility_audits.channelsJson` reads from it
- Season awareness: `BBBService.seasonality` is canonical; `SeasonalityEvaluator` reads it

## New tables (Phase C2)

- `discovery_snapshots` — per-client per-week header (status: running/complete/partial/failed)
- `discovery_signals` — raw research units (keyword, paa, reddit_thread, ai_citation, trending_query, voice_query, review_theme)
- `discovery_clusters` — semantic groupings of signals → become content topics
- `discovery_opportunities` — scored, ranked action items with full `OpportunityScoreCard`

## OpportunityScoreCard dimensions (weights)

searchDemand(0.25) + competitorGap(0.20) + revenueImpact(0.20) + contentFeasibility(0.15) + seasonalRelevance(0.10) + aiSearchPotential(0.10)

## Pipeline stages (11 stages, fault-tolerant)

Stage 1: Seed extraction (pure, always succeeds)
Stage 2: Keyword expansion [SearchDataProvider]
Stage 3: PAA [PeopleAlsoAskProvider]
Stage 4: Trend overlay [TrendProvider] — updates existing signals, no new rows
Stage 5: Competitor gap [SearchDataProvider.fetchCompetitorKeywords]
Stage 6: AI search audit [AISearchProvider] → writes ai_visibility_audits
Stage 7: Social listening [SocialListeningProvider]
Stage 8: Registry gate (pure, hard block on generationAllowed:false)
Stage 9: Cluster building (pure)
Stage 10: Opportunity scoring (pure)
Stage 11: DB persistence (idempotent)

Provider failure → empty array → snapshot.status = "partial" (never aborts other stages)

## Content Engine bridge (Phase C10)

`ServiceRegistryProvider.selectWeeklySlotsFromDiscovery?(count, recentTopics, opportunities)` — optional method, fills slots from top discovery clusters first then pads with registry 60/25/15 mix. Existing path unchanged for clients with no discovery data.

## Milestones

C2: DB schema (tables + keywords extension) — no routes
C3: Provider interface TypeScript definitions + types
C4: GptSearchDataProvider + first end-to-end pipeline run (manual trigger only)
C5: Opportunity API routes + connect AI Visibility page to real data
C6: Weekly scheduler integration + eligibility + idempotency
C7: First real SERP provider (DataForSEO or ValueSERP)
C8: AI search audit (LLM probe) + Google Trends
C9: Reddit + PAA providers
C10: Dashboard integration + Content Engine bridge

**Why:** The audit revealed that all existing "discovery" functionality (AI Visibility, keywords, local presence) uses demo/mock data. The Discovery Engine is the first real data layer — it must not break any existing UI contracts while replacing the mock implementations progressively.

# AI Edge OS — Master Roadmap

**Last updated:** 2026-07-20
**Deployed commit:** `e44141e5` (July 19, 2026)

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

**C9R-7:** ✅ COMPLETE — AI Visibility V1 Release Acceptance: **CONDITIONAL GO** (2026-07-20)

See [AI-VISIBILITY-V1-ROADMAP.md](AI-VISIBILITY-V1-ROADMAP.md) for full phase specs.

---

## Deferred / Post-V1

- GBP Phase 2 pilot (blocked: GCP quota = 0 as of July 2026)
- CI/CD pipeline (currently manual-only Replit Deploy)
- Clerk pk_live_* key upgrade (currently pk_test_* in production, auth functional)
- YouTube OAuth re-authorization (invalid_grant in production)
- Google Search Console + Analytics ingestion (not_implemented)
- Multi-tenant admin dashboard
- AI answer monitoring V2 (real-time LLM polling)

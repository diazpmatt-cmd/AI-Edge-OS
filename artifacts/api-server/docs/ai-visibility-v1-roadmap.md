# AI Visibility Engine — V1 Roadmap

**Last updated:** 2026-07-20  
**Overall V1 completion: ~72%**

---

## Completed phases

| Phase | Name | Key deliverables | Status |
|-------|------|-----------------|--------|
| C9R-1 | Local Presence Foundation | DB schema, adapter contracts, GBP bridge in `getDashboard()`, tenant IDOR guard | ✅ Done |
| C9R-2 | AI Query Scan Service | `AiQueryScanService`, `OpenAiQueryProvider`, `generateAiQueries()`, per-result persistence | ✅ Done |
| C9R-3 | AI Visibility Execution Engine | `AiVisibilityExecutionService`, channel scoring, read-model composition | ✅ Done |
| C9R-4 | Audit Engine + Evidence | 25-check GBP audit, `evaluateGbpAudit()`, evidence endpoints, History panel v0 | ✅ Done |
| C9R-5 | Scheduled Monitoring & Run History | `ai_visibility_schedule`, scheduler monitor, paginated history API, trend normalization, History tab UI, ADR-016 | ✅ Done |

---

## Remaining V1 phases

### C9R-6: AI Visibility Monitoring Alerts
**Priority: High**

Proactive alerting when mention rates change significantly or schedules fail.

Deliverables:
- Alert evaluation: detect drop > X% week-over-week in mention rate
- `ai_visibility_alerts` table (similar to `gbp_alerts`)
- `GET /api/ai-visibility/alerts/:clientId` — list current alerts
- `POST /api/ai-visibility/alerts/:clientId/acknowledge` — mark seen
- In-app alert banner in the History tab (auto-cleared when trend recovers)
- Optional email digest (weekly summary if `AI_VISIBILITY_ALERTS_EMAIL=true`)
- Alert when a schedule is auto-disabled (`consecutive_failures >= max_retries`)

### C9R-7: Multi-Provider Support
**Priority: Medium**

Add a second AI provider (Gemini, Claude, or Perplexity) and a provider registry so scans can be compared across LLMs.

Deliverables:
- `AiQueryProviderRegistry` (same pattern as `BacklinkProviderRegistry`)
- `GeminiQueryProvider` or `PerplexityQueryProvider` implementation
- `provider_id` field on scan record for per-provider filtering in history
- Side-by-side comparison in the History panel (one card per provider)
- `GET /api/ai-visibility/providers/health` — provider registry health report

### C9R-8: Admin Configuration Panel
**Priority: Medium**

A dedicated admin UI for managing AI Visibility settings per tenant.

Deliverables:
- `AIVisibilitySettingsPage` (new route `/admin/ai-visibility/settings`)
- Schedule enable/disable toggle + frequency selector
- Provider selector (when C9R-7 is complete)
- Cost estimate card (queries × price estimate)
- Scan history download (CSV export)

### C9R-9: AI Visibility Read-Model Aggregates
**Priority: Medium**

Surface trend data inside the main Overview tab, not just the History tab.

Deliverables:
- Embed `AiTrendSummary` into `AiVisibilityReadModel` (from `listHistory` → `computeFullTrendSummary`)
- Trend badge on the Overview tab score card
- 30-day rolling mention rate sparkline on the Overview tab

---

## V1 completion estimate

| Phase | Weight | Status |
|-------|--------|--------|
| C9R-1 Foundation | 10% | ✅ |
| C9R-2 Scan Service | 15% | ✅ |
| C9R-3 Execution Engine | 15% | ✅ |
| C9R-4 Audit Engine | 15% | ✅ |
| C9R-5 Scheduled Monitoring | 17% | ✅ |
| C9R-6 Alerts | 10% | ⬜ |
| C9R-7 Multi-Provider | 8% | ⬜ |
| C9R-8 Admin Panel | 5% | ⬜ |
| C9R-9 Read-Model Aggregates | 5% | ⬜ |

**Completed: 72% of defined V1 scope.**

---

## V1 definition of done

- [ ] Mention rate trends surface in the Overview tab (C9R-9)
- [ ] Proactive alert fires when mention rate drops > 20% (C9R-6)
- [ ] At least 2 AI providers (C9R-7)
- [ ] Admin can configure schedule and view cost estimate without touching the DB (C9R-8)
- [ ] All V1 endpoints have ≥15 tests each

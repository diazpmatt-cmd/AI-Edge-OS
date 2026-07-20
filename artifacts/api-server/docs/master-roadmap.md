# AI Edge OS — Master Roadmap

**Last updated:** 2026-07-20

---

## Completed engines

| Engine | Series | Phase | Status | ADR |
|--------|--------|-------|--------|-----|
| GBP Foundation | GBP | Phase 0–1 | ✅ | — |
| GBP Cooldown System | GBP | Phase 1.5 | ✅ | — |
| GBP Audit Engine (Phase 2) | GBP | Phase 2 | ✅ | — |
| GBP Optimization Engine (Phase 3) | GBP | Phase 3 | ✅ | — |
| Local Presence Foundation | C9R-1 | AI Visibility | ✅ | — |
| AI Query Scan Service | C9R-2 | AI Visibility | ✅ | — |
| AI Visibility Execution Engine | C9R-3 | AI Visibility | ✅ | — |
| AI Visibility Audit Engine | C9R-4 | AI Visibility | ✅ | — |
| AI Visibility Scheduled Monitoring | C9R-5 | AI Visibility | ✅ | ADR-016 |
| Discovery Engine (C2–C7) | Discovery | Keyword Discovery | ✅ | — |
| Backlink Authority Engine (C8R-1–10) | Backlinks | Authority | ✅ | ADR-015 |
| Competitor Intelligence (P4–P7, C8R-8+) | Competitors | CI | ✅ | — |
| Edge Opportunities UI | P7 | Opportunities | ✅ | — |
| BBB Content Autopilot (Phases 1–12) | BBB | Autopilot | ✅ | — |
| Call Intelligence | CI | Calls/SMS | ✅ | — |
| Integration Health History | Diagnostics | Monitoring | ✅ | — |
| Social Posts (Meta, TikTok, Google) | Social | Social | ✅ | — |

---

## Active series

### AI Visibility Engine (C9R series)
**Status: C9R-5 complete — 72% of V1**

Next: **C9R-6 — AI Visibility Monitoring Alerts**
- Drop-rate alerts, auto-disable notifications, weekly digest
- See `ai-visibility-v1-roadmap.md` for full phase breakdown

### GBP Engine
**Status: Phase 3 complete — audit + optimization live**

Next: GBP Phase 4 — Automated GBP Update Posting  
- Blocked: GCP quota = 0 for the GBP write API (July 2026 pilot)  
- See `gbp-engine-audit-report.md` for full status

---

## Engine readiness matrix

| Engine | Schema | API routes | Tests | Frontend | Scheduled |
|--------|--------|-----------|-------|----------|-----------|
| GBP Audit | ✅ | ✅ | ✅ | ✅ | Partial |
| GBP Optimization | ✅ | ✅ | ✅ | ✅ | No |
| AI Visibility | ✅ | ✅ | ✅ | ✅ | ✅ |
| Discovery | ✅ | ✅ | ✅ | No | ✅ |
| Backlinks | ✅ | ✅ | ✅ | ✅ | ✅ |
| Competitors | ✅ | ✅ | ✅ | ✅ | No |
| BBB Autopilot | ✅ | ✅ | ✅ | No | ✅ |
| Social Posts | ✅ | ✅ | Partial | ✅ | ✅ |
| Call Intelligence | ✅ | ✅ | No | ✅ | No |

---

## Platform invariants

These rules apply to all current and future engines:

1. **Tenant IDOR guard**: every authenticated route must call `resolveClientActiveCheck(userId)` and verify slug ownership before accessing any client data.
2. **Scheduler authentication**: internal scheduler POSTs must use `x-scheduler-secret` + a dedicated `/ingest/scheduled` endpoint, never the Clerk-protected user-facing endpoint.
3. **Test isolation**: tests must never call paid providers. All paid providers must be injectable via constructor or registry.
4. **Disabled by default**: all new schedulers must be disabled by default (`FEATURE_SCHEDULER_ENABLED` env var).
5. **Schema bootstrap**: all DDL must be in `schema-migrate.ts` as `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. `drizzle-kit push` is never used in production.
6. **Lib/db declarations**: after adding new exports to `lib/db/src/index.ts`, run `pnpm --filter @workspace/db exec tsc --build` before running api-server TypeScript checks.

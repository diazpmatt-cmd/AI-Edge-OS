# C9R-7 Session Handoff — AI Visibility V1 Release Acceptance

**Date:** 2026-07-20
**Phase:** C9R-7 (release acceptance — not an implementation phase)
**Prior phase:** C9R-6 + acceptance remediation (commit `9a3af27`)
**Decision:** CONDITIONAL GO

---

## What Was Done

Performed formal release acceptance for AI Visibility V1 across:

- End-to-end workflow verification (all 16 steps)
- All 7 coverage-state acceptance (normalized deterministically)
- 31 adversarial tenant isolation tests (new test file)
- Scheduler safety property verification
- Persistence and schema migration verification
- Frontend state acceptance
- Complete regression across 33 test files (1080/1081 pass; 1 pre-existing flaky)
- TypeScript clean (lib/db, api-server, frontend)
- Canonical documentation updated (roadmap C9R-6 entry corrected, C9R-7 added)

## New Files

| File | Purpose |
|---|---|
| `artifacts/api-server/src/__tests__/ai-visibility-c9r7-tenant-isolation.test.ts` | 31 adversarial tenant isolation tests |
| `docs/C9R-7-AI-VISIBILITY-V1-RELEASE-ACCEPTANCE.md` | Formal acceptance report |
| `docs/C9R-7-SESSION-HANDOFF.md` | This file |

## Modified Files

| File | Change |
|---|---|
| `docs/AI-VISIBILITY-V1-ROADMAP.md` | C9R-6 entry corrected (post-remediation state); C9R-7 entry added |
| `docs/AI-EDGE-OS-MASTER-ROADMAP.md` | C9R-7 marked complete (CONDITIONAL GO) |

---

## Decision: CONDITIONAL GO

**Implementation accepted.** No release blockers. One deployment prerequisite:

> **DP-001:** Live AI provider smoke test — verify that `AI_INTEGRATIONS_OPENAI_API_KEY` (or `OPENAI_API_KEY`) is configured in the production environment and a single controlled POST to `/api/ai-visibility/query-scan/:clientId` completes successfully before enabling the scheduler or announcing the feature.

All other deployment prerequisites are satisfied:
- Scheduler disabled by default (`AI_VISIBILITY_SCHEDULER_ENABLED` unset)
- `SCHEDULER_SECRET` auto-generated process-bound (no external configuration required)
- All migrations idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`)
- Rollback: remove `AI_VISIBILITY_SCHEDULER_ENABLED` from secrets + restart; no data deleted

---

## Known Non-Blocking Issues

| Issue | Classification |
|---|---|
| `ReferralProgramPage.tsx:162` TypeScript mismatch | Pre-existing, unrelated to AI Visibility |
| `discovery-c6.test.ts > T8` cancellation race | Pre-existing flaky, unrelated to AI Visibility |
| Competitor test group inter-isolation flakiness | Pre-existing, transient — all 101 tests pass individually |
| Clerk `pk_test_*` in production | Operational; upgrade to `pk_live_*` is a separate deferred item |
| YouTube `invalid_grant` in production | Pre-existing; needs re-auth separately |

---

## Accepted Commit

`9a3af27f0f40ab297506824406a609f5e11a1de7` — C9R-6 Acceptance Remediation (all 6 discrepancies resolved)

Acceptance documentation commit: TBD (committed at end of C9R-7 session)

---

## DP-001 Diagnostic Findings (2026-07-20)

Four production scan requests were made. All four were rejected before the scan service was reached. Zero rows written. Zero paid calls.

| Request | Response | Root cause |
|---|---|---|
| `POST .../query-scan/bbb` × 2 | 401 | Bearer token absent — auth hook did not fire |
| `POST .../query-scan/default` × 2 | 403 | Slug mismatch: resolved slug `"bed-bugs-and-beyond"` ≠ requested `"default"` |
| `POST .../query-scan/bed-bugs-and-beyond` | — | Never attempted — page never built this URL |

**Backend guard: correct.** `resolveClientActiveCheck` failed closed on every attempt.

**Frontend defect:** `clientId` was read from `URLSearchParams` (`?clientId=` param → fallback `"default"`), not from `useActiveBusiness()`. Blanket catch showed "Scan failed. Check that an AI provider is configured." for every non-2xx, including 403 — a misleading diagnosis.

**Latent environment risk:** `AI_INTEGRATIONS_OPENAI_BASE_URL=localhost:1106` and a dummy `AI_INTEGRATIONS_OPENAI_API_KEY` block the real `OPENAI_API_KEY`. Unconfirmable until a scan reaches the provider.

---

## DP-001 Tenant Resolution Correction (2026-07-20)

Frontend correction applied. **DP-001 remains pending.** Release status remains **CONDITIONAL GO**.

### Files Modified

| File | Change |
|---|---|
| `artifacts/ai-edge-solutions/src/pages/AIVisibilityEnginePage.tsx` | Replace `URLSearchParams` clientId with `useActiveBusiness().activeBusiness.id`; export `classifyScanError`; fix `handleRunScan` catch |
| `artifacts/ai-edge-solutions/src/__tests__/AIVisibilityEnginePage.test.ts` | New — 48 tests (tenant identity constants + error classification) |
| `docs/C9R-7-AI-VISIBILITY-V1-RELEASE-ACCEPTANCE.md` | DP-001 diagnostic findings + correction record appended |
| `docs/C9R-7-SESSION-HANDOFF.md` | This file — updated with DP-001 findings |

### Correction Summary

- `clientId` now sourced from `useActiveBusiness().activeBusiness.id` — same context as top nav and all other authenticated pages
- No `"default"` fallback. No URL query string override for ordinary tenant users.
- Scan button guard: `if (!clientId) return` in `handleRunScan`
- Error classification: 401→session expired, 403→access denied, 404→not found, 5xx→service error, network→connection error, provider failures→specific messages. Never describes a 401 or 403 as a provider configuration failure.
- `classifyScanError` exported for direct unit testing

### Pre-Deployment Environment Fix Required

Before republishing and retrying DP-001:
1. **Remove** from production secrets: `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`
2. **Retain:** `OPENAI_API_KEY`
3. Republish (picks up code correction + secret removal simultaneously)
4. Do not enable `AI_VISIBILITY_SCHEDULER_ENABLED`

---

## Next Activity

**Deploy the focused correction and execute one authenticated DP-001 scan.**

Once DP-001 smoke test passes:
1. Announce AI Visibility V1 to authorized users
2. Optionally enable scheduler for BBB: `PUT /api/ai-visibility/schedule/bed-bugs-and-beyond { "enabled": true, "frequency": "weekly" }`
3. Set `AI_VISIBILITY_SCHEDULER_ENABLED=true` in production secrets
4. Restart API Server
5. Monitor `[ai-visibility-scheduler]` log lines

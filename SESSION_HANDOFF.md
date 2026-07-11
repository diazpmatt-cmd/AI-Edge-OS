# Session Handoff

## Last session completed: BB&B Pilot Baseline — Platform Audit & Config (Phase 11)

### What was done

Full 13-phase audit-first task establishing the BB&B live pilot platform baseline.
Created a versioned pilot config module, updated the Content Autopilot default
selection, added 44 Phase 11 tests, and produced a ROADMAP with per-provider
readiness tables and a manual acceptance checklist for Matthew.

---

### Audit Findings (as of 2026-07-11)

**DB social connections (confirmed via psql):**

| Provider | Account | Connected |
|----------|---------|-----------|
| facebook | Matthew Diaz | 2026-06-28 |
| google_business | diaz.p.matt@gmail.com | 2026-06-28 |
| instagram | Matthew Diaz | 2026-06-29 |
| youtube | Matthew Diaz | 2026-07-07 |

**Nextdoor**: `coming_soon`, no OAuth, no API, no DB record. UI-only (15-step manual checklist in Local Presence Engine). Modeled truthfully — copy-and-paste workflow only.

---

### Files changed

| File | What changed |
|------|-------------|
| `artifacts/ai-edge-solutions/src/lib/bbb-pilot.ts` | **NEW** — versioned pilot config: `BBB_PILOT_PLATFORM_IDS`, `BBB_DEFERRED_PLATFORM_IDS`, `BBB_PILOT_PROVIDERS`, `BBB_DEFERRED_PROVIDERS`, `BBB_SELECTION_STORAGE_KEY`, `getBBBDefaultSelection()`, `normalizeSavedSelection()`, `isPilotPlatform()`, `isDeferredPlatform()` |
| `artifacts/ai-edge-solutions/src/lib/__tests__/bbb-pilot.test.ts` | **NEW** — 44 Phase 11 tests across 10 describe blocks |
| `artifacts/ai-edge-solutions/src/pages/BBBContentAutopilotPage.tsx` | Imports from `bbb-pilot.ts`; default selection now uses `normalizeSavedSelection(BBB_SELECTION_STORAGE_KEY)` (4 pilot platforms); storage key sourced from module; platform selection UI now shows pilot vs deferred sections; `x_twitter` content profile added (fixes pre-existing TS error) |
| `ROADMAP.md` | **NEW** — per-provider readiness tables (Phases 1–4), manual acceptance test checklist for Matthew |
| `CHANGELOG.md` | Updated — Phase 11 changes logged |

---

### Key decisions

- **Default selection = 4 pilot platforms** (Facebook, Instagram, Google Business, YouTube). First-time users and users with no saved selection see only these four checked by default.
- **Deferred platforms (TikTok, LinkedIn, Pinterest, Nextdoor) remain accessible** — users can still manually check them; they are just not in the default.
- **`selectAll` button still selects ALL queueable providers** — it is an explicit user action.
- **Storage key stays `v1`** — the default fallback changes, not the key. Bump the version in `bbb-pilot.ts` (→ `BBB_PILOT_VERSION`) if a future pilot phase needs a hard localStorage reset.
- **Nextdoor must not be described as a connected API.** It has a UI card (15-step checklist) and a content template, but `connect: false, publish: false` in the registry is the truthful state.

---

### Next steps for Matthew (manual acceptance)

See `ROADMAP.md` § "Manual Acceptance Test Checklist" for the full per-platform verification list. Start with Google Business (text-only posts can publish immediately without an image).

---

### Test baseline

```
bbb-pilot.test.ts       44/44 passed ✅
TypeScript (tsc --noEmit)  0 errors   ✅
```

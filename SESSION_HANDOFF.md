# Session Handoff

## Last session completed: YouTube Live Pilot — Phases 1–6 (2026-07-11)

### What was done

YouTube audit (phases 1–3), content field upgrades (phase 4), BB&B test draft prepared
(phase 5), and Phase 6 approval stop delivered. **No video has been uploaded.** Awaiting
Matthew's explicit approval with confirmed channel, approved content, and MP4 URL.

See the full Phase 1–11 report below.

---

### YouTube Pilot — Phase Results

**Phase 1 — Audit complete.** Full production route hierarchy documented. See report below.

**Phase 2 — Channel verification.** Token expired (2026-07-11T13:39Z) but refresh token
present — auto-refreshes on publish. Channel ID not cached in metadata. Matthew must
confirm the correct YouTube channel via Connected Accounts → YouTube → channel-info.

**Phase 3 — Video upload workflow.** Existing `videoUrl` URL-pull mechanism reused. No
new storage system created. MP4 URL must be publicly accessible.

**Phase 4 — Content fields added.** DB migrated: `youtube_title`, `youtube_privacy`,
`youtube_video_id` columns live. Backend, DTO, and Publishing Center UI updated.

**Phase 5 — BB&B test draft prepared.** Content ready — see report.

**Phase 6 — STOPPED FOR APPROVAL.** Awaiting Matthew's sign-off. See report below.

**Phases 7–11 — PENDING.** Will execute after Matthew approves.

---

### Remaining blocker (GBP, unchanged)

**GBP is still blocked** by `quota_limit_value: "0"` on project `474786012895`.
Matthew must enable both GBP APIs and request non-zero quota in GCP Console.

---

## Previous session: GBP Pilot Audit & Cleanup (TARGET phases 1–11)

### What was done

Full 11-phase audit of the failed Google Business Profile first-publish attempt.
Removed all temporary code, hardened the cooldown system, added 24 tests, and
identified the exact blocker blocking publication. **No GBP post was published.**

---

### Phase Results

**Phase 1 — Audit complete.** Changes identified:

| Change | Category | Disposition |
|--------|----------|-------------|
| `scripts/publish-gbp-pilot.ts` | Temporary script | **Removed** |
| `scripts/publish-gbp-pilot.mjs` | Temporary script | **Removed** |
| `src/routes/social-posts.ts` admin endpoint | Temporary bypass route | **Removed** |
| `src/routes/social-posts.ts` account-skip caching | Legitimate improvement | **Kept + hardened** |
| `tsx` in `api-server` devDependencies | Temp dep (only for scripts) | **Removed** |
| DB metadata seeded w/ `accountName` | Incorrect manual seed | **Cleared** |
| 4 failed draft `social_posts` records | Diagnostic evidence | **Preserved** |

**Phase 2 — Cleanup complete.** All temp/unsafe mechanisms removed.

**Phase 3 — Caching hardened.**
- Cache entries now require `verifiedByApi: true` — manually seeded values are
  rejected and force rediscovery.
- Cache written only from successful API responses.
- 404 on Local Posts API invalidates cached location, triggers controlled rediscovery.

**Phase 4 — Exact Google Error captured:**
- **Account Management API** (`mybusinessaccountmanagement.googleapis.com`): HTTP 429
  > "Quota exceeded for quota metric 'Requests' and limit 'Requests per minute' of
  > service 'mybusinessaccountmanagement.googleapis.com' for consumer
  > 'project_number:474786012895'"
  - Source: metadata stored from July 7, 2026 04:30 UTC
- **Business Information API** (`mybusinessbusinessinformation.googleapis.com`): HTTP 429
  - Response body was **NOT captured** by the previous code (gap corrected — now logged)
  - Known: status 429, persisted 7+ minutes across retries, cannot classify further
- No Retry-After header was received.

**Phase 5 — GCP Configuration:**
Cannot be verified from Replit. Matthew must check:
1. `console.cloud.google.com` → project 474786012895 → APIs & Services → Library
2. Confirm **My Business Account Management API** is enabled
3. Confirm **My Business Business Information API** is enabled
4. APIs & Services → Quotas → confirm neither is set to 0 req/min
5. If not visible: the project may not have Google Business Profile API access
   approved — see: https://developers.google.com/my-business/content/prereqs

**Phase 6 — Cooldown corrected.** New `GbpCooldown` struct in `src/lib/gbp-cooldown.ts`:
- `startedAt / expiresAt / reason / endpoint / service / attemptCount / retryAfterSec / errorType`
- Auto-clears expired cooldowns on read (no stale blocks)
- Honors `Retry-After` header
- Does NOT reset deadline on repeated blind retries
- Separates: `rate_limit / daily_quota / project_quota_zero / access_denied / api_disabled / unknown`
- Legacy flat `cooldownUntil` fields migrated on write

**Phase 7 — DB State:**
- `social_connections.metadata` for `google_business`: cleared to `{}`
  (manually seeded `accountName: accounts/112955071079091449064` was WRONG — that
  ID is the Google user ID, not a GBP business account ID)
- 5 failed/partial `social_posts` records preserved as diagnostic evidence:
  - `b4ec9c5e`, `ff53e5a0`, `4ac079db`, `76426eb5` (today, status=failed)
  - `ee8f1511` (today 05:58 UTC, status=partial)
- No fake provider IDs. No false "published" status.

**Phase 8 — One true next action:**
> **A — API access or nonzero quota must be verified/enabled in Google Cloud Console.**

Rationale: The Account Management API returned 429 on the very first request (no
prior calls within the same minute). The 429 persisted across multiple attempts with
7-minute gaps. Standard per-minute rate limits reset within 60 seconds; this
pattern is inconsistent with transient throttling and consistent with a zero-quota
or unapproved API configuration. The `business.manage` OAuth scope is confirmed
present — scope is not the issue.

**Phase 9 — Controlled retry plan (do not execute until Phase 5 is confirmed):**
1. Matthew verifies both GBP APIs are enabled and have non-zero quotas in GCP Console
2. Confirm token is still valid (or re-authorize at `/auth/google-business`)
3. Execute one normal production publish via the standard queue path (no bypass endpoint)
4. The system will discover account → location, cache both with `verifiedByApi: true`
5. If any 429: the new cooldown code will log the full body + classify + set structured record
6. Stop after one failure, report the full error body

**Phase 10 — Tests & Build:**
```
gbp-cooldown.test.ts    24/24 passed ✅
api-server build        0 errors     ✅
```

---

### Files changed

| File | Change |
|------|--------|
| `artifacts/api-server/src/lib/gbp-cooldown.ts` | **NEW** — pure helpers: `GbpCooldown`, `readGbpCooldown`, `classifyGbpError`, `buildGbpCooldownRecord`, `stripLegacyCooldownFields` |
| `artifacts/api-server/src/__tests__/gbp-cooldown.test.ts` | **NEW** — 24 tests |
| `artifacts/api-server/src/routes/social-posts.ts` | Removed `fetchWithRetry429`, removed admin endpoint, rewrote `publishToGBP` with structured cooldown + `verifiedByApi` guard |
| `artifacts/api-server/scripts/publish-gbp-pilot.ts` | **Deleted** |
| `artifacts/api-server/scripts/publish-gbp-pilot.mjs` | **Deleted** |
| `artifacts/api-server/package.json` | `tsx` removed from devDependencies |

---

### Remaining blocker

**Matthew must verify GBP API access in GCP Console (project 474786012895) before any retry.**
Navigation: console.cloud.google.com → project 474786012895 → APIs & Services →
confirm both `My Business Account Management API` and `My Business Business
Information API` are enabled with non-zero quotas. If the APIs are not listed,
the project does not have GBP API access approved.

---

## Previous session: BB&B Pilot Baseline — Platform Audit & Config (Phase 11)

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

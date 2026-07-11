# AI Edge Solutions — BB&B Growth OS Roadmap

Last updated: 2026-07-11

---

## Current State (v1 Pilot — July 2026)

### Active Platforms (BB&B Pilot v1)

| Platform | Connected | Content Ready | Image Ready | Queue Ready | Direct Publish | Next Step |
|----------|-----------|--------------|-------------|-------------|----------------|-----------|
| **Facebook** | ✅ Matthew Diaz | ✅ Template-based | ❌ Not integrated | ✅ | ✅ Graph API | Integrate image upload |
| **Instagram** | ✅ Matthew Diaz | ✅ Template-based | ❌ Not integrated | ✅ | ✅ via FB Page | Requires public image URL |
| **Google Business** | ✅ diaz.p.matt@gmail.com | ✅ Local copy + template | ❌ Not integrated | ✅ | ✅ GBP Posts API | Extend CTA options |
| **YouTube** | ✅ Matthew Diaz | ✅ Title + description | ❌ | ✅ Draft only | ✅ (requires video file) | Manual video attach → publish |

### Deferred Platforms (Not in v1 Pilot)

| Platform | Registry Status | Reason Deferred | Estimated Next Phase |
|----------|----------------|-----------------|---------------------|
| **TikTok** | `pending_approval` | Awaiting TikTok app review | Phase 2 |
| **LinkedIn** | `coming_soon` | No direct publish backend | Phase 3 |
| **Pinterest** | `coming_soon` | No OAuth or publish backend | Phase 3 |
| **Nextdoor** | `coming_soon` | No API; manual copy-paste only | Phase 4 |

---

## Phase 1 (Current) — Pilot Baseline

**Scope:** Establish truthful end-to-end baseline for the 4 active platforms.

- [x] Canonical provider registry (`social-providers.ts`)
- [x] OAuth connections for Facebook, Instagram, Google Business, YouTube
- [x] Publishing handlers for all 4 active platforms
- [x] Content Autopilot with template-based caption generation
- [x] Platform selection with localStorage persistence
- [x] BB&B pilot config (`bbb-pilot.ts`) — default = 4 pilot platforms
- [x] Queue All respects selection (deferred platforms excluded by default)
- [x] YouTube corrected to `operational` (not pending approval)
- [x] Nextdoor truthfully modeled as manual-only (no OAuth)
- [x] Zero-selection guard on Generate button
- [ ] Manual acceptance verification by Matthew (authenticated browser)

---

## Phase 2 — Image Generation & Media Engine

**Goal:** Each queued post includes a platform-optimized image.

- [ ] Add `aspectRatio`, `minWidth`, `minHeight` fields to `ContentProfile`
- [ ] Integrate image generation API (DALL-E or Replicate) at queue time
- [ ] Platform-specific ratios: Facebook 1.91:1, Instagram 1:1, Google 4:3
- [ ] Image stored in object storage, URL embedded in draft
- [ ] Publishing Center shows image preview before publish
- [ ] Instagram publish uses generated image URL (required for API)
- [ ] Facebook publish supports image attachment
- [ ] TikTok pilot readiness (pending platform approval resolution)

---

## Phase 3 — Analytics & Performance Tracking

**Goal:** Measure what gets published.

- [ ] Post-publish: fetch engagement (likes, comments, reach) per platform
- [ ] Analytics stored in `social_posts` table (`performance` JSONB column)
- [ ] Dashboard widget: top-performing content per platform
- [ ] LinkedIn and Pinterest OAuth + publish backend

---

## Phase 4 — Scheduling & Automation

**Goal:** Queue content now, publish at optimal time.

- [ ] Scheduled publish for Facebook, Instagram, Google Business
- [ ] Optimal post-time algorithm per platform
- [ ] Nextdoor API assessment (if Nextdoor opens Business API)
- [ ] Recurring content templates (monthly pest prevention calendar)

---

## BB&B Pilot Readiness by Provider

### Facebook
- **Connected**: ✅ Matthew Diaz account, Facebook Page linked
- **Content ready**: ✅ Template-based captions (400–500 chars, photo + text)
- **Image ready**: ❌ No image generation yet (manual attach)
- **Video ready**: ❌ Not implemented
- **Queue ready**: ✅ Drafts created in Publishing Center
- **Direct publish**: ✅ Graph API handler (`/v19.0/{pageId}/photos`, `/feed`)
- **Analytics**: ❌ Not yet
- **Blocker**: Image generation for visual posts
- **Manual action**: Attach image in Publishing Center before publish

### Instagram
- **Connected**: ✅ Matthew Diaz, linked via Facebook Business
- **Content ready**: ✅ Template-based captions (125–220 chars)
- **Image ready**: ❌ Requires public image URL (no generation yet)
- **Video/Reels**: ❌ Not implemented
- **Queue ready**: ✅
- **Direct publish**: ✅ Two-step: create container → publish
- **Analytics**: ❌ Not yet
- **Blocker**: Requires a public image URL — cannot publish text-only to Instagram
- **Manual action**: Supply image URL in Publishing Center

### Google Business Profile
- **Connected**: ✅ diaz.p.matt@gmail.com, Baldwin County location
- **Content ready**: ✅ Local-targeted captions (Foley, Gulf Shores, Orange Beach, Fairhope)
- **Image ready**: ❌ No generation yet
- **Video**: ❌ Not implemented
- **Queue ready**: ✅
- **Direct publish**: ✅ GBP Posts API with CTA (Call Now / Book Now)
- **Analytics**: ❌ Not yet
- **Blocker**: None for text posts; image required for photo posts
- **Manual action**: Text-only posts can publish immediately

### YouTube
- **Connected**: ✅ Matthew Diaz, youtube.upload + youtube.readonly scopes
- **Content ready**: ✅ Title + description generation
- **Image/Thumbnail**: ❌ Not implemented
- **Video creation**: ❌ System does NOT produce a video file (text only)
- **Queue ready**: ✅ Drafts saved with title + description
- **Direct publish**: ✅ Resumable upload handler exists — requires actual video file
- **Analytics**: ❌ Not yet
- **Blocker**: YouTube cannot publish without a video file
- **Manual action**: Matthew must attach a video file in Publishing Center, then publish

### Nextdoor
- **Connected**: ❌ No OAuth, no API connection
- **Registry status**: `coming_soon`
- **Implementation**: Manual-only — setup checklist in Local Presence Engine
- **UI**: `NextdoorBusinessCard` in Local Presence page shows 15-step manual guide
- **Content ready**: ✅ Template-based captions (300-char conversational tone)
- **Queue**: ✅ Internal draft only — no API publishing
- **Direct publish**: ❌ Not implemented; no Nextdoor Business API available
- **Blocker**: No public Nextdoor Business API
- **Manual action**: Matthew must copy draft caption → paste into business.nextdoor.com

---

## Manual Acceptance Test Checklist (Matthew — Authenticated Browser)

### Facebook
- [ ] Navigate to `/admin/bbb-autopilot`
- [ ] Select Facebook only
- [ ] Generate weekly content (template-based)
- [ ] Queue Facebook post
- [ ] Navigate to Publishing Center (`/admin/social-publishing`)
- [ ] Attach or skip image
- [ ] Click Publish
- [ ] Confirm live post on Facebook Page
- [ ] Confirm success status stored in Publishing Center

### Instagram
- [ ] Select Instagram only in Content Autopilot
- [ ] Generate and queue Instagram post
- [ ] Navigate to Publishing Center
- [ ] Attach a public image URL (required — Instagram API cannot publish without image)
- [ ] Click Publish
- [ ] Confirm live post on Instagram Business account
- [ ] Confirm success status stored

### Google Business Profile
- [ ] Select Google Business only in Content Autopilot
- [ ] Generate and queue GBP post (local copy: Foley/Gulf Shores/Orange Beach)
- [ ] Navigate to Publishing Center
- [ ] Select CTA (Call Now recommended)
- [ ] Click Publish
- [ ] Confirm live post on Google Business listing
- [ ] Confirm success status stored

### YouTube
- [ ] Select YouTube only in Content Autopilot
- [ ] Generate and queue YouTube description
- [ ] Navigate to Publishing Center
- [ ] Attach a valid test video file (MP4 recommended)
- [ ] Click Publish
- [ ] Confirm video uploaded to YouTube channel
- [ ] Confirm success status stored

### Nextdoor
- [ ] Navigate to Local Presence Engine (`/admin/local-presence`)
- [ ] Open Nextdoor Business card
- [ ] Confirm linked business page URL (if any)
- [ ] Note: posting is MANUAL — no API available
- [ ] Copy content from Content Autopilot Nextdoor draft
- [ ] Paste into business.nextdoor.com
- [ ] Document the Nextdoor business page URL for the record

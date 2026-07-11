# Changelog

All notable changes to the AI Edge Solutions platform.

---

## [Unreleased]

### Fixed
- **Content Autopilot YouTube status** (`/admin/bbb-autopilot`): YouTube was
  previously described as "Pending approval" in the platform note. The note now
  accurately reflects the actual requirement: video file upload in Publishing
  Center. Registry status was already `operational`; no canonical change needed.
- **Root cause**: `PLATFORM_NOTE.youtube` described an OAuth scope-approval gate
  that did not exist. The real limitation is YouTube's resumable-upload protocol
  (needs a video file to publish), not a provider-approval gate.
- **Zero-selection guard**: The Generate button is now disabled and shows
  helper text when no platforms are selected, preventing accidental empty
  template rotation.

### Changed
- `BBBContentAutopilotPage.tsx` Generate button: now shows a `{N} platforms` badge
  (live count of selected queueable providers) for immediate user visibility.
- `BBBContentAutopilotPage.tsx` description text: now uses accurate
  "template library" terminology instead of implying AI model generation.

### Added
- `src/lib/__tests__/autopilot-selection.test.ts`: 4 new describe blocks
  (16 additional tests, 233 total):
  - YouTube canonical audit (registry `operational`, resolves to `ready` when
    connected, `disconnected` when not, publish handler exists, generation
    and queue capabilities are independent from publish)
  - TikTok canonical audit (remains `pending_approval`, resolves to `pending`)
  - Media profile informational-only invariant (no width/height/aspectRatio
    fields in `CONTENT_PROFILES`, no image generation API called from page)
  - Zero-selection behavior (generation disabled when no platforms selected,
    re-enabled on selection, disabled again on clear)

---

## Previous sessions (summary)

### Command Center drag-and-drop
`DashboardPage.tsx` + `app-shell.tsx`: Framer Motion Reorder `axis="y"` failed
inside CSS 2-column grid because items in the same row share identical
y-coordinates. Fix: edit mode switches to `flex-direction: column` for unique
y-offsets. Auto-saves on every reorder event. Sidebar nav edit mode fixed with
same pattern. Storage key renamed to `ai-edge:command-center-layout:v1`.

### Content Autopilot registry refactor
`BBBContentAutopilotPage.tsx` now derives all platform metadata from
`social-providers.ts` canonical registry. Removed `QueueablePlatform`,
`AllPlatformId`, `QUEUE_PLATFORM_META`, `ALL_PLATFORM_TABS`, `INFO_PLATFORMS`,
`QUEUEABLE_PLATFORMS` local constants.

### Social publishing & Meta OAuth
Facebook + Instagram publishing pipeline, OAuth flow, draft queue, Publishing
Center, Meta status checks.

### Call Intelligence
`/admin/call-intelligence` — calls + sms_conversations tables, Telnyx
analytics, live call log.

### GorillaDesk analytics
`/admin/dashboard` GorillaDesk sync widget with live customer/revenue data.

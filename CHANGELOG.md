# Changelog

All notable changes to the AI Edge Solutions platform.

---

## [Unreleased]

### Fixed
- **Command Center tile drag-and-drop** (`/admin/dashboard`): tiles can now be
  grabbed by the ⠿ grip handle, dragged to a new position, and released. The
  new order persists across page refreshes via localStorage.
- **Root cause**: `Reorder.Group axis="y"` inside a CSS 2-column grid caused
  Framer Motion's 1-D reorder algorithm to fail silently — items in the same
  grid row share identical y-coordinates, so the insertion-point comparison
  always returned the same result. Fix: edit mode uses `flex-direction: column`
  so every item has a unique y-offset.
- **Sidebar nav reorder** (`app-shell.tsx`): same grid/axis bug patched.

### Changed
- `DashboardPage.tsx` `DraggableActionTile`: renders as `div` (not `li`),
  `touchAction: none` on item, auto-saves on every reorder event (not only on
  "Done").
- `app-shell.tsx` `DraggableTile`: renders as `div`, horizontal list-row layout
  in edit mode matches the new flex-column container.
- `dashboard-order.ts` storage key: `ai-edge-dash-actions-v1` →
  `ai-edge:command-center-layout:v1` (versioned colon-separated scheme).
- `saveDashOrder` and `clearDashOrder` now wrapped in try/catch for
  private-browsing / quota safety.

### Added
- `src/lib/__tests__/dash-order.test.ts`: 9 describe blocks (25+ assertions)
  covering default order, round-trip persistence, corrupt JSON fallback,
  unknown-ID stripping, duplicate-ID collapsing, new-tile appending, and key
  stability.

---

## Previous sessions (summary)

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

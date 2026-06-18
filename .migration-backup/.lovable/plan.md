# AI Edge v1 + Real OAuth — Implementation Plan

This is a large change. I'll ship it in two coordinated tracks across several rounds. Round 1 (this turn) lays the foundation; later rounds wire each provider's real OAuth and migrate UI.

---

## Track A — AI Edge v1 Architecture

### A1. Database (one migration)
- `clients` — id, user_id, name, website, phone, email, service_areas (jsonb), services (jsonb), social_urls (jsonb), logo_url, brand_voice, timezone, is_default, created_at/updated_at. RLS scoped to user_id.
- `client_id` foreign key (nullable, ON DELETE SET NULL) added to: `article_drafts`, `article_assets`, `content_packages`, `content_assets`, `keywords`, `social_connections`.
- Seed: auto-create one client named **Bed Bugs and Beyond** per existing user with `is_default=true`, then backfill all existing rows' `client_id` to that default. Future inserts default via app code to the current client.

### A2. Client switcher (UI)
- Global `ClientContext` (current active client persisted in localStorage).
- Client switcher dropdown in `AppShell` header (lists clients, "+ New Client").
- New route `/clients` — list, create, edit, set default, delete.
- New route `/clients/$id/settings` — Business Settings form (all fields from request). Replaces the localStorage `business-data.ts` profile; that helper now reads from the active client.

### A3. Content Packages (already partially built)
- Existing `content_packages` table reused. Add `client_id` FK.
- `/repurpose` flow already generates the 10 channel package — wire it to `client_id` and prefill Business/Service/City from active client's Business Settings.
- Confirms channels: SEO Article, GBP, Facebook, Instagram, LinkedIn, YouTube Short, TikTok, Image Prompt (existing 10-channel generator covers these).

### A4. Reporting Dashboard
- New route `/reports` (sidebar link).
- Tiles per active client (or "All clients"): Articles Created, GBP Posts, Social Posts, Published, Ready, Failed. Pulls counts from `article_drafts` + `article_assets` + `content_assets`.

---

## Track B — Real OAuth Scaffolding (priority order)

### B1. Schema upgrade for `social_connections`
- Add `scope text`, `token_type text`, `provider_metadata jsonb`, `last_error text`, `last_verified_at timestamptz`.
- Status derived: `connected` (token valid), `expired` (expires_at < now), `failed` (last_error set), `disconnected` (row absent).

### B2. OAuth infrastructure (per provider, same pattern)
For each provider P in priority order — Google Business Profile, Facebook, Instagram, YouTube, LinkedIn:
- **Secrets**: `<P>_CLIENT_ID`, `<P>_CLIENT_SECRET` (added via add_secret tool as we wire each one).
- **Start route** `/api/oauth/<p>/start` (server route): generates `state` (signed, includes user_id + return_to), redirects to provider authorize URL with the required scopes.
- **Callback route** `/api/oauth/<p>/callback`: verifies state, exchanges `code` → tokens, fetches account/page/channel metadata (account_id + account_name), upserts into `social_connections`, redirects back to `/connections`.
- **Refresh helper** in `src/lib/oauth/<p>.server.ts`: refreshes when `expires_at` is near; updates row or sets `last_error`.
- Account picker: Facebook/Instagram/GBP/YouTube return multiple pages/locations/channels — show a selection screen after callback before saving.

### B3. Connections UI updates
- Replace `window.prompt` mock with real Connect button → redirect to `/api/oauth/<p>/start`.
- Show connected entity name (Page/Location/Channel) + scope + expiry.
- Buttons: **Disconnect**, **Reconnect** (visible when status is `expired` or `failed`).

### B4. Distribution Center Publish vs Copy
- Lookup `social_connections` by current user + channel.
- If a valid connection exists for that channel → render **Publish** button (calls a `publishAsset` server function — implementations stubbed per provider, real publishing wired progressively).
- Otherwise → render **Copy** (current behaviour).
- Failed publish writes `last_error` to the asset and marks status `failed`.

---

## Rollout order (multi-turn)

**This turn (Round 1):**
1. Migration: `clients` table + FK backfill + `social_connections` upgrade.
2. `ClientContext`, client switcher, `/clients`, `/clients/$id/settings`.
3. `/reports` dashboard.
4. OAuth scaffolding: shared `state` signer, `/api/oauth/_state.server.ts` helper, and **Google Business Profile** start + callback routes wired end-to-end (will prompt for `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET`).
5. Connections UI: real Connect for Google Business Profile, mock retained for others until their turn.
6. Distribution Center: Publish-vs-Copy detection logic in place (Publish handlers are stubs that return "not implemented" for now).

**Round 2:** Facebook Pages OAuth + real Publish for FB + GBP.
**Round 3:** Instagram Business OAuth + Publish.
**Round 4:** YouTube OAuth + Publish (Shorts upload).
**Round 5:** LinkedIn Company Pages OAuth + Publish.

---

## Technical notes (skim)

- All OAuth handlers live under `src/routes/api/oauth/<provider>/{start,callback}.ts` (NOT `api/public/` — they require the user's session cookie to know who is connecting).
- State is a short-lived signed JWT (HS256 using `SUPABASE_SERVICE_ROLE_KEY`-derived secret) with `{user_id, return_to, exp, nonce}`.
- Tokens stored using existing `access_token`/`refresh_token` columns (already in the table). No encryption at rest in this round — they're RLS-protected; rotation later.
- The redirect URI you'll register with each provider is `https://<your-domain>/api/oauth/<provider>/callback`. I'll print the exact URLs in chat when each provider is wired so you can paste them into the provider console.

---

## What I need from you

After you approve this plan:
1. I'll prompt for `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` via the secrets tool.
2. I'll give you the exact **Authorized redirect URI** to paste into Google Cloud Console.
3. I'll continue rounds 2–5 the same way per provider.

Approve to start Round 1, or tell me what to change.
# Running this project on Replit

This app is built in Lovable (TanStack Start + Vite). It deploys to
Cloudflare Workers by default inside Lovable, but it can also run on
Replit as a long-running Node server. Nothing in the Lovable build was
removed — the only differences are environment variables.

## 1. Import from GitHub

1. Connect this Lovable project to GitHub (chat **+** menu → GitHub →
   Connect project → Create Repository).
2. In Replit: **Create Repl → Import from GitHub →** pick the repo.

## 2. First-run install

Replit's `.replit` already sets the run command. From the shell:

```bash
bun install
bun run dev
```

`bun run dev` starts Vite. It binds to `PORT=3000` / `HOST=0.0.0.0`
(set in `.replit`). Replit forwards container port `3000` to public
`80`/`443` automatically — open the webview to see the app.

For a production build on Replit Deployments:

```bash
bun run build
node .output/server/index.mjs
```

`NITRO_PRESET=node-server` (set in `.replit`) tells Nitro to emit a Node
server bundle instead of a Cloudflare Worker.

## 3. Environment variables to set in Replit Secrets

### Required to boot

| Key | Value | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `https://xancxpjrmgxxfhjkkujk.supabase.co` | Same as `.env` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | (anon key from `.env`) | Safe in client |
| `VITE_SUPABASE_PROJECT_ID` | `xancxpjrmgxxfhjkkujk` | |
| `SUPABASE_URL` | same as above | Server-side reads |
| `SUPABASE_PUBLISHABLE_KEY` | same as above | Server-side reads |
| `OAUTH_STATE_SECRET` | 32+ random chars | `openssl rand -hex 32` |
| `PUBLIC_APP_URL` | your Replit URL, e.g. `https://your-repl.username.repl.co` | Must exactly match OAuth redirect URIs |

### Required for admin DB writes (`supabaseAdmin`)

| Key | Where to get it |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | **Not exposed by Lovable Cloud.** Either ask Lovable support, or create your own Supabase project and re-run `supabase/migrations/*` against it. |
| `SUPABASE_DB_URL` | Same caveat. |

If you skip these, the app still runs — only server functions that use
the admin client (privileged writes / role grants) will error.

### AI provider (pick ONE)

Default is Lovable AI Gateway. To swap to OpenAI on Replit:

| Key | Value |
| --- | --- |
| `AI_PROVIDER` | `openai` |
| `OPENAI_API_KEY` | `sk-...` |
| `OPENAI_MODEL` | optional, default `gpt-4o-mini` |
| `OPENAI_BASE_URL` | optional, for OpenAI-compatible providers (Groq, Together, etc.) |

`LOVABLE_API_KEY` only works inside Lovable's infrastructure; it cannot
be copied to Replit. All AI calls go through a single facade —
`getAiModel()` in `src/lib/ai-gateway.server.ts` — so this is the only
file to change if you later want Anthropic / a local model / etc.

### OAuth providers (set what you use)

| Key | |
| --- | --- |
| `META_APP_ID`, `META_APP_SECRET` | Meta developer app |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Google Cloud Console |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | TikTok for Developers |

After deploying, **add the Replit callback URLs to each provider**:

```
https://<replit-url>/api/oauth/google/callback
https://<replit-url>/api/oauth/meta/callback
https://<replit-url>/api/oauth/tiktok/callback
https://<replit-url>/api/oauth/youtube/callback
```

## 4. Files to review after import

Nothing must be edited for the app to boot — `.replit` handles
preset/port/host. Optional polish:

- **`.env`** — Replit ignores it; use Secrets instead. Safe to leave.
- **`vite.config.ts`** — unchanged; `NITRO_PRESET` env var overrides the
  default Cloudflare target at build time.
- **`src/lib/ai-gateway.server.ts`** — swap point if you replace Lovable AI.
- **`supabase/migrations/`** — run against your own Supabase project if
  you create one.

## 5. Port summary

| Where | Port |
| --- | --- |
| Container (dev + prod) | `3000` (set via `PORT` in `.replit`) |
| Public (Replit forwards) | `80` / `443` |

## 6. What stays Lovable-only

- The Lovable preview keeps building for Cloudflare Workers — this file
  doesn't touch `vite.config.ts`.
- `LOVABLE_API_KEY` and the `lovable.auth` Google broker only work
  inside Lovable. On Replit, either set `AI_PROVIDER=openai` or wire up
  Google sign-in directly through Supabase Auth.

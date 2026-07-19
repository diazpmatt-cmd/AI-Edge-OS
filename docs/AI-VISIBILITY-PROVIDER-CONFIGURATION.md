# AI Visibility — Provider Configuration

**Last updated:** 2026-07-19
**Covers:** C9R-4 OpenAI AI Query Provider environment variables and operational controls

---

## Overview

C9R-4 introduces an on-demand AI query scan system. Scans are triggered explicitly via `POST /api/ai-visibility/query-scan/:clientId` — there is no background scheduler for AI query scans in V1. The AI Visibility scheduler (C9R-5) is a separate future feature.

---

## Environment Variables

### OpenAI Provider

| Variable | Required | Default | Description |
|---|---|---|---|
| `AI_INTEGRATIONS_OPENAI_API_KEY` | One of these two | — | Replit AI Integrations proxy API key (preferred in Replit-managed environments) |
| `OPENAI_API_KEY` | One of these two | — | Standard OpenAI API key (fallback if Replit proxy not available) |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | No | `https://api.openai.com/v1` | OpenAI-compatible base URL override (used when `AI_INTEGRATIONS_OPENAI_API_KEY` is set) |
| `OPENAI_BASE_URL` | No | `https://api.openai.com/v1` | Fallback base URL (used when only `OPENAI_API_KEY` is set) |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | Model identifier — any OpenAI-compatible model name |

**Key lookup order:**
1. `AI_INTEGRATIONS_OPENAI_API_KEY` + `AI_INTEGRATIONS_OPENAI_BASE_URL`
2. `OPENAI_API_KEY` + `OPENAI_BASE_URL`

If neither key is present, every query result will have `success: false` and `failureReason: "not_configured"`. The scan still completes (it persists zero-evidence results) and `coverage` for `ai_query` reports `not_connected`.

---

## Enabling Live AI Query Execution

To enable real OpenAI calls from the API server:

1. Add the key via Replit Secrets (never hardcode):
   ```
   Secret name:  AI_INTEGRATIONS_OPENAI_API_KEY
   Secret value: <your Replit AI integration key or OpenAI API key>
   ```
2. (Optional) Override the model:
   ```
   Secret name:  OPENAI_MODEL
   Secret value: gpt-4o   # or any OpenAI-compatible model
   ```
3. Restart the API Server workflow.
4. Verify: `GET /api/ai-visibility/query-scan/<clientId>/latest` — should return a scan after the first POST.

**Trigger a scan:**
```
POST /api/ai-visibility/query-scan/<clientId>
Authorization: Bearer <clerk-token>
```

---

## Disabling Live AI Query Execution

AI query scans are **entirely demand-triggered** — removing the key stops all new real queries:

1. Delete `AI_INTEGRATIONS_OPENAI_API_KEY` (and `OPENAI_API_KEY` if present) from Replit Secrets.
2. Restart the API Server workflow.
3. Any subsequent `POST /api/ai-visibility/query-scan/:clientId` will persist a scan record with all results having `failureReason: "not_configured"`.
4. The read-model endpoint (`GET /api/ai-visibility/read-model/:clientId`) continues to serve the last completed scan's results from the database — it does NOT re-query the provider.

There is no feature flag, no `AI_QUERY_ENABLED` env var, and no code change required to disable. Key absence = provider disabled.

---

## Per-Query Timeouts

Each individual query to the OpenAI provider has a **15-second timeout** enforced by `AbortController`. If the provider does not respond within 15 s, the result is recorded with `failureReason: "timeout"` and the scan continues with the next query. This prevents a single slow response from blocking the entire scan.

---

## Cost Control

Queries execute **sequentially**, not in parallel. This is intentional:

- Prevents OpenAI rate limit hits on rapid-fire requests
- Provides a natural per-scan cost ceiling: `queryCount × avgCostPerQuery`
- Default `AI_QUERY_GENERATION_LIMIT = 12` queries per scan

For BBB with 2 active services and 2 geographies, the default generates approximately 6–10 queries per scan.

---

## Failure Classification

The provider maps HTTP/network errors to structured failure reasons:

| `failureReason` | Trigger |
|---|---|
| `not_configured` | No API key present |
| `timeout` | AbortController fired after 15 s |
| `auth_failure` | HTTP 401 or `"invalid api key"` message |
| `rate_limit` | HTTP 429 or `"rate limit"` / `"quota"` message |
| `provider_error` | All other errors |

Failed results are persisted to `ai_query_results` with `success: false`. They are NOT surfaced as read-model observations.

---

## BBB Service-Rule Constraints

For the Bed Bugs & Beyond client:

- **Prohibited phrases:** `[]` in V1 — the AI query generator has no prohibited phrases for BBB's scan queries. The "no termite" rule is a service-registry content prohibition, not an AI query filter.
- **Active services:** Resolved from the service registry at scan time. Only services registered for BBB contribute to query generation.
- **Geographies:** Resolved from `local_presence_profiles.service_areas_json` if populated, else falls back to `"my area"` as the geography token.
- **Competitors:** Resolved from the `competitors` table for `clientId = "bbb"`. Domain matches enable URL detection in AI responses.

---

## C9R-5 Scheduler (Not Yet Implemented)

The C9R-5 phase will add `AI_VISIBILITY_SCHEDULER_ENABLED` (default: `false`) to trigger automated periodic scans. Until C9R-5, all scans are manual via the POST endpoint or the "Run Scan" button in the AI Query tab.

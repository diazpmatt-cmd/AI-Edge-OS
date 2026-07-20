# AI Visibility Engine — Environment Variables

**Last updated:** 2026-07-20

---

## Required for live scans

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes (for live scans) | OpenAI API key used by `OpenAiQueryProvider`. Without this key, any call to the scan endpoint will fail. |

---

## Scheduler variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_VISIBILITY_SCHEDULER_ENABLED` | `""` (disabled) | Set to the literal string `"true"` to activate the scheduler tick. Any other value (including absent) keeps it off. |
| `AI_VISIBILITY_SCHEDULER_MAX_PER_TICK` | `5` | Maximum number of tenant scans to launch per scheduler tick. Clamped to `[1, 20]`. |

---

## Internal / scheduler authentication

| Variable | Required | Description |
|----------|----------|-------------|
| `SCHEDULER_SECRET` | Yes (auto-set) | Shared secret used by the scheduler to authenticate internal POST requests to `/api/ai-visibility/ingest/scheduled`. Set automatically by the Replit environment alongside other scheduler secrets. Do **not** expose this value. |

---

## Cost implications

| Scenario | Approximate LLM calls per scan |
|----------|-------------------------------|
| 1 tenant scan (typical) | 10–20 calls to `gpt-4o-mini` |
| `MAX_PER_TICK=5`, all tenants eligible | 50–100 calls per tick |
| Daily schedule, 1 tenant | ~365 scans/year |
| Weekly schedule, 10 tenants | ~520 scans/year |

**Recommendation:** leave `AI_VISIBILITY_SCHEDULER_ENABLED` unset in development. In production, start with `MAX_PER_TICK=1` and a `weekly` frequency until cost per scan is measured.

---

## Safe enablement checklist

1. `OPENAI_API_KEY` is set and valid
2. `SCHEDULER_SECRET` is set (verify `artifacts/api-server/src/lib/scheduler-secret.ts`)
3. At least one tenant has been enabled via `PUT /api/ai-visibility/schedule/:clientId { enabled: true }`
4. Set `AI_VISIBILITY_SCHEDULER_ENABLED=true` in environment secrets
5. Restart the API server workflow
6. Monitor `[ai-visibility-scheduler]` log entries in the first tick (~60 min after restart)
7. Verify scan records appear in `GET /api/ai-visibility/read-model/:clientId/history`

---

## Full variable reference (AI Visibility only)

| Variable | Consumed by | Notes |
|----------|-------------|-------|
| `OPENAI_API_KEY` | `OpenAiQueryProvider` | Live LLM calls |
| `AI_VISIBILITY_SCHEDULER_ENABLED` | `parseAiVisibilitySchedulerEnvConfig()` | Must equal `"true"` |
| `AI_VISIBILITY_SCHEDULER_MAX_PER_TICK` | `parseAiVisibilitySchedulerEnvConfig()` | Integer 1–20 |
| `SCHEDULER_SECRET` | `ai-visibility-scheduler-monitor.ts` | Internal auth; never log |
| `PORT` | `ai-visibility-scheduler-monitor.ts` | Inbound loop-back URL; default `8080` |

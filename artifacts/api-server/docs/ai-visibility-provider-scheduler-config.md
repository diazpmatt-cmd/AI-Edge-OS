# AI Visibility — Provider & Scheduler Configuration

**Applies to:** C9R-5 and beyond  
**Last updated:** 2026-07-20

---

## Provider Configuration

### Current provider: OpenAI (`OpenAiQueryProvider`)

The only live AI query provider in v1. Loaded automatically in `AiQueryScanService` when no explicit provider is injected.

| Setting | Source | Notes |
|---------|--------|-------|
| API key | `OPENAI_API_KEY` environment secret | Required for live scans |
| Model | Hard-coded to `gpt-4o-mini` in `OpenAiQueryProvider` | Chosen for cost/quality balance |
| Timeout | Provider-internal (follows OpenAI SDK defaults) | No explicit per-query timeout in v1 |

**Test injection:** The `AiQueryScanService` constructor accepts an optional `provider?: AiQueryProvider` parameter. All tests pass a mock provider — no test ever calls a paid API.

### Adding a new provider

1. Implement the `AiQueryProvider` interface (in `lib/db/src/`):
   ```typescript
   interface AiQueryProvider {
     readonly name:  string;
     readonly model: string;
     execute(input: AiQueryProviderInput): Promise<AiQueryResult>;
   }
   ```
2. Export from `lib/db/src/index.ts`
3. Inject via `AiQueryScanService(pool, db, new MyProvider())`

A provider registry (similar to the backlink provider registry) is planned for C9R-6+.

---

## Scheduler Configuration

### Global on/off

The scheduler is **disabled by default** in all environments. Activate it by setting:

```
AI_VISIBILITY_SCHEDULER_ENABLED=true
```

Without this variable set to the literal string `"true"`, the scheduler tick is never registered, and no automated scans run regardless of per-tenant `enabled=true` rows.

### Batch size per tick

```
AI_VISIBILITY_SCHEDULER_MAX_PER_TICK=5
```

| Value | Effect |
|-------|--------|
| Not set | Default: 5 tenants per tick |
| 1–20 | Enforced as-is |
| < 1 | Clamped to 1 |
| > 20 | Clamped to 20 |

Set conservatively. Each tenant scan runs a sequential series of OpenAI calls; at 5 concurrent tenants per tick and ~15 queries per scan, a single tick could issue up to 75 LLM requests. In production start with 1–3 until cost characteristics are validated.

### Per-tenant schedule row

Managed via `PUT /api/ai-visibility/schedule/:clientId`:

```json
{
  "enabled": true,
  "frequency": "weekly"
}
```

| Field | Type | Accepted values | Default |
|-------|------|-----------------|---------|
| `enabled` | boolean | `true` / `false` | `false` |
| `frequency` | string | `daily` `weekly` `biweekly` `monthly` | `weekly` |

Supported intervals:

| Frequency | Interval |
|-----------|----------|
| `daily`   | 24 hours |
| `weekly`  | 7 days   |
| `biweekly`| 14 days  |
| `monthly` | 30 days  |

**First run timing:** when enabling a previously-disabled schedule, `next_run_at` is set to `NOW() + 60 s` so the first scan fires within the next scheduler tick.

---

## Failure & Backoff Behaviour

The scheduler tracks `consecutive_failures` per schedule row. On each failure:

```
next_run_at = NOW() + aiVisibilityBackoffMs(consecutive_failures)
```

Backoff table (`AI_VISIBILITY_BACKOFF_MAX_MS = 15_360_000 ms`):

| consecutive_failures | Delay     |
|---------------------|-----------|
| 1                   | 2 min     |
| 2                   | 4 min     |
| 3                   | 8 min     |
| 4                   | 16 min    |
| 5                   | 32 min    |
| 6                   | 64 min    |
| 7                   | 128 min   |
| 8 (and above)       | **256 min** (cap) |

When `consecutive_failures >= max_retries` (default: 3), the schedule row is **auto-disabled** (`enabled=false`). The tenant (or admin) must re-enable via `PUT /api/ai-visibility/schedule/:clientId { enabled: true }`, which also resets `consecutive_failures` to 0.

---

## Rollback / Disable

**Disable globally (no-restart required):**
```
AI_VISIBILITY_SCHEDULER_ENABLED=   (remove or set to anything other than "true")
```
The scheduler guard in `scheduler.ts` checks the env var at registration time. Restarting the server with the variable absent prevents registration.

**Disable per-tenant:**
```http
PUT /api/ai-visibility/schedule/:clientId
{ "enabled": false }
```

**Emergency: disable all scheduled AI scans:**
1. Set `AI_VISIBILITY_SCHEDULER_ENABLED` to any value other than `"true"` in environment secrets
2. Restart the API server workflow
3. All existing schedule rows retain their `next_run_at` values but the tick no longer fires

---

## Operational Logs

All scheduler log lines carry the prefix `[ai-visibility-scheduler]` for filtering:

| Event | Level | Fields |
|-------|-------|--------|
| Scans due this tick | `info` | `count` |
| Skipping in-flight client | `info` | `clientId` |
| Scan succeeded | `info` | `clientId`, `frequency`, `nextAt` |
| Scan failed (HTTP non-2xx) | `warn` | `clientId`, `newFails`, `nextAt`, `httpStatus`, `body` |
| Auto-disabled | `warn` | `clientId`, `newFails`, `httpStatus`, `body` |
| Tick exception | `error` | `clientId`, `err` |

Example filter (structured logger):
```
grep '\[ai-visibility-scheduler\]' /var/log/api-server.log
```

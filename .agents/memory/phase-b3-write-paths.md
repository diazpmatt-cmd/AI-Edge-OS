---
name: Phase B3 Write-Path Tenant Isolation
description: PUT settings, pause, resume made tenant-aware; resolveClientActiveCheck added; read-path fallback leak fixed.
---

## What changed in Phase B3

Three write paths in `auto-content.ts` were made tenant-aware. All hardcoded
BB&B identity removed from route handlers.

## resolveClientActiveCheck (new export in client-resolver.ts)

Lightweight check: queries `clients` table only (no registry load).
Returns `{ ok: true, clientName, slug, clientId }` or `{ ok: false, reason: "not_found" | "inactive" }`.
Used by pause — which does not require registry validation (safety operation).

**Why not use the full resolver for pause:** Registry load is expensive and unnecessary
for pausing. Pausing is a safety operation; it should succeed even if the registry
has transient issues. Only resume requires a valid registry (it enables generation).

## PUT /auto-content/settings

1. Always calls `resolveClientContentContextFromDb(userId)` — registry must be valid.
2. `clientName` and `industry` come from resolved context, NEVER from request body.
3. Topics validated via `ctx.registry.validateTopic()` if provided in body.
4. Topics normalized via `ctx.registry.normalizeTopics()` after validation.
5. Empty normalized-topics after normalization → 422 SERVICE_NOT_GENERATABLE.
6. Still INSERT OR UPDATE — can create first row for a new client (with correct identity).
7. Logs `[auto-content] settings updated for <clientName> (userId…)`.

## POST /auto-content/pause

1. Uses `resolveClientActiveCheck(userId)` — lightweight, no registry.
2. **UPDATE only** — if no settings row exists → 404 `settings_not_found`.
3. Sets `enginePaused = "true"`, leaves `autopilotEnabled` untouched.
4. Idempotent (repeated pause returns success).
5. Logs `[auto-content] autopilot paused for <clientName>`.

## POST /auto-content/resume

1. Full resolution: `resolveClientContentContextFromDb(userId)`.
2. Registry failures block resume (cannot enable engine without valid registry).
3. **UPDATE only** — if no settings row exists → 404 `settings_not_found`.
4. Pre-flight checks before UPDATE:
   - `configuredAreas.length > 0` (else 422 `service_areas_required`)
   - `configuredTopics.length > 0` (else 422 `topics_required`)
   - `approvalMode ∈ {approval_required, draft_only, auto_schedule}` (else 422 `invalid_approval_mode`)
5. Sets `enginePaused = "false"`, leaves `autopilotEnabled` untouched.
6. Logs success or rejection reason.

## Read-path fallback fix

GET settings (second resolve, line ~192) and GET suggestions (line ~1105):
- **Before:** `resolved.found ? resolved.context.serviceAreas : DEFAULT_SERVICE_AREAS`
  → leaked BB&B Alabama cities / BB&B topics to other tenants on registry failure.
- **After:** `resolved.found ? resolved.context.serviceAreas : []`
  → registry failure returns empty arrays, not BB&B defaults.

**Why this matters:** BB&B's DEFAULT_SERVICE_AREAS and DEFAULT_TOPICS are
Alabama-specific. Another tenant's UI seeing these as "their" defaults is a
data contamination bug.

## Topic validation design: unknown topics pass through

`validateTopicForGenerationWith(services, topic)` returns `null` for unknown
topics (topics not in the registry). This is **intentional** — the comment says
"Unknown topic — allow (may be a valid pest not in registry yet)."

**Consequence for cross-tenant topic isolation:** If a Lakeside user submits
"Bed Bug Inspection" in PUT settings, `validateTopic` returns null (unknown to
Lakeside registry) and `normalizeTopics` keeps it (null = passes through).
The isolation guarantee is NOT at topic-string validation time — it is at:
- clientName/industry: always from canonical client record
- content generation context: uses that client's registry for generation
- Row isolation: upsert keyed on Clerk userId (UNIQUE constraint)

**Keyword safety rails** (code-level, not DB-overridable) apply to ALL providers:
- `"termite"` → SERVICE_COMING_SOON
- `"wildlife"` → SERVICE_DISABLED
- `"heat treatment"` / `"whole
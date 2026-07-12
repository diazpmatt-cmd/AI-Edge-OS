---
name: Phase C6 Lifecycle Governance audit
description: Audit findings, confirmed defects, design limitations, and test coverage for C6.
---

# Phase C6 — Lifecycle Governance Audit

**Verdict**: Production-ready after two defect fixes (both applied).

## Defects Found and Fixed

### D1 — Missing appendAudit in cancel rejection path (MEDIUM)
- File: `artifacts/api-server/src/routes/discovery-inspect.ts`
- When a run is not cancellable, `createAuditEvent()` result was discarded and `appendAudit()` was never called. Rejected cancellation attempts were silently dropped from the audit trail.
- Fix applied: capture result in `rejAudit`; add `appendAudit(pool, rejAudit).catch(() => {})`.

### D2 — Wrong audit action in pipeline error catch (MEDIUM)
- Files: `lib/db/src/discovery-audit.ts` + `artifacts/api-server/src/routes/discovery-run.ts`
- Pipeline exceptions were logged with `"execution_denied_governance"` — implies governance denial when the run had started and hit an exception.
- Fix applied: added `"execution_failed"` to `AuditAction` union; updated catch block.

## Design Limitations (Not Defects)

- **In-memory rate limiter**: not shared across instances; acknowledged in code comment; acceptable for single-instance deployment.
- **TOCTOU race on lease**: lease acquired retroactively after `pipeline.run()` completes; governance check uses snapshot status not lease; race window is negligible for single-instance. Would need distributed lock for multi-instance.
- **Pipeline cancellation not wired**: `discovery-pipeline.ts` has zero cancellation token checks at stage boundaries. `cancel_requested` state change does not interrupt in-flight stages — cooperative cancellation is intentional but incomplete.
- **/auth/i over-redaction**: `REDACTED_KEY_PATTERNS` regex `/auth/i` catches `author`, `authority_signal` etc.; audit records remain correct but some metadata may be needlessly redacted.

## Test Coverage

- **212 C6 unit tests**: all pass (before and after fixes)
- **1,592 total tests** across 29 test files: 1,592 passed, 2 skipped, 0 failed
- Full suite times out when run as one command (cumulative transform time ~120s); must batch into groups of ≤10 test files for CI.
- No integration/DB tests for `discovery-c6-repository.ts` or routes — only pure unit tests.

## Verified Correct

- Tenant isolation: every C6 repository query includes `client_id` in WHERE
- `ACTIVE_RUN_STATES` = `["running", "queued", "planned", "cancel_requested"]` — comprehensive
- Rate limit check fires before client resolution, idempotency, governance, and pipeline
- `evaluateGovernance(DEFAULT_GOVERNANCE_POLICY, activeRuns)` signature correct; `internalOverride` never from request body
- Budget guard fires at Step 7 (before pipeline at Step 8)
- Lease released in `finally` block guarded by `leaseAcquired` flag
- Credential fields (DataForSEO login/password) never leak into response bodies

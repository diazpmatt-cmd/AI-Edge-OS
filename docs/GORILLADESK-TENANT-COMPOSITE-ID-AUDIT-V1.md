# GorillaDesk Tenant Composite ID Audit V1

Date: 2026-08-20

Umbrella: GitHub issue #535

## Decision

Keep the existing global uniqueness constraints until real data is checked for collisions. Immediately fail closed in reusable import/sync code so a provider ID owned by one project cannot be overwritten by another project.

## Repository findings

| Surface | Existing identity | Risk | Guard |
|---|---|---|---|
| Jobs | global `external_id` unique | cross-project upsert could update foreign job fields | preflight ownership classification plus conflict-update project predicate |
| Payments | global `external_id` unique | cross-project upsert could update foreign payment/job/revenue fields | preflight ownership classification plus conflict-update project predicate |
| Customers | global `external_id` unique | live sync lookup/update ignored project | lookup and update now require matching `project_id`; foreign collision insert is ignored |
| Payment → job | `project_id` plus `job_id` at read time | unscoped joins could cross tenants | verification queries both sides through authenticated tenant project |
| Import routes | hard-coded `bed-bugs-and-beyond` project | not reusable multi-tenant onboarding | remain legacy-only; do not expose as generic tenant import routes |

## Why the schema migration is deferred

Changing a global unique constraint to `(project_id, external_id)` is structurally correct for multi-tenancy, but migration safety cannot be inferred from source code. Existing rows may contain duplicate provider IDs, null project ownership, or relationships that rely on global IDs. Production data was not accessed.

## Required read-only collision queries

Run only through an authorized read-only database path:

```sql
SELECT external_id, COUNT(DISTINCT project_id) AS project_count
FROM gorilladesk_jobs
WHERE external_id IS NOT NULL
GROUP BY external_id
HAVING COUNT(DISTINCT project_id) > 1;

SELECT external_id, COUNT(DISTINCT project_id) AS project_count
FROM gorilladesk_customers
WHERE external_id IS NOT NULL
GROUP BY external_id
HAVING COUNT(DISTINCT project_id) > 1;

SELECT external_id, COUNT(DISTINCT project_id) AS project_count
FROM gorilladesk_payments
WHERE external_id IS NOT NULL
GROUP BY external_id
HAVING COUNT(DISTINCT project_id) > 1;
```

Also count null/blank project IDs and orphaned payment `job_id` values per project before migration design is approved.

## Migration design if collision audit is clean

1. Add concurrent unique indexes on `(project_id, external_id)` for non-null external IDs.
2. Update every conflict target and lookup to the composite identity.
3. Validate payment-to-job and job-to-customer references within the same project.
4. Remove old global uniqueness only after application code and indexes are active.
5. Keep rollback indexes until post-migration tenant-isolation checks pass.

No migration SQL was added or executed in this mission.

## Next boundary

The repository guard is independently testable. Final schema migration planning requires collision counts from an authorized read-only production query or sanitized export.

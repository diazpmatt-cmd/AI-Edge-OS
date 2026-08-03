# Production Change-Isolation Evidence

Date: 2026-08-03
Scope: Read-only comparison between the last recorded healthy production commit and current `main`

## Verified runtime state

The primary Coolify Docker Compose application still reports:

- status: `exited:unhealthy`
- restart count: `11`
- maximum restart count: `10`
- last restart type: `crash`
- last online time: `2026-08-03 01:36:48`
- repository: `diazpmatt-cmd/AI-Edge-OS`
- branch: `main`
- reported commit: `HEAD`, not an immutable SHA

No restart, deployment, configuration change, or production mutation was performed.

## Known healthy reference

The recorded successful production deployment reference is:

`b6319d32e805b24c015c8ec758d345260cf030b9`

GitHub comparison shows current `main` is **85 commits ahead** of that reference and not behind it. This establishes a broad regression window; it does not identify the failing commit.

## Deployment-surface changes in the regression window

The compare includes material runtime changes:

- `Dockerfile`: 27 additions and 1 deletion.
- `docker-compose.coolify.yml`: 133 additions and 5 deletions.
- Four standalone worker entrypoints were added:
  - planner
  - bounded reasoning agent
  - preparation
  - publishing
- The Compose stack now starts separate planner, agent, preparation, and publishing services.
- `web` and the publishing worker depend on the API becoming healthy.
- The API health check targets `http://127.0.0.1:3000/api/healthz`.
- The runtime image now packages fixed read-only context and preparation-source trees.
- The API container command remains `node --enable-source-maps ./artifacts/api-server/dist/index.mjs`.

These facts make the API health path, worker startup, packaged files, required environment variables, and mounted Google Cloud files the highest-value evidence targets. They do **not** prove any one of them is the root cause.

## Safe isolation plan

1. Obtain the exact immutable SHA from the failed Coolify deployment.
2. Obtain bounded logs for each Compose service and identify the first failing service.
3. Reproduce image build and Compose rendering for the exact failed SHA in CI or an isolated environment.
4. Compare the failed SHA with the known healthy reference, prioritizing:
   - `Dockerfile`
   - `docker-compose.coolify.yml`
   - API startup and `/api/healthz`
   - worker entrypoints and their startup configuration
5. If runtime logs remain unavailable, perform a non-production commit bisect using build and startup checks. Do not bisect by repeatedly changing production.
6. Preserve database contents and protected secrets; do not use destructive migrations or placeholder credentials to force startup.

## Evidence still required

The following remain unknown:

- exact deployed commit SHA
- first service to exit or become unhealthy
- exception or exit code
- API health-check output
- presence of required environment variables
- presence and readability of mounted credential files
- whether the failure occurs before or after database connection

## Conclusion

The regression window has been narrowed from an undefined production failure to a verified 85-commit range containing substantial Docker and Compose changes. Runtime logs and the immutable failed deployment SHA are still required before any repair can be called evidence-based.

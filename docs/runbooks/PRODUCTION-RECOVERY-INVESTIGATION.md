# Production Recovery Investigation

Last updated: 2026-08-03
Scope: AI Edge OS production application in Coolify

## Purpose

Record verified production evidence, distinguish facts from hypotheses, define a safe recovery sequence, and prevent a restart loop from being mistaken for a completed repair.

## Verified Coolify state

Evidence collected through the read-only Coolify connector on 2026-08-03:

### Server

- Server name: `AI Edge Production/Hertzner`
- Server UUID: `jt34n238twl21zseo7vm2e9h`
- Server reachable: yes
- Server usable: yes
- Coolify version: `4.1.2`

### Primary Docker Compose application

- Application UUID: `rkonpoppxacsnlfkqmf6yct6`
- Repository: `diazpmatt-cmd/AI-Edge-OS`
- Branch: `main`
- Build pack: `dockercompose`
- Compose file: `/docker-compose.coolify.yml`
- Status: `exited:unhealthy`
- Restart count: `11`
- Maximum restart count: `10`
- Last restart type: `crash`
- Last online time reported by Coolify: `2026-08-03 01:36:48`
- Coolify application-level health check enabled: no
- Public web domain configured in compose metadata: `https://aiedgesolutions.online`
- Application-level FQDN field: empty

### Secondary web application

- Application UUID: `h3yxpr01zd7th0dimwq5yiu2`
- Repository: `diazpmatt-cmd/AI-Edge-OS`
- Branch: `main`
- Build pack: `dockerfile`
- FQDN: `https://alex.aiedgesolutions.online`
- Status: `running:unknown`
- Restart count: `0`

The reachable server and running secondary application show that the host itself is not broadly unavailable. They do not prove that the primary API, database connection, secrets, or Docker Compose stack are healthy.

## Verified repository configuration

The current `main` version of `docker-compose.coolify.yml` defines:

- API health check against `http://127.0.0.1:3000/api/healthz`.
- `web` and `dab-publishing-worker` dependencies on a healthy API.
- Required startup variables for the API, including database, Clerk, scheduler, and GorillaDesk secrets.
- Required mounted Google Cloud credential and certificate files.
- Planner, agent, preparation, and publishing workers.
- `restart: unless-stopped` for stack services.

A failure in API startup or its health endpoint can therefore prevent dependent services from becoming ready and can make the whole compose application appear unhealthy.

## Facts not yet available

The current Coolify connector does not expose container logs, deployment logs, per-service container status, environment-variable presence, mounted-file existence, or health-check output. Therefore the exact crashing service and root-cause exception have **not** been verified.

Checklist item 10 must remain unchecked until runtime log evidence identifies the failing service and error. Restarting without that evidence is not diagnosis.

## Ranked hypotheses requiring log verification

These are investigation targets, not findings:

1. A required secret is absent, blank, or incorrectly parsed.
2. One or more required Google Cloud bind-mounted files do not exist in the deployment checkout.
3. The API process starts but `/api/healthz` does not return HTTP 200 within the compose health-check window.
4. The API cannot connect to PostgreSQL during startup or health evaluation.
5. A migration or schema expectation fails during boot.
6. The built API artifact or one worker entrypoint is missing or incompatible with the deployed image.
7. Coolify compose-domain or routing metadata is stale after prior deployment changes.
8. A worker crashes independently and contributes to the compose application failure state.

## Safe evidence collection order

An operator with Coolify access should collect evidence without changing configuration:

1. Open the failed deployment and record the deployment ID, commit SHA, start time, and final status.
2. Capture the final bounded error section from build/deployment logs.
3. Capture the most recent bounded logs for each compose service:
   - `api`
   - `web`
   - `dab-planner-worker`
   - `dab-agent-worker`
   - `dab-preparation-worker`
   - `dab-publishing-worker`
4. Record which container first exited or became unhealthy.
5. Record the API health-check failure output and timestamps.
6. Verify only the **presence**, not values, of required Coolify variables.
7. Verify only the existence and readable mount status of the five Google Cloud files.
8. Confirm PostgreSQL is reachable from the application network.
9. Record the exact deployed Git commit rather than relying on `HEAD` as a label.
10. Store no secret values, tokens, certificates, customer data, or unrestricted logs in GitHub.

## Recovery decision tree

### Required variable missing

- Add or correct the variable through protected Coolify configuration.
- Do not commit a secret or placeholder value.
- Redeploy the exact reviewed commit.

### Required mounted file missing

- Restore the file through the approved secret-provisioning path.
- Confirm file ownership and read-only mount behavior.
- Do not add private credential material to Git.

### API health endpoint failing

- Test the API process and `/api/healthz` independently.
- Correct the endpoint, dependency check, port, or startup period only after the failure is reproduced.
- Keep dependent services stopped until the API reports healthy.

### Database failure

- Verify database health, network attachment, credentials, TLS requirements, and migration state.
- Do not run destructive or unreviewed migrations as a recovery shortcut.

### Artifact or entrypoint failure

- Compare the Docker image contents and build output with the referenced commands.
- Correct the build manifest or command in a reviewed branch.
- Require CI validation before redeployment.

## Verification gates for checklist item 11

The primary application is not considered restored until all applicable evidence is recorded:

- Exact repaired commit identified.
- Deployment completes without restart exhaustion.
- API container remains running and healthy.
- `/api/healthz` returns HTTP 200 through the intended internal check.
- Public web route returns the expected response.
- PostgreSQL remains healthy.
- Required workers have expected state and no crash loop.
- Restart count remains stable during an observation period.
- No secret values appear in logs, commits, issues, or reports.
- Rollback target and procedure are documented.

## Rollback boundary

If a recovery change worsens health or introduces a new failure:

1. Stop further automatic retries.
2. Return to the last verified healthy commit and configuration snapshot.
3. Preserve the failed deployment evidence.
4. Reconfirm database integrity before bringing dependent workers back online.
5. Record the failed hypothesis and continue from evidence rather than stacking speculative changes.

## Current blocker

**Blocked on bounded runtime logs from the primary Coolify Docker Compose application.** The connector confirms a crash loop and exhausted restart limit but cannot expose the exact container exception. No restart, deployment, secret change, or production mutation was performed while producing this report.

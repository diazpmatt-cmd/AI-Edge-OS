# Coolify on Hetzner Deployment Runbook

## Deployment source

- Repository: `diazpmatt-cmd/AI-Edge-OS`
- Branch: `main`
- Compose file: `docker-compose.coolify.yml`
- Public service: `web`
- Internal API service: `api`

## Coolify configuration

Create or update a Docker Compose application using this repository and Compose file. Attach the production domain to the `web` service on port 80. Do not expose the `api` service publicly; Nginx proxies same-origin `/api/*` requests to it over the Compose network.

## Required protected variables

Store these only in Coolify's protected environment-variable store:

- `DATABASE_URL`
- `CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `SCHEDULER_SECRET`
- `PRIVATE_OBJECT_DIR` (the private Google Cloud Storage path, beginning with the bucket name)
- `OBJECT_STORAGE_SERVICE_ACCOUNT_JSON_B64` (base64-encoded Google Cloud service-account JSON)
- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_CLERK_PROXY_URL` when a Clerk proxy is used

Do not commit provider secrets, database credentials, OAuth secrets, Telnyx credentials, SMTP credentials, or production API keys.

The Compose application pins `OBJECT_STORAGE_PROVIDER=gcs`. The service account must be able to create V4 signed URLs and read/write objects in the configured private bucket. Configure the bucket CORS policy separately to allow HTTPS `PUT` requests from `https://aiedgesolutions.online`; never make the bucket public.

## Enforced safety state

The Compose file pins these values and they must not be overridden during Referral Growth acceptance:

- `SCHEDULER_ENABLED=false`
- `REFERRAL_SCHEDULER_ENABLED=false`
- `AI_VISIBILITY_SCHEDULER_ENABLED=false`
- `REFERRAL_DELIVERY_ENABLED=false`
- `REFERRAL_DELIVERY_MODE=dry_run`
- `REFERRAL_DELIVERY_EMERGENCY_STOP=true`
- `REFERRAL_DELIVERY_ALLOWLIST=`

The API startup code only starts recurring schedulers when `SCHEDULER_ENABLED` is exactly `true`.

## Deployment procedure

1. Confirm the selected Git revision is the approved `main` commit.
2. Confirm all required variables exist in Coolify.
3. Confirm the safety values above remain unchanged.
4. Deploy the Compose application.
5. Wait for both service health checks to pass.
6. Verify `GET /healthz` on the public domain returns `200 ok`.
7. Verify `GET /api/healthz` returns JSON with `status: ok`.
8. Sign in through Clerk and perform tenant-scoped read-only smoke tests.
9. Confirm Referral Growth readiness reports delivery disabled, dry-run mode, emergency stop engaged, and schedulers disabled.
10. Do not send a live message, issue a reward, process a payment, write to an external CRM, or release the emergency stop without separate authorization.

## Rollback

Use Coolify's previous successful deployment revision. After rollback, repeat both health checks and verify the safety-state indicators. Database rollback is not automatic; do not reverse migrations unless a reviewed migration-specific rollback procedure exists.

## Production acceptance evidence

Record:

- deployed Git SHA;
- deployment start and completion times;
- web and API health results;
- authenticated smoke-test results;
- Referral Growth safety-state screenshot or API evidence;
- any warnings or deviations;
- rollback revision available at deployment time.

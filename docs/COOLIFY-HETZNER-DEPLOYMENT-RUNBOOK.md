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
- `PRIVATE_OBJECT_DIR=/ai-edge-os-media-prod-bbb-4827/private`
- `GOOGLE_CLOUD_PROJECT=project-4978b26c-b88e-454b-875`
- `GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/gcp/workload-identity-credential.json`
- `GOOGLE_API_CERTIFICATE_CONFIG=/run/secrets/gcp/certificate-config.json`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_CLERK_PROXY_URL` when a Clerk proxy is used

Do not commit provider secrets, database credentials, OAuth secrets, Telnyx credentials, SMTP credentials, or production API keys.

The Compose application pins `OBJECT_STORAGE_PROVIDER=gcs-wif`. It deliberately rejects the former `OBJECT_STORAGE_SERVICE_ACCOUNT_JSON_B64` path. Production uses X.509 Workload Identity Federation, one-hour service-account impersonation tokens, and the IAM Credentials `signBlob` API. No Google service-account private key is created or stored.

## Keyless Google Cloud Storage authentication

### Fixed identities

- Project ID: `project-4978b26c-b88e-454b-875`
- Bucket: `ai-edge-os-media-prod-bbb-4827`
- Service account: `ai-edge-os-media-prod@project-4978b26c-b88e-454b-875.iam.gserviceaccount.com`
- Workload identity pool ID: `ai-edge-coolify-prod`
- X.509 provider ID: `hetzner-x509`
- Certificate subject: `ai-edge-os-coolify-prod`

Obtain `PROJECT_NUMBER` with `gcloud projects describe project-4978b26c-b88e-454b-875 --format=value(projectNumber)`. Use the numeric value in principal and provider resource names; do not substitute the project ID.

### Google Cloud setup

1. Keep the enforced `iam.disableServiceAccountKeyCreation` policy enabled. Do not create or download a service-account JSON key.
2. Enable `iam.googleapis.com`, `iamcredentials.googleapis.com`, `sts.googleapis.com`, `cloudresourcemanager.googleapis.com`, and `storage.googleapis.com` in project `project-4978b26c-b88e-454b-875`.
3. Create a private certificate authority or offline self-signed CA. Keep the CA private key outside Coolify. Issue a rotatable client-auth certificate whose subject common name is exactly `ai-edge-os-coolify-prod`. Coolify receives only the leaf certificate, its private key, and the public trust chain. Prefer a 30-90 day leaf lifetime and rotate before expiry.
4. Build `trust_store.yaml` from the public CA chain:

   ```yaml
   trustStore:
     trustAnchors:
     - pemCertificate: "<PEM root certificate with newlines encoded as \\n>"
     intermediateCas:
     - pemCertificate: "<PEM intermediate certificate with newlines encoded as \\n>"
   ```

5. Create the pool and X.509 provider. The condition admits only the exact certificate subject:

   ```bash
   gcloud iam workload-identity-pools create ai-edge-coolify-prod \
     --project=project-4978b26c-b88e-454b-875 \
     --location=global \
     --display-name="AI Edge Coolify production" \
     --description="Hetzner Coolify media-upload signer"

   gcloud iam workload-identity-pools providers create-x509 hetzner-x509 \
     --project=project-4978b26c-b88e-454b-875 \
     --location=global \
     --workload-identity-pool=ai-edge-coolify-prod \
     --trust-store-config-path=trust_store.yaml \
     --attribute-mapping="google.subject=assertion.subject.dn.cn" \
     --attribute-condition='assertion.subject.dn.cn=="ai-edge-os-coolify-prod"'
   ```

6. Bind only that subject to the existing service account for impersonation:

   ```bash
   gcloud iam service-accounts add-iam-policy-binding \
     ai-edge-os-media-prod@project-4978b26c-b88e-454b-875.iam.gserviceaccount.com \
     --project=project-4978b26c-b88e-454b-875 \
     --role=roles/iam.workloadIdentityUser \
     --member="principal://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/ai-edge-coolify-prod/subject/ai-edge-os-coolify-prod"
   ```

7. Grant the service account permission to create Cloud Storage signatures. V4 signing through impersonated credentials requires `iam.serviceAccounts.signBlob`. `roles/iam.workloadIdentityUser` does not contain it; `roles/iam.serviceAccountTokenCreator` does. Prefer a custom project role containing only `iam.serviceAccounts.signBlob`, granted to the service account on itself:

   ```bash
   gcloud iam roles create aiEdgeGcsV4Signer \
     --project=project-4978b26c-b88e-454b-875 \
     --title="AI Edge GCS V4 signer" \
     --description="Allows only IAM signBlob for V4 media upload URLs" \
     --permissions=iam.serviceAccounts.signBlob \
     --stage=GA

   gcloud iam service-accounts add-iam-policy-binding \
     ai-edge-os-media-prod@project-4978b26c-b88e-454b-875.iam.gserviceaccount.com \
     --project=project-4978b26c-b88e-454b-875 \
     --role=projects/project-4978b26c-b88e-454b-875/roles/aiEdgeGcsV4Signer \
     --member="serviceAccount:ai-edge-os-media-prod@project-4978b26c-b88e-454b-875.iam.gserviceaccount.com"
   ```

   If organization policy does not permit that custom-role binding, use the supported but broader `roles/iam.serviceAccountTokenCreator` self-binding:

   ```bash
   gcloud iam service-accounts add-iam-policy-binding \
     ai-edge-os-media-prod@project-4978b26c-b88e-454b-875.iam.gserviceaccount.com \
     --project=project-4978b26c-b88e-454b-875 \
     --role=roles/iam.serviceAccountTokenCreator \
     --member="serviceAccount:ai-edge-os-media-prod@project-4978b26c-b88e-454b-875.iam.gserviceaccount.com"
   ```

   No `iam.serviceAccounts.actAs`, `signJwt`, or service-account key permission is required by this application. The predefined Token Creator role includes extra token permissions; record its use if the custom signBlob-only role is unavailable.

8. Grant bucket access only on `gs://ai-edge-os-media-prod-bbb-4827`. The supported predefined fallback is `roles/storage.objectUser`. For strict least privilege, create and bind this narrower custom role:

   ```bash
   gcloud iam roles create aiEdgeMediaObjectAccess \
     --project=project-4978b26c-b88e-454b-875 \
     --title="AI Edge media object access" \
     --description="Create, read, update, and delete private media objects" \
     --permissions=storage.objects.create,storage.objects.get,storage.objects.update,storage.objects.delete \
     --stage=GA

   gcloud storage buckets add-iam-policy-binding gs://ai-edge-os-media-prod-bbb-4827 \
     --member="serviceAccount:ai-edge-os-media-prod@project-4978b26c-b88e-454b-875.iam.gserviceaccount.com" \
     --role=projects/project-4978b26c-b88e-454b-875/roles/aiEdgeMediaObjectAccess
   ```

   Do not grant bucket administration, legacy ACL roles, or public access.
9. Preserve uniform bucket-level access and public access prevention. Save the following as `cors.json`, then apply it with `gcloud storage buckets update gs://ai-edge-os-media-prod-bbb-4827 --cors-file=cors.json`:

   ```json
   [
     {
       "origin": ["https://aiedgesolutions.online"],
       "method": ["PUT", "GET", "HEAD"],
       "responseHeader": ["Content-Type"],
       "maxAgeSeconds": 3600
     }
   ]
   ```

### Credential and certificate configuration

Generate the external-account configuration with service-account impersonation. This JSON file contains no private key and is not a service-account key:

```bash
gcloud iam workload-identity-pools create-cred-config \
  projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/ai-edge-coolify-prod/providers/hetzner-x509 \
  --service-account=ai-edge-os-media-prod@project-4978b26c-b88e-454b-875.iam.gserviceaccount.com \
  --service-account-token-lifetime-seconds=3600 \
  --credential-cert-path=/run/secrets/gcp/client-cert.pem \
  --credential-cert-private-key-path=/run/secrets/gcp/client-key.pem \
  --credential-cert-trust-chain-path=/run/secrets/gcp/trust-chain.pem \
  --output-file=workload-identity-credential.json
```

The command also creates `certificate_config.json`. Before mounting it, verify its certificate and private-key paths are the `/run/secrets/gcp/...` container paths above.

In Coolify, use protected file mounts rather than environment-variable contents:

- `/run/secrets/gcp/workload-identity-credential.json` - generated external-account configuration; non-secret, but protect against alteration.
- `/run/secrets/gcp/certificate-config.json` - generated certificate-path configuration; non-secret, but protect against alteration.
- `/run/secrets/gcp/client-cert.pem` - rotatable leaf certificate.
- `/run/secrets/gcp/client-key.pem` - rotatable workload private key; secret, read-only, and never logged.
- `/run/secrets/gcp/trust-chain.pem` - public intermediate chain.

Set the four runtime variables listed above. Do not set `OBJECT_STORAGE_SERVICE_ACCOUNT_JSON_B64`, do not inject certificate material into environment variables, and do not pass any of these values as Docker build arguments. The Google auth library exchanges the client certificate for a short-lived federated token, impersonates the dedicated service account for a one-hour access token, and calls `signBlob` without exposing a Google private key.

Replit remains unchanged: when `OBJECT_STORAGE_PROVIDER` is absent, the existing Replit local sidecar supplies its external-account credential and signed URL.

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

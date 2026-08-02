# Apollos Google Cloud Operational Integration

**Status:** Architecture and read-only design approved for documentation only  
**Date:** 2026-08-02  
**Production changes:** None

## Purpose

Apollos will inspect, diagnose, and later perform narrowly modeled corrections across Google Cloud. Apollos is the reasoning and policy layer, not an unrestricted administrator, shell, or generic `gcloud` proxy.

## Verified production baseline

- Google Cloud project: `project-4978b26c-b88e-454b-875` (`474786012895`)
- Production bucket: `ai-edge-os-media-prod-bbb-4827`
- Production workload service account: `ai-edge-os-media-prod@project-4978b26c-b88e-454b-875.iam.gserviceaccount.com`
- Workload Identity pool: `ai-edge-coolify-prod`
- X.509 provider: `hetzner-x509`
- Required certificate subject CN: `ai-edge-os-coolify-prod`
- Subject mapping: `google.subject = assertion.subject.dn.cn`
- Custom signer role: `projects/project-4978b26c-b88e-454b-875/roles/aiEdgeGcsV4Signer`
- Required signer permission: `iam.serviceAccounts.signBlob`
- Bucket role: `roles/storage.objectUser`
- Client certificate expiration: 2026-10-30

The application currently authenticates through X.509 Workload Identity Federation and service-account impersonation. No downloadable service-account key is permitted.

## Architecture

```text
ChatGPT / Apollos
        |
        v
Private Google Cloud MCP resource server
        |
        v
Identity + request binding + policy evaluation
        |
        v
Exact allowlisted Google Cloud adapters
        |
        v
Google Cloud APIs
        |
        v
Bounded evidence + audit result
```

### Relationship to the Development Agent Bridge

The Google Cloud control plane is a separate provider integration. It reuses the established DAB principles for verified workload identity, exact operation allowlists, non-transitive approval categories, replay protection, bounded output, kill switches, and audit evidence.

It must not extend or silently change the five existing DAB-3B read-only development-task tools. Development coordination and infrastructure operations remain separate trust domains, databases, scopes, service identities, and deployment units.

## Hosting target

The recommended runtime is a dedicated Cloud Run service with:

- a dedicated runtime service account;
- no service-account key files;
- private ingress and authenticated invocation;
- exact OAuth audience and caller identity validation;
- least-privilege Google Cloud API permissions;
- Cloud Audit Logs and application-level structured audit records;
- separate configuration, deployment, and kill switch from the production AI Edge OS application.

Cloud Run is a target architecture, not an authorization to provision or deploy it.

## Provider adapter boundaries

Each tool must call a purpose-built adapter. No tool may accept an arbitrary command, resource URI, IAM role, API method, shell fragment, or unbounded filter.

Required adapter groups:

1. Resource Manager and Service Usage
2. IAM and service-account policy inspection
3. Workload Identity Federation pool/provider inspection
4. Cloud Storage configuration and permission inspection
5. Cloud Logging bounded reads
6. Quota and API-health inspection
7. Authentication and storage probes
8. Certificate inventory and controlled rotation

## Phase 1 — read-only foundation

Deliver only bounded reads:

- identify the configured and authenticated project;
- list and describe approved workload identity pools and providers;
- inspect X.509 trust configuration and attribute mappings/conditions;
- inspect approved service accounts and IAM bindings;
- inspect the production bucket IAM, CORS, lifecycle, retention, location, and public-access posture;
- read recent logs using fixed resource types, bounded time ranges, limits, and redaction;
- inspect required API enablement and known quotas;
- report certificate metadata and expiration status.

Phase 1 must not exchange tokens, sign blobs, write objects, alter IAM, enable APIs, change CORS, rotate certificates, or mutate any resource.

## Phase 2 — safe diagnostics

Add explicit diagnostic operations with isolated probe resources:

- WIF token exchange test;
- service-account impersonation test;
- `signBlob` test with a fixed non-secret probe payload;
- bucket create/read/delete probe using a reserved prefix and TTL;
- configuration drift evaluation;
- credential-file structure validation without returning credential material;
- IAM-policy validation against approved policy templates.

Diagnostic writes must be idempotent, use reserved probe names, include automatic cleanup, and clearly distinguish cleanup failure from test failure.

## Phase 3 — approval-required corrections

Potential modeled corrections:

- update an approved X.509 trust anchor;
- rotate the Coolify client certificate through an approved two-party procedure;
- add or remove one exact IAM binding from an approved role/resource matrix;
- replace bucket CORS with an approved policy document;
- enable one allowlisted required API;
- update one named configuration field with schema validation.

Every mutation requires a change envelope containing:

- reason and incident/task reference;
- evidence and confidence;
- exact before state;
- exact intended state;
- approval identity, category, revision, and expiry;
- dry-run or precondition result;
- execution result;
- independent verification;
- rollback instructions and rollback eligibility.

## Explicitly forbidden capabilities

- arbitrary shell execution;
- arbitrary `gcloud` execution;
- arbitrary REST or GraphQL proxying;
- arbitrary resource deletion;
- arbitrary IAM grants or custom-role editing;
- arbitrary log queries or unrestricted data export;
- access-token, identity-token, assertion, private-key, or credential-file disclosure;
- billing account changes, payment changes, organization-policy changes, or project deletion;
- lateral access to customer application data or the production PostgreSQL database.

## Output contract

All tools return a bounded structure:

- `operation`
- `requestReference`
- `target`
- `observedAt`
- `status`: `ok | warning | failed | unavailable | approval_required`
- `evidence[]`
- `findings[]`
- `recommendedActions[]`
- `redactions[]`
- `auditReference`

Raw API responses are not returned. Secrets and credential material are never accepted as tool arguments or persisted in tool results.

## Certificate operations

The current certificate expires on 2026-10-30. Initial alert thresholds are overdue/90, 75, 60, 45, 30, 21, 14, 7, 3, and 1 day.

The rotation procedure must generate the private key on the Coolify host or another approved destination, keep it non-exportable from Apollos, issue or register the public certificate through a separately authorized signer, install the certificate and trust chain as Coolify secret files, restart only through a separate deployment authorization, test WIF/impersonation/signing/storage, and retain the previous credential only for a bounded rollback window.

Apollos may orchestrate evidence and approvals, but it must never receive or return the private key.

## Future provider pattern

Meta and Hetzner integrations should reuse the same provider-control-plane contract: isolated service identity, exact tool registry, read-only first, diagnostic probes second, modeled corrections last, complete audit evidence, and human approval for material changes.

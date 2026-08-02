# Apollos Google Cloud Security and Permission Model

**Status:** Proposed foundation  
**Date:** 2026-08-02

## Security objective

A compromise or reasoning error in Apollos must not become unrestricted Google Cloud administration. Every request must be attributable, bounded, policy-evaluated, auditable, and limited to the smallest approved resource and action.

## Trust zones

1. **ChatGPT / Apollos** — proposes and interprets operations; holds no Google Cloud credential.
2. **MCP resource server** — authenticates the caller, validates schemas, applies policy, and dispatches only registered tools.
3. **Provider adapters** — call fixed Google Cloud APIs with fixed resource constraints.
4. **Google Cloud service identity** — grants only the permissions required by the enabled phase.
5. **Audit store** — records bounded request, decision, evidence, and result metadata without secrets.

## Identity model

- Use a dedicated Cloud Run runtime service account.
- Do not create or download service-account keys.
- Require authenticated invocation and exact audience validation.
- Map the verified caller to a bounded workload principal.
- A workload principal is never human approval and cannot approve its own action.
- Separate identities must be used for read-only inspection, diagnostic probes, and mutation execution where practical.

## Authorization classes

| Class | Meaning | Default |
|---|---|---|
| `inspect` | Read bounded configuration and status | Phase 1 only |
| `diagnose` | Execute a predefined reversible probe | Disabled until Phase 2 approval |
| `correct_config` | Change one approved configuration field | Disabled; human approval required |
| `iam_change` | Change one exact IAM binding | Disabled; enhanced approval required |
| `credential_rotation` | Rotate approved client credentials | Disabled; enhanced approval required |
| `delete_resource` | Delete a production resource | Forbidden |
| `billing_change` | Change billing or payment state | Forbidden |

Authorization is non-transitive. Approval for inspection does not authorize diagnostics; approval for one IAM binding does not authorize another role, member, resource, project, or time window.

## Resource allowlist

Initial production targets are limited to:

- project `project-4978b26c-b88e-454b-875`;
- project number `474786012895`;
- bucket `ai-edge-os-media-prod-bbb-4827`;
- service account `ai-edge-os-media-prod@project-4978b26c-b88e-454b-875.iam.gserviceaccount.com`;
- workload identity pool `ai-edge-coolify-prod`;
- provider `hetzner-x509`;
- custom role `projects/project-4978b26c-b88e-454b-875/roles/aiEdgeGcsV4Signer`.

A new resource requires a registry revision and attributable approval. Tool input must not accept arbitrary project IDs, bucket names, service accounts, roles, or provider names in production mode.

## Least-privilege progression

### Phase 1 service identity

Grant only read permissions needed for:

- project metadata and service enablement;
- IAM policy reads;
- service-account metadata and IAM policy reads;
- workload identity pool/provider reads;
- bucket metadata, IAM, CORS, lifecycle, and retention reads;
- bounded Cloud Logging reads;
- quota and service-health reads.

Avoid broad primitive roles such as Owner, Editor, Viewer, or Security Admin. Prefer predefined granular viewer roles or a custom role composed from audited permissions.

### Phase 2 diagnostic identity

Use a separate identity or explicit impersonation path for probe actions. Add only permissions required to exchange the approved workload identity, impersonate the approved service account, call `signBlob`, and manipulate objects under a reserved probe prefix.

### Phase 3 mutation identity

Use separate execution identities or short-lived impersonation for each mutation class. Mutation identities must not be the default runtime identity and must require an approved change envelope.

## Request controls

Every call requires:

- exact tool name from the registry;
- closed JSON schema with `additionalProperties: false`;
- request ID, correlation ID, nonce, issue time, and expiry;
- caller identity and approved scope;
- resource-registry revision;
- policy revision;
- idempotency key;
- rate-limit capacity;
- kill switch in the enabled state;
- output-size and time-range limits.

Missing, stale, ambiguous, revoked, unavailable, or conflicting evidence fails closed.

## Mutation controls

A mutation request additionally requires:

- exact before-state fingerprint;
- desired-state fingerprint;
- provider precondition such as ETag or metageneration where supported;
- attributable human approval bound to tool, resource, change, revision, and expiry;
- dry-run or validation result;
- rollback plan;
- post-change independent read-back verification.

No mutation may silently broaden scope after approval. If observed state differs from approved before state, execution must stop as stale.

## Secret handling

Never accept, return, log, persist, or place in documentation:

- private keys;
- access tokens or identity tokens;
- workload identity assertions;
- service-account key JSON;
- database credentials;
- API secrets;
- signed URLs with active signatures;
- complete credential or certificate configuration files.

Certificate public metadata, fingerprints, issuers, subjects, and expiration dates may be recorded. Private-key paths may be referenced only as fixed operational locations, never read or returned.

## Logging and redaction

Application audit events should include tool, caller reference, target reference, policy decision, request/result hashes, timestamps, status, evidence summary, approval reference, and verification result.

Logs must redact URLs with signatures, bearer values, PEM blocks, token-like strings, request headers, credential file contents, and raw Google API error payloads. Cloud Logging reads must use fixed filters, bounded time windows, and result limits.

## Certificate rotation safeguards

- Generate the private key at the approved destination.
- Apollos must not transport the private key.
- Validate subject CN `ai-edge-os-coolify-prod` before issuance.
- Validate issuer/trust chain and provider compatibility before installation.
- Install new and previous credentials with explicit version references.
- Require separate approval for application restart or deployment.
- Verify token exchange, impersonation, `signBlob`, storage upload, and cleanup.
- Roll back if any verification fails.
- Revoke or remove the previous credential only after the rollback window closes.

## Emergency controls

- Global kill switch for the Google Cloud MCP service.
- Per-tool disable flags.
- Per-resource denylist overrides.
- Revocation generation for callers and execution identities.
- Rate limiting and concurrency caps.
- Read-only degradation mode.
- Bounded error responses that reveal no credentials or raw provider payloads.

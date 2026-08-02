# Apollos Google Cloud Tool Registry

**Status:** Proposed  
**Registry revision:** `gcp-tools-v1`  
**Date:** 2026-08-02

## Registry rules

- Tool names and schemas are immutable within a registry revision.
- Production resources are selected from the approved resource registry, not arbitrary user input.
- All tools are disabled unless their implementation phase is active.
- Outputs are normalized, bounded, redacted, and audited.
- Read-only annotations do not replace runtime permission enforcement.

## Phase 1 — read-only

| Tool | Purpose | Fixed target | Limits |
|---|---|---|---|
| `gcp.get_project` | Return configured and authenticated project identity | Approved production project | No child-resource enumeration |
| `gcp.list_workload_identity_pools` | List pools in the approved project | Approved project | Maximum 50; normalized metadata only |
| `gcp.describe_x509_provider` | Inspect provider state, trust anchors, mappings, and conditions | `ai-edge-coolify-prod/hetzner-x509` | No certificate/private-key contents |
| `gcp.get_service_account` | Inspect approved service-account metadata | Approved production service account | No key material or access tokens |
| `gcp.check_service_account_iam` | Evaluate IAM bindings against approved expectations | Approved production service account | Return bindings and drift diagnostics only |
| `gcp.check_bucket_permissions` | Inspect bucket IAM and effective expected access | Approved production bucket | No object listing by default |
| `gcp.inspect_bucket_cors` | Inspect CORS rules | Approved production bucket | Normalized origins/methods/headers only |
| `gcp.inspect_bucket_lifecycle` | Inspect lifecycle, retention, location, and public-access prevention | Approved production bucket | Metadata only |
| `gcp.read_recent_logs` | Read bounded operational logs | Approved project/resource types | Maximum 15-minute window, 200 entries, fixed filters |
| `gcp.check_required_apis` | Report enablement of the approved API set | Approved project | No API enablement |
| `gcp.check_api_quotas` | Report selected quota usage/configuration | Approved services and metrics | No quota override requests |
| `gcp.report_certificate_expiration` | Report certificate subject, issuer, fingerprint, validity, and alert state | Approved certificate references | Never read or return private key |
| `gcp.detect_configuration_drift` | Compare current normalized state with approved baseline | Approved resource set | Evidence only; no correction |

### Phase 1 input pattern

```json
{
  "requestId": "bounded-id",
  "resourceRegistryRevision": "gcp-resources-v1",
  "policyRevision": "gcp-policy-v1",
  "correlationId": "bounded-id",
  "issuedAt": "RFC3339",
  "expiresAt": "RFC3339",
  "nonce": "bounded-id",
  "idempotencyKey": "bounded-id"
}
```

Tools may add closed-schema selectors such as an approved log profile or quota profile. They must not add arbitrary project, role, principal, service-account, bucket, log-filter, SQL, shell, or API-method fields.

## Phase 2 — safe diagnostics

| Tool | Purpose | Safety boundary |
|---|---|---|
| `gcp.test_wif_authentication` | Verify X.509 external-account token exchange | No token returned; status and bounded claims only |
| `gcp.test_service_account_impersonation` | Verify impersonation of the approved service account | No access token returned |
| `gcp.test_sign_blob` | Sign a fixed probe digest | Fixed payload; return verification result, not signature bytes |
| `gcp.test_storage_access` | Create/read/delete a probe object | Reserved prefix, small fixed payload, TTL, mandatory cleanup |
| `gcp.validate_credential_configuration` | Validate file references and non-secret schema | Never return file contents |
| `gcp.validate_iam_policy` | Compare policy against approved templates | Read/evaluate only |

Diagnostic tools require the `diagnose` authorization class. Any residual probe object or cleanup failure must produce `warning` or `failed`, never a false success.

## Phase 3 — approval-required corrections

| Tool | Purpose | Required authorization |
|---|---|---|
| `gcp.update_x509_trust_anchor` | Replace one approved trust anchor/configuration | `credential_rotation` |
| `gcp.rotate_client_certificate` | Orchestrate approved certificate rotation without handling the private key | `credential_rotation` plus separate deployment/restart approval |
| `gcp.correct_service_account_iam_binding` | Add/remove one exact approved binding | `iam_change` |
| `gcp.repair_bucket_cors` | Replace CORS with an approved policy document | `correct_config` |
| `gcp.enable_required_api` | Enable one allowlisted API | `correct_config` |
| `gcp.update_known_configuration` | Update one registered configuration field | `correct_config` |

### Required mutation input

```json
{
  "requestId": "bounded-id",
  "changeEnvelopeId": "bounded-id",
  "targetRegistryKey": "approved-key",
  "beforeStateHash": "sha256:...",
  "desiredStateHash": "sha256:...",
  "approvalReference": "bounded-id",
  "approvalRevision": 1,
  "approvalExpiresAt": "RFC3339",
  "correlationId": "bounded-id",
  "issuedAt": "RFC3339",
  "expiresAt": "RFC3339",
  "nonce": "bounded-id",
  "idempotencyKey": "bounded-id"
}
```

The desired state is loaded from an approved change record or registered policy template. It is not supplied as arbitrary JSON by the caller.

## Forbidden tools

The following names and equivalent capabilities must never be registered:

- `execute_arbitrary_shell`
- `run_any_gcloud_command`
- `call_any_google_api`
- `run_arbitrary_log_query`
- `delete_any_resource`
- `grant_any_iam_role`
- `edit_any_custom_role`
- `read_any_secret`
- `download_service_account_key`
- `export_credentials`
- `change_billing_account`
- `delete_project`

## Required result pattern

```json
{
  "operation": "gcp.get_project",
  "requestReference": "bounded-id",
  "target": "registered-resource-key",
  "observedAt": "RFC3339",
  "status": "ok",
  "evidence": [],
  "findings": [],
  "recommendedActions": [],
  "redactions": [],
  "auditReference": "bounded-id"
}
```

No result may contain tokens, private keys, PEM bodies, credential-file contents, active signed URLs, raw request headers, or unbounded Google API responses.

# Engineering Handbook: Apollos Google Cloud Operations

**Canonical architecture:** `docs/adr/ADR-019-apollos-google-cloud-provider-control-plane.md`

## Operating rule

Apollos is a reasoning, evidence, and policy layer. It is not a root shell, generic cloud console, arbitrary `gcloud` executor, or unrestricted Google API proxy.

## System boundary

Google Cloud operations use a separate provider control plane from the Development Agent Bridge.

- DAB remains responsible for development-task coordination, attributable approvals, Git evidence, and its existing five read-only MCP tools.
- The Google Cloud control plane owns registered cloud resources, provider-specific tools, diagnostics, change envelopes, and operational audit evidence.
- The two systems may share pure contract patterns, but they must not share service identities, OAuth audiences, scopes, databases, deployment units, or implicit authorization.

## Production baseline

- Project: `project-4978b26c-b88e-454b-875`
- Project number: `474786012895`
- Bucket: `ai-edge-os-media-prod-bbb-4827`
- Service account: `ai-edge-os-media-prod@project-4978b26c-b88e-454b-875.iam.gserviceaccount.com`
- WIF pool: `ai-edge-coolify-prod`
- X.509 provider: `hetzner-x509`
- Required CN: `ai-edge-os-coolify-prod`
- Attribute mapping: `google.subject = assertion.subject.dn.cn`
- Client certificate expiry: 2026-10-30

The correct pool ID is `ai-edge-coolify-prod`. Do not reintroduce the incorrect value `ai-edge-os-coolify-prod` as the pool ID; that value is the required certificate CN.

## Coolify configuration invariant

`docker-compose.coolify.yml` intentionally contains these non-secret production constants:

```yaml
PRIVATE_OBJECT_DIR: /ai-edge-os-media-prod-bbb-4827/private
GOOGLE_CLOUD_PROJECT: project-4978b26c-b88e-454b-875
GOOGLE_APPLICATION_CREDENTIALS: /run/secrets/gcp/workload-identity-credential.json
GOOGLE_API_CERTIFICATE_CONFIG: /run/secrets/gcp/certificate-config.json
```

Coolify previously converted `${VARIABLE:?message}` expressions into the literal message text. Do not restore required-variable interpolation for these fields until Coolify parsing behavior is independently verified.

## Secret-file invariant

The production API container mounts:

- `/run/secrets/gcp/workload-identity-credential.json`
- `/run/secrets/gcp/certificate-config.json`
- `/run/secrets/gcp/client-cert.pem`
- `/run/secrets/gcp/client-key.pem`
- `/run/secrets/gcp/trust-chain.pem`

Documentation and tools may verify fixed path presence and public certificate metadata. They must never read, return, log, commit, or transmit the client private key or credential-file contents.

## Tool-development rules

- Add only exact tools from `docs/APOLLOS-GCP-TOOL-REGISTRY.md`.
- Use closed schemas and approved resource-registry keys.
- Never accept arbitrary project IDs, service accounts, roles, bucket names, API methods, log filters, commands, or resource URIs in production mode.
- Normalize provider responses before policy evaluation and output.
- Bound list sizes, log windows, output bytes, execution time, and retries.
- Treat missing or stale evidence as unavailable, not success.
- Keep read, diagnostic, and mutation permissions separate.
- Require independent read-back verification after every mutation.

## IAM rules

- Never grant Owner, Editor, or other broad primitive roles to the provider-control runtime.
- Prefer dedicated service accounts and audited granular/custom roles.
- The default runtime identity is read-only.
- Diagnostic and mutation capabilities require separate identities or explicit short-lived impersonation.
- A caller or workload may not approve its own material action.

## Logging rules

Persist only bounded references, hashes, decisions, evidence summaries, results, and verification status. Redact tokens, assertions, signed URLs, PEM bodies, credential values, headers, and raw provider errors.

`gcp.read_recent_logs` must use registered query profiles, a maximum 15-minute window, and a maximum 200 returned entries. Do not expose arbitrary Cloud Logging filters.

## Certificate lifecycle

The certificate expiring on 2026-10-30 requires immediate operational ownership. Target production rotation by 2026-09-30.

Rotation must:

1. generate the private key at the approved destination;
2. validate CN, issuer, trust chain, and provider compatibility;
3. install versioned Coolify secret files without exposing their contents to Apollos;
4. obtain separate authorization for restart or deployment;
5. verify WIF exchange, impersonation, `signBlob`, upload, delete, application health, and rollback;
6. retain the previous credential only for a bounded rollback window;
7. remove or revoke the previous credential after acceptance.

## Change workflow

Every correction requires:

- task or incident reference;
- exact evidence and before-state hash;
- desired-state hash from an approved template/change record;
- attributable human approval bound to operation, resource, revision, and expiry;
- provider precondition;
- execution result;
- independent verification;
- rollback plan and outcome.

A state mismatch invalidates the approval and stops execution.

## Documentation workflow

Update these together when durable behavior changes:

- this handbook section;
- ADR-019 or a superseding ADR;
- integration specification;
- security and permission model;
- tool registry revision;
- implementation roadmap;
- session handoff;
- root `ROADMAP.md` and `CHANGELOG.md` when a phase is implemented or accepted.

Do not represent a documented phase as implemented, deployed, connected, or active without verified code and operational evidence.

# Apollos Google Cloud Integration Roadmap

**Status:** Architecture-first plan  
**Date:** 2026-08-02  
**Current phase:** Documentation and repository discovery only

## Governing constraints

- Do not modify production infrastructure to begin this integration.
- Do not add arbitrary shell, `gcloud`, API proxy, IAM, deletion, billing, or credential-export capabilities.
- Keep the existing Development Agent Bridge tool surface unchanged.
- Use a separate provider control plane, service identity, deployment, configuration, audit boundary, and resource registry.
- Read-only capability must be implemented and verified before diagnostics; diagnostics must be verified before corrections.
- Every operational phase requires a separately approved task, exact base SHA, bounded file list, verification plan, and authorization categories.

## Discovery findings

The repository already provides reusable patterns:

- `lib/development-control` — canonical task, approval, lifecycle, and audit contracts;
- `lib/development-control-bridge` — exact operation catalog and fail-closed policy evaluation;
- `artifacts/development-control-mcp` — OAuth-protected Streamable HTTP MCP runtime with closed schemas, replay protection, rate limiting, kill switch, bounded output, and redacted failures;
- `lib/development-control-store` — tenant-independent persistence boundaries;
- `lib/development-control-github` — normalized external evidence reconciliation;
- `artifacts/api-server/src/lib/objectStorage.ts` — production X.509 WIF and service-account impersonation usage for GCS signing.

These components provide patterns, not automatic authorization to couple Google Cloud operations into the DAB runtime.

## GCP-0 — Architecture and documentation foundation

**Status:** Documented on `docs/apollos-gcp-operations-foundation`.

Deliverables:

- Engineering Handbook section;
- ADR for the separate provider control plane;
- integration specification;
- security and permission model;
- tool registry;
- implementation roadmap;
- session handoff.

Verification:

- repository and production state inspected read-only;
- no production mutation;
- branch starts at production commit `b6319d32e805b24c015c8ec758d345260cf030b9`;
- application and database observed `running:healthy` with restart count `0`.

## GCP-1A — Pure provider contracts

Create a new pure package, tentatively `lib/provider-control`, containing:

- provider-neutral operation and resource registry contracts;
- request envelopes and deterministic fingerprints;
- read/diagnostic/mutation classifications;
- authorization-class matrix;
- evidence, finding, recommendation, and result contracts;
- change-envelope contracts;
- fail-closed policy evaluation;
- fixtures and focused tests.

Restrictions:

- no environment access;
- no Google SDK;
- no network, database, filesystem, MCP, deployment, or credential behavior;
- no customer identity or customer database dependency.

## GCP-1B — Google Cloud read adapters

Create `lib/provider-control-gcp` with caller-supplied clients and bounded adapters for:

- Resource Manager;
- IAM and IAM Credentials metadata inspection;
- Workload Identity Pools and Providers;
- Cloud Storage metadata/IAM/CORS/lifecycle;
- Cloud Logging bounded reads;
- Service Usage and selected quota inspection;
- certificate metadata parsing from caller-supplied public certificate references.

Add normalized drift rules for the approved production resource registry.

Restrictions:

- read-only API clients only;
- no token exchange, impersonation, signing, object writes, API enablement, IAM changes, or certificate rotation;
- no credential file content reads in the library.

## GCP-1C — Private read-only MCP foundation

Create a separate artifact, tentatively `artifacts/provider-control-gcp-mcp`, with:

- authenticated Streamable HTTP MCP;
- exact Phase 1 tool registry;
- closed schemas;
- bounded outputs;
- rate limiting, replay protection, idempotency, kill switches, and audit persistence;
- separate configuration namespace and deployment unit from DAB-3B/3C;
- inactive entrypoint until separately authorized.

Verification must include malformed input, wrong audience, wrong subject, stale request, replay, unknown tool, resource escape, oversized output, redaction, rate limit, and kill-switch tests.

## GCP-1D — Read-only deployment design and activation

Separate approvals are required for:

- Cloud Run project/region selection;
- dedicated runtime service account and least-privilege read role;
- private ingress/authentication design;
- audit sink/retention;
- configuration and public-key setup;
- deployment;
- ChatGPT connector installation;
- workspace policy;
- live endpoint proof;
- activation.

Activation acceptance:

- all Phase 1 tools operate only on registered resources;
- IAM review confirms no primitive broad roles;
- outputs contain no secrets or raw credential material;
- audit records are complete;
- kill switch and per-tool disables work;
- production AI Edge OS remains unaffected.

## GCP-2A — Pure diagnostic contracts

Extend the registry with diagnostic envelopes for WIF, impersonation, `signBlob`, storage probe, credential-configuration validation, and IAM-template validation.

Define reserved probe names, payload sizes, TTLs, cleanup rules, and failure semantics before adding any API execution.

## GCP-2B — Diagnostic execution adapters

Implement separately permissioned diagnostic adapters.

Acceptance:

- no token or signature bytes returned;
- storage probe is restricted to the reserved prefix;
- cleanup is verified and separately reported;
- diagnostic permissions cannot alter IAM, APIs, CORS, trust anchors, or production objects outside the probe prefix.

## GCP-3A — Change-envelope and approval model

Implement immutable intended-change records, exact before/desired hashes, approval binding, preconditions, rollback metadata, verification requirements, and expiration.

No Google Cloud mutations are included in this phase.

## GCP-3B — Narrow correction tools

Implement one mutation family at a time, in this recommended order:

1. approved API enablement;
2. approved bucket CORS replacement;
3. one exact service-account IAM binding correction;
4. X.509 trust-anchor update;
5. client-certificate rotation orchestration.

Each family requires separate IAM, tests, runbook, dry-run behavior, live canary, rollback proof, and production authorization.

## Certificate renewal workstream

Current certificate expiry: 2026-10-30.

Required operational milestones:

- immediate: establish manual ownership and alerts;
- by 2026-08-16: approve renewal design and signer/host responsibilities;
- by 2026-08-31: complete non-production rotation rehearsal;
- by 2026-09-15: complete production-ready runbook and rollback proof;
- by 2026-09-30: rotate production certificate unless an earlier risk trigger requires action;
- after rotation: verify WIF, impersonation, `signBlob`, upload, deletion, application health, and rollback readiness.

Automation may be implemented later, but the current certificate must not wait for the full Apollos integration.

## Future provider sequence

After the Google Cloud read-only foundation is operational and verified:

1. Meta provider control plane;
2. Hetzner provider control plane;
3. cross-provider incident correlation;
4. predefined recovery playbooks;
5. bounded autonomous recovery for low-risk, reversible operations only.

# Apollos Google Cloud Integration Session Handoff

**Date:** 2026-08-02  
**Branch:** `docs/apollos-gcp-operations-foundation`  
**Starting SHA:** `b6319d32e805b24c015c8ec758d345260cf030b9`  
**Status:** Architecture and documentation created; no implementation or production mutation

## Verified production state

Read-only inspection confirmed:

- Coolify application UUID `rkonpoppxacsnlfkqmf6yct6`
- repository `diazpmatt-cmd/AI-Edge-OS`
- branch `main`
- application status `running:healthy`
- application restart count `0`
- production web domain `https://aiedgesolutions.online`
- PostgreSQL UUID `ypg0krkeij7h7u9inur0aq9e`
- PostgreSQL status `running:healthy`
- PostgreSQL restart count `0`

The production commit was confirmed as `b6319d32e805b24c015c8ec758d345260cf030b9`, which hardcodes the four required non-secret Coolify GCS constants after Coolify incorrectly treated required-variable interpolation messages as literal values.

No application restart, deployment, secret change, IAM change, database change, Google Cloud mutation, or production configuration change was performed.

## Repository discovery

Relevant existing foundations:

- `AGENTS.md` — canonical safeguards and phase separation;
- `replit.md` — Engineering Handbook and DAB architecture history;
- `ROADMAP.md`, `CHANGELOG.md`, and `SESSION_HANDOFF.md` — durable project state;
- `lib/development-control` — canonical task/approval/audit contracts;
- `lib/development-control-bridge` — exact operation catalog and fail-closed policy;
- `lib/development-control-store` — tenant-independent persistence;
- `lib/development-control-github` — normalized external evidence;
- `artifacts/development-control-mcp` — authenticated, schema-bounded, rate-limited, kill-switched read-only MCP runtime;
- `artifacts/api-server/src/lib/objectStorage.ts` — keyless X.509 WIF, service-account impersonation, GCS signing, and redacted storage diagnostics.

Architectural conclusion: Google Cloud operations must be a separate provider control plane that reuses DAB concepts but does not modify or expand the existing five DAB MCP tools.

## Documents created

- `docs/engineering-handbook/APOLLOS-GCP-OPERATIONS.md`
- `docs/adr/ADR-019-apollos-google-cloud-provider-control-plane.md`
- `docs/APOLLOS-GOOGLE-CLOUD-INTEGRATION.md`
- `docs/APOLLOS-GCP-SECURITY-PERMISSION-MODEL.md`
- `docs/APOLLOS-GCP-TOOL-REGISTRY.md`
- `docs/APOLLOS-GCP-IMPLEMENTATION-ROADMAP.md`
- `docs/APOLLOS-GCP-SESSION-HANDOFF.md`

## Core decisions

- Separate provider control plane from DAB.
- Cloud Run is the preferred future host, with a dedicated service account and no downloadable key.
- Exact resource registry and tool registry; no arbitrary project/resource/API input.
- Read-only tools first, diagnostic probes second, approval-bound corrections third.
- Separate identities and permissions for read, diagnose, and mutate.
- Complete bounded audit evidence and independent verification.
- No private key, access token, assertion, credential-file content, signed URL, database secret, or API secret may enter chat, logs, results, or documentation.
- Certificate rotation may be orchestrated by Apollos, but the private key must be generated and retained at the approved destination.

## Certificate priority

Current certificate:

- Subject: `CN=ai-edge-os-coolify-prod`
- Issuer: `AI Edge Coolify Production Root CA`
- Expiration: 2026-10-30

Target production rotation by 2026-09-30. Do not wait for the full provider-control implementation.

Milestones:

- by 2026-08-16: renewal ownership, signer, host responsibilities, and alerts approved;
- by 2026-08-31: non-production rotation rehearsal complete;
- by 2026-09-15: production runbook and rollback proof complete;
- by 2026-09-30: production certificate rotated and verified.

## Next bounded implementation task

**GCP-1A — Pure provider contracts**

Create a pure provider-neutral package for:

- resource and tool registry contracts;
- request envelopes and fingerprints;
- read/diagnostic/mutation classification;
- authorization classes;
- evidence and result models;
- immutable change envelopes;
- fail-closed policy evaluation;
- fixtures and focused tests.

GCP-1A exclusions:

- no Google SDK;
- no network or filesystem;
- no environment access;
- no database or migration;
- no MCP server;
- no Cloud Run provisioning;
- no credentials;
- no Google Cloud API call;
- no production change;
- no extension of DAB-3B tools.

Before implementation, create an attributable task specification bound to the current `origin/main` SHA, exact branch, exact files, tests, exclusions, and authorization categories.

## Deferred work

- Google Cloud read adapters;
- private read-only MCP service;
- Cloud Run/IAM/audit deployment design and activation;
- diagnostic token/signing/storage probes;
- immutable change-envelope persistence;
- IAM, CORS, API, trust-anchor, and certificate correction tools;
- Meta integration;
- Hetzner integration;
- cross-provider incident correlation and safe recovery playbooks.

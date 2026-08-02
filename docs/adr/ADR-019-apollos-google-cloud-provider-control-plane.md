# ADR-019: Apollos Google Cloud Provider Control Plane

**Status:** Accepted for architecture and documentation  
**Date:** 2026-08-02  
**Decider:** Matthew Diaz  
**Tags:** apollos, google-cloud, mcp, operations, security, least-privilege

## Context

AI Edge OS now uses production Google Cloud Storage through X.509 Workload Identity Federation, service-account impersonation, and `signBlob`. The production integration is healthy, but operational diagnosis still depends on manual Google Cloud and host inspection.

Apollos needs a durable way to inspect Google Cloud, diagnose failures, detect drift, and eventually apply predefined safe corrections. A generic shell, unrestricted `gcloud`, broad service-account role, or arbitrary Google API proxy would turn a reasoning system into an unbounded administrator and violate the repository's established fail-closed development-control principles.

The repository already contains the Development Agent Bridge (DAB): tenant-independent coordination contracts, attributable approvals, a policy package, and an isolated private read-only MCP foundation. That architecture offers useful patterns, but its current trust domain is development-task coordination and its MCP surface is intentionally limited to five read-only DAB tools.

## Decision

Build Google Cloud operations as a **separate provider control plane** that reuses DAB security concepts but does not modify or broaden the existing DAB MCP tool surface.

The Google Cloud provider control plane will have:

- a separate package boundary and MCP artifact;
- a separate service identity and deployment unit;
- a separate resource registry and exact tool registry;
- separate OAuth audience, scopes, kill switch, rate limits, and audit records;
- read-only tools first;
- separately permissioned diagnostic probes second;
- approval-bound modeled corrections last;
- no service-account keys;
- no arbitrary shell, `gcloud`, API proxy, resource deletion, IAM grant, billing, or credential-export capabilities.

Cloud Run is the preferred hosting target because it supports a dedicated runtime service identity and keyless Google Cloud API access. Hosting and provisioning remain separately authorized operational work.

## Tool and resource policy

Production mode uses registered resource keys rather than caller-supplied arbitrary project IDs, bucket names, service accounts, roles, providers, or filters.

Every tool call must be authenticated, schema-bounded, resource-bounded, policy-evaluated, replay-protected, rate-limited, audited, redacted, and output-limited.

Human approval is required for all material corrections. A workload identity cannot create, replace, or approve a human authorization decision.

## Phase boundary

### Phase 1

Read-only project, WIF, IAM, bucket, logging, API, quota, drift, and certificate-expiration inspection.

### Phase 2

Controlled WIF, impersonation, signing, and reserved-prefix storage probes. No tokens, signatures, or credential material are returned.

### Phase 3

One narrowly modeled correction family at a time, using exact before state, intended state, approval, precondition, result, verification, and rollback evidence.

## Certificate rotation decision

Apollos may coordinate certificate metadata, alerts, approvals, public-certificate issuance, installation evidence, verification, and rollback. It must never receive, return, or persist the client private key. The private key is generated and retained at an approved destination such as the Coolify host.

The current client certificate expires on 2026-10-30. Manual renewal ownership and alerts must be established immediately; production rotation should be completed by 2026-09-30 rather than waiting for the entire provider control plane.

## Consequences

### Positive

- Limits blast radius and prevents a generic administrative backdoor.
- Preserves the established DAB boundary and its five-tool contract.
- Makes future Meta and Hetzner integrations follow a consistent provider pattern.
- Supports gradual permission expansion backed by evidence and tests.
- Keeps production application credentials and customer data out of the control plane.

### Costs

- Requires a separate service, package, configuration, IAM design, deployment, and audit store.
- More tools and adapters must be modeled explicitly.
- Some incidents will still require human intervention because unrestricted escape hatches are intentionally absent.

## Rejected alternatives

### Add arbitrary `gcloud` execution

Rejected because command validation is incomplete, difficult to audit semantically, and easily becomes privilege escalation.

### Extend the existing DAB MCP server with Google Cloud tools

Rejected because development coordination and provider operations have different identities, scopes, resources, permissions, deployment risks, and audit needs.

### Give Apollos project Owner or Editor

Rejected because primitive broad roles violate least privilege and make policy-layer mistakes materially destructive.

### Use a downloadable service-account key

Rejected because long-lived keys increase theft, leakage, and rotation risk. Use Cloud Run service identity and short-lived impersonation instead.

### Implement correction tools first

Rejected because safe write design depends on trusted read models, drift detection, exact before-state evidence, diagnostics, and rollback verification.

## Related documents

- `docs/APOLLOS-GOOGLE-CLOUD-INTEGRATION.md`
- `docs/APOLLOS-GCP-SECURITY-PERMISSION-MODEL.md`
- `docs/APOLLOS-GCP-TOOL-REGISTRY.md`
- `docs/APOLLOS-GCP-IMPLEMENTATION-ROADMAP.md`
- `docs/APOLLOS-GCP-SESSION-HANDOFF.md`

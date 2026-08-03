# Production Recovery Evidence Packet

Last updated: 2026-08-03
Scope: primary AI Edge OS Docker Compose application in Coolify
Related: Issue #124 and `docs/runbooks/PRODUCTION-RECOVERY-INVESTIGATION.md`

## Purpose

Use this packet to capture the minimum bounded evidence needed to diagnose and verify production recovery without exposing credentials, certificates, customer data, or unrestricted logs.

A field marked **unknown** is preferable to a guess. Do not restart, redeploy, edit configuration, or rotate credentials merely to fill this form.

## Redaction rules

Never paste any of the following into GitHub:

- environment-variable values;
- OAuth tokens, API keys, passwords, cookies, or authorization headers;
- private keys, certificates, service-account JSON, or mounted-file contents;
- customer names, phone numbers, email addresses, message bodies, or lead details;
- full unbounded deployment or container logs.

Permitted evidence includes variable names with presence status, file paths with existence/readability status, HTTP status codes, timestamps, container exit codes, health-check output with sensitive values removed, and a short bounded stack-trace section.

## A. Deployment identity

- Coolify server UUID: `jt34n238twl21zseo7vm2e9h`
- Application UUID: `rkonpoppxacsnlfkqmf6yct6`
- Deployment ID: **unknown**
- Exact deployed commit SHA: **unknown**
- Deployment started at: **unknown**
- Deployment ended at: **unknown**
- Build result: **unknown**
- Runtime result: `exited:unhealthy`
- Last known healthy commit/configuration: **unknown; verify from deployment history**

## B. First failing service

Record every service, but identify the first failure by timestamp.

| Service | Container state | Health state | Exit code | Restart count | First failure timestamp | Bounded error code/message |
|---|---|---|---:|---:|---|---|
| `api` | unknown | unknown | unknown | unknown | unknown | unknown |
| `web` | unknown | unknown | unknown | unknown | unknown | unknown |
| `dab-planner-worker` | unknown | n/a or unknown | unknown | unknown | unknown | unknown |
| `dab-agent-worker` | unknown | n/a or unknown | unknown | unknown | unknown | unknown |
| `dab-preparation-worker` | unknown | n/a or unknown | unknown | unknown | unknown | unknown |
| `dab-publishing-worker` | unknown | n/a or unknown | unknown | unknown | unknown | unknown |

First proven failing service: **unknown**

Evidence timestamp and source: **unknown**

## C. API health evidence

- Process starts: **unknown**
- Internal target: `http://127.0.0.1:3000/api/healthz`
- HTTP status: **unknown**
- Response time: **unknown**
- Bounded response/error after redaction: **unknown**
- First failed health-check timestamp: **unknown**
- Last successful health-check timestamp: **unknown**

## D. Required configuration presence

Record only `present`, `missing`, or `blank/invalid`. Never record values.

| Requirement | Status | Evidence source |
|---|---|---|
| `DATABASE_URL` | unknown | unknown |
| Clerk runtime variables | unknown | unknown |
| Scheduler runtime variables | unknown | unknown |
| GorillaDesk runtime variables | unknown | unknown |
| Google Cloud project/location variables | unknown | unknown |
| Other compose-required variables | unknown | unknown |

Any variable whose parser received literal validation text instead of a value: **unknown**

## E. Mounted-file presence

Record only path, existence, readability, ownership/mode summary, and mount result. Do not paste file contents.

| Mounted path | Exists | Readable by container | Read-only mount verified | Notes |
|---|---|---|---|---|
| Google Cloud credential/certificate path 1 | unknown | unknown | unknown | unknown |
| Google Cloud credential/certificate path 2 | unknown | unknown | unknown | unknown |
| Google Cloud credential/certificate path 3 | unknown | unknown | unknown | unknown |
| Google Cloud credential/certificate path 4 | unknown | unknown | unknown | unknown |
| Google Cloud credential/certificate path 5 | unknown | unknown | unknown | unknown |

## F. PostgreSQL evidence

- Database UUID: `ypg0krkeij7h7u9inur0aq9e`
- Coolify status: `running:healthy` at last read-only observation
- Application-network DNS resolution: **unknown**
- TCP reachability from API network: **unknown**
- Authentication result without exposing credentials: **unknown**
- Migration/schema result: **unknown**
- Destructive migration performed: **no**

## G. Bounded log excerpts

For each excerpt, retain only the final relevant section, normally no more than 40 lines. Redact secrets and customer data before attaching.

### Deployment/build excerpt

```text
Not yet captured.
```

### First failing service excerpt

```text
Not yet captured.
```

### API health-check excerpt

```text
Not yet captured.
```

## H. Proven root cause

Root cause statement: **not yet proven**

Direct supporting evidence:

1. **unknown**
2. **unknown**
3. **unknown**

Rejected hypotheses and evidence:

- **none yet**

## I. Proposed minimal repair

- Repair type: **unknown**
- Files/configuration affected: **unknown**
- Why this is the smallest repair tied to evidence: **unknown**
- CI validation required: **unknown**
- Secret/configuration owner action required: **unknown**
- Database risk: **unknown**
- Rollback target: **unknown**

## J. Recovery verification

Do not mark recovery complete until all applicable rows are evidenced.

| Gate | Result | Evidence |
|---|---|---|
| Exact repaired commit deployed | pending | pending |
| Deployment completes without restart exhaustion | pending | pending |
| API container running and healthy | pending | pending |
| Internal `/api/healthz` returns HTTP 200 | pending | pending |
| Public route returns expected response | pending | pending |
| PostgreSQL remains healthy | pending | pending |
| Required workers have expected state | pending | pending |
| Restart count stable during observation window | pending | pending |
| No secret/customer data exposed | pending | pending |
| Rollback target and procedure recorded | pending | pending |

## Current status

Blocked on authenticated operator access to bounded deployment/container logs and immutable deployed-version evidence. This template does not authorize a restart, deployment, configuration change, secret change, migration, or production mutation.

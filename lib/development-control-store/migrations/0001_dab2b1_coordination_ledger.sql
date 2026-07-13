-- DAB-2B1: tenant-independent development coordination ledger.
-- Additive only. This migration must run against a dedicated control-plane
-- PostgreSQL database, never the customer database or lib/db schema.

CREATE TABLE IF NOT EXISTS development_tasks (
  task_id TEXT PRIMARY KEY,
  active_revision INTEGER NOT NULL CHECK (active_revision > 0),
  specification_hash TEXT NOT NULL CHECK (specification_hash ~ '^spec_[0-9a-f]{64}$'),
  state TEXT NOT NULL CHECK (state IN ('proposed','approved','claimed','in_progress','review_requested','verified','completed','blocked','rejected','cancelled')),
  version INTEGER NOT NULL CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS development_task_specifications (
  task_id TEXT NOT NULL REFERENCES development_tasks(task_id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision > 0),
  specification_hash TEXT NOT NULL CHECK (specification_hash ~ '^spec_[0-9a-f]{64}$'),
  expected_origin_main_sha TEXT NOT NULL CHECK (expected_origin_main_sha ~ '^[0-9a-f]{40}$'),
  specification JSONB NOT NULL CHECK (octet_length(specification::TEXT) <= 131072),
  recorded_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (task_id, revision),
  CONSTRAINT uq_development_specification_hash UNIQUE (task_id, specification_hash)
);

CREATE TABLE IF NOT EXISTS development_actor_identities (
  actor_id TEXT PRIMARY KEY CHECK (char_length(actor_id) BETWEEN 1 AND 200),
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 200),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('human_authority','architect_reviewer','codex_implementer','bounded_sub_agent','read_only_automation')),
  verified BOOLEAN NOT NULL,
  actor_snapshot JSONB NOT NULL CHECK (octet_length(actor_snapshot::TEXT) <= 4096),
  first_observed_at TIMESTAMPTZ NOT NULL,
  last_observed_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS development_authorization_decisions (
  approval_id TEXT PRIMARY KEY CHECK (approval_id ~ '^approval_[0-9a-f]{64}$'),
  task_id TEXT NOT NULL REFERENCES development_tasks(task_id) ON DELETE CASCADE,
  decision_sequence INTEGER NOT NULL,
  specification_revision INTEGER NOT NULL,
  specification_hash TEXT NOT NULL CHECK (specification_hash ~ '^spec_[0-9a-f]{64}$'),
  expected_git_sha TEXT NOT NULL CHECK (expected_git_sha ~ '^[0-9a-f]{40}$'),
  categories JSONB NOT NULL CHECK (jsonb_typeof(categories) = 'array' AND jsonb_array_length(categories) BETWEEN 1 AND 10),
  deciding_actor_id TEXT NOT NULL REFERENCES development_actor_identities(actor_id),
  deciding_actor JSONB NOT NULL CHECK (octet_length(deciding_actor::TEXT) <= 4096),
  decision TEXT NOT NULL CHECK (decision IN ('proposed','approved','rejected','revoked','expired')),
  decided_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  constraints JSONB NOT NULL CHECK (jsonb_typeof(constraints) = 'array' AND jsonb_array_length(constraints) <= 50),
  rationale TEXT NOT NULL CHECK (char_length(rationale) BETWEEN 1 AND 1000),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 200),
  record JSONB NOT NULL CHECK (octet_length(record::TEXT) <= 32768),
  CONSTRAINT uq_development_approval_task_sequence UNIQUE (task_id, decision_sequence)
);

CREATE TABLE IF NOT EXISTS development_task_claims (
  task_id TEXT PRIMARY KEY REFERENCES development_tasks(task_id) ON DELETE CASCADE,
  owner_actor_id TEXT NOT NULL REFERENCES development_actor_identities(actor_id),
  owner_snapshot JSONB NOT NULL CHECK (octet_length(owner_snapshot::TEXT) <= 4096),
  claimed_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > claimed_at),
  lease_version INTEGER NOT NULL CHECK (lease_version > 0)
);

CREATE TABLE IF NOT EXISTS development_audit_events (
  event_id TEXT PRIMARY KEY CHECK (event_id ~ '^event_[0-9a-f]{64}$'),
  task_id TEXT NOT NULL REFERENCES development_tasks(task_id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  prior_state TEXT,
  new_state TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES development_actor_identities(actor_id),
  actor_snapshot JSONB NOT NULL CHECK (octet_length(actor_snapshot::TEXT) <= 4096),
  reason_code TEXT NOT NULL CHECK (char_length(reason_code) BETWEEN 1 AND 200),
  expected_git_sha TEXT,
  observed_git_sha TEXT,
  specification_revision INTEGER NOT NULL,
  specification_hash TEXT NOT NULL CHECK (specification_hash ~ '^spec_[0-9a-f]{64}$'),
  correlation_key TEXT NOT NULL CHECK (char_length(correlation_key) BETWEEN 1 AND 200),
  metadata JSONB NOT NULL CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::TEXT) <= 16384),
  occurred_at TIMESTAMPTZ NOT NULL,
  event JSONB NOT NULL CHECK (octet_length(event::TEXT) <= 32768),
  CONSTRAINT uq_development_event_task_sequence UNIQUE (task_id, sequence)
);

CREATE TABLE IF NOT EXISTS development_milestones (
  milestone_id TEXT PRIMARY KEY CHECK (milestone_id ~ '^milestone_[0-9a-f]{64}$'),
  task_id TEXT NOT NULL REFERENCES development_tasks(task_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('committed','pushed','pull_request_opened','merged','deployed')),
  status TEXT NOT NULL CHECK (status IN ('verified','not_verified','not_applicable')),
  evidence TEXT,
  verified_by_actor_id TEXT REFERENCES development_actor_identities(actor_id),
  record JSONB NOT NULL CHECK (octet_length(record::TEXT) <= 8192),
  recorded_at TIMESTAMPTZ NOT NULL,
  current BOOLEAN NOT NULL,
  CONSTRAINT ck_development_milestone_evidence CHECK ((status = 'verified' AND evidence IS NOT NULL AND char_length(evidence) BETWEEN 1 AND 500) OR (status <> 'verified' AND evidence IS NULL))
);

CREATE TABLE IF NOT EXISTS development_completion_reports (
  report_id TEXT PRIMARY KEY CHECK (report_id ~ '^report_[0-9a-f]{64}$'),
  task_id TEXT NOT NULL REFERENCES development_tasks(task_id) ON DELETE CASCADE,
  specification_revision INTEGER NOT NULL,
  specification_hash TEXT NOT NULL CHECK (specification_hash ~ '^spec_[0-9a-f]{64}$'),
  submitted_by_actor_id TEXT NOT NULL REFERENCES development_actor_identities(actor_id),
  submitted_by JSONB NOT NULL CHECK (octet_length(submitted_by::TEXT) <= 4096),
  report JSONB NOT NULL CHECK (octet_length(report::TEXT) <= 65536),
  submitted_at TIMESTAMPTZ NOT NULL,
  current BOOLEAN NOT NULL
);

CREATE TABLE IF NOT EXISTS development_idempotency_records (
  operation TEXT NOT NULL CHECK (char_length(operation) BETWEEN 1 AND 100),
  task_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 200),
  request_fingerprint TEXT NOT NULL CHECK (request_fingerprint ~ '^request_[0-9a-f]{64}$'),
  result JSONB NOT NULL CHECK (octet_length(result::TEXT) <= 131072),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (operation, task_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_development_tasks_state_updated ON development_tasks(state, updated_at, task_id);
CREATE INDEX IF NOT EXISTS idx_development_approval_task_category_time ON development_authorization_decisions(task_id, decided_at, approval_id);
CREATE INDEX IF NOT EXISTS idx_development_claim_expiry ON development_task_claims(expires_at, task_id);
CREATE INDEX IF NOT EXISTS idx_development_event_task_time ON development_audit_events(task_id, occurred_at, event_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_development_milestone_current ON development_milestones(task_id, kind) WHERE current = TRUE;
CREATE INDEX IF NOT EXISTS idx_development_milestone_history ON development_milestones(task_id, kind, recorded_at, milestone_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_development_report_current ON development_completion_reports(task_id) WHERE current = TRUE;
CREATE INDEX IF NOT EXISTS idx_development_report_history ON development_completion_reports(task_id, submitted_at, report_id);
CREATE INDEX IF NOT EXISTS idx_development_idempotency_created ON development_idempotency_records(created_at, operation, task_id);

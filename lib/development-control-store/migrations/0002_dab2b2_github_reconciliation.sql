CREATE TABLE IF NOT EXISTS development_github_identities (
  repository_id text NOT NULL CHECK (repository_id ~ '^[1-9][0-9]{0,19}$'),
  actor_id text NOT NULL CHECK (actor_id ~ '^[1-9][0-9]{0,19}$'),
  display_login text NOT NULL CHECK (char_length(display_login) BETWEEN 1 AND 100),
  first_observed_at timestamptz NOT NULL,
  last_observed_at timestamptz NOT NULL,
  PRIMARY KEY (repository_id, actor_id)
);

CREATE TABLE IF NOT EXISTS development_github_evidence (
  evidence_id text PRIMARY KEY CHECK (evidence_id ~ '^github_evidence_[0-9a-f]{64}$'),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^github_observation_[0-9a-f]{64}$'),
  repository_id text NOT NULL CHECK (repository_id ~ '^[1-9][0-9]{0,19}$'),
  repository_name text NOT NULL,
  object_type text NOT NULL,
  object_id text NOT NULL CHECK (object_id ~ '^[1-9][0-9]{0,19}$'),
  source_url text NOT NULL,
  actor_id text,
  actor_login text,
  source_created_at timestamptz NOT NULL,
  source_updated_at timestamptz NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^content_[0-9a-f]{64}$'),
  deleted boolean NOT NULL,
  approval_binding jsonb CHECK (approval_binding IS NULL OR octet_length(approval_binding::text) <= 4096),
  head_sha text,
  previous_head_sha text,
  recorded_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_development_github_evidence_fingerprint ON development_github_evidence (repository_id, fingerprint);
CREATE INDEX IF NOT EXISTS idx_development_github_evidence_object ON development_github_evidence (repository_id, object_type, object_id, source_updated_at);

CREATE TABLE IF NOT EXISTS development_github_reconciliation_cursors (
  repository_id text NOT NULL,
  stream text NOT NULL CHECK (char_length(stream) BETWEEN 1 AND 100),
  cursor text CHECK (cursor IS NULL OR char_length(cursor) <= 500),
  etag text CHECK (etag IS NULL OR char_length(etag) <= 500),
  last_observed_at timestamptz,
  retry_at timestamptz,
  version integer NOT NULL CHECK (version > 0),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (repository_id, stream)
);
CREATE INDEX IF NOT EXISTS idx_development_github_cursor_retry ON development_github_reconciliation_cursors (retry_at, repository_id, stream);

CREATE TABLE IF NOT EXISTS development_github_reconciliation_runs (
  run_id text PRIMARY KEY CHECK (run_id ~ '^github_run_[0-9a-f]{64}$'),
  repository_id text NOT NULL,
  stream text NOT NULL,
  operation_key text NOT NULL,
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^github_request_[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('succeeded','not_modified','rate_limited','unavailable')),
  diagnostics jsonb NOT NULL CHECK (octet_length(diagnostics::text) <= 32768),
  summary jsonb NOT NULL CHECK (octet_length(summary::text) <= 65536),
  recorded_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_development_github_run_operation ON development_github_reconciliation_runs (operation_key, request_fingerprint);
CREATE INDEX IF NOT EXISTS idx_development_github_run_repository ON development_github_reconciliation_runs (repository_id, stream, recorded_at);

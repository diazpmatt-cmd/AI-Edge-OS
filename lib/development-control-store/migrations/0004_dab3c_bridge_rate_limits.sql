CREATE TABLE IF NOT EXISTS development_bridge_rate_limits (
  principal_reference_hash text NOT NULL CHECK (principal_reference_hash ~ '^bridge_principal_hash_[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0 AND request_count <= 1000),
  expires_at timestamptz NOT NULL CHECK (expires_at > window_started_at),
  PRIMARY KEY (principal_reference_hash, window_started_at)
);

CREATE INDEX IF NOT EXISTS idx_development_bridge_rate_limit_expiry
  ON development_bridge_rate_limits (expires_at, principal_reference_hash);

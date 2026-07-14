CREATE TABLE IF NOT EXISTS development_bridge_request_ledger (
  request_fingerprint_hash text PRIMARY KEY CHECK (request_fingerprint_hash ~ '^bridge_request_hash_[0-9a-f]{64}$'),
  principal_reference_hash text NOT NULL CHECK (principal_reference_hash ~ '^bridge_principal_hash_[0-9a-f]{64}$'),
  token_id_hash text NOT NULL CHECK (token_id_hash ~ '^bridge_token_hash_[0-9a-f]{64}$'),
  nonce_hash text NOT NULL CHECK (nonce_hash ~ '^bridge_nonce_hash_[0-9a-f]{64}$'),
  idempotency_key_hash text NOT NULL CHECK (idempotency_key_hash ~ '^bridge_idempotency_hash_[0-9a-f]{64}$'),
  correlation_reference text NOT NULL CHECK (char_length(correlation_reference) BETWEEN 1 AND 200),
  operation text NOT NULL CHECK (char_length(operation) BETWEEN 1 AND 100),
  outcome text NOT NULL CHECK (outcome IN ('claimed','allowed','denied','failed')),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_development_bridge_request_idempotency
  ON development_bridge_request_ledger (principal_reference_hash, idempotency_key_hash);
CREATE UNIQUE INDEX IF NOT EXISTS uq_development_bridge_request_nonce
  ON development_bridge_request_ledger (principal_reference_hash, nonce_hash);
CREATE INDEX IF NOT EXISTS idx_development_bridge_request_expiry
  ON development_bridge_request_ledger (expires_at, request_fingerprint_hash);

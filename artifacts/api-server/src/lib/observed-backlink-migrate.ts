import { pool } from "@workspace/db";

/**
 * Dedicated additive startup bootstrap for Measurement-owned backlink inventory
 * persistence. This intentionally does not alter Authority opportunity tables.
 */
export async function migrateObservedBacklinks(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS backlink_inventory_runs (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      provider_id TEXT NOT NULL CHECK (char_length(provider_id) BETWEEN 1 AND 100),
      provider_revision TEXT NOT NULL CHECK (char_length(provider_revision) BETWEEN 1 AND 100),
      status TEXT NOT NULL CHECK (status IN ('succeeded','failed')),
      completeness TEXT NOT NULL CHECK (completeness IN ('complete','incomplete')),
      completed_at TIMESTAMPTZ NOT NULL,
      input_fingerprint TEXT NOT NULL CHECK (input_fingerprint ~ '^[0-9a-f]{64}$'),
      observed_count INTEGER NOT NULL CHECK (observed_count >= 0),
      absence_evaluation_applied BOOLEAN NOT NULL,
      active_backlink_count INTEGER NOT NULL CHECK (active_backlink_count >= 0),
      referring_domain_count INTEGER NOT NULL CHECK (referring_domain_count >= 0),
      new_count INTEGER NOT NULL CHECK (new_count >= 0),
      lost_count INTEGER NOT NULL CHECK (lost_count >= 0),
      restored_count INTEGER NOT NULL CHECK (restored_count >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_backlink_inventory_runs_id_client UNIQUE (id, client_id),
      CONSTRAINT uq_backlink_inventory_runs_client_run UNIQUE (client_id, run_id),
      CONSTRAINT ck_backlink_inventory_absence_truth CHECK (
        (status = 'failed' AND absence_evaluation_applied = FALSE) OR
        (status = 'succeeded' AND completeness = 'incomplete' AND absence_evaluation_applied = FALSE) OR
        (status = 'succeeded' AND completeness = 'complete' AND absence_evaluation_applied = TRUE)
      )
    );
    CREATE INDEX IF NOT EXISTS idx_backlink_inventory_runs_client_completed
      ON backlink_inventory_runs(client_id, completed_at DESC, run_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS observed_backlinks (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      source_url TEXT NOT NULL,
      source_domain TEXT NOT NULL,
      target_url TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active','lost')),
      first_seen_at TIMESTAMPTZ NOT NULL,
      first_seen_run_id TEXT NOT NULL,
      first_seen_provider_id TEXT NOT NULL,
      last_seen_at TIMESTAMPTZ NOT NULL,
      last_seen_run_id TEXT NOT NULL,
      last_seen_provider_id TEXT NOT NULL,
      consecutive_successful_misses INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_successful_misses >= 0),
      last_lost_at TIMESTAMPTZ,
      last_lost_run_id TEXT,
      reacquired_count INTEGER NOT NULL DEFAULT 0 CHECK (reacquired_count >= 0),
      last_reacquired_at TIMESTAMPTZ,
      last_evaluated_run_id TEXT,
      last_evaluated_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_observed_backlinks_id_client UNIQUE (id, client_id),
      CONSTRAINT ck_observed_backlink_loss_pair CHECK ((last_lost_at IS NULL) = (last_lost_run_id IS NULL)),
      CONSTRAINT ck_observed_backlink_evaluated_pair CHECK ((last_evaluated_at IS NULL) = (last_evaluated_run_id IS NULL))
    );
    CREATE INDEX IF NOT EXISTS idx_observed_backlinks_client_status
      ON observed_backlinks(client_id, status, source_domain);
    CREATE INDEX IF NOT EXISTS idx_observed_backlinks_client_domain
      ON observed_backlinks(client_id, source_domain, id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS observed_backlink_transitions (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('new','still_observed','possibly_missing','lost','restored')),
      source_url TEXT NOT NULL,
      source_domain TEXT NOT NULL,
      target_url TEXT NOT NULL,
      at TIMESTAMPTZ NOT NULL,
      consecutive_successful_misses INTEGER NOT NULL CHECK (consecutive_successful_misses >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_observed_backlink_transitions_id_client UNIQUE (id, client_id)
    );
    CREATE INDEX IF NOT EXISTS idx_observed_backlink_transitions_client_at
      ON observed_backlink_transitions(client_id, at DESC, id);
    CREATE INDEX IF NOT EXISTS idx_observed_backlink_transitions_client_type
      ON observed_backlink_transitions(client_id, type, at DESC);
  `);
}

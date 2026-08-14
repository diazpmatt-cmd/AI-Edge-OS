import { pool } from "@workspace/db";

/**
 * Additive startup bootstrap for lifecycle-backed Measurement provenance on
 * backlink_score_history. Legacy rows remain explicitly untrusted via NULL source.
 */
export async function migrateBacklinkMeasurementHistory(): Promise<void> {
  await pool.query(`
    ALTER TABLE backlink_score_history
      ADD COLUMN IF NOT EXISTS restored_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE backlink_score_history
      ADD COLUMN IF NOT EXISTS measurement_source TEXT;
    ALTER TABLE backlink_score_history
      ADD COLUMN IF NOT EXISTS measurement_inventory_run_id TEXT;
    ALTER TABLE backlink_score_history
      ADD COLUMN IF NOT EXISTS measurement_observed_at TIMESTAMPTZ;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_backlink_score_history_measurement_source'
      ) THEN
        ALTER TABLE backlink_score_history
          ADD CONSTRAINT ck_backlink_score_history_measurement_source
          CHECK (
            measurement_source IS NULL OR
            measurement_source = 'observed_backlink_lifecycle_v1'
          );
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_backlink_score_history_measurement_source
      ON backlink_score_history(client_id, measurement_source, snapshot_date DESC);
  `);
}

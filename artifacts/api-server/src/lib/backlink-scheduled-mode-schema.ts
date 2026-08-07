import { pool } from "@workspace/db";

export interface BacklinkScheduledModeSchemaState {
  readonly ready: boolean;
  readonly constraintDefinition: string | null;
}

const MODE_CONSTRAINT = "ck_backlink_ingestion_mode";

/**
 * Idempotently expands the persisted backlink ingestion mode contract from
 * manual-only to manual | scheduled.
 *
 * This does NOT activate scheduled execution. The ingestion validator and
 * scheduler execution boundary remain fail-closed until separately wired.
 */
export async function ensureBacklinkScheduledModeSchemaReady(): Promise<void> {
  await pool.query("BEGIN");
  try {
    await pool.query(`
      ALTER TABLE backlink_ingestion_runs
        DROP CONSTRAINT IF EXISTS ${MODE_CONSTRAINT};
      ALTER TABLE backlink_ingestion_runs
        ADD CONSTRAINT ${MODE_CONSTRAINT}
        CHECK (mode IN ('manual','scheduled')) NOT VALID;
      ALTER TABLE backlink_ingestion_runs
        VALIDATE CONSTRAINT ${MODE_CONSTRAINT};
    `);
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

export async function getBacklinkScheduledModeSchemaState(): Promise<BacklinkScheduledModeSchemaState> {
  const result = await pool.query<{ definition: string }>(
    `SELECT pg_get_constraintdef(c.oid) AS definition
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'backlink_ingestion_runs'
        AND c.conname = $1
      LIMIT 1`,
    [MODE_CONSTRAINT],
  );
  const definition = result.rows[0]?.definition ?? null;
  return Object.freeze({
    ready: Boolean(
      definition &&
      /mode/i.test(definition) &&
      /manual/i.test(definition) &&
      /scheduled/i.test(definition)
    ),
    constraintDefinition: definition,
  });
}

import { pool } from "@workspace/db";
import { migrateSchema } from "./schema-migrate.js";

const AUTHORITY_TEST_SCHEMA_LOCK = 744190312;

export async function migrateAuthorityTestBaseSchema(): Promise<void> {
  const lockClient = await pool.connect();
  try {
    await lockClient.query("SELECT pg_advisory_lock($1)", [AUTHORITY_TEST_SCHEMA_LOCK]);
    await migrateSchema();
  } finally {
    try {
      await lockClient.query("SELECT pg_advisory_unlock($1)", [AUTHORITY_TEST_SCHEMA_LOCK]);
    } finally {
      lockClient.release();
    }
  }
}

import { pool } from "@workspace/db";

/**
 * Controlled startup migration for the agent_tasks table.
 *
 * Must be called from index.ts before the server begins accepting requests.
 * Any failure propagates as a thrown error — the server MUST NOT start if
 * this migration fails. The caller is responsible for process.exit on catch.
 *
 * drizzle-kit push is blocked by a pre-existing constraint conflict in this
 * DB, so this table is bootstrapped via pool.query with idempotent DDL.
 */
export async function migrateAgentTasks(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_tasks (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id          TEXT        NOT NULL,
      task_type        TEXT        NOT NULL,
      payload          TEXT        NOT NULL DEFAULT '{}',
      status           TEXT        NOT NULL DEFAULT 'pending_review',
      decision         TEXT,
      resolution       TEXT,
      decision_by      TEXT,
      decision_at      TIMESTAMPTZ,
      decision_note    TEXT,
      rule_id          TEXT,
      rule_set_version TEXT        NOT NULL DEFAULT 'v1',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS resolution TEXT;

    CREATE INDEX IF NOT EXISTS idx_agent_tasks_user_created
      ON agent_tasks(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_tasks_user_status
      ON agent_tasks(user_id, status);
  `);

  console.log("[AGENT-TASKS] Migration complete");
}

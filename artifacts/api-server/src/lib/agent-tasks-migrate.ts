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
      execution_attempts INTEGER     NOT NULL DEFAULT 0,
      execution_started_at TIMESTAMPTZ,
      execution_completed_at TIMESTAMPTZ,
      failure_code      TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS resolution TEXT;
    ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS execution_attempts INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS execution_started_at TIMESTAMPTZ;
    ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS execution_completed_at TIMESTAMPTZ;
    ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS failure_code TEXT;

    CREATE INDEX IF NOT EXISTS idx_agent_tasks_user_created
      ON agent_tasks(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_tasks_user_status
      ON agent_tasks(user_id, status);

    CREATE TABLE IF NOT EXISTS agent_task_steps (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id          UUID        NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
      step_key         TEXT        NOT NULL,
      position         INTEGER     NOT NULL CHECK (position >= 0),
      capability       TEXT        NOT NULL,
      status           TEXT        NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending','running','completed','failed','cancelled')),
      attempt_count    INTEGER     NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      max_attempts     INTEGER     NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
      input_digest     TEXT        NOT NULL,
      output_receipt   JSONB,
      failure_code     TEXT,
      lease_owner      TEXT,
      lease_expires_at TIMESTAMPTZ,
      started_at       TIMESTAMPTZ,
      completed_at     TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(task_id, step_key),
      UNIQUE(task_id, position)
    );

    CREATE INDEX IF NOT EXISTS idx_agent_task_steps_task_status
      ON agent_task_steps(task_id, status, position);
    CREATE INDEX IF NOT EXISTS idx_agent_task_steps_lease
      ON agent_task_steps(status, lease_expires_at)
      WHERE status='running';
  `);

  console.log("[AGENT-TASKS] Migration complete");
}

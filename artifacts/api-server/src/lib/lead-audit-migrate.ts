import { pool } from "@workspace/db";

export async function migrateLeadAuditEvents(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lead_audit_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id UUID NOT NULL,
      action TEXT NOT NULL,
      actor_type TEXT NOT NULL DEFAULT 'system',
      actor_id TEXT,
      previous_state JSONB,
      next_state JSONB,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS lead_audit_events_lead_created_at_idx
    ON lead_audit_events (lead_id, created_at DESC)
  `);
}

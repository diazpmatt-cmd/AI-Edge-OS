import { pool } from "@workspace/db";
import type { ClassifiedLeadEmail } from "./lead-email-classifier.js";
import { classifyWorkerErrorCode, sanitizeWorkerError } from "./lead-email-worker-policy.js";

export const LEAD_EMAIL_WORKER_KEY = "gmail-lead-bridge-v1";
export const LEAD_EMAIL_PROVIDER = "gmail";

export type LeadEmailPersistenceResult = "persisted" | "ignored" | "duplicate" | "conflict";

export interface LeadEmailPollSuccess {
  checkpointInternalDateMs: number | null;
  listed: number;
  ingested: number;
  skipped: number;
  quarantined: number;
}

export async function bootstrapLeadEmailPersistence(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lead_email_events (
      provider text NOT NULL,
      external_message_id text NOT NULL,
      platform text NOT NULL,
      classification text NOT NULL,
      payload_hash text NOT NULL,
      state text NOT NULL CHECK (state IN ('claimed','persisted','ignored','quarantined','conflict')),
      gmail_internal_date_ms bigint NOT NULL,
      lead_id uuid,
      safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      processed_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (provider, external_message_id)
    );
    CREATE INDEX IF NOT EXISTS idx_lead_email_events_processed_at
      ON lead_email_events(processed_at DESC);

    CREATE TABLE IF NOT EXISTS lead_email_quarantine (
      provider text NOT NULL,
      external_message_id text NOT NULL,
      reason_code text NOT NULL,
      safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      attempts integer NOT NULL DEFAULT 1,
      first_seen_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (provider, external_message_id)
    );

    CREATE TABLE IF NOT EXISTS lead_email_worker_state (
      worker_key text PRIMARY KEY,
      checkpoint_internal_date_ms bigint,
      last_attempt_at timestamptz,
      last_successful_poll_at timestamptz,
      last_failure_at timestamptz,
      consecutive_failures integer NOT NULL DEFAULT 0,
      last_error_code text,
      last_error_message text,
      last_listed_count integer NOT NULL DEFAULT 0,
      last_ingested_count integer NOT NULL DEFAULT 0,
      last_skipped_count integer NOT NULL DEFAULT 0,
      last_quarantined_count integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`INSERT INTO lead_email_worker_state(worker_key)
    VALUES ($1) ON CONFLICT(worker_key) DO NOTHING`, [LEAD_EMAIL_WORKER_KEY]);
}

export async function getLeadEmailCheckpointInternalDateMs(): Promise<number | null> {
  const result = await pool.query<{ checkpoint_internal_date_ms: string | null }>(
    "SELECT checkpoint_internal_date_ms FROM lead_email_worker_state WHERE worker_key=$1",
    [LEAD_EMAIL_WORKER_KEY],
  );
  const raw = result.rows[0]?.checkpoint_internal_date_ms;
  if (raw === null || raw === undefined) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export async function markLeadEmailPollAttempt(): Promise<void> {
  await pool.query(`UPDATE lead_email_worker_state
    SET last_attempt_at=now(), updated_at=now()
    WHERE worker_key=$1`, [LEAD_EMAIL_WORKER_KEY]);
}

export async function markLeadEmailPollSuccess(result: LeadEmailPollSuccess): Promise<void> {
  await pool.query(`UPDATE lead_email_worker_state SET
      checkpoint_internal_date_ms=$2,
      last_successful_poll_at=now(),
      consecutive_failures=0,
      last_error_code=NULL,
      last_error_message=NULL,
      last_listed_count=$3,
      last_ingested_count=$4,
      last_skipped_count=$5,
      last_quarantined_count=$6,
      updated_at=now()
    WHERE worker_key=$1`, [
    LEAD_EMAIL_WORKER_KEY,
    result.checkpointInternalDateMs,
    result.listed,
    result.ingested,
    result.skipped,
    result.quarantined,
  ]);
}

export async function markLeadEmailPollFailure(error: unknown, consecutiveFailures: number): Promise<void> {
  await pool.query(`UPDATE lead_email_worker_state SET
      last_failure_at=now(),
      consecutive_failures=$2,
      last_error_code=$3,
      last_error_message=$4,
      updated_at=now()
    WHERE worker_key=$1`, [
    LEAD_EMAIL_WORKER_KEY,
    consecutiveFailures,
    classifyWorkerErrorCode(error),
    sanitizeWorkerError(error),
  ]);
}

export async function quarantineLeadEmail(input: {
  messageId: string;
  internalDateMs: number;
  reasonCode: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO lead_email_quarantine(
        provider,external_message_id,reason_code,safe_metadata,attempts,first_seen_at,last_seen_at)
      VALUES($1,$2,$3,$4::jsonb,1,now(),now())
      ON CONFLICT(provider,external_message_id) DO UPDATE SET
        reason_code=EXCLUDED.reason_code,
        safe_metadata=EXCLUDED.safe_metadata,
        attempts=lead_email_quarantine.attempts+1,
        last_seen_at=now()`, [
      LEAD_EMAIL_PROVIDER,
      input.messageId,
      input.reasonCode,
      JSON.stringify(input.metadata),
    ]);
    await client.query(`INSERT INTO lead_email_events(
        provider,external_message_id,platform,classification,payload_hash,state,gmail_internal_date_ms,safe_metadata)
      VALUES($1,$2,'unknown','unknown',$3,'quarantined',$4,$5::jsonb)
      ON CONFLICT(provider,external_message_id) DO NOTHING`, [
      LEAD_EMAIL_PROVIDER,
      input.messageId,
      `quarantine:${input.reasonCode}`,
      input.internalDateMs,
      JSON.stringify(input.metadata),
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function persistClassifiedLeadEmail(input: {
  messageId: string;
  internalDateMs: number;
  classified: ClassifiedLeadEmail;
  summary: string;
  metadata: Record<string, unknown>;
}): Promise<LeadEmailPersistenceResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const claimed = await client.query<{ external_message_id: string }>(`INSERT INTO lead_email_events(
        provider,external_message_id,platform,classification,payload_hash,state,gmail_internal_date_ms,safe_metadata)
      VALUES($1,$2,$3,$4,$5,'claimed',$6,$7::jsonb)
      ON CONFLICT(provider,external_message_id) DO NOTHING
      RETURNING external_message_id`, [
      LEAD_EMAIL_PROVIDER,
      input.messageId,
      input.classified.source,
      input.classified.kind,
      input.classified.payloadHash,
      input.internalDateMs,
      JSON.stringify(input.metadata),
    ]);

    if (!claimed.rowCount) {
      const existing = await client.query<{ payload_hash: string }>(
        "SELECT payload_hash FROM lead_email_events WHERE provider=$1 AND external_message_id=$2 FOR UPDATE",
        [LEAD_EMAIL_PROVIDER, input.messageId],
      );
      if (existing.rows[0]?.payload_hash === input.classified.payloadHash) {
        await client.query("COMMIT");
        return "duplicate";
      }

      await client.query(`INSERT INTO lead_email_quarantine(
          provider,external_message_id,reason_code,safe_metadata,attempts,first_seen_at,last_seen_at)
        VALUES($1,$2,'payload_conflict',$3::jsonb,1,now(),now())
        ON CONFLICT(provider,external_message_id) DO UPDATE SET
          reason_code='payload_conflict',
          safe_metadata=EXCLUDED.safe_metadata,
          attempts=lead_email_quarantine.attempts+1,
          last_seen_at=now()`, [LEAD_EMAIL_PROVIDER, input.messageId, JSON.stringify(input.metadata)]);
      await client.query(`UPDATE lead_email_events SET state='conflict', processed_at=now()
        WHERE provider=$1 AND external_message_id=$2`, [LEAD_EMAIL_PROVIDER, input.messageId]);
      await client.query("COMMIT");
      return "conflict";
    }

    const actionable = input.classified.kind === "lead" || input.classified.kind === "follow_up";
    let leadId: string | null = null;
    if (actionable) {
      const lead = await client.query<{ id: string }>(`INSERT INTO leads(
          client_name,source,phone,customer_name,message,event_type,status,notes)
        VALUES('Bed Bugs & Beyond','gmail-lead-bridge','',$1,$2,$3,'new',$4)
        RETURNING id`, [
        input.classified.customerName,
        input.summary || null,
        `gmail:${input.messageId}`,
        JSON.stringify({ ...input.metadata, payloadHash: input.classified.payloadHash, gmailMessageId: input.messageId }).slice(0, 20_000),
      ]);
      leadId = lead.rows[0]?.id ?? null;
    }

    const finalState = actionable ? "persisted" : "ignored";
    await client.query(`UPDATE lead_email_events SET state=$3, lead_id=$4, processed_at=now()
      WHERE provider=$1 AND external_message_id=$2`, [LEAD_EMAIL_PROVIDER, input.messageId, finalState, leadId]);
    await client.query("COMMIT");
    return finalState;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

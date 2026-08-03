import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import type { ClassifiedLeadEmail } from "../lib/lead-email-classifier.js";
import {
  bootstrapLeadEmailPersistence,
  getLeadEmailCheckpointInternalDateMs,
  LEAD_EMAIL_PROVIDER,
  LEAD_EMAIL_WORKER_KEY,
  markLeadEmailPollAttempt,
  markLeadEmailPollFailure,
  markLeadEmailPollSuccess,
  persistClassifiedLeadEmail,
  quarantineLeadEmail,
} from "../lib/lead-email-persistence.js";

const classifiedLead = (messageId: string, payloadHash = "hash-a"): ClassifiedLeadEmail => ({
  source: "yelp",
  kind: "lead",
  externalId: messageId,
  customerName: "Test Customer",
  service: "Bed bug treatment",
  location: "Foley, AL",
  details: "Controlled integration fixture",
  urgency: "urgent",
  payloadHash,
});

const input = (messageId: string, payloadHash = "hash-a") => ({
  messageId,
  internalDateMs: Date.parse("2026-08-03T06:00:00Z"),
  classified: classifiedLead(messageId, payloadHash),
  summary: "Service: Bed bug treatment\nLocation: Foley, AL",
  metadata: {
    from: "Yelp <reply+fixture@messaging.yelp.com>",
    subject: "New lead on Yelp",
    platform: "yelp",
    kind: "lead",
    urgency: "urgent",
    receivedAt: "2026-08-03T06:00:00.000Z",
  },
});

beforeAll(async () => {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE IF NOT EXISTS leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_name text NOT NULL DEFAULT '',
      source text NOT NULL DEFAULT 'telnyx',
      phone text NOT NULL DEFAULT '',
      customer_name text,
      message text,
      event_type text NOT NULL DEFAULT 'sms',
      status text NOT NULL DEFAULT 'new',
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await bootstrapLeadEmailPersistence();
});

beforeEach(async () => {
  await pool.query("DELETE FROM lead_email_quarantine");
  await pool.query("DELETE FROM lead_email_events");
  await pool.query("DELETE FROM leads WHERE source='gmail-lead-bridge'");
  await pool.query(`UPDATE lead_email_worker_state SET
      checkpoint_internal_date_ms=NULL,
      last_attempt_at=NULL,
      last_successful_poll_at=NULL,
      last_failure_at=NULL,
      consecutive_failures=0,
      last_error_code=NULL,
      last_error_message=NULL,
      last_listed_count=0,
      last_ingested_count=0,
      last_skipped_count=0,
      last_quarantined_count=0,
      updated_at=now()
    WHERE worker_key=$1`, [LEAD_EMAIL_WORKER_KEY]);
});

describe("Lead Bridge atomic event persistence", () => {
  it("creates one lead when two workers concurrently claim the same Gmail message", async () => {
    const results = await Promise.all([
      persistClassifiedLeadEmail(input("gmail-concurrent")),
      persistClassifiedLeadEmail(input("gmail-concurrent")),
    ]);

    expect([...results].sort()).toEqual(["duplicate", "persisted"]);

    const leads = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM leads WHERE source='gmail-lead-bridge' AND event_type=$1",
      ["gmail:gmail-concurrent"],
    );
    expect(Number(leads.rows[0]?.count ?? 0)).toBe(1);

    const events = await pool.query<{ state: string; lead_id: string | null }>(
      "SELECT state,lead_id FROM lead_email_events WHERE provider=$1 AND external_message_id=$2",
      [LEAD_EMAIL_PROVIDER, "gmail-concurrent"],
    );
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0]?.state).toBe("persisted");
    expect(events.rows[0]?.lead_id).toBeTruthy();
  });

  it("quarantines a replay whose payload hash conflicts with the claimed event", async () => {
    expect(await persistClassifiedLeadEmail(input("gmail-conflict", "hash-original"))).toBe("persisted");
    expect(await persistClassifiedLeadEmail(input("gmail-conflict", "hash-mutated"))).toBe("conflict");

    const leads = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM leads WHERE source='gmail-lead-bridge' AND event_type=$1",
      ["gmail:gmail-conflict"],
    );
    expect(Number(leads.rows[0]?.count ?? 0)).toBe(1);

    const event = await pool.query<{ state: string }>(
      "SELECT state FROM lead_email_events WHERE provider=$1 AND external_message_id=$2",
      [LEAD_EMAIL_PROVIDER, "gmail-conflict"],
    );
    expect(event.rows[0]?.state).toBe("conflict");

    const quarantine = await pool.query<{ reason_code: string; attempts: number }>(
      "SELECT reason_code,attempts FROM lead_email_quarantine WHERE provider=$1 AND external_message_id=$2",
      [LEAD_EMAIL_PROVIDER, "gmail-conflict"],
    );
    expect(quarantine.rows[0]).toEqual({ reason_code: "payload_conflict", attempts: 1 });
  });

  it("increments quarantine attempts without creating a customer lead", async () => {
    const quarantineInput = {
      messageId: "gmail-oversized",
      internalDateMs: Date.parse("2026-08-03T06:30:00Z"),
      reasonCode: "message_text_too_large",
      metadata: { subject: "Oversized controlled fixture" },
    };
    await quarantineLeadEmail(quarantineInput);
    await quarantineLeadEmail(quarantineInput);

    const quarantine = await pool.query<{ attempts: number; reason_code: string }>(
      "SELECT attempts,reason_code FROM lead_email_quarantine WHERE provider=$1 AND external_message_id=$2",
      [LEAD_EMAIL_PROVIDER, quarantineInput.messageId],
    );
    expect(quarantine.rows[0]).toEqual({ attempts: 2, reason_code: "message_text_too_large" });

    const event = await pool.query<{ state: string }>(
      "SELECT state FROM lead_email_events WHERE provider=$1 AND external_message_id=$2",
      [LEAD_EMAIL_PROVIDER, quarantineInput.messageId],
    );
    expect(event.rows[0]?.state).toBe("quarantined");

    const leads = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM leads WHERE source='gmail-lead-bridge'",
    );
    expect(Number(leads.rows[0]?.count ?? 0)).toBe(0);
  });

  it("rolls back a failed lead insert and leaves the durable checkpoint unchanged", async () => {
    const checkpointBefore = Date.parse("2026-08-03T05:00:00Z");
    await markLeadEmailPollSuccess({
      checkpointInternalDateMs: checkpointBefore,
      listed: 0,
      ingested: 0,
      skipped: 0,
      quarantined: 0,
    });

    await pool.query(`CREATE OR REPLACE FUNCTION lead_email_test_fail_insert()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.event_type = 'gmail:gmail-fault-injection' THEN
          RAISE EXCEPTION 'controlled lead insert failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql`);
    await pool.query("DROP TRIGGER IF EXISTS lead_email_test_fail_insert_trigger ON leads");
    await pool.query(`CREATE TRIGGER lead_email_test_fail_insert_trigger
      BEFORE INSERT ON leads
      FOR EACH ROW EXECUTE FUNCTION lead_email_test_fail_insert()`);

    try {
      await expect(persistClassifiedLeadEmail(input("gmail-fault-injection")))
        .rejects.toThrow("controlled lead insert failure");

      const events = await pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM lead_email_events WHERE provider=$1 AND external_message_id=$2",
        [LEAD_EMAIL_PROVIDER, "gmail-fault-injection"],
      );
      const leads = await pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM leads WHERE source='gmail-lead-bridge' AND event_type=$1",
        ["gmail:gmail-fault-injection"],
      );

      expect(Number(events.rows[0]?.count ?? 0)).toBe(0);
      expect(Number(leads.rows[0]?.count ?? 0)).toBe(0);
      expect(await getLeadEmailCheckpointInternalDateMs()).toBe(checkpointBefore);
    } finally {
      await pool.query("DROP TRIGGER IF EXISTS lead_email_test_fail_insert_trigger ON leads");
      await pool.query("DROP FUNCTION IF EXISTS lead_email_test_fail_insert()");
    }
  });
});

describe("Lead Bridge durable checkpoint and health state", () => {
  it("persists attempts, successful checkpoint advancement, counters, and failure diagnostics", async () => {
    await markLeadEmailPollAttempt();
    await markLeadEmailPollSuccess({
      checkpointInternalDateMs: 1_754_203_200_000,
      listed: 5,
      ingested: 1,
      skipped: 3,
      quarantined: 1,
    });

    expect(await getLeadEmailCheckpointInternalDateMs()).toBe(1_754_203_200_000);

    const success = await pool.query<{
      last_attempt_at: Date | null;
      last_successful_poll_at: Date | null;
      consecutive_failures: number;
      last_listed_count: number;
      last_ingested_count: number;
      last_skipped_count: number;
      last_quarantined_count: number;
    }>(`SELECT last_attempt_at,last_successful_poll_at,consecutive_failures,
              last_listed_count,last_ingested_count,last_skipped_count,last_quarantined_count
         FROM lead_email_worker_state WHERE worker_key=$1`, [LEAD_EMAIL_WORKER_KEY]);
    expect(success.rows[0]?.last_attempt_at).toBeTruthy();
    expect(success.rows[0]?.last_successful_poll_at).toBeTruthy();
    expect(success.rows[0]?.consecutive_failures).toBe(0);
    expect(success.rows[0]?.last_listed_count).toBe(5);
    expect(success.rows[0]?.last_ingested_count).toBe(1);
    expect(success.rows[0]?.last_skipped_count).toBe(3);
    expect(success.rows[0]?.last_quarantined_count).toBe(1);

    await markLeadEmailPollFailure(new Error("Gmail API request failed with status 429"), 2);
    const failure = await pool.query<{
      last_failure_at: Date | null;
      consecutive_failures: number;
      last_error_code: string | null;
      last_error_message: string | null;
    }>(`SELECT last_failure_at,consecutive_failures,last_error_code,last_error_message
         FROM lead_email_worker_state WHERE worker_key=$1`, [LEAD_EMAIL_WORKER_KEY]);
    expect(failure.rows[0]?.last_failure_at).toBeTruthy();
    expect(failure.rows[0]?.consecutive_failures).toBe(2);
    expect(failure.rows[0]?.last_error_code).toBe("GMAIL_RATE_LIMITED");
    expect(failure.rows[0]?.last_error_message).toBe("Gmail API request failed with status 429");
  });
});
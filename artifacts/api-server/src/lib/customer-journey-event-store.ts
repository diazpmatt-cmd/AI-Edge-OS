import { pool } from "@workspace/db";
import { normalizeJourneyEmail, normalizeJourneyPhone } from "@workspace/db";

export type JourneyEvidenceEventType = "missed_call_observed" | "recovery_text_sent" | "customer_reply_observed";

export type JourneyEvidenceInput = {
  clientId: string;
  eventType: JourneyEvidenceEventType;
  source: "telnyx";
  canonicalRecordType: "telnyx_call" | "telnyx_message";
  canonicalRecordId: string;
  phone?: string | null;
  email?: string | null;
  occurredAt?: Date;
  metadata?: Record<string, string | number | boolean | null>;
};

export function journeyEventIdentityKey(input: Pick<JourneyEvidenceInput, "clientId" | "eventType" | "source" | "canonicalRecordType" | "canonicalRecordId">): string {
  return JSON.stringify([input.clientId, input.eventType, input.source, input.canonicalRecordType, input.canonicalRecordId.trim()]);
}

export async function appendJourneyEvidence(input: JourneyEvidenceInput): Promise<{ id: string; created: boolean }> {
  const canonicalRecordId = input.canonicalRecordId.trim();
  if (!canonicalRecordId) throw new Error("canonical_record_id_required");
  const identity = journeyEventIdentityKey({ ...input, canonicalRecordId });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [identity]);
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM customer_journey_events
       WHERE client_id = $1 AND event_type = $2 AND source = $3
         AND canonical_record_type = $4 AND canonical_record_id = $5
       LIMIT 1`,
      [input.clientId, input.eventType, input.source, input.canonicalRecordType, canonicalRecordId],
    );
    if (existing.rows[0]) {
      await client.query("COMMIT");
      return { id: existing.rows[0].id, created: false };
    }
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO customer_journey_events
         (client_id, event_type, source, normalized_phone, normalized_email,
          canonical_record_type, canonical_record_id, metadata, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
       RETURNING id`,
      [input.clientId, input.eventType, input.source, normalizeJourneyPhone(input.phone), normalizeJourneyEmail(input.email), input.canonicalRecordType, canonicalRecordId, JSON.stringify(input.metadata ?? {}), input.occurredAt ?? new Date()],
    );
    await client.query("COMMIT");
    return { id: inserted.rows[0].id, created: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

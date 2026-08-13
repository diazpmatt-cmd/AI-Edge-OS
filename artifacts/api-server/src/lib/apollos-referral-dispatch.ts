import { pool } from "@workspace/db";
import {
  createReferralDeliveryProviders,
  dispatchReferralDelivery,
  evaluateReferralDeliveryGate,
  resolveReferralDeliveryConfig,
} from "./referral-delivery.js";

export interface ApollosReferralDispatchInput {
  readonly clientId: string;
  readonly actorUserId: string;
  readonly invitationId: string;
  readonly requestedMode: "dry_run" | "live";
  readonly idempotencyKey: string;
}

export async function dispatchApollosApprovedReferralInvitation(
  input: ApollosReferralDispatchInput,
) {
  const config = resolveReferralDeliveryConfig();
  const client = await pool.connect();
  let attempt: {
    id: string;
    channel: "sms" | "email";
    destination: string;
    subject: string | null;
    body: string;
    mode: "dry_run" | "live";
  } | null = null;

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${input.clientId}:referral-delivery:${input.invitationId}`,
    ]);

    const existing = await client.query(
      `SELECT id, invitation_id AS "invitationId", requested_mode AS "requestedMode",
              status, provider_message_id AS "providerMessageId"
       FROM referral_delivery_attempts
       WHERE client_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [input.clientId, input.idempotencyKey],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].invitationId !== input.invitationId) {
        throw new Error("APOLLOS_REFERRAL_IDEMPOTENCY_CONFLICT");
      }
      await client.query("COMMIT");
      return Object.freeze({
        invitationId: input.invitationId,
        attemptId: existing.rows[0].id as string,
        mode: existing.rows[0].requestedMode as "dry_run" | "live",
        sent: existing.rows[0].status === "delivered",
        idempotent: true,
        providerMessageId: (existing.rows[0].providerMessageId as string | null) ?? null,
      });
    }

    const invitationResult = await client.query(
      `SELECT ri.id, ri.channel, ri.recipient_destination AS destination,
              ri.subject, ri.initial_message AS body, ri.status,
              ri.delivery_state AS "deliveryState", ri.sequence_step AS "sequenceStep",
              ri.approved_by_user_id AS "approvedByUserId", ri.approved_at AS "approvedAt",
              rcp.status AS "contactStatus"
       FROM referral_invitations ri
       LEFT JOIN referral_contact_preferences rcp
         ON rcp.client_id = ri.client_id
        AND rcp.channel = ri.channel
        AND rcp.destination = ri.recipient_destination
       WHERE ri.id = $1 AND ri.client_id = $2
       FOR UPDATE OF ri`,
      [input.invitationId, input.clientId],
    );
    const invitation = invitationResult.rows[0];
    if (
      !invitation || invitation.status !== "approved" ||
      invitation.deliveryState !== "not_dispatched" || invitation.sequenceStep !== 0 ||
      !invitation.approvedByUserId || !invitation.approvedAt
    ) {
      throw new Error("APOLLOS_REFERRAL_INVITATION_NOT_DISPATCHABLE");
    }
    if (invitation.contactStatus !== "opted_in") {
      throw new Error("APOLLOS_REFERRAL_CONTACT_NOT_OPTED_IN");
    }

    const gate = evaluateReferralDeliveryGate(config, input.requestedMode, invitation.destination);
    if (!gate.allowed) throw new Error(`APOLLOS_REFERRAL_${gate.reason.toUpperCase()}`);

    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${input.clientId}:referral-delivery-rate-limit`,
    ]);
    const rateResult = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM referral_delivery_attempts
       WHERE client_id = $1
         AND created_at > NOW() - INTERVAL '1 hour'
         AND status IN ('simulated', 'dispatching', 'delivered', 'failed')`,
      [input.clientId],
    );
    if (Number(rateResult.rows[0]?.count ?? 0) >= config.hourlyLimit) {
      throw new Error("APOLLOS_REFERRAL_DELIVERY_RATE_LIMITED");
    }

    if (gate.mode === "live") {
      const duplicate = await client.query(
        `SELECT id FROM referral_delivery_attempts
         WHERE client_id = $1 AND invitation_id = $2 AND sequence_step = 0
           AND requested_mode = 'live' AND status IN ('dispatching', 'delivered')
         LIMIT 1`,
        [input.clientId, invitation.id],
      );
      if (duplicate.rows[0]) throw new Error("APOLLOS_REFERRAL_DELIVERY_ALREADY_ATTEMPTED");
    }

    const inserted = await client.query(
      `INSERT INTO referral_delivery_attempts (
         client_id, invitation_id, channel, recipient_destination, sequence_step,
         requested_mode, status, provider, idempotency_key, requested_by_user_id, completed_at
       ) VALUES (
         $1, $2, $3, $4, 0, $5,
         CASE WHEN $5 = 'dry_run' THEN 'simulated' ELSE 'dispatching' END,
         CASE WHEN $5 = 'dry_run' THEN NULL WHEN $3 = 'sms' THEN 'telnyx' ELSE 'smtp' END,
         $6, $7, CASE WHEN $5 = 'dry_run' THEN NOW() ELSE NULL END
       ) RETURNING id`,
      [input.clientId, invitation.id, invitation.channel, invitation.destination,
       gate.mode, input.idempotencyKey, input.actorUserId],
    );
    attempt = {
      id: inserted.rows[0].id,
      channel: invitation.channel,
      destination: invitation.destination,
      subject: invitation.subject,
      body: invitation.body,
      mode: gate.mode,
    };
    await client.query("COMMIT");
  } catch (error: any) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error?.code === "23505") throw new Error("APOLLOS_REFERRAL_DUPLICATE_DELIVERY_ATTEMPT");
    throw error;
  } finally {
    client.release();
  }

  if (!attempt) throw new Error("APOLLOS_REFERRAL_DELIVERY_ATTEMPT_NOT_CREATED");
  if (attempt.mode === "dry_run") {
    return Object.freeze({
      invitationId: input.invitationId,
      attemptId: attempt.id,
      mode: "dry_run" as const,
      sent: false,
      idempotent: false,
      providerMessageId: null,
    });
  }

  const providerResult = await dispatchReferralDelivery(
    createReferralDeliveryProviders(),
    { channel: attempt.channel, destination: attempt.destination, subject: attempt.subject, body: attempt.body },
    "live",
  );
  await pool.query(
    `UPDATE referral_delivery_attempts
     SET status = $3, provider_message_id = $4, failure_code = $5, completed_at = NOW()
     WHERE id = $1 AND client_id = $2 AND status = 'dispatching'`,
    [attempt.id, input.clientId, providerResult.ok ? "delivered" : "failed",
     providerResult.ok ? providerResult.providerMessageId : null,
     providerResult.ok ? null : providerResult.errorCode],
  );
  if (!providerResult.ok) {
    throw new Error(`APOLLOS_REFERRAL_PROVIDER_DELIVERY_FAILED:${providerResult.errorCode}`);
  }
  return Object.freeze({
    invitationId: input.invitationId,
    attemptId: attempt.id,
    mode: "live" as const,
    sent: true,
    idempotent: false,
    providerMessageId: providerResult.providerMessageId,
  });
}

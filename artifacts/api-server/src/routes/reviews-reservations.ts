import { Router } from "express";
import { getAuth } from "@clerk/express";
import { pool } from "@workspace/db";
import { resolveClientActiveCheck } from "../lib/client-resolver.js";
import { getReviewRequestConfiguration } from "../lib/review-request-configuration.js";

const router = Router();
const RESERVATION_MINUTES = 15;

type EligibleJobRow = {
  job_external_id: string;
  customer_external_id: string;
  customer_name: string;
  service_type: string | null;
  job_amount_cents: number;
  completed_at: Date;
  paid_amount_cents: number;
  last_paid_at: Date;
  has_phone: boolean;
  has_email: boolean;
};

type PriorJourneyRow = {
  event_type: string;
  occurred_at: Date;
};

type ReservationRow = {
  id: string;
  occurred_at: Date;
};

function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  return trimmed ? trimmed.split(/\s+/)[0] : "there";
}

export function buildReviewRequestPreview(input: {
  customerName: string;
  businessName: string;
  reviewUrl: string;
}): string {
  return `Hi ${firstName(input.customerName)}! Thanks for choosing ${input.businessName}. If our team took good care of you, a quick Google review would mean a lot: ${input.reviewUrl}\n\nThanks again — ${input.businessName}`;
}

async function resolveTenant(req: any, res: any) {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  const client = await resolveClientActiveCheck(userId);
  if (!client.ok) {
    res.status(client.reason === "not_found" ? 404 : 403).json({ error: client.reason });
    return null;
  }

  return { userId, ...client };
}

/**
 * POST /api/reviews/reservations/:jobExternalId
 *
 * Creates a short internal reservation lease and returns the exact message
 * preview. This endpoint NEVER sends SMS/email and NEVER returns raw customer
 * contact data. The reservation exists only to prove atomic dedupe before a
 * future controlled delivery path is implemented.
 */
router.post("/reviews/reservations/:jobExternalId", async (req, res) => {
  const tenant = await resolveTenant(req, res);
  if (!tenant) return;

  const jobExternalId = String(req.params.jobExternalId ?? "").trim();
  if (!jobExternalId) {
    res.status(400).json({ error: "job_external_id_required" });
    return;
  }

  const configuration = await getReviewRequestConfiguration(tenant.slug);
  if (configuration.status !== "owner_confirmed" || !configuration.reviewUrl) {
    res.status(409).json({
      error: "verified_review_url_not_configured",
      message: "An owner-confirmed Google review URL is required before a preview can be reserved.",
    });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Transaction-scoped lock serializes all reservation attempts for the same
    // tenant + GorillaDesk job, preventing double claims without a new table.
    const lockKey = `${tenant.clientId}:review_request:${jobExternalId}`;
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [lockKey],
    );

    const prior = await client.query<PriorJourneyRow>(
      `SELECT event_type, occurred_at
         FROM customer_journey_events
        WHERE client_id = $1
          AND canonical_record_type = 'gorilladesk_job'
          AND canonical_record_id = $2
          AND (
            event_type IN (
              'review_request_sent',
              'review_request_delivered',
              'review_request_completed'
            )
            OR (
              event_type = 'review_request_reserved'
              AND occurred_at >= NOW() - ($3::int * INTERVAL '1 minute')
            )
          )
        ORDER BY occurred_at DESC
        LIMIT 1`,
      [tenant.clientId, jobExternalId, RESERVATION_MINUTES],
    );

    if (prior.rows.length) {
      await client.query("ROLLBACK");
      res.status(409).json({
        error: "review_request_already_reserved_or_processed",
        priorEventType: prior.rows[0].event_type,
        priorEventAt: prior.rows[0].occurred_at.toISOString(),
      });
      return;
    }

    const eligible = await client.query<EligibleJobRow>(
      `SELECT
         j.external_id AS job_external_id,
         c.external_id AS customer_external_id,
         c.name AS customer_name,
         j.service_type,
         j.amount_cents AS job_amount_cents,
         j.completed_at,
         COALESCE(SUM(p.amount_cents), 0)::int AS paid_amount_cents,
         MAX(p.paid_at) AS last_paid_at,
         (c.phone IS NOT NULL AND BTRIM(c.phone) <> '') AS has_phone,
         (c.email IS NOT NULL AND BTRIM(c.email) <> '') AS has_email
       FROM gorilladesk_jobs j
       JOIN gorilladesk_customers c
         ON c.external_id = j.customer_id
        AND c.project_id = j.project_id
       JOIN gorilladesk_payments p
         ON p.job_id = j.external_id
        AND p.project_id = j.project_id
        AND p.status = 'collected'
        AND p.paid_at IS NOT NULL
       WHERE j.project_id = $1
         AND j.external_id = $2
         AND j.status = 'completed'
         AND j.completed_at IS NOT NULL
         AND j.customer_id IS NOT NULL
         AND j.amount_cents > 0
       GROUP BY
         j.external_id,
         c.external_id,
         c.name,
         c.phone,
         c.email,
         j.service_type,
         j.amount_cents,
         j.completed_at
       HAVING COALESCE(SUM(p.amount_cents), 0) >= j.amount_cents
       LIMIT 1`,
      [tenant.slug, jobExternalId],
    );

    if (!eligible.rows.length) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "job_not_review_eligible" });
      return;
    }

    const job = eligible.rows[0];
    if (!job.has_phone && !job.has_email) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "no_customer_contact_channel" });
      return;
    }

    const reservedAt = new Date();
    const expiresAt = new Date(reservedAt.getTime() + RESERVATION_MINUTES * 60_000);
    const metadata = {
      schemaVersion: 1,
      reservationExpiresAt: expiresAt.toISOString(),
      customerExternalId: job.customer_external_id,
      serviceType: job.service_type,
      jobAmountCents: Number(job.job_amount_cents),
      paidAmountCents: Number(job.paid_amount_cents),
      reviewConfigurationConfirmedAt: configuration.confirmedAt,
      contactChannels: {
        smsAvailable: job.has_phone,
        emailAvailable: job.has_email,
      },
      deliveryReady: false,
      sendPathStatus: "not_accepted",
    };

    const reservation = await client.query<ReservationRow>(
      `INSERT INTO customer_journey_events
         (client_id, event_type, source, canonical_record_type,
          canonical_record_id, metadata, occurred_at)
       VALUES ($1, 'review_request_reserved', 'review_request_engine',
               'gorilladesk_job', $2, $3::jsonb, NOW())
       RETURNING id, occurred_at`,
      [tenant.clientId, jobExternalId, JSON.stringify(metadata)],
    );

    await client.query("COMMIT");

    const messagePreview = buildReviewRequestPreview({
      customerName: job.customer_name,
      businessName: tenant.clientName,
      reviewUrl: configuration.reviewUrl,
    });

    res.status(201).json({
      reservation: {
        id: reservation.rows[0].id,
        jobExternalId,
        reservedAt: reservation.rows[0].occurred_at.toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
      customer: {
        name: job.customer_name,
        smsAvailable: job.has_phone,
        emailAvailable: job.has_email,
      },
      evidence: {
        completedJob: true,
        paidInFull: true,
        sameTenantProject: true,
        noPriorActiveReservationOrDelivery: true,
        ownerConfirmedReviewUrl: true,
      },
      preview: {
        channel: job.has_phone ? "sms" : "email",
        message: messagePreview,
      },
      deliveryReady: false,
      sendPathStatus: "not_accepted",
      blockers: ["controlled_send_path_not_accepted"],
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* no-op */ }
    console.error("[reviews-reservations] reserve error:", err);
    res.status(500).json({ error: "review_reservation_failed" });
  } finally {
    client.release();
  }
});

export default router;

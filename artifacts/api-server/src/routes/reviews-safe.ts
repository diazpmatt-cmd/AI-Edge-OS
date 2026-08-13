import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, pool, DrizzleTenantSafeReviewRepository } from "@workspace/db";
import { resolveClientActiveCheck } from "../lib/client-resolver.js";
import { getReviewRequestConfiguration } from "../lib/review-request-configuration.js";

const router = Router();
const DEFAULT_ELIGIBILITY_WINDOW_DAYS = 30;
const MAX_ELIGIBILITY_WINDOW_DAYS = 90;
const ACTIVE_RESERVATION_MINUTES = 15;

type Tenant = {
  userId: string;
  clientName: string;
  slug: string;
  clientId: string;
};

type EligibilityRow = {
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

async function resolveTenant(req: any, res: any): Promise<Tenant | null> {
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

function parseEligibilityWindowDays(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_ELIGIBILITY_WINDOW_DAYS;
  return Math.min(MAX_ELIGIBILITY_WINDOW_DAYS, Math.floor(parsed));
}

router.get("/reviews/overview", async (req, res) => {
  const tenant = await resolveTenant(req, res);
  if (!tenant) return;

  try {
    const repo = new DrizzleTenantSafeReviewRepository(db);
    const summaries = await repo.findByClientId(tenant.clientId);

    res.json({
      clientId: tenant.clientId,
      clientSlug: tenant.slug,
      clientName: tenant.clientName,
      source: "tenant_safe_review_summaries",
      automationStatus: "not_activated",
      summaries: summaries.map(summary => ({
        ...summary,
        observedAt: summary.observedAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[reviews-safe] overview error:", err);
    res.status(500).json({ error: "review_overview_failed" });
  }
});

router.get("/reviews/eligibility", async (req, res) => {
  const tenant = await resolveTenant(req, res);
  if (!tenant) return;

  const windowDays = parseEligibilityWindowDays(req.query.windowDays);

  try {
    const configuration = await getReviewRequestConfiguration(tenant.slug);
    const hasOwnerConfirmedReviewUrl = configuration.status === "owner_confirmed";

    const { rows } = await pool.query<EligibilityRow>(
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
         AND j.status = 'completed'
         AND j.completed_at IS NOT NULL
         AND j.external_id IS NOT NULL
         AND j.customer_id IS NOT NULL
         AND j.amount_cents > 0
         AND j.completed_at >= NOW() - ($2::int * INTERVAL '1 day')
         AND NOT EXISTS (
           SELECT 1
           FROM customer_journey_events e
           WHERE e.client_id = $3
             AND e.canonical_record_type = 'gorilladesk_job'
             AND e.canonical_record_id = j.external_id
             AND (
               e.event_type IN (
                 'review_request_sent',
                 'review_request_delivered',
                 'review_request_completed'
               )
               OR (
                 e.event_type = 'review_request_reserved'
                 AND e.occurred_at >= NOW() - ($4::int * INTERVAL '1 minute')
               )
             )
         )
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
       ORDER BY j.completed_at DESC
       LIMIT 100`,
      [tenant.slug, windowDays, tenant.clientId, ACTIVE_RESERVATION_MINUTES],
    );

    const candidates = rows.map(row => {
      const blockers: string[] = ["controlled_send_path_not_accepted"];
      if (!hasOwnerConfirmedReviewUrl) blockers.unshift("verified_review_url_not_configured");
      if (!row.has_phone && !row.has_email) blockers.push("no_customer_contact_channel");

      return {
        jobExternalId: row.job_external_id,
        customerExternalId: row.customer_external_id,
        customerName: row.customer_name,
        serviceType: row.service_type,
        jobAmountCents: Number(row.job_amount_cents),
        paidAmountCents: Number(row.paid_amount_cents),
        completedAt: new Date(row.completed_at).toISOString(),
        lastPaidAt: new Date(row.last_paid_at).toISOString(),
        contactChannels: {
          smsAvailable: row.has_phone,
          emailAvailable: row.has_email,
        },
        evidence: {
          completedJob: true,
          paidInFull: true,
          sameTenantProject: true,
          priorReviewRequestEvidence: false,
          noActiveReservation: true,
          ownerConfirmedReviewUrl: hasOwnerConfirmedReviewUrl,
        },
        deliveryReady: false,
        blockers,
      };
    });

    const globalBlockers = ["controlled_send_path_not_accepted"];
    if (!hasOwnerConfirmedReviewUrl) globalBlockers.unshift("verified_review_url_not_configured");

    res.json({
      clientId: tenant.clientId,
      clientSlug: tenant.slug,
      clientName: tenant.clientName,
      source: "gorilladesk_local_transaction_snapshots",
      windowDays,
      reservationLeaseMinutes: ACTIVE_RESERVATION_MINUTES,
      candidateCount: candidates.length,
      deliveryReadyCount: 0,
      automationStatus: "not_activated",
      reviewConfigurationStatus: configuration.status,
      reviewConfigurationConfirmedAt: configuration.confirmedAt,
      globalBlockers,
      candidates,
    });
  } catch (err: any) {
    if (err?.code === "42P01") {
      res.status(503).json({ error: "review_eligibility_source_not_ready" });
      return;
    }
    console.error("[reviews-safe] eligibility error:", err);
    res.status(500).json({ error: "review_eligibility_failed" });
  }
});

function retired(_req: any, res: any): void {
  res.status(410).json({
    error: "legacy_review_request_path_retired",
    message:
      "This legacy Reviews path is retired until review requests are tenant-scoped and tied to verified completed-job evidence. No customer message was sent.",
  });
}

router.get("/reviews/stats", retired);
router.put("/reviews/stats/:platform", retired);
router.get("/reviews/requests", retired);
router.post("/reviews/requests", retired);
router.patch("/reviews/requests/:id", retired);
router.delete("/reviews/requests/:id", retired);

export default router;

import { pool } from "@workspace/db";
import { resolveReferralDeliveryConfig } from "./referral-delivery.js";
import { buildReferralPilotDeliveryReadiness } from "./referral-pilot-readiness.js";

interface LocalGorillaDeskReadiness {
  readonly available: boolean;
  readonly customerCount: number | null;
  readonly externalCalls: false;
}

function countValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getApollosReferralPilotStatus(clientId: string) {
  const [invitationResult, eligibleInvitationResult, attemptResult, attributionResult, tenantResult] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'approved' AND delivery_state = 'not_dispatched')::int AS approved_undispatched
       FROM referral_invitations
       WHERE client_id = $1`,
      [clientId],
    ),
    pool.query(
      `SELECT ri.id
       FROM referral_invitations ri
       JOIN referral_contact_preferences rcp
         ON rcp.client_id = ri.client_id
        AND rcp.channel = ri.channel
        AND rcp.destination = ri.recipient_destination
       WHERE ri.client_id = $1
         AND ri.status = 'approved'
         AND ri.delivery_state = 'not_dispatched'
         AND ri.consent_source IS NOT NULL
         AND ri.consent_at IS NOT NULL
         AND rcp.status = 'opted_in'
         AND rcp.consent_source IS NOT NULL
         AND rcp.consent_at IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM referral_delivery_attempts rda
           WHERE rda.client_id = ri.client_id
             AND rda.invitation_id = ri.id
             AND rda.requested_mode = 'live'
             AND rda.status IN ('dispatching', 'delivered')
         )
       ORDER BY ri.approved_at ASC NULLS LAST, ri.created_at ASC
       LIMIT 10`,
      [clientId],
    ),
    pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'simulated')::int AS simulated,
         COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
         COUNT(*) FILTER (WHERE status = 'dispatching')::int AS dispatching
       FROM referral_delivery_attempts
       WHERE client_id = $1`,
      [clientId],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count
       FROM referral_crm_attributions
       WHERE client_id = $1 AND status = 'confirmed'`,
      [clientId],
    ),
    pool.query(`SELECT slug FROM clients WHERE id = $1 LIMIT 1`, [clientId]),
  ]);

  const invitation = invitationResult.rows[0] ?? {};
  const eligibleInvitationIds = Object.freeze(
    eligibleInvitationResult.rows
      .map((row: { id?: unknown }) => typeof row.id === "string" ? row.id : null)
      .filter((id: string | null): id is string => Boolean(id)),
  );
  const attempts = attemptResult.rows[0] ?? {};
  const slug = typeof tenantResult.rows[0]?.slug === "string" ? tenantResult.rows[0].slug : null;
  let localGorillaDesk: Readonly<LocalGorillaDeskReadiness> = Object.freeze({
    available: false,
    customerCount: null,
    externalCalls: false as const,
  });

  if (slug) {
    try {
      const synced = await pool.query(
        `SELECT COUNT(*)::int AS count FROM gorilladesk_customers WHERE project_id = $1`,
        [slug],
      );
      const customerCount = countValue(synced.rows[0]?.count);
      localGorillaDesk = Object.freeze({
        available: customerCount > 0,
        customerCount,
        externalCalls: false as const,
      });
    } catch {
      // Fail closed: never invent local sync availability.
    }
  }

  return Object.freeze({
    productionAcceptance: Object.freeze({
      completedMilestones: 8 as const,
      totalMilestones: 8 as const,
      complete: true as const,
    }),
    pilotDelivery: buildReferralPilotDeliveryReadiness(resolveReferralDeliveryConfig()),
    localGorillaDesk,
    invitations: Object.freeze({
      total: countValue(invitation.total),
      approvedUndispatched: countValue(invitation.approved_undispatched),
      eligibleForControlledPilot: eligibleInvitationIds.length,
      eligibleInvitationIds,
    }),
    deliveryAttempts: Object.freeze({
      total: countValue(attempts.total),
      simulated: countValue(attempts.simulated),
      dispatching: countValue(attempts.dispatching),
      delivered: countValue(attempts.delivered),
      failed: countValue(attempts.failed),
    }),
    evidence: Object.freeze({
      failedDeliveryAttempts: countValue(attempts.failed),
      confirmedAttributions: countValue(attributionResult.rows[0]?.count),
    }),
    externalCalls: false as const,
    sideEffects: false as const,
  });
}

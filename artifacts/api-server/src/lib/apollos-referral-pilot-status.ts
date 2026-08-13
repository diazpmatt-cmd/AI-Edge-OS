import { pool } from "@workspace/db";
import { resolveReferralDeliveryConfig } from "./referral-delivery.js";
import { buildReferralPilotDeliveryReadiness } from "./referral-pilot-readiness.js";

function countValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getApollosReferralPilotStatus(clientId: string) {
  const [invitationResult, failedResult, attributionResult, tenantResult] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'approved' AND delivery_state = 'not_dispatched')::int AS approved_undispatched,
         COUNT(*) FILTER (WHERE delivery_state = 'simulated')::int AS simulated,
         COUNT(*) FILTER (WHERE delivery_state = 'delivered')::int AS delivered,
         COUNT(*) FILTER (WHERE delivery_state = 'failed')::int AS failed
       FROM referral_invitations
       WHERE client_id = $1`,
      [clientId],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count
       FROM referral_delivery_attempts
       WHERE client_id = $1 AND status = 'failed'`,
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
  const slug = typeof tenantResult.rows[0]?.slug === "string" ? tenantResult.rows[0].slug : null;
  let localGorillaDesk = Object.freeze({
    available: false,
    customerCount: null as number | null,
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
      simulated: countValue(invitation.simulated),
      delivered: countValue(invitation.delivered),
      failed: countValue(invitation.failed),
    }),
    evidence: Object.freeze({
      failedDeliveryAttempts: countValue(failedResult.rows[0]?.count),
      confirmedAttributions: countValue(attributionResult.rows[0]?.count),
    }),
    externalCalls: false as const,
    sideEffects: false as const,
  });
}

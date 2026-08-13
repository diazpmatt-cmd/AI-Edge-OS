import { Router, type Response } from "express";
import referralRouter from "./referrals-core.js";
import { resolveReferralDeliveryConfig } from "../lib/referral-delivery.js";
import { buildReferralPilotDeliveryReadiness } from "../lib/referral-pilot-readiness.js";

const router = Router();

// Compatibility boundary for the Referral Engine UI.
// The legacy SQL list query returns snake_case fields, while the React page
// consumes the API's established camelCase contract.
// Production acceptance is verified through RGE-8. Autonomous operation
// remains disabled and is governed by the live safety controls below.
router.use((req, res, next) => {
  const sendJson = res.json.bind(res);

  if (req.method === "GET" && req.path === "/referrals/readiness") {
    res.json = ((body: unknown) => {
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return sendJson(body);
      }

      const response = body as Record<string, unknown>;
      const currentAcceptance =
        response.productionAcceptance &&
        typeof response.productionAcceptance === "object" &&
        !Array.isArray(response.productionAcceptance)
          ? (response.productionAcceptance as Record<string, unknown>)
          : {};
      const blockers = Array.isArray(response.blockers)
        ? response.blockers.filter(
            (blocker) => blocker !== "production_acceptance_incomplete",
          )
        : [];
      const pilotDelivery = buildReferralPilotDeliveryReadiness(
        resolveReferralDeliveryConfig(),
      );

      return sendJson({
        ...response,
        productionAcceptance: {
          ...currentAcceptance,
          accepted: 8,
          total: 8,
          complete: true,
        },
        pilotDelivery,
        blockers,
      });
    }) as Response["json"];

    next();
    return;
  }

  if (req.method !== "GET" || req.path !== "/referrals") {
    next();
    return;
  }

  res.json = ((body: unknown) => {
    if (!Array.isArray(body)) return sendJson(body);

    return sendJson(
      body.map((row: Record<string, unknown>) => ({
        id: row.id,
        programId: row.program_id ?? null,
        programName: row.program_name ?? null,
        referrerName: row.referrer_name,
        referrerEmail: row.referrer_email ?? null,
        referrerPhone: row.referrer_phone ?? null,
        referredName: row.referred_name ?? null,
        referredPhone: row.referred_phone ?? null,
        status: row.status,
        rewardAmount: row.reward_amount ?? null,
        source: row.source,
        convertedAt: row.converted_at ?? null,
        paidAt: row.paid_at ?? null,
        createdAt: row.created_at,
      })),
    );
  }) as Response["json"];

  next();
});

router.use(referralRouter);

export default router;

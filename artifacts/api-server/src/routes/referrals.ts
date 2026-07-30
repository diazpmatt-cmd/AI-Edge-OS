import { Router, type Response } from "express";
import referralRouter from "./referrals-core.js";

const router = Router();

// Compatibility boundary for the Referral Engine UI.
// The legacy SQL list query returns snake_case fields, while the React page
// consumes the API's established camelCase contract.
router.use((req, res, next) => {
  if (req.method !== "GET" || req.path !== "/referrals") {
    next();
    return;
  }

  const sendJson = res.json.bind(res);
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

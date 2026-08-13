import { Router } from "express";
import { getAuth } from "@clerk/express";
import { buildClientOnboardingPreflight } from "../lib/client-onboarding-preflight.js";

const router = Router();

router.post("/client-onboarding/preflight", (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const report = buildClientOnboardingPreflight(req.body ?? {});
  res.json({
    checkedAt: new Date().toISOString(),
    operatorUserIdPresent: true,
    ...report,
  });
});

export default router;

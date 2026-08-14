import { Router } from "express";
import { getAuth } from "@clerk/express";
import { resolveClientActiveCheck } from "../lib/client-resolver.js";
import { buildLeadRecoveryReadiness } from "../lib/lead-recovery-readiness.js";

const router = Router();

router.get("/lead-recovery/readiness", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const resolved = await resolveClientActiveCheck(userId);
    if (!resolved.ok) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    res.json(await buildLeadRecoveryReadiness(resolved.clientId));
  } catch (error) {
    console.error("[lead-recovery-readiness] failed:", error);
    res.status(500).json({ error: "readiness_check_failed" });
  }
});

export default router;

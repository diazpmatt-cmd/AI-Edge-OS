import { Router } from "express";
import { getAuth } from "@clerk/express";
import { computeTelnyxAnalytics } from "../lib/telnyx-analytics";
import { resolveClientActiveCheck } from "../lib/client-resolver.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/telnyx
// Returns all Telnyx call + SMS + lead recovery metrics from real webhook data.
// Test/seed rows (555-prefix phones, [TEST] messages) are excluded.
// ─────────────────────────────────────────────────────────────────────────────

router.get("/analytics/telnyx", async (req, res) => {
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

    const data = await computeTelnyxAnalytics(resolved.clientId, resolved.slug);
    res.json(data);
  } catch (err) {
    console.error("[telnyx-analytics] Error computing analytics:", err);
    res.status(500).json({ error: "Failed to fetch Telnyx analytics" });
  }
});

export default router;

import { Router } from "express";
import { getAuth } from "@clerk/express";
import { computeTelnyxAnalytics } from "../lib/telnyx-analytics";

const router = Router();

function requireAuth(req: any, res: any): boolean {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/telnyx
// Returns all Telnyx call + SMS + lead recovery metrics from real webhook data.
// Test/seed rows (555-prefix phones, [TEST] messages) are excluded.
// ─────────────────────────────────────────────────────────────────────────────

router.get("/analytics/telnyx", async (req, res) => {
  if (!requireAuth(req, res)) return;

  try {
    const data = await computeTelnyxAnalytics("bed-bugs-and-beyond");
    res.json(data);
  } catch (err) {
    console.error("[telnyx-analytics] Error computing analytics:", err);
    res.status(500).json({ error: "Failed to fetch Telnyx analytics" });
  }
});

export default router;

import { Router } from "express";
import { getAuth } from "@clerk/express";
import { computeInsights } from "../lib/ai-insights-engine";

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
// GET /api/analytics/insights
// Returns rule-based business insights derived exclusively from real data.
// No LLM calls — all logic is deterministic and auditable.
// ─────────────────────────────────────────────────────────────────────────────

router.get("/analytics/insights", async (req, res) => {
  if (!requireAuth(req, res)) return;

  try {
    const result = await computeInsights("bed-bugs-and-beyond");
    res.json(result);
  } catch (err) {
    console.error("[insights] Error computing insights:", err);
    res.status(500).json({ error: "Failed to compute insights" });
  }
});

export default router;

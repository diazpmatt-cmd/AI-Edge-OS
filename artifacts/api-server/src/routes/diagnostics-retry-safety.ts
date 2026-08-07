import { Router } from "express";
import { getAuth } from "@clerk/express";

const router = Router();

/**
 * Runtime safety boundary for the legacy Diagnostics bulk retry action.
 *
 * The old /diagnostics/retry-failed handler resets every aggregate failed post
 * to scheduled without consulting per-platform delivery evidence. That can
 * revive terminal preflight failures and bypass lane-level retry eligibility.
 *
 * Keep this guard mounted before diagnosticsRouter until the legacy handler is
 * removed from diagnostics.ts. Operators must use Publishing Lane Diagnostics
 * and an explicitly eligible isolated delivery retry instead.
 */
router.post("/diagnostics/retry-failed", (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.status(409).json({
    ok: false,
    retried: 0,
    code: "DIAGNOSTICS_BULK_RETRY_DISABLED",
    error:
      "Bulk failed-post retry is disabled. Review Publishing Lane Diagnostics and retry only an eligible isolated failed delivery.",
  });
});

export default router;

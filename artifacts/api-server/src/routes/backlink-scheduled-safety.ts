import { Router } from "express";

import { SCHEDULER_SECRET } from "../lib/scheduler-secret.js";

const router = Router();

/**
 * Temporary fail-closed boundary for scheduled backlink discovery.
 *
 * The legacy scheduled ingestion route still builds discovery input from
 * BB&B-specific constants (domain, geography, and service allowlists), while
 * the canonical tenant record does not yet own a website/domain field. It is
 * therefore unsafe to let the scheduler execute that path for arbitrary
 * tenants. Mount this router before backlinksRouter until a tenant-owned
 * authority/discovery profile supplies the complete discovery context.
 */
router.post("/api/backlinks/ingest/scheduled", (req, res) => {
  if (req.headers["x-scheduler-secret"] !== SCHEDULER_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(409).json({
    ok: false,
    outcome: "skipped",
    error: "BACKLINK_SCHEDULED_CONTEXT_NOT_TENANT_SAFE",
    message:
      "Scheduled backlink discovery is paused until domain, competitor, geography, and service scope come from a canonical tenant-owned authority profile.",
  });
});

export default router;

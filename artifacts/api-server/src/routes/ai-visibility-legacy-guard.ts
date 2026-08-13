import { Router, type Request, type Response } from "express";

const router = Router();

function retired(_req: Request, res: Response): void {
  res.status(410).json({
    error: "legacy_visibility_endpoint_retired",
    message:
      "This legacy AI Visibility endpoint was retired because it could return non-evidence-backed audit data. Use the tenant-scoped read model, AI query evidence, or scan history endpoints instead.",
  });
}

// Legacy aggregate/report endpoints are intentionally retired before the older
// ai-visibility router is mounted. The live evidence routes use deeper paths
// such as /ai-visibility/read-model/:clientId and /ai-visibility/query-scan/*,
// so these exact/one-segment routes do not intercept them.
router.get("/ai-visibility", retired);
router.get("/ai-visibility/:clientId", retired);
router.post("/ai-visibility/audit", retired);
router.put("/ai-visibility/:id", retired);
router.post("/ai-visibility/generate-report", retired);
router.post("/ai-visibility/download-pdf", retired);
router.post("/ai-visibility/export-pdf", retired);
router.post("/ai-visibility/email-report", retired);

export default router;

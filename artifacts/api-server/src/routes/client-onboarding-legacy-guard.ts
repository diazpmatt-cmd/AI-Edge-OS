import { Router, type Request, type Response } from "express";

const router = Router();

function retired(_req: Request, res: Response): void {
  res.status(410).json({
    error: "legacy_client_onboarding_endpoint_retired",
    message:
      "The legacy client-onboarding staging API is retired until operator-owned tenant-safe staging and canonical provisioning are implemented. The current onboarding UI remains preview-only and performs no provisioning.",
  });
}

// The legacy onboarding router is authenticated but its staging table has no
// owner/tenant column, so every CRUD/deploy path is fail-closed here. A future
// onboarding API must introduce explicit operator ownership before it is mounted.
router.use("/client-onboarding", retired);

export default router;

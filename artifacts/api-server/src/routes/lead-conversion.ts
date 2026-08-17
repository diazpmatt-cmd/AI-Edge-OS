import { Router } from "express";
import { getAuth } from "@clerk/express";
import { resolveClientActiveCheck } from "../lib/client-resolver.js";
import { updateLeadConversionStage } from "../services/lead-conversion";

const router = Router();

type AuthFn = typeof getAuth;
type TenantResolver = typeof resolveClientActiveCheck;
type UpdateConversionFn = typeof updateLeadConversionStage;

export function createLeadConversionHandler(
  getAuthFn: AuthFn = getAuth,
  resolveTenantFn: TenantResolver = resolveClientActiveCheck,
  updateConversionFn: UpdateConversionFn = updateLeadConversionStage,
) {
  return async (req: any, res: any) => {
    const { userId } = getAuthFn(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    try {
      const tenant = await resolveTenantFn(userId);
      if (!tenant.ok) {
        res.status(tenant.reason === "inactive" ? 403 : 404).json({
          error: tenant.reason === "inactive" ? "client_inactive" : "client_not_found",
        });
        return;
      }

      const body = req.body as { stage?: unknown; note?: unknown };
      const result = await updateConversionFn(tenant.clientId, req.params.id, body.stage, body.note);
      if (result.status === "not_found") { res.status(404).json({ error: result.error }); return; }
      if (result.status === "invalid") { res.status(422).json({ error: result.error }); return; }
      res.json({ action: "conversion_updated", lead: result.lead });
    } catch {
      res.status(500).json({ error: "conversion_update_unavailable" });
    }
  };
}

router.patch("/leads/:id/conversion", createLeadConversionHandler() as any);

export default router;

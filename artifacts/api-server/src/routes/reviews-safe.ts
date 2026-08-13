import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, DrizzleTenantSafeReviewRepository } from "@workspace/db";
import { resolveClientActiveCheck } from "../lib/client-resolver.js";

const router = Router();

async function resolveTenant(req: any, res: any) {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  const client = await resolveClientActiveCheck(userId);
  if (!client.ok) {
    res.status(client.reason === "not_found" ? 404 : 403).json({ error: client.reason });
    return null;
  }

  return { userId, ...client };
}

/**
 * Evidence-only Reviews overview.
 *
 * Reads only the canonical tenant-safe review summary table. These rows are
 * persisted by the GBP review importer after connection/location ownership is
 * verified. No external provider call or customer contact occurs here.
 */
router.get("/reviews/overview", async (req, res) => {
  const tenant = await resolveTenant(req, res);
  if (!tenant) return;

  try {
    const repo = new DrizzleTenantSafeReviewRepository(db);
    const summaries = await repo.findByClientId(tenant.clientId);

    res.json({
      clientId: tenant.clientId,
      clientSlug: tenant.slug,
      clientName: tenant.clientName,
      source: "tenant_safe_review_summaries",
      automationStatus: "not_activated",
      summaries: summaries.map(summary => ({
        ...summary,
        observedAt: summary.observedAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[reviews-safe] overview error:", err);
    res.status(500).json({ error: "review_overview_failed" });
  }
});

function retired(_req: any, res: any): void {
  res.status(410).json({
    error: "legacy_review_request_path_retired",
    message:
      "This legacy Reviews path is retired until review requests are tenant-scoped and tied to verified completed-job evidence. No customer message was sent.",
  });
}

// Legacy manual stats and request-send/history paths are unsafe for a
// multi-tenant production system. Intercept them before the older router.
router.get("/reviews/stats", retired);
router.put("/reviews/stats/:platform", retired);
router.get("/reviews/requests", retired);
router.post("/reviews/requests", retired);
router.patch("/reviews/requests/:id", retired);
router.delete("/reviews/requests/:id", retired);

export default router;

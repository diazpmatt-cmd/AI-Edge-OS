import { Router } from "express";
import { getAuth } from "@clerk/express";
import { resolveClientActiveCheck } from "../lib/client-resolver.js";
import {
  getReviewRequestConfiguration,
  saveOwnerConfirmedReviewUrl,
} from "../lib/review-request-configuration.js";

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

router.get("/reviews/configuration", async (req, res) => {
  const tenant = await resolveTenant(req, res);
  if (!tenant) return;

  try {
    const configuration = await getReviewRequestConfiguration(tenant.slug);
    res.json({
      clientId: tenant.clientId,
      clientSlug: tenant.slug,
      clientName: tenant.clientName,
      configuration,
      sendPathStatus: "not_accepted",
      automationStatus: "not_activated",
    });
  } catch (err) {
    console.error("[reviews-configuration] GET error:", err);
    res.status(500).json({ error: "review_configuration_failed" });
  }
});

router.put("/reviews/configuration", async (req, res) => {
  const tenant = await resolveTenant(req, res);
  if (!tenant) return;

  const reviewUrl = req.body?.reviewUrl;
  if (typeof reviewUrl !== "string" || !reviewUrl.trim()) {
    res.status(400).json({ error: "review_url_required" });
    return;
  }

  try {
    const configuration = await saveOwnerConfirmedReviewUrl({
      clientSlug: tenant.slug,
      userId: tenant.userId,
      reviewUrl,
    });

    res.json({
      clientId: tenant.clientId,
      clientSlug: tenant.slug,
      clientName: tenant.clientName,
      configuration,
      sendPathStatus: "not_accepted",
      automationStatus: "not_activated",
    });
  } catch (err: any) {
    if (err?.code === "invalid_google_review_url") {
      res.status(422).json({ error: "invalid_google_review_url" });
      return;
    }
    if (err?.code === "google_business_channel_not_initialized") {
      res.status(409).json({ error: "google_business_channel_not_initialized" });
      return;
    }
    console.error("[reviews-configuration] PUT error:", err);
    res.status(500).json({ error: "review_configuration_update_failed" });
  }
});

export default router;

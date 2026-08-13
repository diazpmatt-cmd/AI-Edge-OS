import { Router } from "express";
import { getAuth } from "@clerk/express";
import { resolveClientActiveCheck } from "../lib/client-resolver.js";
import { createProductionMediaGenerationRegistry } from "../lib/media-generation-provider.js";

const router = Router();
const mediaRegistry = createProductionMediaGenerationRegistry();

router.get("/media-generation/readiness", async (req, res) => {
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

    const readiness = await mediaRegistry.getReadiness();

    res.json({
      checkedAt: new Date().toISOString(),
      clientId: resolved.clientId,
      executionStatus: readiness.generationAllowed ? "provider_ready" : "blocked",
      blocker: readiness.generationAllowed ? null : "media_generation_provider_not_configured",
      readiness,
      safety: {
        generationEndpointExposed: false,
        demoProviderRegistered: false,
        paidGenerationExecuted: false,
      },
    });
  } catch (error) {
    console.error("[media-generation] readiness failed:", error);
    res.status(500).json({ error: "media_generation_readiness_failed" });
  }
});

export default router;

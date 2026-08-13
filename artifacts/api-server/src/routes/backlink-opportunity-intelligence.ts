import { Router } from "express";
import { getAuth } from "@clerk/express";
import { resolveClientContentContextFromDb } from "../lib/client-resolver.js";
import { buildBacklinkOpportunityReadModel } from "../lib/backlink-opportunity-read-model.js";

const router = Router();

router.get("/api/backlinks/opportunities/intelligence", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const resolved = await resolveClientContentContextFromDb(userId);
  if (!resolved.found) {
    res.status(404).json({ error: "client_not_found", reason: resolved.reason });
    return;
  }

  const requestedLimit = Number(req.query.limit ?? 20);

  try {
    const data = await buildBacklinkOpportunityReadModel(resolved.client.id, requestedLimit);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(data);
  } catch (error) {
    console.error("[BACKLINK-OPPORTUNITY-INTELLIGENCE] read failed:", error);
    res.status(500).json({ error: "BACKLINK_OPPORTUNITY_INTELLIGENCE_READ_FAILED" });
  }
});

export default router;
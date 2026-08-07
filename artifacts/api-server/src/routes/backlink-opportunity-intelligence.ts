import { Router } from "express";
import { getAuth } from "@clerk/express";
import {
  db,
  DrizzleBacklinkRepository,
  BACKLINK_MAX_PAGE_SIZE,
} from "@workspace/db";
import { resolveClientContentContextFromDb } from "../lib/client-resolver.js";
import { rankBacklinkOpportunities } from "../lib/backlink-opportunity-intelligence.js";

const router = Router();
const repo = new DrizzleBacklinkRepository(db);

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
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(BACKLINK_MAX_PAGE_SIZE, Math.floor(requestedLimit)))
    : 20;

  try {
    const listed = await repo.listOpportunities(resolved.client.id, {
      limit: BACKLINK_MAX_PAGE_SIZE,
      offset: 0,
    });

    const hydrated = await Promise.all(
      listed.items.map(async ({ opportunity, workflow }) => ({
        opportunity,
        workflow,
        prospect: await repo.getProspectById(opportunity.prospectId, resolved.client.id),
      })),
    );

    const ranked = rankBacklinkOpportunities(hydrated, BACKLINK_MAX_PAGE_SIZE);
    const items = ranked.slice(0, limit);
    const summary = {
      totalActionable: ranked.length,
      topPriority: ranked.filter((item) => item.priorityTier === "top").length,
      highPriority: ranked.filter((item) => item.priorityTier === "high").length,
      competitorGaps: ranked.filter((item) => item.reasonCodes.includes("competitor_gap")).length,
      easyWins: ranked.filter((item) => item.reasonCodes.includes("easy_win")).length,
    };

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      clientId: resolved.client.id,
      scoring: {
        potentialValueWeight: 0.55,
        attainabilityWeight: 0.45,
        terminalWorkflowsExcluded: true,
      },
      summary,
      items,
    });
  } catch (error) {
    console.error("[BACKLINK-OPPORTUNITY-INTELLIGENCE] read failed:", error);
    res.status(500).json({ error: "BACKLINK_OPPORTUNITY_INTELLIGENCE_READ_FAILED" });
  }
});

export default router;

import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, DrizzleBacklinkRepository } from "@workspace/db";
import { resolveClientContentContextFromDb } from "../lib/client-resolver.js";
import {
  buildLegacyBacklinkWorkflowTransition,
  type LegacyBacklinkWorkflowPatchBody,
} from "../lib/backlink-workflow-patch.js";

const router = Router();
const repo = new DrizzleBacklinkRepository(db);

router.patch("/api/backlinks/workflows/:opportunityId", async (req, res) => {
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

  const opportunityId = req.params.opportunityId?.trim();
  if (!opportunityId) {
    res.status(400).json({ error: "opportunityId_required" });
    return;
  }

  let transition;
  try {
    transition = buildLegacyBacklinkWorkflowTransition(
      req.body as LegacyBacklinkWorkflowPatchBody,
      userId,
    );
  } catch (error) {
    if (error instanceof Error && error.message === "toStatus_required") {
      res.status(400).json({ error: "toStatus_required" });
      return;
    }
    throw error;
  }

  try {
    const workflow = await repo.transitionWorkflow(
      opportunityId,
      resolved.client.id,
      transition,
    );
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ workflow });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/workflow not found|cross-tenant/i.test(message)) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (/invalid backlink workflow transition/i.test(message)) {
      res.status(400).json({ error: "invalid_transition", message });
      return;
    }

    console.error("[BACKLINK-WORKFLOW-PATCH] transition failed:", error);
    res.status(500).json({ error: "db_error" });
  }
});

export default router;

import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, DrizzleBacklinkRepository } from "@workspace/db";
import { resolveClientContentContextFromDb } from "../lib/client-resolver.js";
import {
  auditReasonForBacklinkWorkflowHumanAction,
  isBacklinkWorkflowHumanAction,
  statusForBacklinkWorkflowHumanAction,
} from "../lib/backlink-workflow-human-action.js";

const router = Router();
const repo = new DrizzleBacklinkRepository(db);

router.post(
  "/api/backlinks/opportunities/:opportunityId/workflow-action",
  async (req, res) => {
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
      res.status(400).json({ error: "opportunity_id_required" });
      return;
    }

    const action = req.body?.action;
    if (!isBacklinkWorkflowHumanAction(action)) {
      res.status(400).json({ error: "invalid_workflow_action" });
      return;
    }

    try {
      const workflow = await repo.transitionWorkflow(
        opportunityId,
        resolved.client.id,
        {
          toStatus: statusForBacklinkWorkflowHumanAction(action),
          actorId: userId,
          reason: auditReasonForBacklinkWorkflowHumanAction(action),
        },
      );

      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({ workflow });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/workflow not found|cross-tenant/i.test(message)) {
        res.status(404).json({ error: "workflow_not_found" });
        return;
      }
      if (/invalid backlink workflow transition/i.test(message)) {
        res.status(409).json({
          error: "invalid_transition",
          message: "That action is not valid for the workflow's current durable state.",
        });
        return;
      }

      console.error("[BACKLINK-WORKFLOW-ACTION] transition failed:", error);
      res.status(500).json({ error: "BACKLINK_WORKFLOW_ACTION_FAILED" });
    }
  },
);

export default router;

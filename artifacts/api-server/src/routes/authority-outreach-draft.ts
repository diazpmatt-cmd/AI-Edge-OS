import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, pool, DrizzleBacklinkRepository } from "@workspace/db";
import { resolveClientContentContextFromDb } from "../lib/client-resolver.js";
import { selectBacklinkEvidencePreview } from "../lib/backlink-opportunity-intelligence.js";
import {
  buildAuthorityOutreachDraft,
  isAuthorityOutreachDraftWorkflowEligible,
} from "../lib/authority-outreach-draft.js";

const router = Router();
const repo = new DrizzleBacklinkRepository(db);

router.get(
  "/api/backlinks/opportunities/:opportunityId/outreach-draft-preview",
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

    try {
      const opportunity = await repo.getOpportunityById(
        opportunityId,
        resolved.client.id,
      );
      if (!opportunity) {
        res.status(404).json({ error: "opportunity_not_found" });
        return;
      }

      const workflowResult = await pool.query<{ status: string }>(
        `SELECT status
         FROM backlink_workflows
         WHERE opportunity_id = $1 AND client_id = $2
         LIMIT 1`,
        [opportunityId, resolved.client.id],
      );
      const workflowStatus = workflowResult.rows[0]?.status ?? null;
      if (!workflowStatus) {
        res.status(404).json({ error: "workflow_not_found" });
        return;
      }
      if (!isAuthorityOutreachDraftWorkflowEligible(workflowStatus)) {
        res.status(409).json({
          error: "outreach_draft_not_approved",
          message: "Outreach drafts require an approved or pursuing opportunity.",
          workflowStatus,
        });
        return;
      }

      let serviceName: string | null = null;
      if (opportunity.serviceId) {
        const service = resolved.context.registry
          .getGeneratableServices()
          .find((candidate) => candidate.serviceId === opportunity.serviceId);
        if (!service) {
          res.status(409).json({
            error: "outreach_service_not_eligible",
            message: "The opportunity references a service that is not eligible for generated copy.",
          });
          return;
        }
        serviceName = service.displayName;
      }

      const evidence = await repo.listEvidenceForProspect(
        opportunity.prospectId,
        resolved.client.id,
      );
      const evidencePreview = selectBacklinkEvidencePreview(opportunity, evidence, 3);
      if (evidencePreview.length === 0) {
        res.status(409).json({
          error: "outreach_evidence_unavailable",
          message: "No referenced persisted evidence is available for this draft.",
        });
        return;
      }

      const draft = buildAuthorityOutreachDraft({
        opportunityId: opportunity.id,
        category: opportunity.category,
        recommendedAction: opportunity.recommendedAction,
        clientName: resolved.context.clientName,
        industryLabel: resolved.context.industryLabel,
        region: resolved.context.region,
        serviceId: opportunity.serviceId,
        serviceName,
        evidence: evidencePreview,
      });

      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({
        workflowStatus,
        editable: true,
        persisted: false,
        sendAvailable: false,
        draft,
      });
    } catch (error) {
      console.error("[AUTHORITY-OUTREACH-DRAFT] preview failed:", error);
      res.status(500).json({ error: "AUTHORITY_OUTREACH_DRAFT_PREVIEW_FAILED" });
    }
  },
);

export default router;

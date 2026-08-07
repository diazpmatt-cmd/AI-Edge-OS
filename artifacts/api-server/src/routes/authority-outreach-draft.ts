import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, pool, DrizzleBacklinkRepository } from "@workspace/db";
import { resolveClientContentContextFromDb } from "../lib/client-resolver.js";
import { selectBacklinkEvidencePreview } from "../lib/backlink-opportunity-intelligence.js";
import {
  buildAuthorityOutreachDraft,
  isAuthorityOutreachDraftWorkflowEligible,
} from "../lib/authority-outreach-draft.js";
import {
  createAuthorityOutreachDraft,
  getAuthorityOutreachDraft,
  listAuthorityOutreachDraftVersions,
  mutateAuthorityOutreachDraft,
} from "../lib/authority-outreach-draft-store.js";

const router = Router();
const repo = new DrizzleBacklinkRepository(db);

async function resolveDraftContext(userId: string, opportunityId: string) {
  const resolved = await resolveClientContentContextFromDb(userId);
  if (!resolved.found) {
    return { ok: false as const, status: 404, body: { error: "client_not_found", reason: resolved.reason } };
  }

  const opportunity = await repo.getOpportunityById(opportunityId, resolved.client.id);
  if (!opportunity) {
    return { ok: false as const, status: 404, body: { error: "opportunity_not_found" } };
  }

  const workflowResult = await pool.query<{ id: string; status: string }>(
    `SELECT id, status
     FROM backlink_workflows
     WHERE opportunity_id = $1 AND client_id = $2
     LIMIT 1`,
    [opportunityId, resolved.client.id],
  );
  const workflow = workflowResult.rows[0] ?? null;
  if (!workflow) {
    return { ok: false as const, status: 404, body: { error: "workflow_not_found" } };
  }
  if (!isAuthorityOutreachDraftWorkflowEligible(workflow.status)) {
    return {
      ok: false as const,
      status: 409,
      body: {
        error: "outreach_draft_not_approved",
        message: "Outreach drafts require an approved or pursuing opportunity.",
        workflowStatus: workflow.status,
      },
    };
  }

  let serviceName: string | null = null;
  if (opportunity.serviceId) {
    const service = resolved.context.registry
      .getGeneratableServices()
      .find((candidate) => candidate.serviceId === opportunity.serviceId);
    if (!service) {
      return {
        ok: false as const,
        status: 409,
        body: {
          error: "outreach_service_not_eligible",
          message: "The opportunity references a service that is not eligible for generated copy.",
        },
      };
    }
    serviceName = service.displayName;
  }

  const evidence = await repo.listEvidenceForProspect(opportunity.prospectId, resolved.client.id);
  const evidencePreview = selectBacklinkEvidencePreview(opportunity, evidence, 3);
  if (evidencePreview.length === 0) {
    return {
      ok: false as const,
      status: 409,
      body: {
        error: "outreach_evidence_unavailable",
        message: "No referenced persisted evidence is available for this draft.",
      },
    };
  }

  const baselineDraft = buildAuthorityOutreachDraft({
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

  return {
    ok: true as const,
    clientId: resolved.client.id,
    workflow: { id: workflow.id, status: workflow.status as "approved" | "pursuing" },
    baselineDraft,
  };
}

function mapDraftStoreError(error: unknown): { status: number; body: Record<string, unknown> } | null {
  const message = error instanceof Error ? error.message : "";
  if (/text_required|subject_too_long|body_too_long|expected_version_required/.test(message)) {
    return { status: 400, body: { error: message } };
  }
  if (/already_exists|version_conflict|invalid_transition|draft_conflict/.test(message)) {
    return { status: 409, body: { error: message } };
  }
  if (/draft_not_found/.test(message)) {
    return { status: 404, body: { error: message } };
  }
  return null;
}

router.get(
  "/api/backlinks/opportunities/:opportunityId/outreach-draft-preview",
  async (req, res) => {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const opportunityId = req.params.opportunityId?.trim();
    if (!opportunityId) {
      res.status(400).json({ error: "opportunity_id_required" });
      return;
    }

    try {
      const context = await resolveDraftContext(userId, opportunityId);
      if (!context.ok) {
        res.status(context.status).json(context.body);
        return;
      }

      const [persistedDraft, history] = await Promise.all([
        getAuthorityOutreachDraft(opportunityId, context.clientId),
        listAuthorityOutreachDraftVersions(opportunityId, context.clientId),
      ]);

      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({
        workflowStatus: context.workflow.status,
        editable: true,
        persisted: Boolean(persistedDraft),
        sendAvailable: false,
        draft: context.baselineDraft,
        persistedDraft,
        history,
      });
    } catch (error) {
      console.error("[AUTHORITY-OUTREACH-DRAFT] preview failed:", error);
      res.status(500).json({ error: "AUTHORITY_OUTREACH_DRAFT_PREVIEW_FAILED" });
    }
  },
);

router.post(
  "/api/backlinks/opportunities/:opportunityId/outreach-draft",
  async (req, res) => {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const opportunityId = req.params.opportunityId?.trim();
    if (!opportunityId) {
      res.status(400).json({ error: "opportunity_id_required" });
      return;
    }

    try {
      const context = await resolveDraftContext(userId, opportunityId);
      if (!context.ok) {
        res.status(context.status).json(context.body);
        return;
      }

      const current = await getAuthorityOutreachDraft(opportunityId, context.clientId);
      const draft = current
        ? await mutateAuthorityOutreachDraft({
            clientId: context.clientId,
            opportunityId,
            actorId: userId,
            action: "save",
            expectedVersion: req.body?.expectedVersion,
            subject: req.body?.subject,
            body: req.body?.body,
          })
        : await createAuthorityOutreachDraft({
            clientId: context.clientId,
            opportunityId,
            workflowId: context.workflow.id,
            actorId: userId,
            subject: req.body?.subject,
            body: req.body?.body,
            provenance: context.baselineDraft.provenance as unknown as Record<string, unknown>,
            generatedBy: context.baselineDraft.generatedBy,
          });

      const history = await listAuthorityOutreachDraftVersions(opportunityId, context.clientId);
      res.setHeader("Cache-Control", "no-store");
      res.status(current ? 200 : 201).json({
        draft,
        history,
        sendAvailable: false,
      });
    } catch (error) {
      const mapped = mapDraftStoreError(error);
      if (mapped) {
        res.status(mapped.status).json(mapped.body);
        return;
      }
      console.error("[AUTHORITY-OUTREACH-DRAFT] save failed:", error);
      res.status(500).json({ error: "AUTHORITY_OUTREACH_DRAFT_SAVE_FAILED" });
    }
  },
);

router.post(
  "/api/backlinks/opportunities/:opportunityId/outreach-draft/action",
  async (req, res) => {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const opportunityId = req.params.opportunityId?.trim();
    if (!opportunityId) {
      res.status(400).json({ error: "opportunity_id_required" });
      return;
    }

    const action = req.body?.action;
    if (action !== "approve" && action !== "reopen" && action !== "reject") {
      res.status(400).json({ error: "invalid_outreach_draft_action" });
      return;
    }

    try {
      const context = await resolveDraftContext(userId, opportunityId);
      if (!context.ok) {
        res.status(context.status).json(context.body);
        return;
      }

      const draft = await mutateAuthorityOutreachDraft({
        clientId: context.clientId,
        opportunityId,
        actorId: userId,
        action,
        expectedVersion: req.body?.expectedVersion,
      });
      const history = await listAuthorityOutreachDraftVersions(opportunityId, context.clientId);

      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({ draft, history, sendAvailable: false });
    } catch (error) {
      const mapped = mapDraftStoreError(error);
      if (mapped) {
        res.status(mapped.status).json(mapped.body);
        return;
      }
      console.error("[AUTHORITY-OUTREACH-DRAFT] action failed:", error);
      res.status(500).json({ error: "AUTHORITY_OUTREACH_DRAFT_ACTION_FAILED" });
    }
  },
);

export default router;

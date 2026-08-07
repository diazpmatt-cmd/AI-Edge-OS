import { Router } from "express";
import { getAuth } from "@clerk/express";
import { pool } from "@workspace/db";
import { resolveClientContentContextFromDb } from "../lib/client-resolver.js";
import { getAuthorityOutreachDraft } from "../lib/authority-outreach-draft-store.js";
import { listAuthorityTargetContacts } from "../lib/authority-target-contact-store.js";
import { evaluateAuthorityOutreachReadiness } from "../lib/authority-outreach-readiness.js";

const router = Router();

router.get("/api/backlinks/opportunities/:opportunityId/outreach-readiness", async (req, res) => {
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
    const resolved = await resolveClientContentContextFromDb(userId);
    if (!resolved.found) {
      res.status(404).json({ error: "client_not_found", reason: resolved.reason });
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

    const [draft, contacts] = await Promise.all([
      getAuthorityOutreachDraft(opportunityId, resolved.client.id),
      listAuthorityTargetContacts(opportunityId, resolved.client.id),
    ]);

    const readiness = evaluateAuthorityOutreachReadiness({
      workflowStatus,
      draft: draft
        ? {
            status: draft.status,
            version: draft.version,
            approvedAt: draft.approvedAt,
            approvedBy: draft.approvedBy,
          }
        : null,
      contacts: contacts.map((contact) => ({
        verificationStatus: contact.verificationStatus,
        sourceUrl: contact.sourceUrl,
        verifiedAt: contact.verifiedAt,
        verifiedBy: contact.verifiedBy,
      })),
    });

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      opportunityId,
      workflowStatus,
      draft: draft
        ? { status: draft.status, version: draft.version, approvedAt: draft.approvedAt }
        : null,
      verifiedContacts: contacts
        .filter((contact) => contact.verificationStatus === "human_verified")
        .map((contact) => ({
          id: contact.id,
          organizationName: contact.organizationName,
          contactMethod: contact.contactMethod,
          sourceUrl: contact.sourceUrl,
          verifiedAt: contact.verifiedAt,
        })),
      readiness,
      sendAvailable: false,
      sendAuthorized: false,
    });
  } catch (error) {
    console.error("[AUTHORITY-OUTREACH-READINESS] read failed:", error);
    res.status(500).json({ error: "AUTHORITY_OUTREACH_READINESS_FAILED" });
  }
});

export default router;

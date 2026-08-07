import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, pool, DrizzleBacklinkRepository } from "@workspace/db";
import { resolveClientContentContextFromDb } from "../lib/client-resolver.js";
import { isAuthorityOutreachDraftWorkflowEligible } from "../lib/authority-outreach-draft.js";
import {
  actOnAuthorityTargetContact,
  createAuthorityTargetContact,
  listAuthorityTargetContacts,
  updateAuthorityTargetContact,
} from "../lib/authority-target-contact-store.js";

const router = Router();
const repo = new DrizzleBacklinkRepository(db);

async function resolveWorkspace(userId: string, opportunityId: string) {
  const resolved = await resolveClientContentContextFromDb(userId);
  if (!resolved.found) {
    return { ok: false as const, status: 404, body: { error: "client_not_found", reason: resolved.reason } };
  }
  const opportunity = await repo.getOpportunityById(opportunityId, resolved.client.id);
  if (!opportunity) {
    return { ok: false as const, status: 404, body: { error: "opportunity_not_found" } };
  }
  const workflow = await pool.query<{ status: string }>(
    `SELECT status FROM backlink_workflows
     WHERE opportunity_id = $1 AND client_id = $2 LIMIT 1`,
    [opportunityId, resolved.client.id],
  );
  const workflowStatus = workflow.rows[0]?.status ?? null;
  if (!isAuthorityOutreachDraftWorkflowEligible(workflowStatus)) {
    return {
      ok: false as const,
      status: 409,
      body: {
        error: "authority_target_contacts_not_approved",
        message: "Target contacts require an approved or pursuing Authority opportunity.",
        workflowStatus,
      },
    };
  }
  return {
    ok: true as const,
    clientId: resolved.client.id,
    prospectId: opportunity.prospectId,
    workflowStatus,
  };
}

function mapError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/required|invalid|too_long/.test(message)) return { status: 400, error: message };
  if (/version_conflict|must_reopen|already_invalid|reopen_requires_invalid/.test(message)) return { status: 409, error: message };
  if (/not_found/.test(message)) return { status: 404, error: message };
  return null;
}

router.get("/api/backlinks/opportunities/:opportunityId/target-contacts", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const opportunityId = req.params.opportunityId?.trim();
  if (!opportunityId) { res.status(400).json({ error: "opportunity_id_required" }); return; }
  try {
    const workspace = await resolveWorkspace(userId, opportunityId);
    if (!workspace.ok) { res.status(workspace.status).json(workspace.body); return; }
    const contacts = await listAuthorityTargetContacts(opportunityId, workspace.clientId);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ workflowStatus: workspace.workflowStatus, contacts, sendAvailable: false, automatedDiscoveryAvailable: false });
  } catch (error) {
    console.error("[AUTHORITY-TARGET-CONTACT] list failed:", error);
    res.status(500).json({ error: "AUTHORITY_TARGET_CONTACT_LIST_FAILED" });
  }
});

router.post("/api/backlinks/opportunities/:opportunityId/target-contacts", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const opportunityId = req.params.opportunityId?.trim();
  if (!opportunityId) { res.status(400).json({ error: "opportunity_id_required" }); return; }
  try {
    const workspace = await resolveWorkspace(userId, opportunityId);
    if (!workspace.ok) { res.status(workspace.status).json(workspace.body); return; }
    const contact = await createAuthorityTargetContact({
      clientId: workspace.clientId,
      opportunityId,
      prospectId: workspace.prospectId,
      actorId: userId,
      contact: req.body ?? {},
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({ contact, sendAvailable: false, automatedDiscoveryAvailable: false });
  } catch (error) {
    const mapped = mapError(error);
    if (mapped) { res.status(mapped.status).json({ error: mapped.error }); return; }
    console.error("[AUTHORITY-TARGET-CONTACT] create failed:", error);
    res.status(500).json({ error: "AUTHORITY_TARGET_CONTACT_CREATE_FAILED" });
  }
});

router.patch("/api/backlinks/opportunities/:opportunityId/target-contacts/:contactId", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const opportunityId = req.params.opportunityId?.trim();
  const contactId = req.params.contactId?.trim();
  if (!opportunityId || !contactId) { res.status(400).json({ error: "opportunity_and_contact_required" }); return; }
  try {
    const workspace = await resolveWorkspace(userId, opportunityId);
    if (!workspace.ok) { res.status(workspace.status).json(workspace.body); return; }
    const contacts = await listAuthorityTargetContacts(opportunityId, workspace.clientId);
    if (!contacts.some((contact) => contact.id === contactId)) {
      res.status(404).json({ error: "authority_target_contact_not_found" });
      return;
    }
    const contact = await updateAuthorityTargetContact({
      id: contactId,
      clientId: workspace.clientId,
      actorId: userId,
      expectedVersion: req.body?.expectedVersion,
      contact: req.body ?? {},
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ contact, sendAvailable: false, automatedDiscoveryAvailable: false });
  } catch (error) {
    const mapped = mapError(error);
    if (mapped) { res.status(mapped.status).json({ error: mapped.error }); return; }
    console.error("[AUTHORITY-TARGET-CONTACT] update failed:", error);
    res.status(500).json({ error: "AUTHORITY_TARGET_CONTACT_UPDATE_FAILED" });
  }
});

router.post("/api/backlinks/opportunities/:opportunityId/target-contacts/:contactId/action", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const opportunityId = req.params.opportunityId?.trim();
  const contactId = req.params.contactId?.trim();
  if (!opportunityId || !contactId) { res.status(400).json({ error: "opportunity_and_contact_required" }); return; }
  const action = req.body?.action;
  if (action !== "verify" && action !== "invalidate" && action !== "reopen") {
    res.status(400).json({ error: "authority_target_contact_action_invalid" });
    return;
  }
  try {
    const workspace = await resolveWorkspace(userId, opportunityId);
    if (!workspace.ok) { res.status(workspace.status).json(workspace.body); return; }
    const contacts = await listAuthorityTargetContacts(opportunityId, workspace.clientId);
    if (!contacts.some((contact) => contact.id === contactId)) {
      res.status(404).json({ error: "authority_target_contact_not_found" });
      return;
    }
    const contact = await actOnAuthorityTargetContact({
      id: contactId,
      clientId: workspace.clientId,
      actorId: userId,
      expectedVersion: req.body?.expectedVersion,
      action,
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ contact, sendAvailable: false, automatedDiscoveryAvailable: false });
  } catch (error) {
    const mapped = mapError(error);
    if (mapped) { res.status(mapped.status).json({ error: mapped.error }); return; }
    console.error("[AUTHORITY-TARGET-CONTACT] action failed:", error);
    res.status(500).json({ error: "AUTHORITY_TARGET_CONTACT_ACTION_FAILED" });
  }
});

export default router;

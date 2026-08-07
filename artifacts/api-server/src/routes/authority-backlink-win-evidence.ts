import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, DrizzleBacklinkRepository } from "@workspace/db";
import { resolveClientContentContextFromDb } from "../lib/client-resolver.js";
import {
  actOnAuthorityBacklinkWinEvidence,
  createAuthorityBacklinkWinEvidence,
  getAuthorityBacklinkWinEvidence,
  updateAuthorityBacklinkWinEvidence,
} from "../lib/authority-backlink-win-evidence-store.js";

const router = Router();
const repo = new DrizzleBacklinkRepository(db);

async function resolveWorkspace(userId: string, opportunityId: string) {
  const resolved = await resolveClientContentContextFromDb(userId);
  if (!resolved.found) return { ok: false as const, status: 404, body: { error: "client_not_found", reason: resolved.reason } };
  const opportunity = await repo.getOpportunityById(opportunityId, resolved.client.id);
  if (!opportunity) return { ok: false as const, status: 404, body: { error: "opportunity_not_found" } };
  return { ok: true as const, clientId: resolved.client.id, prospectId: opportunity.prospectId };
}

function mapError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/required|invalid|too_long/.test(message)) return { status: 400, error: message };
  if (/version_conflict|must_reopen|already_invalid|reopen_requires_invalid|duplicate key/i.test(message)) return { status: 409, error: message };
  if (/not_found/.test(message)) return { status: 404, error: message };
  return null;
}

router.get("/api/backlinks/opportunities/:opportunityId/win-evidence", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const opportunityId = req.params.opportunityId?.trim();
  if (!opportunityId) { res.status(400).json({ error: "opportunity_id_required" }); return; }
  try {
    const workspace = await resolveWorkspace(userId, opportunityId);
    if (!workspace.ok) { res.status(workspace.status).json(workspace.body); return; }
    const evidence = await getAuthorityBacklinkWinEvidence(opportunityId, workspace.clientId);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ evidence, markWonEligible: evidence?.verificationStatus === "human_verified" });
  } catch (error) {
    console.error("[AUTHORITY-WIN-EVIDENCE] read failed:", error);
    res.status(500).json({ error: "AUTHORITY_WIN_EVIDENCE_READ_FAILED" });
  }
});

router.post("/api/backlinks/opportunities/:opportunityId/win-evidence", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const opportunityId = req.params.opportunityId?.trim();
  if (!opportunityId) { res.status(400).json({ error: "opportunity_id_required" }); return; }
  try {
    const workspace = await resolveWorkspace(userId, opportunityId);
    if (!workspace.ok) { res.status(workspace.status).json(workspace.body); return; }
    if (await getAuthorityBacklinkWinEvidence(opportunityId, workspace.clientId)) {
      res.status(409).json({ error: "win_evidence_already_exists" });
      return;
    }
    const evidence = await createAuthorityBacklinkWinEvidence({
      clientId: workspace.clientId,
      opportunityId,
      prospectId: workspace.prospectId,
      actorId: userId,
      evidence: req.body ?? {},
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({ evidence, markWonEligible: false });
  } catch (error) {
    const mapped = mapError(error);
    if (mapped) { res.status(mapped.status).json({ error: mapped.error }); return; }
    console.error("[AUTHORITY-WIN-EVIDENCE] create failed:", error);
    res.status(500).json({ error: "AUTHORITY_WIN_EVIDENCE_CREATE_FAILED" });
  }
});

router.patch("/api/backlinks/opportunities/:opportunityId/win-evidence", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const opportunityId = req.params.opportunityId?.trim();
  if (!opportunityId) { res.status(400).json({ error: "opportunity_id_required" }); return; }
  try {
    const workspace = await resolveWorkspace(userId, opportunityId);
    if (!workspace.ok) { res.status(workspace.status).json(workspace.body); return; }
    const current = await getAuthorityBacklinkWinEvidence(opportunityId, workspace.clientId);
    if (!current) { res.status(404).json({ error: "win_evidence_not_found" }); return; }
    const evidence = await updateAuthorityBacklinkWinEvidence({
      id: current.id,
      clientId: workspace.clientId,
      actorId: userId,
      expectedVersion: req.body?.expectedVersion,
      evidence: req.body ?? {},
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ evidence, markWonEligible: false });
  } catch (error) {
    const mapped = mapError(error);
    if (mapped) { res.status(mapped.status).json({ error: mapped.error }); return; }
    console.error("[AUTHORITY-WIN-EVIDENCE] update failed:", error);
    res.status(500).json({ error: "AUTHORITY_WIN_EVIDENCE_UPDATE_FAILED" });
  }
});

router.post("/api/backlinks/opportunities/:opportunityId/win-evidence/action", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const opportunityId = req.params.opportunityId?.trim();
  if (!opportunityId) { res.status(400).json({ error: "opportunity_id_required" }); return; }
  const action = req.body?.action;
  if (action !== "verify" && action !== "invalidate" && action !== "reopen") {
    res.status(400).json({ error: "win_evidence_action_invalid" });
    return;
  }
  try {
    const workspace = await resolveWorkspace(userId, opportunityId);
    if (!workspace.ok) { res.status(workspace.status).json(workspace.body); return; }
    const current = await getAuthorityBacklinkWinEvidence(opportunityId, workspace.clientId);
    if (!current) { res.status(404).json({ error: "win_evidence_not_found" }); return; }
    const evidence = await actOnAuthorityBacklinkWinEvidence({
      id: current.id,
      clientId: workspace.clientId,
      actorId: userId,
      expectedVersion: req.body?.expectedVersion,
      action,
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ evidence, markWonEligible: evidence.verificationStatus === "human_verified" });
  } catch (error) {
    const mapped = mapError(error);
    if (mapped) { res.status(mapped.status).json({ error: mapped.error }); return; }
    console.error("[AUTHORITY-WIN-EVIDENCE] action failed:", error);
    res.status(500).json({ error: "AUTHORITY_WIN_EVIDENCE_ACTION_FAILED" });
  }
});

export default router;

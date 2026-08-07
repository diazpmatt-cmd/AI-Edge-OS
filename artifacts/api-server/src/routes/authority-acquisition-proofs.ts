import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, pool, DrizzleBacklinkRepository } from "@workspace/db";
import { resolveClientContentContextFromDb } from "../lib/client-resolver.js";
import {
  actOnAuthorityAcquisitionProof,
  createAuthorityAcquisitionProof,
  listAuthorityAcquisitionProofs,
  updateAuthorityAcquisitionProof,
} from "../lib/authority-acquisition-proof-store.js";

const router = Router();
const repo = new DrizzleBacklinkRepository(db);

async function resolveProofWorkspace(userId: string, opportunityId: string) {
  const resolved = await resolveClientContentContextFromDb(userId);
  if (!resolved.found) {
    return { ok: false as const, status: 404, body: { error: "client_not_found", reason: resolved.reason } };
  }
  const opportunity = await repo.getOpportunityById(opportunityId, resolved.client.id);
  if (!opportunity) {
    return { ok: false as const, status: 404, body: { error: "opportunity_not_found" } };
  }
  const workflowResult = await pool.query<{ id: string; status: string }>(
    `SELECT id, status FROM backlink_workflows
     WHERE opportunity_id = $1 AND client_id = $2 LIMIT 1`,
    [opportunityId, resolved.client.id],
  );
  const workflow = workflowResult.rows[0] ?? null;
  if (!workflow) {
    return { ok: false as const, status: 404, body: { error: "workflow_not_found" } };
  }
  if (workflow.status !== "pursuing" && workflow.status !== "won") {
    return {
      ok: false as const,
      status: 409,
      body: {
        error: "authority_acquisition_proof_not_pursuing",
        message: "Acquisition proof is available only for pursuing or won Authority opportunities.",
        workflowStatus: workflow.status,
      },
    };
  }
  return {
    ok: true as const,
    clientId: resolved.client.id,
    prospectId: opportunity.prospectId,
    workflowId: workflow.id,
    workflowStatus: workflow.status as "pursuing" | "won",
  };
}

function requireMutableProofWorkspace(workspace: { workflowStatus: "pursuing" | "won" }) {
  if (workspace.workflowStatus === "won") {
    return {
      status: 409,
      body: {
        error: "authority_acquisition_proof_read_only_after_won",
        message: "Acquisition proof is immutable after the Authority opportunity is marked won.",
      },
    };
  }
  return null;
}

function mapError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/required|invalid|too_long/.test(message)) return { status: 400, error: message };
  if (/version_conflict|must_reopen|already_invalid|reopen_requires_invalid/.test(message)) {
    return { status: 409, error: message };
  }
  if (/not_found/.test(message)) return { status: 404, error: message };
  return null;
}

router.get("/api/backlinks/opportunities/:opportunityId/acquisition-proofs", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const opportunityId = req.params.opportunityId?.trim();
  if (!opportunityId) { res.status(400).json({ error: "opportunity_id_required" }); return; }
  try {
    const workspace = await resolveProofWorkspace(userId, opportunityId);
    if (!workspace.ok) { res.status(workspace.status).json(workspace.body); return; }
    const proofs = await listAuthorityAcquisitionProofs(opportunityId, workspace.clientId);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      workflowStatus: workspace.workflowStatus,
      proofs,
      mutable: workspace.workflowStatus === "pursuing",
      externalVerificationAvailable: false,
      sendAvailable: false,
    });
  } catch (error) {
    console.error("[AUTHORITY-ACQUISITION-PROOF] list failed:", error);
    res.status(500).json({ error: "AUTHORITY_ACQUISITION_PROOF_LIST_FAILED" });
  }
});

router.post("/api/backlinks/opportunities/:opportunityId/acquisition-proofs", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const opportunityId = req.params.opportunityId?.trim();
  if (!opportunityId) { res.status(400).json({ error: "opportunity_id_required" }); return; }
  try {
    const workspace = await resolveProofWorkspace(userId, opportunityId);
    if (!workspace.ok) { res.status(workspace.status).json(workspace.body); return; }
    const immutable = requireMutableProofWorkspace(workspace);
    if (immutable) { res.status(immutable.status).json(immutable.body); return; }
    const proof = await createAuthorityAcquisitionProof({
      clientId: workspace.clientId,
      opportunityId,
      prospectId: workspace.prospectId,
      workflowId: workspace.workflowId,
      actorId: userId,
      proof: req.body ?? {},
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({ proof, externalVerificationAvailable: false, sendAvailable: false });
  } catch (error) {
    const mapped = mapError(error);
    if (mapped) { res.status(mapped.status).json({ error: mapped.error }); return; }
    console.error("[AUTHORITY-ACQUISITION-PROOF] create failed:", error);
    res.status(500).json({ error: "AUTHORITY_ACQUISITION_PROOF_CREATE_FAILED" });
  }
});

router.patch("/api/backlinks/opportunities/:opportunityId/acquisition-proofs/:proofId", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const opportunityId = req.params.opportunityId?.trim();
  const proofId = req.params.proofId?.trim();
  if (!opportunityId || !proofId) { res.status(400).json({ error: "opportunity_and_proof_required" }); return; }
  try {
    const workspace = await resolveProofWorkspace(userId, opportunityId);
    if (!workspace.ok) { res.status(workspace.status).json(workspace.body); return; }
    const immutable = requireMutableProofWorkspace(workspace);
    if (immutable) { res.status(immutable.status).json(immutable.body); return; }
    const proofs = await listAuthorityAcquisitionProofs(opportunityId, workspace.clientId);
    if (!proofs.some((proof) => proof.id === proofId)) {
      res.status(404).json({ error: "authority_acquisition_proof_not_found" });
      return;
    }
    const proof = await updateAuthorityAcquisitionProof({
      id: proofId,
      clientId: workspace.clientId,
      opportunityId,
      actorId: userId,
      expectedVersion: req.body?.expectedVersion,
      proof: req.body ?? {},
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ proof, externalVerificationAvailable: false, sendAvailable: false });
  } catch (error) {
    const mapped = mapError(error);
    if (mapped) { res.status(mapped.status).json({ error: mapped.error }); return; }
    console.error("[AUTHORITY-ACQUISITION-PROOF] update failed:", error);
    res.status(500).json({ error: "AUTHORITY_ACQUISITION_PROOF_UPDATE_FAILED" });
  }
});

router.post("/api/backlinks/opportunities/:opportunityId/acquisition-proofs/:proofId/action", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const opportunityId = req.params.opportunityId?.trim();
  const proofId = req.params.proofId?.trim();
  if (!opportunityId || !proofId) { res.status(400).json({ error: "opportunity_and_proof_required" }); return; }
  const action = req.body?.action;
  if (action !== "verify" && action !== "invalidate" && action !== "reopen") {
    res.status(400).json({ error: "authority_acquisition_proof_action_invalid" });
    return;
  }
  try {
    const workspace = await resolveProofWorkspace(userId, opportunityId);
    if (!workspace.ok) { res.status(workspace.status).json(workspace.body); return; }
    const immutable = requireMutableProofWorkspace(workspace);
    if (immutable) { res.status(immutable.status).json(immutable.body); return; }
    const proofs = await listAuthorityAcquisitionProofs(opportunityId, workspace.clientId);
    if (!proofs.some((proof) => proof.id === proofId)) {
      res.status(404).json({ error: "authority_acquisition_proof_not_found" });
      return;
    }
    const proof = await actOnAuthorityAcquisitionProof({
      id: proofId,
      clientId: workspace.clientId,
      opportunityId,
      actorId: userId,
      expectedVersion: req.body?.expectedVersion,
      action,
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ proof, externalVerificationAvailable: false, sendAvailable: false });
  } catch (error) {
    const mapped = mapError(error);
    if (mapped) { res.status(mapped.status).json({ error: mapped.error }); return; }
    console.error("[AUTHORITY-ACQUISITION-PROOF] action failed:", error);
    res.status(500).json({ error: "AUTHORITY_ACQUISITION_PROOF_ACTION_FAILED" });
  }
});

export default router;

import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";

import { listAuthorizedApollosClients } from "../lib/apollos-client-access.js";
import {
  APOLLOS_CAPABILITY_REGISTRY,
  explainApollosCoverageGap,
} from "../lib/apollos-client-orchestrator.js";
import {
  buildApollosLiveCoverageForActor,
  type ApollosLiveCoverageFailureReason,
} from "../lib/apollos-client-coverage-live.js";
import { buildApollosClientMissionSummary } from "../lib/apollos-client-mission.js";
import { prepareApollosCapabilityActivation } from "../lib/apollos-client-preparation.js";

const router = Router();

function respondFailure(res: Response, reason: ApollosLiveCoverageFailureReason): void {
  const status = reason === "not_found"
    ? 404
    : reason === "inactive" || reason === "unauthorized"
      ? 403
      : reason === "selection_required" || reason === "resolution_mismatch"
        ? 409
        : reason === "registry_unavailable"
          ? 503
          : 422;
  res.status(status).json({ error: `APOLLOS_CLIENT_${reason.toUpperCase()}` });
}

function parseRequestedClientId(req: Request):
  | { readonly ok: true; readonly clientId: string | null }
  | { readonly ok: false } {
  const value = req.query.clientId;
  if (value === undefined) return { ok: true, clientId: null };
  if (typeof value !== "string") return { ok: false };
  const clientId = value.trim();
  if (!clientId || clientId.length > 100) return { ok: false };
  return { ok: true, clientId };
}

async function loadActorCoverage(req: Request, res: Response, userId: string) {
  const selection = parseRequestedClientId(req);
  if (!selection.ok) {
    res.status(400).json({ error: "APOLLOS_CLIENT_ID_INVALID" });
    return null;
  }
  const live = await buildApollosLiveCoverageForActor(userId, selection.clientId);
  if (!live.ok) {
    respondFailure(res, live.reason);
    return null;
  }
  return live;
}

router.get("/apollos/capabilities", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ capabilities: APOLLOS_CAPABILITY_REGISTRY });
});

router.get("/apollos/clients", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const clients = await listAuthorizedApollosClients(userId);
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ clients });
});

router.get("/apollos/client-context", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const live = await loadActorCoverage(req, res, userId);
  if (!live) return;

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(live.context);
});

router.get("/apollos/client-coverage", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const live = await loadActorCoverage(req, res, userId);
  if (!live) return;

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(live.coverage);
});

router.get("/apollos/activation-plan", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const live = await loadActorCoverage(req, res, userId);
  if (!live) return;

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(live.activationPlan);
});

router.get("/apollos/full-utilization", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const live = await loadActorCoverage(req, res, userId);
  if (!live) return;

  const mission = buildApollosClientMissionSummary({
    coverage: live.coverage,
    activationPlan: live.activationPlan,
  });

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(mission);
});

router.get("/apollos/capabilities/:capabilityKey", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const capabilityKey = String(req.params.capabilityKey ?? "").trim();
  if (!capabilityKey || capabilityKey.length > 100) {
    res.status(400).json({ error: "APOLLOS_CAPABILITY_KEY_INVALID" });
    return;
  }

  const live = await loadActorCoverage(req, res, userId);
  if (!live) return;

  const known = live.coverage.capabilities.find((item) => item.capability.key === capabilityKey);
  if (!known) {
    res.status(404).json({ error: "APOLLOS_CAPABILITY_NOT_FOUND" });
    return;
  }

  const gap = explainApollosCoverageGap(live.coverage, capabilityKey);
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    capabilityKey,
    activeOrNotApplicable: gap === null,
    gap,
  });
});

router.post("/apollos/prepare-activation", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const capabilityKey = typeof req.body?.capabilityKey === "string"
    ? req.body.capabilityKey.trim()
    : "";
  if (!capabilityKey || capabilityKey.length > 100) {
    res.status(400).json({ error: "APOLLOS_CAPABILITY_KEY_INVALID" });
    return;
  }

  const live = await loadActorCoverage(req, res, userId);
  if (!live) return;

  const prepared = prepareApollosCapabilityActivation(live, capabilityKey);
  if (prepared.status === "capability_not_found") {
    res.status(404).json({ error: "APOLLOS_CAPABILITY_NOT_FOUND" });
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(prepared);
});

export default router;

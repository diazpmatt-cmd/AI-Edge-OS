import { Router, type Response } from "express";
import { getAuth } from "@clerk/express";

import {
  APOLLOS_CAPABILITY_REGISTRY,
  type ApollosActionGate,
} from "../lib/apollos-client-orchestrator.js";
import {
  buildApollosLiveCoverageForUser,
  explainApollosLiveGapForUser,
  type ApollosLiveCoverageFailureReason,
} from "../lib/apollos-client-coverage-live.js";
import { buildApollosClientMissionSummary } from "../lib/apollos-client-mission.js";

const router = Router();

function respondFailure(res: Response, reason: ApollosLiveCoverageFailureReason): void {
  const status = reason === "not_found"
    ? 404
    : reason === "inactive"
      ? 403
      : reason === "registry_unavailable"
        ? 503
        : 422;
  res.status(status).json({ error: `APOLLOS_CLIENT_${reason.toUpperCase()}` });
}

function executionBoundary(gate: ApollosActionGate): string {
  switch (gate) {
    case "SAFE_AUTOMATIC_ACTION": return "prepared_for_safe_execution";
    case "HUMAN_APPROVAL_REQUIRED": return "human_approval_required";
    case "OAUTH_AUTHORIZATION_REQUIRED": return "oauth_authorization_required";
    case "EXTERNAL_CONFIGURATION_REQUIRED": return "external_configuration_required";
    case "BLOCKED": return "blocked";
  }
}

router.get("/apollos/capabilities", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ capabilities: APOLLOS_CAPABILITY_REGISTRY });
});

router.get("/apollos/client-context", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const live = await buildApollosLiveCoverageForUser(userId);
  if (!live.ok) {
    respondFailure(res, live.reason);
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(live.context);
});

router.get("/apollos/client-coverage", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const live = await buildApollosLiveCoverageForUser(userId);
  if (!live.ok) {
    respondFailure(res, live.reason);
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(live.coverage);
});

router.get("/apollos/activation-plan", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const live = await buildApollosLiveCoverageForUser(userId);
  if (!live.ok) {
    respondFailure(res, live.reason);
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(live.activationPlan);
});

router.get("/apollos/full-utilization", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const live = await buildApollosLiveCoverageForUser(userId);
  if (!live.ok) {
    respondFailure(res, live.reason);
    return;
  }

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

  const result = await explainApollosLiveGapForUser(userId, capabilityKey);
  if (!result.ok) {
    respondFailure(res, result.reason);
    return;
  }
  if (!result.gap) {
    const known = APOLLOS_CAPABILITY_REGISTRY.find((item) => item.key === capabilityKey);
    if (!known) {
      res.status(404).json({ error: "APOLLOS_CAPABILITY_NOT_FOUND" });
      return;
    }
    res.status(200).json({
      capabilityKey,
      activeOrNotApplicable: true,
      gap: null,
    });
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    capabilityKey,
    activeOrNotApplicable: false,
    gap: result.gap,
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

  const live = await buildApollosLiveCoverageForUser(userId);
  if (!live.ok) {
    respondFailure(res, live.reason);
    return;
  }

  const item = live.activationPlan.items.find((candidate) => candidate.capabilityKey === capabilityKey);
  if (!item) {
    const current = live.coverage.capabilities.find((candidate) => candidate.capability.key === capabilityKey);
    if (!current) {
      res.status(404).json({ error: "APOLLOS_CAPABILITY_NOT_FOUND" });
      return;
    }
    res.status(200).json({
      status: "no_action_required",
      capabilityKey,
      capabilityStatus: current.status,
      sideEffects: false,
    });
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    status: "prepared",
    clientId: live.context.clientId,
    clientName: live.context.clientName,
    capabilityKey,
    capabilityName: item.capabilityName,
    action: item.recommendedAction,
    reason: item.reason,
    expectedBenefit: item.expectedBenefit,
    dependencies: item.dependencies,
    gate: item.gate,
    boundary: executionBoundary(item.gate),
    sideEffects: false,
    executionStarted: false,
    message:
      "Preparation only. This endpoint does not perform OAuth, publish externally, send outreach, spend money, or mutate provider state.",
  });
});

export default router;

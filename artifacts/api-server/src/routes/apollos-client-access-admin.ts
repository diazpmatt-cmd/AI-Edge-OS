import { Router } from "express";
import { getAuth } from "@clerk/express";

import { isApollosAdminUser } from "../lib/apollos-admin-access-policy.js";
import {
  grantDelegatedApollosClientAccess,
  revokeDelegatedApollosClientAccess,
  type ApollosDelegatedAccessLevel,
} from "../lib/apollos-client-access.js";

const router = Router();

function requireApollosAdmin(req: Parameters<typeof getAuth>[0], res: any): string | null {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  if (!isApollosAdminUser(userId)) {
    res.status(403).json({ error: "APOLLOS_ADMIN_REQUIRED" });
    return null;
  }
  return userId;
}

function parseActorAndClient(body: unknown):
  | { readonly ok: true; readonly actorUserId: string; readonly clientId: string }
  | { readonly ok: false } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false };
  const record = body as Record<string, unknown>;
  const actorUserId = typeof record.actorUserId === "string" ? record.actorUserId.trim() : "";
  const clientId = typeof record.clientId === "string" ? record.clientId.trim() : "";
  if (!actorUserId || actorUserId.length > 200 || !clientId || clientId.length > 100) {
    return { ok: false };
  }
  return { ok: true, actorUserId, clientId };
}

function parseDelegatedAccessLevel(value: unknown): ApollosDelegatedAccessLevel | null {
  return value === "viewer" || value === "operator" ? value : null;
}

router.post("/apollos/client-access/grant", async (req, res) => {
  if (!requireApollosAdmin(req, res)) return;

  const target = parseActorAndClient(req.body);
  const accessLevel = parseDelegatedAccessLevel(req.body?.accessLevel);
  if (!target.ok || !accessLevel) {
    res.status(400).json({ error: "APOLLOS_CLIENT_ACCESS_INPUT_INVALID" });
    return;
  }

  const result = await grantDelegatedApollosClientAccess({
    actorUserId: target.actorUserId,
    clientId: target.clientId,
    accessLevel,
  });
  if (!result.ok) {
    const status = result.reason === "client_not_found" ? 404 : 409;
    res.status(status).json({ error: `APOLLOS_CLIENT_ACCESS_${result.reason.toUpperCase()}` });
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    status: "granted",
    actorUserId: target.actorUserId,
    clientId: target.clientId,
    accessLevel,
  });
});

router.post("/apollos/client-access/revoke", async (req, res) => {
  if (!requireApollosAdmin(req, res)) return;

  const target = parseActorAndClient(req.body);
  if (!target.ok) {
    res.status(400).json({ error: "APOLLOS_CLIENT_ACCESS_INPUT_INVALID" });
    return;
  }

  const result = await revokeDelegatedApollosClientAccess({
    actorUserId: target.actorUserId,
    clientId: target.clientId,
  });
  if (!result.ok) {
    res.status(404).json({ error: "APOLLOS_CLIENT_ACCESS_GRANT_NOT_FOUND" });
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    status: "revoked",
    actorUserId: target.actorUserId,
    clientId: target.clientId,
  });
});

export default router;

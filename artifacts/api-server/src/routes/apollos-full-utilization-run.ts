import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";

import { ApollosClientMcpRuntime } from "../lib/apollos-client-mcp.js";

const router = Router();
const runtime = new ApollosClientMcpRuntime();

function respondRuntimeFailure(res: Response, exception: unknown): void {
  const reason = exception instanceof Error ? exception.message : "";

  if (reason === "APOLLOS_MCP_CLIENT_NOT_FOUND") {
    res.status(404).json({ error: "APOLLOS_CLIENT_NOT_FOUND" });
    return;
  }
  if (reason === "APOLLOS_MCP_CLIENT_UNAUTHORIZED" || reason === "APOLLOS_MCP_CLIENT_WRITE_UNAUTHORIZED") {
    res.status(403).json({ error: "APOLLOS_CLIENT_WRITE_UNAUTHORIZED" });
    return;
  }
  if (reason === "APOLLOS_MCP_CLIENT_SELECTION_REQUIRED" || reason === "APOLLOS_MCP_CLIENT_RESOLUTION_MISMATCH") {
    res.status(409).json({ error: "APOLLOS_CLIENT_RESOLUTION_CONFLICT" });
    return;
  }

  res.status(500).json({ error: "APOLLOS_FULL_UTILIZATION_RUN_FAILED" });
}

/**
 * Web-session bridge to the canonical Apollos full-utilization MCP runtime.
 *
 * This route deliberately does not implement its own execution policy. The MCP
 * runtime remains authoritative for client authorization, operator-vs-viewer
 * access, SAFE_AUTOMATIC_ACTION gating, and the bounded cycle runner.
 */
router.post("/apollos/full-utilization/run", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const clientId = typeof req.body?.clientId === "string" ? req.body.clientId.trim() : "";
  if (!clientId || clientId.length > 100) {
    res.status(400).json({ error: "APOLLOS_CLIENT_ID_INVALID" });
    return;
  }

  try {
    const execution = await runtime.execute({
      context: Object.freeze({
        userId,
        actorReference: `web-session:${userId}`,
      }),
      toolName: "apollos_run_full_utilization_cycle",
      arguments: Object.freeze({ clientId }),
    });

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      clientId: execution.clientId,
      sideEffects: execution.sideEffects,
      cycle: execution.data,
    });
  } catch (exception) {
    respondRuntimeFailure(res, exception);
  }
});

export default router;

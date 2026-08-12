import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const query = vi.fn();
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  return {
    query,
    release,
    connect,
    pool: { connect, totalCount: 1, idleCount: 1, waitingCount: 0 },
  };
});

vi.mock("@workspace/db", () => ({ pool: dbMocks.pool }));

import {
  APOLLOS_CONTROL_PLANE_MCP_TOOLS,
  executeApollosControlPlaneMcpTool,
  isApollosControlPlaneMcpToolName,
} from "./apollos-control-plane-mcp.js";
import { ApollosClientMcpJsonRpcHandler } from "./apollos-client-mcp-handler.js";

const originalEnv = { ...process.env };

describe("Apollos control-plane MCP registry", () => {
  beforeEach(() => {
    process.env.APOLLOS_ADMIN_USER_IDS = "clerk-admin";
    dbMocks.query.mockReset();
    dbMocks.release.mockReset();
    dbMocks.connect.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("keeps every registered control-plane tool read-only and OAuth-protected", () => {
    expect(APOLLOS_CONTROL_PLANE_MCP_TOOLS.map((item) => item.name)).toEqual([
      "apollos_github_get_control_plane",
      "apollos_coolify_get_control_plane",
      "apollos_clerk_get_instance_diagnostics",
      "apollos_postgres_get_health",
      "apollos_get_runtime_readiness",
      "apollos_get_system_diagnostic",
      "apollos_get_system_repair_proposal",
    ]);
    for (const tool of APOLLOS_CONTROL_PLANE_MCP_TOOLS) {
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
      expect(tool.securitySchemes).toBeTruthy();
      expect(isApollosControlPlaneMcpToolName(tool.name)).toBe(true);
    }
    expect(isApollosControlPlaneMcpToolName("apollos_execute_safe_action")).toBe(false);
  });

  it("rejects unexpected arguments before executing a control-plane tool", async () => {
    await expect(executeApollosControlPlaneMcpTool({
      toolName: "apollos_postgres_get_health",
      arguments: { sql: "select * from clients" },
      actorUserId: "clerk-admin",
      actorReference: "chatgpt-admin",
    })).rejects.toThrow("APOLLOS_MCP_ARGUMENTS_INVALID");
    expect(dbMocks.connect).not.toHaveBeenCalled();
  });

  it("exposes Postgres health and runtime readiness through the main MCP tool list", async () => {
    const response = await new ApollosClientMcpJsonRpcHandler().handle({
      context: { userId: "clerk-admin", actorReference: "chatgpt-admin" },
      message: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    const tools = (response.body as any).result.tools;
    const postgres = tools.find((item: any) => item.name === "apollos_postgres_get_health");
    const readiness = tools.find((item: any) => item.name === "apollos_get_runtime_readiness");
    expect(postgres).toBeTruthy();
    expect(postgres.annotations.readOnlyHint).toBe(true);
    expect(readiness).toBeTruthy();
    expect(readiness.annotations.readOnlyHint).toBe(true);
  });

  it("keeps non-admin Postgres access fail-closed before database activity", async () => {
    const response = await new ApollosClientMcpJsonRpcHandler().handle({
      context: { userId: "not-admin", actorReference: "chatgpt-user" },
      message: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "apollos_postgres_get_health", arguments: {} },
      },
    });
    expect(response.body).toMatchObject({
      result: {
        isError: true,
        _meta: { reason: "APOLLOS_MCP_POSTGRES_ADMIN_REQUIRED" },
      },
    });
    expect(dbMocks.connect).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from "vitest";

import { ApollosClientMcpJsonRpcHandler } from "./apollos-client-mcp-handler";
import {
  APOLLOS_COMPETITIVE_EDGE_MCP_TOOL,
  executeApollosCompetitiveEdgeMcpTool,
  isApollosCompetitiveEdgeMcpToolName,
} from "./competitive-edge-mcp";

const context = Object.freeze({
  userId: "user_test",
  actorReference: "clerk-oauth:user_test",
});

describe("Competitive Edge MCP", () => {
  it("registers one read-only, closed-world tool", () => {
    expect(APOLLOS_COMPETITIVE_EDGE_MCP_TOOL.name).toBe("apollos_get_competitive_edge");
    expect(APOLLOS_COMPETITIVE_EDGE_MCP_TOOL.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(APOLLOS_COMPETITIVE_EDGE_MCP_TOOL.inputSchema.additionalProperties).toBe(false);
    expect(isApollosCompetitiveEdgeMcpToolName("apollos_get_competitive_edge")).toBe(true);
    expect(isApollosCompetitiveEdgeMcpToolName("apollos_set_competitive_edge")).toBe(false);
  });

  it("appears in the authenticated Apollos MCP tools list", async () => {
    const handler = new ApollosClientMcpJsonRpcHandler();
    const response = await handler.handle({
      context,
      message: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
    });

    expect(response.status).toBe(200);
    const body = response.body as { result?: { tools?: Array<{ name?: string }> } };
    expect(body.result?.tools?.some((tool) => tool.name === "apollos_get_competitive_edge")).toBe(true);
  });

  it("rejects arbitrary input fields before tenant resolution", async () => {
    await expect(executeApollosCompetitiveEdgeMcpTool({
      arguments: { clientId: "client-bbb", competitorDomain: "untrusted.example" },
      actorUserId: context.userId,
      actorReference: context.actorReference,
    })).rejects.toThrow("APOLLOS_MCP_ARGUMENTS_INVALID");
  });

  it("rejects malformed client ids before tenant resolution", async () => {
    await expect(executeApollosCompetitiveEdgeMcpTool({
      arguments: { clientId: "   " },
      actorUserId: context.userId,
      actorReference: context.actorReference,
    })).rejects.toThrow("APOLLOS_MCP_CLIENT_ID_INVALID");
  });

  it("requires an authenticated actor identity", async () => {
    await expect(executeApollosCompetitiveEdgeMcpTool({
      arguments: {},
      actorUserId: "",
      actorReference: context.actorReference,
    })).rejects.toThrow("APOLLOS_MCP_IDENTITY_REQUIRED");
  });
});

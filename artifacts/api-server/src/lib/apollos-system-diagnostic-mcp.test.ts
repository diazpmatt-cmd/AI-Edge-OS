import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApollosClientMcpJsonRpcHandler } from "./apollos-client-mcp-handler.js";

const originalEnv = { ...process.env };

const adminContext = { userId: "clerk-admin", actorReference: "chatgpt-admin" } as const;

describe("Apollos system diagnostic MCP surface", () => {
  beforeEach(() => {
    process.env.APOLLOS_ADMIN_USER_IDS = "clerk-admin";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("publishes the synthesized diagnostic as a read-only OAuth-protected tool", async () => {
    const response = await new ApollosClientMcpJsonRpcHandler().handle({
      context: adminContext,
      message: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    const tools = (response.body as any).result.tools;
    const tool = tools.find((candidate: any) => candidate.name === "apollos_get_system_diagnostic");
    expect(tool).toBeTruthy();
    expect(tool.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });
    expect(tool.securitySchemes).toBeTruthy();
  });

  it("fails closed before provider reads for a non-admin caller", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await new ApollosClientMcpJsonRpcHandler().handle({
      context: { userId: "not-admin", actorReference: "chatgpt-user" },
      message: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "apollos_get_system_diagnostic", arguments: {} },
      },
    });
    expect(response.body).toMatchObject({
      result: {
        isError: true,
        _meta: { reason: "APOLLOS_MCP_SYSTEM_DIAGNOSTIC_ADMIN_REQUIRED" },
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unexpected diagnostic arguments before provider reads", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await new ApollosClientMcpJsonRpcHandler().handle({
      context: adminContext,
      message: {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "apollos_get_system_diagnostic", arguments: { unsafe: true } },
      },
    });
    expect(response.body).toMatchObject({
      result: { isError: true, _meta: { reason: "APOLLOS_MCP_ARGUMENTS_INVALID" } },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

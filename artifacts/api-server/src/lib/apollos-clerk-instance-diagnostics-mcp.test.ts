import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApollosClientMcpJsonRpcHandler } from "./apollos-client-mcp-handler.js";

const originalEnv = { ...process.env };

describe("Apollos Clerk instance diagnostics MCP surface", () => {
  beforeEach(() => {
    process.env.APOLLOS_ADMIN_USER_IDS = "clerk-admin";
    process.env.CLERK_SECRET_KEY = "clerk-secret";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("publishes the Clerk instance diagnostic as read-only and OAuth-protected", async () => {
    const response = await new ApollosClientMcpJsonRpcHandler().handle({
      context: { userId: "clerk-admin", actorReference: "chatgpt-admin" },
      message: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    const tools = (response.body as any).result.tools;
    const tool = tools.find((candidate: any) => candidate.name === "apollos_clerk_get_instance_diagnostics");
    expect(tool).toBeTruthy();
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(tool.securitySchemes).toBeTruthy();
  });

  it("fails closed for a non-admin before contacting Clerk", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await new ApollosClientMcpJsonRpcHandler().handle({
      context: { userId: "not-admin", actorReference: "chatgpt-user" },
      message: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "apollos_clerk_get_instance_diagnostics", arguments: {} },
      },
    });
    expect(response.body).toMatchObject({
      result: { isError: true, _meta: { reason: "APOLLOS_MCP_CLERK_ADMIN_REQUIRED" } },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unexpected arguments before contacting Clerk", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await new ApollosClientMcpJsonRpcHandler().handle({
      context: { userId: "clerk-admin", actorReference: "chatgpt-admin" },
      message: {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "apollos_clerk_get_instance_diagnostics", arguments: { includeSecrets: true } },
      },
    });
    expect(response.body).toMatchObject({
      result: { isError: true, _meta: { reason: "APOLLOS_MCP_ARGUMENTS_INVALID" } },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

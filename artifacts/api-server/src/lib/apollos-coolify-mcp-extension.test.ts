import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApollosClientMcpJsonRpcHandler } from "./apollos-client-mcp-handler.js";

const originalEnv = { ...process.env };
const adminContext = { userId: "clerk-admin", actorReference: "chatgpt-admin" } as const;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Apollos Coolify MCP control-plane extension", () => {
  beforeEach(() => {
    process.env.APOLLOS_ADMIN_USER_IDS = "clerk-admin";
    process.env.APOLLOS_COOLIFY_READ_TOKEN = "coolify-read-token";
    process.env.APOLLOS_COOLIFY_BASE_URL = "https://coolify.example.com";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("publishes the Coolify tool as read-only and OAuth-protected", async () => {
    const response = await new ApollosClientMcpJsonRpcHandler().handle({
      context: adminContext,
      message: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    const tools = (response.body as any).result.tools;
    const tool = tools.find((candidate: any) => candidate.name === "apollos_coolify_get_control_plane");
    expect(tool).toBeTruthy();
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(tool.securitySchemes).toBeTruthy();
  });

  it("returns a sanitized Coolify snapshot without client resolution or side effects", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/applications")) return json([{ uuid: "app-1", name: "AI Edge OS", status: "running:healthy" }]);
      if (url.endsWith("/servers")) return json([{ uuid: "server-1", name: "Production", settings: { is_reachable: true, is_usable: true } }]);
      if (url.endsWith("/databases")) return json([{ uuid: "db-1", name: "postgres", status: "running:healthy", type: "postgresql" }]);
      if (url.endsWith("/deployments")) return json([]);
      return json({ message: "not found" }, 404);
    }));

    const response = await new ApollosClientMcpJsonRpcHandler().handle({
      context: adminContext,
      message: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "apollos_coolify_get_control_plane", arguments: {} },
      },
    });

    expect(response.body).toMatchObject({
      result: {
        structuredContent: {
          tool: "apollos_coolify_get_control_plane",
          actorReference: "chatgpt-admin",
          clientId: null,
          sideEffects: false,
          data: {
            applications: [{ uuid: "app-1", status: "running:healthy" }],
            servers: [{ uuid: "server-1", settings: { isReachable: true, isUsable: true } }],
            databases: [{ uuid: "db-1", type: "postgresql" }],
          },
        },
        isError: false,
      },
    });
    expect(JSON.stringify(response.body)).not.toContain("coolify-read-token");
  });

  it("fails closed for a non-admin caller before contacting Coolify", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await new ApollosClientMcpJsonRpcHandler().handle({
      context: { userId: "not-admin", actorReference: "chatgpt-user" },
      message: {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "apollos_coolify_get_control_plane", arguments: {} },
      },
    });
    expect(response.body).toMatchObject({
      result: { isError: true, _meta: { reason: "APOLLOS_MCP_COOLIFY_ADMIN_REQUIRED" } },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

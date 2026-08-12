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

function githubFetch(headSha: string) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/repos/diazpmatt-cmd/AI-Edge-OS")) {
      return json({
        full_name: "diazpmatt-cmd/AI-Edge-OS",
        default_branch: "main",
        private: true,
        archived: false,
        disabled: false,
      });
    }
    if (url.includes("/commits?sha=main")) {
      return json([{
        sha: headSha,
        commit: {
          message: "GitHub control plane",
          author: { name: "AI Edge", date: "2026-08-12T00:00:00Z" },
          committer: { date: "2026-08-12T00:00:01Z" },
        },
      }]);
    }
    if (url.includes("/pulls?state=open")) return json([]);
    if (url.endsWith(`/commits/${headSha}/status`)) return json({ state: "success", statuses: [] });
    if (url.includes("/actions/runs?branch=main")) return json({ workflow_runs: [] });
    return json({ message: "not found" }, 404);
  });
}

describe("Apollos GitHub MCP control-plane extension", () => {
  beforeEach(() => {
    process.env.APOLLOS_ADMIN_USER_IDS = "clerk-admin";
    process.env.APOLLOS_GITHUB_READ_TOKEN = "read-only-token";
    process.env.APOLLOS_GITHUB_REPOSITORY = "diazpmatt-cmd/AI-Edge-OS";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("publishes the GitHub tool as read-only and OAuth-protected", async () => {
    const response = await new ApollosClientMcpJsonRpcHandler().handle({
      context: adminContext,
      message: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    const tools = (response.body as any).result.tools;
    const tool = tools.find((candidate: any) => candidate.name === "apollos_github_get_control_plane");
    expect(tool).toBeTruthy();
    expect(tool.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });
    expect(tool.securitySchemes).toBeTruthy();
  });

  it("executes a sanitized GitHub snapshot without tenant resolution or side effects", async () => {
    const headSha = "a".repeat(40);
    vi.stubGlobal("fetch", githubFetch(headSha));
    const response = await new ApollosClientMcpJsonRpcHandler().handle({
      context: adminContext,
      message: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "apollos_github_get_control_plane", arguments: {} },
      },
    });
    expect(response.body).toMatchObject({
      result: {
        structuredContent: {
          tool: "apollos_github_get_control_plane",
          actorReference: "chatgpt-admin",
          clientId: null,
          sideEffects: false,
          data: {
            repository: { fullName: "diazpmatt-cmd/AI-Edge-OS", defaultBranch: "main" },
            head: { sha: headSha },
          },
        },
        isError: false,
      },
    });
    expect(JSON.stringify(response.body)).not.toContain("read-only-token");
  });

  it("fails closed for a non-admin caller", async () => {
    const fetchMock = githubFetch("a".repeat(40));
    vi.stubGlobal("fetch", fetchMock);
    const response = await new ApollosClientMcpJsonRpcHandler().handle({
      context: { userId: "not-admin", actorReference: "chatgpt-user" },
      message: {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "apollos_github_get_control_plane", arguments: {} },
      },
    });
    expect(response.body).toMatchObject({
      result: {
        isError: true,
        _meta: { reason: "APOLLOS_MCP_GITHUB_ADMIN_REQUIRED" },
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

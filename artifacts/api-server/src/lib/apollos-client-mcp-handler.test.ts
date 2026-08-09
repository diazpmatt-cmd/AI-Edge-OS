import { describe, expect, it } from "vitest";

import {
  buildApollosActivationPlan,
  buildApollosClientCoverage,
} from "./apollos-client-orchestrator";
import { ApollosClientMcpRuntime } from "./apollos-client-mcp";
import { ApollosClientMcpJsonRpcHandler } from "./apollos-client-mcp-handler";
import type { ApollosLiveCoverageSuccess } from "./apollos-client-coverage-live";

function liveClient(): ApollosLiveCoverageSuccess {
  const coverage = buildApollosClientCoverage({
    client: { id: "client-bbb", name: "Bed Bugs & Beyond", industry: "pest_control" },
    evidence: { activeFeatures: ["discovery_engine"] },
  });
  return {
    ok: true,
    context: {
      clientId: "client-bbb",
      clientName: "Bed Bugs & Beyond",
      industry: "pest_control",
      industryLabel: "Pest Control",
      region: "Baldwin County",
      serviceAreas: ["Foley"],
      configuredPlatforms: [],
      approvalMode: "approval_required",
      frequency: "weekly",
      serviceNames: ["Bed Bug Treatment", "Fumigation"],
    },
    evidence: { activeFeatures: ["discovery_engine"] },
    coverage,
    activationPlan: buildApollosActivationPlan(coverage),
  };
}

const context = { userId: "clerk-matt", actorReference: "chatgpt-matt" } as const;

const target = {
  clientId: "client-bbb",
  ownerUserId: "clerk-bbb-owner",
  slug: "bed-bugs-and-beyond",
  clientName: "Bed Bugs & Beyond",
  industry: "pest_control",
  industryLabel: "Pest Control",
  region: "Baldwin County",
  accessLevel: "operator" as const,
  ownership: "delegated" as const,
};

function handler(): ApollosClientMcpJsonRpcHandler {
  return new ApollosClientMcpJsonRpcHandler(
    new ApollosClientMcpRuntime(
      async () => liveClient(),
      async () => [{
        clientId: target.clientId,
        slug: target.slug,
        clientName: target.clientName,
        industry: target.industry,
        industryLabel: target.industryLabel,
        region: target.region,
        accessLevel: target.accessLevel,
        ownership: target.ownership,
      }],
      async (_actorUserId, requestedClientId) => requestedClientId && requestedClientId !== target.clientId
        ? { ok: false, reason: "unauthorized" }
        : { ok: true, target },
    ),
  );
}

describe("ApollosClientMcpJsonRpcHandler", () => {
  it("negotiates the MCP protocol and bounded server identity", async () => {
    const response = await handler().handle({
      context,
      message: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-03-26",
        serverInfo: { name: "ai-edge-apollos-client" },
      },
    });
  });

  it("lists only the tenant-bound Apollos client tools", async () => {
    const response = await handler().handle({
      context,
      message: { jsonrpc: "2.0", id: 2, method: "tools/list" },
    });
    const tools = (response.body as any).result.tools;
    expect(tools.map((tool: any) => tool.name)).toContain("apollos_list_clients");
    expect(tools.map((tool: any) => tool.name)).toContain("apollos_get_full_utilization");
    expect(tools.map((tool: any) => tool.name)).not.toContain("get_task");
  });

  it("executes the full-utilization mission for an authorized selected client", async () => {
    const response = await handler().handle({
      context,
      message: {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "apollos_get_full_utilization",
          arguments: { clientId: "client-bbb" },
        },
      },
    });
    expect(response.body).toMatchObject({
      result: {
        structuredContent: {
          tool: "apollos_get_full_utilization",
          actorReference: "chatgpt-matt",
          clientId: "client-bbb",
          sideEffects: false,
        },
        isError: false,
      },
    });
  });

  it("returns a bounded MCP error for an unauthorized client selection", async () => {
    const response = await handler().handle({
      context,
      message: {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "apollos_get_client_coverage",
          arguments: { clientId: "somebody-else" },
        },
      },
    });
    expect(response.body).toMatchObject({
      result: {
        isError: true,
        _meta: { reason: "APOLLOS_MCP_CLIENT_UNAUTHORIZED" },
      },
    });
  });

  it("accepts initialized notification without a result body", async () => {
    const response = await handler().handle({
      context,
      message: { jsonrpc: "2.0", method: "notifications/initialized" },
    });
    expect(response).toEqual({ status: 202, body: null });
  });

  it("rejects unknown JSON-RPC methods", async () => {
    const response = await handler().handle({
      context,
      message: { jsonrpc: "2.0", id: 5, method: "resources/list" },
    });
    expect(response).toMatchObject({
      status: 400,
      body: { error: { code: -32601, data: { reason: "APOLLOS_MCP_METHOD_NOT_FOUND" } } },
    });
  });
});

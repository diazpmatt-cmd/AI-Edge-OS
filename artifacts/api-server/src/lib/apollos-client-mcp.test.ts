import { describe, expect, it, vi } from "vitest";

import {
  buildApollosActivationPlan,
  buildApollosClientCoverage,
} from "./apollos-client-orchestrator";
import {
  APOLLOS_CLIENT_MCP_TOOLS,
  ApollosClientMcpRuntime,
} from "./apollos-client-mcp";
import type { ApollosLiveCoverageSuccess } from "./apollos-client-coverage-live";

function liveClient(name = "Boatliner Company"): ApollosLiveCoverageSuccess {
  const coverage = buildApollosClientCoverage({
    client: {
      id: "client-boatliner",
      name,
      industry: "marine_services",
    },
    evidence: {
      connectedIntegrations: ["facebook"],
      activeFeatures: ["discovery_engine"],
    },
  });
  return {
    ok: true,
    context: {
      clientId: "client-boatliner",
      clientName: name,
      industry: "marine_services",
      industryLabel: "Marine Services",
      region: "Alabama Gulf Coast",
      serviceAreas: ["Mobile"],
      configuredPlatforms: ["facebook"],
      approvalMode: "approval_required",
      frequency: "weekly",
      serviceNames: ["Boat Liner Installation"],
    },
    evidence: {
      connectedIntegrations: ["facebook"],
      activeFeatures: ["discovery_engine"],
    },
    coverage,
    activationPlan: buildApollosActivationPlan(coverage),
  };
}

const context = {
  userId: "clerk-user-boatliner",
  actorReference: "chatgpt-user-42",
} as const;

describe("ApollosClientMcpRuntime", () => {
  it("publishes the bounded Apollos client tool catalog", () => {
    expect(APOLLOS_CLIENT_MCP_TOOLS.map((tool) => tool.name)).toEqual([
      "apollos_get_client_context",
      "apollos_get_client_coverage",
      "apollos_get_activation_plan",
      "apollos_get_full_utilization",
      "apollos_get_capability_status",
      "apollos_prepare_activation",
    ]);
  });

  it("does not expose clientId as a tool-selected tenant argument", () => {
    for (const tool of APOLLOS_CLIENT_MCP_TOOLS) {
      expect(JSON.stringify(tool.inputSchema)).not.toContain("clientId");
    }
  });

  it("resolves live client state from the authenticated context userId", async () => {
    const builder = vi.fn(async (userId: string) => {
      expect(userId).toBe("clerk-user-boatliner");
      return liveClient();
    });
    const runtime = new ApollosClientMcpRuntime(builder);

    const result = await runtime.execute({
      context,
      toolName: "apollos_get_client_context",
      arguments: {},
    });

    expect(builder).toHaveBeenCalledTimes(1);
    expect(result.actorReference).toBe("chatgpt-user-42");
    expect(result.sideEffects).toBe(false);
    expect(result.data).toMatchObject({ clientName: "Boatliner Company" });
  });

  it("rejects an attempted client override on no-argument tools", async () => {
    const runtime = new ApollosClientMcpRuntime(async () => liveClient());
    await expect(runtime.execute({
      context,
      toolName: "apollos_get_client_coverage",
      arguments: { clientId: "client-bbb" },
    })).rejects.toThrow("APOLLOS_MCP_ARGUMENTS_INVALID");
  });

  it("rejects client override mixed into capability arguments", async () => {
    const runtime = new ApollosClientMcpRuntime(async () => liveClient());
    await expect(runtime.execute({
      context,
      toolName: "apollos_get_capability_status",
      arguments: { capabilityKey: "facebook_social", clientId: "client-bbb" },
    })).rejects.toThrow("APOLLOS_MCP_ARGUMENTS_INVALID");
  });

  it("returns the full-utilization mission through one operator-facing tool", async () => {
    const runtime = new ApollosClientMcpRuntime(async () => liveClient());
    const result = await runtime.execute({
      context,
      toolName: "apollos_get_full_utilization",
      arguments: {},
    });

    expect(result.data).toMatchObject({
      mission: "maximize_ai_edge_utilization",
      clientId: "client-boatliner",
      clientName: "Boatliner Company",
      status: "action_required",
    });
  });

  it("keeps activation preparation side-effect free", async () => {
    const runtime = new ApollosClientMcpRuntime(async () => liveClient());
    const result = await runtime.execute({
      context,
      toolName: "apollos_prepare_activation",
      arguments: { capabilityKey: "facebook_social" },
    });

    expect(result.sideEffects).toBe(false);
    expect(result.data).toMatchObject({
      status: "prepared",
      capabilityKey: "facebook_social",
      sideEffects: false,
      executionStarted: false,
    });
  });

  it("fails closed when the authenticated tenant cannot be resolved", async () => {
    const runtime = new ApollosClientMcpRuntime(async () => ({ ok: false, reason: "not_found" }));
    await expect(runtime.execute({
      context,
      toolName: "apollos_get_full_utilization",
      arguments: {},
    })).rejects.toThrow("APOLLOS_MCP_CLIENT_NOT_FOUND");
  });

  it("requires an authenticated transport identity", async () => {
    const runtime = new ApollosClientMcpRuntime(async () => liveClient());
    await expect(runtime.execute({
      context: { userId: "", actorReference: "" },
      toolName: "apollos_get_client_context",
      arguments: {},
    })).rejects.toThrow("APOLLOS_MCP_IDENTITY_REQUIRED");
  });
});

import { describe, expect, it, vi } from "vitest";

import {
  ApollosClientMcpRuntime,
  type ApollosClientTargetResolver,
} from "./apollos-client-mcp";

const context = Object.freeze({
  userId: "clerk-user-viewer",
  actorReference: "chatgpt-viewer",
});

const viewerTarget = Object.freeze({
  clientId: "client-bbb",
  ownerUserId: "clerk-owner-bbb",
  slug: "bed-bugs-and-beyond",
  clientName: "Bed Bugs & Beyond",
  industry: "pest_control",
  industryLabel: "Pest Control",
  region: "Baldwin County, Alabama",
  accessLevel: "viewer" as const,
  ownership: "delegated" as const,
});

function viewerResolver(): ApollosClientTargetResolver {
  return vi.fn(async (_actorUserId: string, requestedClientId?: string | null) => {
    if (requestedClientId && requestedClientId !== viewerTarget.clientId) {
      return { ok: false as const, reason: "unauthorized" as const };
    }
    return { ok: true as const, target: viewerTarget };
  });
}

function viewerRuntime() {
  const buildLive = vi.fn(async () => {
    throw new Error("VIEWER_WRITE_MUST_NOT_LOAD_CLIENT_STATE");
  });
  const runtime = new ApollosClientMcpRuntime(
    buildLive,
    async () => [],
    viewerResolver(),
  );
  return { runtime, buildLive };
}

describe("Apollos MCP delegated access levels", () => {
  it("blocks viewer delegations from executing a safe action", async () => {
    const { runtime, buildLive } = viewerRuntime();

    await expect(runtime.execute({
      context,
      toolName: "apollos_execute_safe_action",
      arguments: {
        clientId: viewerTarget.clientId,
        capabilityKey: "ai_visibility_monitoring",
      },
    })).rejects.toThrow("APOLLOS_MCP_CLIENT_WRITE_UNAUTHORIZED");

    expect(buildLive).not.toHaveBeenCalled();
  });

  it("blocks viewer delegations from running the full-utilization cycle", async () => {
    const { runtime, buildLive } = viewerRuntime();

    await expect(runtime.execute({
      context,
      toolName: "apollos_run_full_utilization_cycle",
      arguments: { clientId: viewerTarget.clientId },
    })).rejects.toThrow("APOLLOS_MCP_CLIENT_WRITE_UNAUTHORIZED");

    expect(buildLive).not.toHaveBeenCalled();
  });
});

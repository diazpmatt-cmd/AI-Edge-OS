import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  buildApollosActivationPlan,
  buildApollosClientCoverage,
} from "./apollos-client-orchestrator";
import {
  APOLLOS_CLIENT_MCP_TOOLS,
  ApollosClientMcpRuntime,
  type ApollosClientListBuilder,
  type ApollosClientTargetResolver,
} from "./apollos-client-mcp";
import type { ApollosLiveCoverageSuccess } from "./apollos-client-coverage-live";
import {
  ApollosSafeActionExecutor,
  type ApollosAiVisibilityRunner,
} from "./apollos-safe-action-executor";

const referralPilotStatusSource = readFileSync(
  new URL("./apollos-referral-pilot-status.ts", import.meta.url),
  "utf8",
).replace(/\s+/g, " ");
const leadRecoveryReadinessSource = readFileSync(
  new URL("./lead-recovery-readiness.ts", import.meta.url),
  "utf8",
).replace(/\s+/g, " ");

function liveClient(name = "Boatliner Company", clientId = "client-boatliner"): ApollosLiveCoverageSuccess {
  const coverage = buildApollosClientCoverage({
    client: {
      id: clientId,
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
      clientId,
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
  userId: "clerk-user-operator",
  actorReference: "chatgpt-user-42",
} as const;

const target = Object.freeze({
  clientId: "client-boatliner",
  ownerUserId: "clerk-owner-boatliner",
  slug: "boatliner-company",
  clientName: "Boatliner Company",
  industry: "marine_services",
  industryLabel: "Marine Services",
  region: "Alabama Gulf Coast",
  accessLevel: "operator" as const,
  ownership: "delegated" as const,
});

function allowTarget(): ApollosClientTargetResolver {
  return vi.fn(async (_actorUserId: string, requestedClientId?: string | null) => {
    if (requestedClientId && requestedClientId !== target.clientId) {
      return { ok: false as const, reason: "unauthorized" as const };
    }
    return { ok: true as const, target };
  });
}

function listOne(): ApollosClientListBuilder {
  return vi.fn(async () => [{
    clientId: target.clientId,
    slug: target.slug,
    clientName: target.clientName,
    industry: target.industry,
    industryLabel: target.industryLabel,
    region: target.region,
    accessLevel: target.accessLevel,
    ownership: target.ownership,
  }]);
}

function safeExecutor(runner?: ApollosAiVisibilityRunner): ApollosSafeActionExecutor {
  return new ApollosSafeActionExecutor(runner ?? {
    execute: vi.fn(async () => ({
      generatedAt: new Date("2026-08-09T18:00:00.000Z"),
      recommendations: [],
      coverage: [],
      rejected: [],
    })),
  });
}

function runtime(overrides: {
  build?: (ownerUserId: string) => Promise<any>;
  list?: ApollosClientListBuilder;
  resolve?: ApollosClientTargetResolver;
  safe?: ApollosSafeActionExecutor;
} = {}): ApollosClientMcpRuntime {
  return new ApollosClientMcpRuntime(
    overrides.build ?? (async () => liveClient()),
    overrides.list ?? listOne(),
    overrides.resolve ?? allowTarget(),
    overrides.safe ?? safeExecutor(),
  );
}

describe("ApollosClientMcpRuntime", () => {
  it("publishes the bounded Apollos client tool catalog", () => {
    expect(APOLLOS_CLIENT_MCP_TOOLS.map((tool) => tool.name)).toEqual([
      "apollos_list_clients",
      "apollos_get_client_context",
      "apollos_get_client_coverage",
      "apollos_get_activation_plan",
      "apollos_get_full_utilization",
      "apollos_get_capability_status",
      "apollos_prepare_activation",
      "apollos_execute_safe_action",
      "apollos_run_full_utilization_cycle",
      "apollos_get_referral_pilot_status",
      "apollos_get_lead_recovery_readiness",
      "apollos_dispatch_approved_referral_invitation",
      "apollos_clerk_get_oauth_settings",
      "apollos_clerk_list_oauth_applications",
      "apollos_clerk_get_user",
      "apollos_hetzner_get_infrastructure",
    ]);
  });

  it("separates read-only, internal-write, and external Referral dispatch tools", () => {
    const byName = new Map(APOLLOS_CLIENT_MCP_TOOLS.map((tool) => [tool.name, tool]));
    for (const name of [
      "apollos_list_clients",
      "apollos_get_client_context",
      "apollos_get_client_coverage",
      "apollos_get_activation_plan",
      "apollos_get_full_utilization",
      "apollos_get_capability_status",
      "apollos_prepare_activation",
      "apollos_get_referral_pilot_status",
      "apollos_get_lead_recovery_readiness",
      "apollos_clerk_get_oauth_settings",
      "apollos_clerk_list_oauth_applications",
      "apollos_clerk_get_user",
      "apollos_hetzner_get_infrastructure",
    ] as const) {
      expect(byName.get(name)?.annotations.readOnlyHint).toBe(true);
    }
    for (const name of [
      "apollos_execute_safe_action",
      "apollos_run_full_utilization_cycle",
    ] as const) {
      expect(byName.get(name)?.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      });
    }
    expect(byName.get("apollos_dispatch_approved_referral_invitation")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    });
  });

  it("keeps Referral dispatch input bounded to one approved invitation", () => {
    const tool = APOLLOS_CLIENT_MCP_TOOLS.find(
      (candidate) => candidate.name === "apollos_dispatch_approved_referral_invitation",
    );
    expect(tool).toBeDefined();
    const schema = tool!.inputSchema as any;
    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties).sort()).toEqual([
      "clientId",
      "confirmDispatch",
      "idempotencyKey",
      "invitationId",
      "requestedMode",
    ]);
    expect(schema.required).toEqual([
      "invitationId",
      "requestedMode",
      "confirmDispatch",
      "idempotencyKey",
    ]);
    expect(schema.properties.confirmDispatch.const).toBe(true);
    expect(schema.properties.requestedMode.enum).toEqual(["dry_run", "live"]);
  });

  it("keeps the Referral status selector capped, consent-backed, and opaque", () => {
    expect(referralPilotStatusSource).toContain("SELECT ri.id");
    expect(referralPilotStatusSource).toContain("LIMIT 10");
    expect(referralPilotStatusSource).toContain("ri.status = 'approved'");
    expect(referralPilotStatusSource).toContain("ri.delivery_state = 'not_dispatched'");
    expect(referralPilotStatusSource).toContain("ri.consent_source IS NOT NULL");
    expect(referralPilotStatusSource).toContain("ri.consent_at IS NOT NULL");
    expect(referralPilotStatusSource).toContain("rcp.status = 'opted_in'");
    expect(referralPilotStatusSource).toContain("rcp.consent_source IS NOT NULL");
    expect(referralPilotStatusSource).toContain("rcp.consent_at IS NOT NULL");
    expect(referralPilotStatusSource).toContain("rda.requested_mode = 'live'");
    expect(referralPilotStatusSource).toContain("rda.status IN ('dispatching', 'delivered')");
    expect(referralPilotStatusSource).toContain("eligibleInvitationIds");
    expect(referralPilotStatusSource).not.toContain("recipientName:");
    expect(referralPilotStatusSource).not.toContain("recipientDestination:");
    expect(referralPilotStatusSource).not.toContain("initialMessage:");
  });

  it("keeps Lead Recovery readiness sanitized and side-effect free", () => {
    const tool = APOLLOS_CLIENT_MCP_TOOLS.find(
      (candidate) => candidate.name === "apollos_get_lead_recovery_readiness",
    );
    expect(tool?.annotations).toMatchObject({
      readOnlyHint: true,
      openWorldHint: false,
    });
    expect((tool?.inputSchema as any)?.additionalProperties).toBe(false);
    expect(leadRecoveryReadinessSource).toContain("apiKeyConfigured");
    expect(leadRecoveryReadinessSource).toContain("publicKeyConfigured");
    expect(leadRecoveryReadinessSource).toContain("transferSafety");
    expect(leadRecoveryReadinessSource).toContain("duplicateOwnerRisk");
    expect(leadRecoveryReadinessSource).toContain("externalCalls: false");
    expect(leadRecoveryReadinessSource).toContain("sideEffects: false");
    expect(leadRecoveryReadinessSource).not.toContain("apiKey:");
    expect(leadRecoveryReadinessSource).not.toContain("publicKey:");
    expect(leadRecoveryReadinessSource).not.toContain("messagesTable");
    expect(leadRecoveryReadinessSource).not.toContain("callsTable");
  });

  it("rejects arbitrary Referral destination or message input before tenant resolution", async () => {
    const resolve = vi.fn();
    const instance = runtime({ resolve: resolve as ApollosClientTargetResolver });
    await expect(instance.execute({
      context,
      toolName: "apollos_dispatch_approved_referral_invitation",
      arguments: {
        invitationId: "11111111-1111-4111-8111-111111111111",
        requestedMode: "live",
        confirmDispatch: true,
        idempotencyKey: "pilot:test-0001",
        destination: "+12515550101",
      },
    })).rejects.toThrow("APOLLOS_MCP_ARGUMENTS_INVALID");
    expect(resolve).not.toHaveBeenCalled();
  });

  it("rejects viewer Referral dispatch before live coverage or delivery execution", async () => {
    const build = vi.fn();
    const resolve: ApollosClientTargetResolver = vi.fn(async () => ({
      ok: true as const,
      target: Object.freeze({ ...target, accessLevel: "viewer" as const }),
    }));
    const instance = runtime({ build, resolve });
    await expect(instance.execute({
      context,
      toolName: "apollos_dispatch_approved_referral_invitation",
      arguments: {
        clientId: target.clientId,
        invitationId: "11111111-1111-4111-8111-111111111111",
        requestedMode: "live",
        confirmDispatch: true,
        idempotencyKey: "pilot:test-0002",
      },
    })).rejects.toThrow("APOLLOS_MCP_CLIENT_WRITE_UNAUTHORIZED");
    expect(build).not.toHaveBeenCalled();
  });

  it("keeps client selection server-authorized instead of authoritative from tool arguments", async () => {
    const resolve = allowTarget();
    const instance = runtime({ resolve });

    const result = await instance.execute({
      context,
      toolName: "apollos_get_client_coverage",
      arguments: { clientId: "client-boatliner" },
    });

    expect(resolve).toHaveBeenCalledWith("clerk-user-operator", "client-boatliner");
    expect(result.clientId).toBe("client-boatliner");
  });

  it("lists only the actor's safe authorized-client view", async () => {
    const instance = runtime();
    const result = await instance.execute({
      context,
      toolName: "apollos_list_clients",
      arguments: {},
    });

    expect(result.clientId).toBeNull();
    expect(result.data).toEqual({ clients: [{
      clientId: "client-boatliner",
      slug: "boatliner-company",
      clientName: "Boatliner Company",
      industry: "marine_services",
      industryLabel: "Marine Services",
      region: "Alabama Gulf Coast",
      accessLevel: "operator",
      ownership: "delegated",
    }] });
    expect(JSON.stringify(result.data)).not.toContain("ownerUserId");
  });

  it("builds live state using the authorized target owner's canonical userId", async () => {
    const build = vi.fn(async (ownerUserId: string) => {
      expect(ownerUserId).toBe("clerk-owner-boatliner");
      return liveClient();
    });
    const instance = runtime({ build });

    const result = await instance.execute({
      context,
      toolName: "apollos_get_client_context",
      arguments: { clientId: "client-boatliner" },
    });

    expect(build).toHaveBeenCalledTimes(1);
    expect(result.actorReference).toBe("chatgpt-user-42");
    expect(result.sideEffects).toBe(false);
    expect(result.data).toMatchObject({ clientName: "Boatliner Company" });
  });

  it("fails closed when a client selection is not in the actor's access set", async () => {
    const instance = runtime();
    await expect(instance.execute({
      context,
      toolName: "apollos_get_client_coverage",
      arguments: { clientId: "client-bbb" },
    })).rejects.toThrow("APOLLOS_MCP_CLIENT_UNAUTHORIZED");
  });

  it("fails closed if authorized target resolution and live client resolution disagree", async () => {
    const instance = runtime({ build: async () => liveClient("Wrong Client", "client-other") });
    await expect(instance.execute({
      context,
      toolName: "apollos_get_client_context",
      arguments: { clientId: "client-boatliner" },
    })).rejects.toThrow("APOLLOS_MCP_CLIENT_RESOLUTION_MISMATCH");
  });

  it("returns the full-utilization mission through one operator-facing tool", async () => {
    const result = await runtime().execute({
      context,
      toolName: "apollos_get_full_utilization",
      arguments: { clientId: "client-boatliner" },
    });

    expect(result.data).toMatchObject({
      mission: "maximize_ai_edge_utilization",
      clientId: "client-boatliner",
      clientName: "Boatliner Company",
      status: "action_required",
    });
  });

  it("keeps activation preparation side-effect free", async () => {
    const result = await runtime().execute({
      context,
      toolName: "apollos_prepare_activation",
      arguments: { clientId: "client-boatliner", capabilityKey: "facebook_social" },
    });

    expect(result.sideEffects).toBe(false);
    expect(result.data).toMatchObject({
      status: "prepared",
      capabilityKey: "facebook_social",
      sideEffects: false,
      executionStarted: false,
    });
  });

  it("executes an allowlisted safe action using the authorized target owner's identity", async () => {
    const runner: ApollosAiVisibilityRunner = {
      execute: vi.fn(async () => ({
        generatedAt: new Date("2026-08-09T18:00:00.000Z"),
        recommendations: [{ id: 1 }],
        coverage: [{ id: 1 }, { id: 2 }],
        rejected: [],
      })),
    };
    const result = await runtime({ safe: safeExecutor(runner) }).execute({
      context,
      toolName: "apollos_execute_safe_action",
      arguments: {
        clientId: "client-boatliner",
        capabilityKey: "ai_visibility_monitoring",
      },
    });

    expect(runner.execute).toHaveBeenCalledWith({
      clientId: "client-boatliner",
      userId: "clerk-owner-boatliner",
    });
    expect(result.sideEffects).toBe(true);
    expect(result.data).toMatchObject({
      status: "executed",
      capabilityKey: "ai_visibility_monitoring",
      externalSideEffects: false,
      providerCalls: false,
      spendAuthorized: false,
    });
  });

  it("refuses non-safe execution requests without side effects", async () => {
    const result = await runtime().execute({
      context,
      toolName: "apollos_execute_safe_action",
      arguments: {
        clientId: "client-boatliner",
        capabilityKey: "facebook_social",
      },
    });

    expect(result.sideEffects).toBe(false);
    expect(result.data).toMatchObject({
      status: "execution_not_allowed",
      capabilityKey: "facebook_social",
    });
  });

  it("fails closed when the actor has no authorized client", async () => {
    const instance = runtime({
      resolve: async () => ({ ok: false, reason: "not_found" }),
    });
    await expect(instance.execute({
      context,
      toolName: "apollos_get_full_utilization",
      arguments: {},
    })).rejects.toThrow("APOLLOS_MCP_CLIENT_NOT_FOUND");
  });

  it("requires an explicit selection when an access resolver says the actor has multiple ambiguous clients", async () => {
    const instance = runtime({
      resolve: async () => ({ ok: false, reason: "selection_required" }),
    });
    await expect(instance.execute({
      context,
      toolName: "apollos_get_full_utilization",
      arguments: {},
    })).rejects.toThrow("APOLLOS_MCP_CLIENT_SELECTION_REQUIRED");
  });

  it("requires an authenticated transport identity", async () => {
    await expect(runtime().execute({
      context: { userId: "", actorReference: "" },
      toolName: "apollos_get_client_context",
      arguments: {},
    })).rejects.toThrow("APOLLOS_MCP_IDENTITY_REQUIRED");
  });
});

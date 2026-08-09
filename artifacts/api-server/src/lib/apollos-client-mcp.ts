import { APOLLOS_CAPABILITY_REGISTRY } from "./apollos-client-orchestrator.js";
import { buildApollosClientMissionSummary } from "./apollos-client-mission.js";
import {
  buildApollosLiveCoverageForUser,
  type ApollosLiveCoverageResult,
} from "./apollos-client-coverage-live.js";
import { prepareApollosCapabilityActivation } from "./apollos-client-preparation.js";

export const APOLLOS_CLIENT_MCP_TOOLS = Object.freeze([
  {
    name: "apollos_get_client_context",
    description: "Return the authenticated AI Edge client's safe business context and enabled service registry.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "apollos_get_client_coverage",
    description: "Audit meaningful utilization across all AI Edge capabilities applicable to the authenticated client.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "apollos_get_activation_plan",
    description: "Return the prioritized plan for closing the authenticated client's current AI Edge capability gaps.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "apollos_get_full_utilization",
    description: "Answer the operator mission: make sure this authenticated client is using everything AI Edge currently offers.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "apollos_get_capability_status",
    description: "Return status and recommended action for one AI Edge capability for the authenticated client.",
    inputSchema: {
      type: "object",
      properties: { capabilityKey: { type: "string", minLength: 1, maxLength: 100 } },
      required: ["capabilityKey"],
      additionalProperties: false,
    },
  },
  {
    name: "apollos_prepare_activation",
    description: "Prepare the next activation action and its authorization boundary without causing external side effects.",
    inputSchema: {
      type: "object",
      properties: { capabilityKey: { type: "string", minLength: 1, maxLength: 100 } },
      required: ["capabilityKey"],
      additionalProperties: false,
    },
  },
] as const);

export type ApollosClientMcpToolName = typeof APOLLOS_CLIENT_MCP_TOOLS[number]["name"];

export interface ApollosClientMcpExecutionContext {
  /**
   * This must come from the transport/authentication layer. Tool arguments never
   * select the tenant and are never allowed to override this identity.
   */
  readonly userId: string;
  readonly actorReference: string;
}

export interface ApollosClientMcpResult {
  readonly tool: ApollosClientMcpToolName;
  readonly actorReference: string;
  readonly sideEffects: false;
  readonly data: unknown;
}

export type ApollosLiveCoverageBuilder = (userId: string) => Promise<ApollosLiveCoverageResult>;

function parseCapabilityKey(argumentsValue: unknown): string {
  if (!argumentsValue || typeof argumentsValue !== "object" || Array.isArray(argumentsValue)) {
    throw new Error("APOLLOS_MCP_ARGUMENTS_INVALID");
  }
  const value = (argumentsValue as Record<string, unknown>).capabilityKey;
  if (typeof value !== "string" || !value.trim() || value.trim().length > 100) {
    throw new Error("APOLLOS_MCP_CAPABILITY_KEY_INVALID");
  }
  const keys = Object.keys(argumentsValue as Record<string, unknown>);
  if (keys.some((key) => key !== "capabilityKey")) {
    throw new Error("APOLLOS_MCP_ARGUMENTS_INVALID");
  }
  return value.trim();
}

function assertEmptyArguments(argumentsValue: unknown): void {
  if (argumentsValue === undefined || argumentsValue === null) return;
  if (!argumentsValue || typeof argumentsValue !== "object" || Array.isArray(argumentsValue)) {
    throw new Error("APOLLOS_MCP_ARGUMENTS_INVALID");
  }
  if (Object.keys(argumentsValue as Record<string, unknown>).length !== 0) {
    throw new Error("APOLLOS_MCP_ARGUMENTS_INVALID");
  }
}

function assertToolName(value: unknown): ApollosClientMcpToolName {
  if (typeof value !== "string") throw new Error("APOLLOS_MCP_TOOL_INVALID");
  if (!APOLLOS_CLIENT_MCP_TOOLS.some((tool) => tool.name === value)) {
    throw new Error("APOLLOS_MCP_TOOL_INVALID");
  }
  return value as ApollosClientMcpToolName;
}

export class ApollosClientMcpRuntime {
  constructor(
    private readonly buildLiveCoverage: ApollosLiveCoverageBuilder = buildApollosLiveCoverageForUser,
  ) {}

  listTools(): typeof APOLLOS_CLIENT_MCP_TOOLS {
    return APOLLOS_CLIENT_MCP_TOOLS;
  }

  async execute(input: {
    readonly context: ApollosClientMcpExecutionContext;
    readonly toolName: unknown;
    readonly arguments?: unknown;
  }): Promise<ApollosClientMcpResult> {
    if (!input.context.userId.trim() || !input.context.actorReference.trim()) {
      throw new Error("APOLLOS_MCP_IDENTITY_REQUIRED");
    }

    const tool = assertToolName(input.toolName);
    const needsCapabilityKey = tool === "apollos_get_capability_status" || tool === "apollos_prepare_activation";
    const capabilityKey = needsCapabilityKey ? parseCapabilityKey(input.arguments) : null;
    if (!needsCapabilityKey) assertEmptyArguments(input.arguments);

    const live = await this.buildLiveCoverage(input.context.userId);
    if (!live.ok) {
      throw new Error(`APOLLOS_MCP_CLIENT_${live.reason.toUpperCase()}`);
    }

    let data: unknown;
    switch (tool) {
      case "apollos_get_client_context":
        data = live.context;
        break;
      case "apollos_get_client_coverage":
        data = live.coverage;
        break;
      case "apollos_get_activation_plan":
        data = live.activationPlan;
        break;
      case "apollos_get_full_utilization":
        data = buildApollosClientMissionSummary({
          coverage: live.coverage,
          activationPlan: live.activationPlan,
        });
        break;
      case "apollos_get_capability_status": {
        const current = live.coverage.capabilities.find(
          (candidate) => candidate.capability.key === capabilityKey,
        );
        if (!current) throw new Error("APOLLOS_MCP_CAPABILITY_NOT_FOUND");
        data = current;
        break;
      }
      case "apollos_prepare_activation": {
        const prepared = prepareApollosCapabilityActivation(live, capabilityKey!);
        if (prepared.status === "capability_not_found") {
          throw new Error("APOLLOS_MCP_CAPABILITY_NOT_FOUND");
        }
        data = prepared;
        break;
      }
    }

    return Object.freeze({
      tool,
      actorReference: input.context.actorReference,
      sideEffects: false as const,
      data,
    });
  }
}

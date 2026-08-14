import { resolveAuthorizedApollosClientTarget } from "./apollos-client-access.js";
import {
  APOLLOS_MCP_INTERNAL_WRITE_ANNOTATIONS,
  APOLLOS_MCP_OAUTH_SECURITY_SCHEMES,
} from "./apollos-client-mcp-auth.js";

const CLIENT_ID_PROPERTY = Object.freeze({ type: "string", minLength: 1, maxLength: 100 });
const ACTIONS = Object.freeze([
  "set_continuous_generation",
  "set_automatic_media",
  "pause_content_autopilot",
  "resume_content_autopilot",
] as const);
type Action = typeof ACTIONS[number];

export const APOLLOS_CONTENT_AUTOPILOT_CONTROL_MCP_TOOL = Object.freeze({
  securitySchemes: APOLLOS_MCP_OAUTH_SECURITY_SCHEMES,
  annotations: Object.freeze({
    ...APOLLOS_MCP_INTERNAL_WRITE_ANNOTATIONS,
    idempotentHint: true,
  }),
  name: "apollos_set_content_autopilot_control",
  description: "Change one fixed, reversible Content Autopilot control for an authorized AI Edge client and verify the canonical state afterward. Supports Continuous Generation, Automatic Media, pause, and resume only. Does not approve or publish content, call external providers, change OAuth/accounts, or authorize spend.",
  inputSchema: Object.freeze({
    type: "object",
    properties: Object.freeze({
      clientId: CLIENT_ID_PROPERTY,
      action: Object.freeze({ type: "string", enum: ACTIONS }),
      enabled: Object.freeze({ type: "boolean" }),
    }),
    required: Object.freeze(["action"]),
    additionalProperties: false,
  }),
});

export type ApollosContentAutopilotControlMcpToolName = typeof APOLLOS_CONTENT_AUTOPILOT_CONTROL_MCP_TOOL.name;

export function isApollosContentAutopilotControlMcpToolName(
  value: unknown,
): value is ApollosContentAutopilotControlMcpToolName {
  return value === APOLLOS_CONTENT_AUTOPILOT_CONTROL_MCP_TOOL.name;
}

function parseArguments(value: unknown): {
  readonly clientId: string | null;
  readonly action: Action;
  readonly enabled?: boolean;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("APOLLOS_MCP_ARGUMENTS_INVALID");
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set(["clientId", "action", "enabled"]);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new Error("APOLLOS_MCP_ARGUMENTS_INVALID");
  }

  const rawClientId = record.clientId;
  const clientId = rawClientId === undefined
    ? null
    : typeof rawClientId === "string" && rawClientId.trim() && rawClientId.trim().length <= 100
      ? rawClientId.trim()
      : (() => { throw new Error("APOLLOS_MCP_CLIENT_ID_INVALID"); })();

  const action = typeof record.action === "string" && (ACTIONS as readonly string[]).includes(record.action)
    ? record.action as Action
    : (() => { throw new Error("APOLLOS_MCP_CONTENT_AUTOPILOT_ACTION_INVALID"); })();

  const valueRequired = action === "set_continuous_generation" || action === "set_automatic_media";
  if (valueRequired && typeof record.enabled !== "boolean") {
    throw new Error("APOLLOS_MCP_CONTENT_AUTOPILOT_VALUE_REQUIRED");
  }
  if (!valueRequired && record.enabled !== undefined) {
    throw new Error("APOLLOS_MCP_CONTENT_AUTOPILOT_VALUE_NOT_ALLOWED");
  }

  return Object.freeze({
    clientId,
    action,
    ...(valueRequired ? { enabled: record.enabled as boolean } : {}),
  });
}

export async function executeApollosContentAutopilotControlMcpTool(input: {
  readonly arguments: unknown;
  readonly actorUserId: string;
  readonly actorReference: string;
}) {
  const actorUserId = input.actorUserId.trim();
  const actorReference = input.actorReference.trim();
  if (!actorUserId || !actorReference) throw new Error("APOLLOS_MCP_IDENTITY_REQUIRED");

  const parsed = parseArguments(input.arguments);
  const resolution = await resolveAuthorizedApollosClientTarget(actorUserId, parsed.clientId);
  if (!resolution.ok) {
    throw new Error(`APOLLOS_MCP_CLIENT_${resolution.reason.toUpperCase()}`);
  }
  if (resolution.target.accessLevel === "viewer") {
    throw new Error("APOLLOS_MCP_CLIENT_WRITE_UNAUTHORIZED");
  }

  // Load the DB-backed mutation service only after identity, tenant selection,
  // and write access succeed. This keeps the MCP registry itself lightweight and
  // prevents database mocks in unrelated control-plane tests from being widened.
  const { executeContentAutopilotControl } = await import("./content-autopilot-control-service.js");
  const execution = await executeContentAutopilotControl({
    ownerUserId: resolution.target.ownerUserId,
    expectedClientId: resolution.target.clientId,
    action: parsed.action,
    ...(parsed.enabled === undefined ? {} : { enabled: parsed.enabled }),
  });

  return Object.freeze({
    tool: APOLLOS_CONTENT_AUTOPILOT_CONTROL_MCP_TOOL.name,
    actorReference,
    clientId: resolution.target.clientId,
    sideEffects: execution.changed,
    data: execution,
  });
}

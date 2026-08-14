import { resolveAuthorizedApollosClientTarget } from "./apollos-client-access.js";
import {
  APOLLOS_MCP_OAUTH_SECURITY_SCHEMES,
  APOLLOS_MCP_READ_ONLY_ANNOTATIONS,
} from "./apollos-client-mcp-auth.js";

const CLIENT_ID_PROPERTY = Object.freeze({ type: "string", minLength: 1, maxLength: 100 });

export const APOLLOS_COMPETITIVE_EDGE_MCP_TOOL = Object.freeze({
  securitySchemes: APOLLOS_MCP_OAUTH_SECURITY_SCHEMES,
  annotations: APOLLOS_MCP_READ_ONLY_ANNOTATIONS,
  name: "apollos_get_competitive_edge",
  description: "Return one tenant-safe Competitive Edge snapshot for an authorized AI Edge client, composing persisted competitor, Discovery, Authority, AI Visibility, and trusted Measurement evidence. Read-only; makes no paid provider calls and performs no external action.",
  inputSchema: Object.freeze({
    type: "object",
    properties: Object.freeze({ clientId: CLIENT_ID_PROPERTY }),
    additionalProperties: false,
  }),
});

export type ApollosCompetitiveEdgeMcpToolName = typeof APOLLOS_COMPETITIVE_EDGE_MCP_TOOL.name;

export function isApollosCompetitiveEdgeMcpToolName(value: unknown): value is ApollosCompetitiveEdgeMcpToolName {
  return value === APOLLOS_COMPETITIVE_EDGE_MCP_TOOL.name;
}

function parseOptionalClientId(value: unknown): string | null {
  const input = value ?? {};
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("APOLLOS_MCP_ARGUMENTS_INVALID");
  }
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "clientId")) {
    throw new Error("APOLLOS_MCP_ARGUMENTS_INVALID");
  }
  if (record.clientId === undefined) return null;
  if (typeof record.clientId !== "string" || !record.clientId.trim() || record.clientId.trim().length > 100) {
    throw new Error("APOLLOS_MCP_CLIENT_ID_INVALID");
  }
  return record.clientId.trim();
}

export async function executeApollosCompetitiveEdgeMcpTool(input: {
  readonly arguments: unknown;
  readonly actorUserId: string;
  readonly actorReference: string;
}) {
  const actorUserId = input.actorUserId.trim();
  const actorReference = input.actorReference.trim();
  if (!actorUserId || !actorReference) throw new Error("APOLLOS_MCP_IDENTITY_REQUIRED");

  const requestedClientId = parseOptionalClientId(input.arguments);
  const resolution = await resolveAuthorizedApollosClientTarget(actorUserId, requestedClientId);
  if (!resolution.ok) {
    throw new Error(`APOLLOS_MCP_CLIENT_${resolution.reason.toUpperCase()}`);
  }

  // Keep database-backed Competitive Edge dependencies out of the MCP module's
  // import-time path. Existing control-plane tests deliberately mock @workspace/db;
  // the read model is needed only after identity + tenant authorization succeeds.
  const { buildCompetitiveEdgeReadModel } = await import("./competitive-edge-read-model.js");
  const target = resolution.target;
  const data = await buildCompetitiveEdgeReadModel({
    clientId: target.clientId,
    clientName: target.clientName,
    industry: target.industryLabel || target.industry,
    region: target.region,
  });

  return Object.freeze({
    tool: APOLLOS_COMPETITIVE_EDGE_MCP_TOOL.name,
    actorReference,
    clientId: target.clientId,
    sideEffects: false as const,
    data,
  });
}

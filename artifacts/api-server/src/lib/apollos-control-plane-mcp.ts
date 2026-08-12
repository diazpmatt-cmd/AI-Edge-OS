import { getApollosGitHubControlPlane } from "./apollos-github-readonly.js";
import { getApollosCoolifyControlPlane } from "./apollos-coolify-readonly.js";
import { getApollosClerkInstanceDiagnostics } from "./apollos-clerk-readonly.js";
import { getApollosPostgresHealth } from "./apollos-postgres-readonly.js";
import { getApollosRuntimeReadiness } from "./apollos-runtime-readiness.js";
import { getApollosSystemDiagnostic } from "./apollos-system-diagnostic.js";
import { getApollosSystemRepairProposal } from "./apollos-system-repair-proposal.js";
import {
  APOLLOS_MCP_OAUTH_SECURITY_SCHEMES,
  APOLLOS_MCP_READ_ONLY_ANNOTATIONS,
} from "./apollos-client-mcp-auth.js";

const EMPTY_INPUT_SCHEMA = Object.freeze({
  type: "object",
  properties: Object.freeze({}),
  additionalProperties: false,
});

interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly securitySchemes: typeof APOLLOS_MCP_OAUTH_SECURITY_SCHEMES;
  readonly annotations: typeof APOLLOS_MCP_READ_ONLY_ANNOTATIONS;
  readonly inputSchema: typeof EMPTY_INPUT_SCHEMA;
}

function tool<const TName extends string>(
  name: TName,
  description: string,
): ToolDefinition & { readonly name: TName } {
  return Object.freeze({
    securitySchemes: APOLLOS_MCP_OAUTH_SECURITY_SCHEMES,
    annotations: APOLLOS_MCP_READ_ONLY_ANNOTATIONS,
    name,
    description,
    inputSchema: EMPTY_INPUT_SCHEMA,
  });
}

export const APOLLOS_CONTROL_PLANE_MCP_TOOLS = Object.freeze([
  tool(
    "apollos_github_get_control_plane",
    "Admin-only: inspect sanitized AI Edge OS GitHub repository state, recent commits, open pull requests, commit statuses, and workflow runs. Read-only and never returns credentials.",
  ),
  tool(
    "apollos_coolify_get_control_plane",
    "Admin-only: inspect sanitized Coolify applications, servers, databases, and active deployments. Read-only and never returns credentials, raw compose, or deployment logs.",
  ),
  tool(
    "apollos_clerk_get_instance_diagnostics",
    "Admin-only: inspect sanitized Clerk production instance, Organization settings, Organization count, and the authenticated admin's Organization memberships. Read-only and never returns the Clerk secret key or private metadata.",
  ),
  tool(
    "apollos_postgres_get_health",
    "Admin-only: inspect sanitized PostgreSQL server, connection-pool, transaction, cache, temp-file, and deadlock health without reading customer rows or returning query text or credentials.",
  ),
  tool(
    "apollos_get_runtime_readiness",
    "Admin-only: report which Apollos production control-plane providers and OAuth resource settings are configured, using booleans and a secret-free human setup queue. Makes no provider calls and returns no credential values.",
  ),
  tool(
    "apollos_get_system_diagnostic",
    "Admin-only: synthesize GitHub, Coolify, Hetzner, and Clerk evidence into what is broken, what changed, the highest-impact next action, and what Apollos verified itself. Read-only.",
  ),
  tool(
    "apollos_get_system_repair_proposal",
    "Admin-only: turn the current system diagnostic into an evidence-backed repair proposal using the existing Apollos repair planner, including authority, approval boundary, smallest safe repair, and verification. Does not execute repairs.",
  ),
] as const);

export type ApollosControlPlaneMcpToolName = typeof APOLLOS_CONTROL_PLANE_MCP_TOOLS[number]["name"];

const TOOL_NAMES = new Set<string>(APOLLOS_CONTROL_PLANE_MCP_TOOLS.map((item) => item.name));

export function isApollosControlPlaneMcpToolName(value: unknown): value is ApollosControlPlaneMcpToolName {
  return typeof value === "string" && TOOL_NAMES.has(value);
}

function assertEmptyArguments(value: unknown): void {
  const input = value ?? {};
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("APOLLOS_MCP_ARGUMENTS_INVALID");
  }
  if (Object.keys(input as Record<string, unknown>).length !== 0) {
    throw new Error("APOLLOS_MCP_ARGUMENTS_INVALID");
  }
}

export async function executeApollosControlPlaneMcpTool(input: {
  readonly toolName: ApollosControlPlaneMcpToolName;
  readonly arguments: unknown;
  readonly actorUserId: string;
  readonly actorReference: string;
}): Promise<Readonly<Record<string, unknown>>> {
  assertEmptyArguments(input.arguments);
  const actorUserId = input.actorUserId.trim();
  const actorReference = input.actorReference.trim();
  if (!actorUserId || !actorReference) throw new Error("APOLLOS_MCP_IDENTITY_REQUIRED");

  let data: unknown;
  switch (input.toolName) {
    case "apollos_github_get_control_plane":
      data = await getApollosGitHubControlPlane(actorUserId);
      break;
    case "apollos_coolify_get_control_plane":
      data = await getApollosCoolifyControlPlane(actorUserId);
      break;
    case "apollos_clerk_get_instance_diagnostics":
      data = await getApollosClerkInstanceDiagnostics(actorUserId);
      break;
    case "apollos_postgres_get_health":
      data = await getApollosPostgresHealth(actorUserId);
      break;
    case "apollos_get_runtime_readiness":
      data = getApollosRuntimeReadiness(actorUserId);
      break;
    case "apollos_get_system_diagnostic":
      data = await getApollosSystemDiagnostic(actorUserId);
      break;
    case "apollos_get_system_repair_proposal":
      data = await getApollosSystemRepairProposal(actorUserId);
      break;
    default: {
      const exhaustive: never = input.toolName;
      throw new Error(`APOLLOS_MCP_TOOL_INVALID:${exhaustive}`);
    }
  }

  return Object.freeze({
    tool: input.toolName,
    actorReference,
    clientId: null,
    sideEffects: false,
    data,
  });
}

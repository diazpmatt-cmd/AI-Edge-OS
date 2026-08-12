import {
  ApollosClientMcpRuntime,
  type ApollosClientMcpExecutionContext,
} from "./apollos-client-mcp.js";
import { getApollosGitHubControlPlane } from "./apollos-github-readonly.js";
import { getApollosCoolifyControlPlane } from "./apollos-coolify-readonly.js";
import {
  APOLLOS_MCP_OAUTH_SECURITY_SCHEMES,
  APOLLOS_MCP_READ_ONLY_ANNOTATIONS,
} from "./apollos-client-mcp-auth.js";

interface JsonRpcMessage {
  readonly jsonrpc?: unknown;
  readonly id?: unknown;
  readonly method?: unknown;
  readonly params?: unknown;
}

export interface ApollosClientMcpJsonRpcResponse {
  readonly status: number;
  readonly body: unknown | null;
}

const APOLLOS_GITHUB_CONTROL_PLANE_TOOL = Object.freeze({
  securitySchemes: APOLLOS_MCP_OAUTH_SECURITY_SCHEMES,
  annotations: APOLLOS_MCP_READ_ONLY_ANNOTATIONS,
  name: "apollos_github_get_control_plane",
  description: "Admin-only: inspect sanitized AI Edge OS GitHub repository state, recent commits, open pull requests, commit statuses, and workflow runs. Read-only and never returns credentials.",
  inputSchema: Object.freeze({ type: "object", properties: Object.freeze({}), additionalProperties: false }),
});

const APOLLOS_COOLIFY_CONTROL_PLANE_TOOL = Object.freeze({
  securitySchemes: APOLLOS_MCP_OAUTH_SECURITY_SCHEMES,
  annotations: APOLLOS_MCP_READ_ONLY_ANNOTATIONS,
  name: "apollos_coolify_get_control_plane",
  description: "Admin-only: inspect sanitized Coolify applications, servers, databases, and active deployments. Read-only and never returns credentials, raw compose, or deployment logs.",
  inputSchema: Object.freeze({ type: "object", properties: Object.freeze({}), additionalProperties: false }),
});

function result(id: unknown, payload: unknown): ApollosClientMcpJsonRpcResponse {
  return Object.freeze({
    status: 200,
    body: Object.freeze({ jsonrpc: "2.0", id: id ?? null, result: payload }),
  });
}

function error(id: unknown, code: number, message: string, reason: string, status = 400): ApollosClientMcpJsonRpcResponse {
  return Object.freeze({
    status,
    body: Object.freeze({
      jsonrpc: "2.0",
      id: id ?? null,
      error: Object.freeze({ code, message, data: Object.freeze({ reason }) }),
    }),
  });
}

function parseMessage(value: unknown): JsonRpcMessage | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRpcMessage
    : null;
}

function safeReason(exception: unknown): string {
  const message = exception instanceof Error ? exception.message : "APOLLOS_MCP_REQUEST_REJECTED";
  return /^APOLLOS_MCP_[A-Z0-9_]+$/.test(message)
    ? message
    : "APOLLOS_MCP_REQUEST_REJECTED";
}

function assertEmptyArguments(value: unknown): void {
  const input = value ?? {};
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input as Record<string, unknown>).length !== 0) {
    throw new Error("APOLLOS_MCP_ARGUMENTS_INVALID");
  }
}

function executionResult(id: unknown, execution: unknown): ApollosClientMcpJsonRpcResponse {
  return result(id, Object.freeze({
    structuredContent: execution,
    content: Object.freeze([{ type: "text", text: JSON.stringify(execution) }]),
    isError: false,
  }));
}

export class ApollosClientMcpJsonRpcHandler {
  constructor(private readonly runtime = new ApollosClientMcpRuntime()) {}

  async handle(input: {
    readonly context: ApollosClientMcpExecutionContext;
    readonly message: unknown;
  }): Promise<ApollosClientMcpJsonRpcResponse> {
    const message = parseMessage(input.message);
    if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      return error(null, -32600, "Invalid Request", "APOLLOS_MCP_JSON_RPC_INVALID");
    }

    if (message.method === "notifications/initialized") {
      return Object.freeze({ status: 202, body: null });
    }

    if (message.method === "initialize") {
      return result(message.id, Object.freeze({
        protocolVersion: "2025-03-26",
        capabilities: Object.freeze({ tools: Object.freeze({ listChanged: false }) }),
        serverInfo: Object.freeze({ name: "ai-edge-apollos-client", version: "0.1.0" }),
      }));
    }

    if (message.method === "tools/list") {
      return result(message.id, Object.freeze({
        tools: Object.freeze([
          ...this.runtime.listTools(),
          APOLLOS_GITHUB_CONTROL_PLANE_TOOL,
          APOLLOS_COOLIFY_CONTROL_PLANE_TOOL,
        ]),
      }));
    }

    if (message.method === "tools/call") {
      const params = message.params as { name?: unknown; arguments?: unknown } | null;
      if (!params || typeof params !== "object" || Array.isArray(params)) {
        return error(message.id, -32602, "Invalid params", "APOLLOS_MCP_ARGUMENTS_INVALID");
      }
      try {
        if (params.name === APOLLOS_GITHUB_CONTROL_PLANE_TOOL.name) {
          assertEmptyArguments(params.arguments);
          const actorUserId = input.context.userId.trim();
          const actorReference = input.context.actorReference.trim();
          if (!actorUserId || !actorReference) throw new Error("APOLLOS_MCP_IDENTITY_REQUIRED");
          const data = await getApollosGitHubControlPlane(actorUserId);
          return executionResult(message.id, Object.freeze({
            tool: APOLLOS_GITHUB_CONTROL_PLANE_TOOL.name,
            actorReference,
            clientId: null,
            sideEffects: false,
            data,
          }));
        }

        if (params.name === APOLLOS_COOLIFY_CONTROL_PLANE_TOOL.name) {
          assertEmptyArguments(params.arguments);
          const actorUserId = input.context.userId.trim();
          const actorReference = input.context.actorReference.trim();
          if (!actorUserId || !actorReference) throw new Error("APOLLOS_MCP_IDENTITY_REQUIRED");
          const data = await getApollosCoolifyControlPlane(actorUserId);
          return executionResult(message.id, Object.freeze({
            tool: APOLLOS_COOLIFY_CONTROL_PLANE_TOOL.name,
            actorReference,
            clientId: null,
            sideEffects: false,
            data,
          }));
        }

        const execution = await this.runtime.execute({
          context: input.context,
          toolName: params.name,
          arguments: params.arguments,
        });
        return executionResult(message.id, execution);
      } catch (exception) {
        const reason = safeReason(exception);
        return result(message.id, Object.freeze({
          content: Object.freeze([{ type: "text", text: "Apollos client tool request was rejected." }]),
          _meta: Object.freeze({ reason }),
          isError: true,
        }));
      }
    }

    return error(message.id, -32601, "Method not found", "APOLLOS_MCP_METHOD_NOT_FOUND");
  }
}

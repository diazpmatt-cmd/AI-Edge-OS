import {
  ApollosClientMcpRuntime,
  type ApollosClientMcpExecutionContext,
} from "./apollos-client-mcp.js";

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
      return result(message.id, Object.freeze({ tools: this.runtime.listTools() }));
    }

    if (message.method === "tools/call") {
      const params = message.params as { name?: unknown; arguments?: unknown } | null;
      if (!params || typeof params !== "object" || Array.isArray(params)) {
        return error(message.id, -32602, "Invalid params", "APOLLOS_MCP_ARGUMENTS_INVALID");
      }
      try {
        const execution = await this.runtime.execute({
          context: input.context,
          toolName: params.name,
          arguments: params.arguments,
        });
        return result(message.id, Object.freeze({
          structuredContent: execution,
          content: Object.freeze([{ type: "text", text: JSON.stringify(execution) }]),
          isError: false,
        }));
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

import { describe, expect, it } from "vitest";

import { ApollosClientMcpRuntime } from "./apollos-client-mcp";
import { ApollosClientMcpJsonRpcHandler } from "./apollos-client-mcp-handler";

const context = {
  userId: "clerk-matt",
  actorReference: "chatgpt-matt",
} as const;

describe("weekly publishing health MCP catalog", () => {
  it("advertises the tenant diagnostic as read-only", async () => {
    const runtime = {
      listTools: () => [],
    } as unknown as ApollosClientMcpRuntime;
    const response = await new ApollosClientMcpJsonRpcHandler(runtime).handle({
      context,
      message: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });

    const tools = (response.body as any).result.tools;
    const health = tools.find(
      (tool: any) => tool.name === "apollos_get_weekly_publishing_health",
    );
    expect(health).toBeDefined();
    expect(health.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });
  });
});

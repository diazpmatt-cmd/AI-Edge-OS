import { describe, expect, it } from "vitest";

import { ApollosClientMcpJsonRpcHandler } from "./apollos-client-mcp-handler";
import {
  APOLLOS_CONTENT_AUTOPILOT_CONTROL_MCP_TOOL,
  executeApollosContentAutopilotControlMcpTool,
  isApollosContentAutopilotControlMcpToolName,
} from "./content-autopilot-control-mcp";

const context = Object.freeze({
  userId: "user_test",
  actorReference: "clerk-oauth:user_test",
});

describe("Content Autopilot operator MCP", () => {
  it("registers a bounded idempotent internal-write tool", () => {
    expect(APOLLOS_CONTENT_AUTOPILOT_CONTROL_MCP_TOOL.name)
      .toBe("apollos_set_content_autopilot_control");
    expect(APOLLOS_CONTENT_AUTOPILOT_CONTROL_MCP_TOOL.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(APOLLOS_CONTENT_AUTOPILOT_CONTROL_MCP_TOOL.inputSchema.additionalProperties).toBe(false);
    expect(isApollosContentAutopilotControlMcpToolName("apollos_set_content_autopilot_control")).toBe(true);
    expect(isApollosContentAutopilotControlMcpToolName("apollos_generic_settings_patch")).toBe(false);
  });

  it("appears in the authenticated Apollos tools list", async () => {
    const handler = new ApollosClientMcpJsonRpcHandler();
    const response = await handler.handle({
      context,
      message: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
    });

    expect(response.status).toBe(200);
    const body = response.body as { result?: { tools?: Array<{ name?: string }> } };
    expect(body.result?.tools?.some(
      (tool) => tool.name === "apollos_set_content_autopilot_control",
    )).toBe(true);
  });

  it("rejects arbitrary setting names and payloads before tenant resolution", async () => {
    await expect(executeApollosContentAutopilotControlMcpTool({
      arguments: {
        clientId: "client-bbb",
        action: "set_continuous_generation",
        enabled: true,
        settingName: "approvalMode",
        settingValue: "auto_schedule",
      },
      actorUserId: context.userId,
      actorReference: context.actorReference,
    })).rejects.toThrow("APOLLOS_MCP_ARGUMENTS_INVALID");
  });

  it("rejects unknown actions before tenant resolution", async () => {
    await expect(executeApollosContentAutopilotControlMcpTool({
      arguments: { action: "publish_everything", enabled: true },
      actorUserId: context.userId,
      actorReference: context.actorReference,
    })).rejects.toThrow("APOLLOS_MCP_CONTENT_AUTOPILOT_ACTION_INVALID");
  });

  it("requires a boolean only for set actions", async () => {
    await expect(executeApollosContentAutopilotControlMcpTool({
      arguments: { action: "set_automatic_media" },
      actorUserId: context.userId,
      actorReference: context.actorReference,
    })).rejects.toThrow("APOLLOS_MCP_CONTENT_AUTOPILOT_VALUE_REQUIRED");

    await expect(executeApollosContentAutopilotControlMcpTool({
      arguments: { action: "pause_content_autopilot", enabled: true },
      actorUserId: context.userId,
      actorReference: context.actorReference,
    })).rejects.toThrow("APOLLOS_MCP_CONTENT_AUTOPILOT_VALUE_NOT_ALLOWED");
  });

  it("requires authenticated actor identity", async () => {
    await expect(executeApollosContentAutopilotControlMcpTool({
      arguments: { action: "pause_content_autopilot" },
      actorUserId: "",
      actorReference: context.actorReference,
    })).rejects.toThrow("APOLLOS_MCP_IDENTITY_REQUIRED");
  });
});

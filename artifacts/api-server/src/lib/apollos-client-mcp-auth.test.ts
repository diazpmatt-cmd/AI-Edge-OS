import { describe, expect, it } from "vitest";

import {
  APOLLOS_MCP_OAUTH_SCOPES,
  apollosMcpProtectedResourceMetadataUrl,
  buildApollosMcpProtectedResourceMetadata,
  buildApollosMcpWwwAuthenticate,
  clerkAuthorizationServerFromPublishableKey,
  resolveApollosMcpAuthorizationServer,
  resolveApollosMcpResourceUrl,
} from "./apollos-client-mcp-auth";
import { APOLLOS_CLIENT_MCP_TOOLS } from "./apollos-client-mcp";

function publishableKey(hostname: string): string {
  return `pk_test_${Buffer.from(`${hostname}$`, "utf8").toString("base64")}`;
}

describe("Apollos MCP OAuth contract", () => {
  it("derives Clerk's OAuth authorization-server origin from the publishable key", () => {
    expect(clerkAuthorizationServerFromPublishableKey(
      publishableKey("example.clerk.accounts.dev"),
    )).toBe("https://example.clerk.accounts.dev");
  });

  it("fails closed for malformed Clerk publishable keys", () => {
    expect(clerkAuthorizationServerFromPublishableKey("pk_test_not-valid-base64"))
      .toBeNull();
    expect(clerkAuthorizationServerFromPublishableKey(undefined)).toBeNull();
  });

  it("prefers an explicit authorization-server override when supplied", () => {
    expect(resolveApollosMcpAuthorizationServer({
      configuredAuthorizationServer: "https://clerk.example.com/",
      clerkPublishableKey: publishableKey("ignored.clerk.accounts.dev"),
    })).toBe("https://clerk.example.com");
  });

  it("resolves the public MCP resource from forwarded request data when no override exists", () => {
    expect(resolveApollosMcpResourceUrl({
      protocol: "https",
      host: "mcp.example.com",
    })).toBe("https://mcp.example.com/api/apollos/mcp");
  });

  it("prefers the configured public MCP resource URL for tunnel deployments", () => {
    expect(resolveApollosMcpResourceUrl({
      configuredResourceUrl: "https://tunnel.example.com/mcp",
      protocol: "http",
      host: "api:3000",
    })).toBe("https://tunnel.example.com/mcp");
  });

  it("rejects insecure non-local public resource URLs", () => {
    expect(resolveApollosMcpResourceUrl({
      configuredResourceUrl: "http://public.example.com/mcp",
    })).toBeNull();
  });

  it("builds path-specific RFC 9728 discovery metadata", () => {
    const resourceUrl = "https://mcp.example.com/api/apollos/mcp";
    expect(apollosMcpProtectedResourceMetadataUrl(resourceUrl)).toBe(
      "https://mcp.example.com/.well-known/oauth-protected-resource/api/apollos/mcp",
    );

    expect(buildApollosMcpProtectedResourceMetadata({
      resourceUrl,
      authorizationServer: "https://example.clerk.accounts.dev",
    })).toEqual({
      resource: resourceUrl,
      authorization_servers: ["https://example.clerk.accounts.dev"],
      scopes_supported: APOLLOS_MCP_OAUTH_SCOPES,
      bearer_methods_supported: ["header"],
    });
  });

  it("builds the OAuth challenge that points clients to protected-resource metadata", () => {
    expect(buildApollosMcpWwwAuthenticate("https://mcp.example.com/api/apollos/mcp"))
      .toBe(
        "Bearer realm=\"ai-edge-apollos\", resource_metadata=\"https://mcp.example.com/.well-known/oauth-protected-resource/api/apollos/mcp\"",
      );
  });

  it("requires OAuth on every tool and keeps only the safe executor write-capable", () => {
    for (const tool of APOLLOS_CLIENT_MCP_TOOLS) {
      expect(tool.securitySchemes).toEqual([{ type: "oauth2", scopes: APOLLOS_MCP_OAUTH_SCOPES }]);
      if (tool.name === "apollos_execute_safe_action") {
        expect(tool.annotations).toEqual({
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        });
      } else {
        expect(tool.annotations).toEqual({
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        });
      }
    }
  });
});

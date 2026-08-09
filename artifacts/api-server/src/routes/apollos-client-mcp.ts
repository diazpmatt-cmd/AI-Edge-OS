import { Router, type Request, type Response } from "express";
import { clerkClient } from "@clerk/express";

import { ApollosClientMcpJsonRpcHandler } from "../lib/apollos-client-mcp-handler.js";
import {
  buildApollosMcpProtectedResourceMetadata,
  buildApollosMcpWwwAuthenticate,
  resolveApollosMcpAuthorizationServer,
  resolveApollosMcpResourceUrl,
} from "../lib/apollos-client-mcp-auth.js";
import { getClerkProxyHost } from "../middlewares/clerkProxyMiddleware.js";

export const apollosMcpPublicRouter = Router();
export const apollosMcpAuthenticatedRouter = Router();

const mcpHandler = new ApollosClientMcpJsonRpcHandler();

function firstHeader(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(",")[0]?.trim() || null;
}

function resolveTransportConfiguration(req: Request):
  | { readonly ok: true; readonly resourceUrl: string; readonly authorizationServer: string }
  | { readonly ok: false } {
  const resourceUrl = resolveApollosMcpResourceUrl({
    configuredResourceUrl: process.env.APOLLOS_MCP_RESOURCE_URL,
    protocol: firstHeader(req.headers["x-forwarded-proto"]) ?? req.protocol,
    host: getClerkProxyHost(req),
  });
  const authorizationServer = resolveApollosMcpAuthorizationServer({
    configuredAuthorizationServer: process.env.APOLLOS_MCP_AUTHORIZATION_SERVER,
    clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY,
  });

  if (!resourceUrl || !authorizationServer) return { ok: false };
  return { ok: true, resourceUrl, authorizationServer };
}

function toClerkWebRequest(req: Request): globalThis.Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (typeof value === "string") {
      headers.set(name, value);
    }
  }

  const protocol = firstHeader(req.headers["x-forwarded-proto"]) ?? req.protocol;
  const host = getClerkProxyHost(req) ?? "localhost";
  return new globalThis.Request(`${protocol}://${host}${req.originalUrl || req.url}`, {
    method: req.method,
    headers,
  });
}

function respondTransportUnavailable(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.status(503).json({ error: "APOLLOS_MCP_OAUTH_CONFIGURATION_UNAVAILABLE" });
}

function respondOAuthRequired(res: Response, resourceUrl: string): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("WWW-Authenticate", buildApollosMcpWwwAuthenticate(resourceUrl));
  res.status(401).json({ error: "APOLLOS_MCP_OAUTH_REQUIRED" });
}

function protectedResourceMetadata(req: Request, res: Response): void {
  const configuration = resolveTransportConfiguration(req);
  if (!configuration.ok) {
    respondTransportUnavailable(res);
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(buildApollosMcpProtectedResourceMetadata(configuration));
}

// RFC 9728 path-specific discovery plus root fallback for clients that probe
// the root well-known URI first. These endpoints intentionally remain public.
apollosMcpPublicRouter.get(
  "/.well-known/oauth-protected-resource/api/apollos/mcp",
  protectedResourceMetadata,
);
apollosMcpPublicRouter.get(
  "/.well-known/oauth-protected-resource",
  protectedResourceMetadata,
);

// ChatGPT/other MCP hosts must present a Clerk-issued OAuth access token. The
// token resolves directly to the canonical Clerk userId already used by AI Edge
// tenant access policy; the Secure MCP Tunnel is transport only, never identity.
apollosMcpAuthenticatedRouter.post("/apollos/mcp", async (req: Request, res: Response) => {
  const configuration = resolveTransportConfiguration(req);
  if (!configuration.ok) {
    respondTransportUnavailable(res);
    return;
  }

  let requestState;
  try {
    requestState = await clerkClient.authenticateRequest(toClerkWebRequest(req), {
      acceptsToken: "oauth_token",
    });
  } catch {
    respondOAuthRequired(res, configuration.resourceUrl);
    return;
  }

  if (!requestState.isAuthenticated || requestState.tokenType !== "oauth_token") {
    respondOAuthRequired(res, configuration.resourceUrl);
    return;
  }

  const auth = requestState.toAuth();
  const userId = auth.tokenType === "oauth_token"
    && "userId" in auth
    && typeof auth.userId === "string"
    ? auth.userId.trim()
    : "";
  if (!userId) {
    respondOAuthRequired(res, configuration.resourceUrl);
    return;
  }

  const response = await mcpHandler.handle({
    context: Object.freeze({
      userId,
      actorReference: `clerk-oauth:${userId}`,
    }),
    message: req.body,
  });

  res.setHeader("Cache-Control", "no-store");
  if (response.body === null) {
    res.status(response.status).end();
    return;
  }
  res.status(response.status).json(response.body);
});

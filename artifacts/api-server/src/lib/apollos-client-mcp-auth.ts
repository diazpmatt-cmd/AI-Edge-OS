export const APOLLOS_MCP_OAUTH_SCOPES = Object.freeze([
  "openid",
  "profile",
  "email",
] as const);

export const APOLLOS_MCP_OAUTH_SECURITY_SCHEMES = Object.freeze([
  Object.freeze({
    type: "oauth2" as const,
    scopes: APOLLOS_MCP_OAUTH_SCOPES,
  }),
]);

export const APOLLOS_MCP_READ_ONLY_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

export const APOLLOS_MCP_INTERNAL_WRITE_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
});

function decodeBase64Url(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(normalized, "base64").toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Clerk publishable keys contain the Frontend API hostname as base64 followed
 * by a `$` delimiter. Data after the first delimiter is reserved for Clerk key
 * extensibility and must not become part of the hostname. OAuth authorization-
 * server metadata is hosted on the Frontend API origin.
 */
export function clerkAuthorizationServerFromPublishableKey(
  publishableKey: string | null | undefined,
): string | null {
  const trimmed = publishableKey?.trim();
  if (!trimmed) return null;

  const match = /^pk_(?:test|live)_(.+)$/.exec(trimmed);
  if (!match?.[1]) return null;

  const decoded = decodeBase64Url(match[1]);
  if (!decoded) return null;

  const delimiterIndex = decoded.indexOf("$");
  const hostname = (delimiterIndex >= 0 ? decoded.slice(0, delimiterIndex) : decoded).trim();
  if (!hostname || !/^[a-z0-9.-]+(?::[0-9]+)?$/i.test(hostname)) return null;

  try {
    const url = new URL(`https://${hostname}`);
    return url.origin;
  } catch {
    return null;
  }
}

function isPrivateHttpResourceHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;

  // Docker/Coolify service discovery commonly uses single-label DNS names such
  // as `api`. These are private-network identities, not public web origins.
  if (!host.includes(".")) return true;
  if (host.endsWith(".internal") || host.endsWith(".local")) return true;

  return /^(?:10\.|127\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host);
}

function normalizeResourceUrl(
  value: string | null | undefined,
  options: { readonly allowPrivateHttp?: boolean } = {},
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const privateHttp = url.protocol === "http:"
      && options.allowPrivateHttp === true
      && isPrivateHttpResourceHost(url.hostname);
    if (url.protocol !== "https:" && !privateHttp) return null;
    if (url.username || url.password || url.hash || url.search) return null;
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString().replace(/\/$/, url.pathname === "/" ? "" : "");
  } catch {
    return null;
  }
}

function normalizeAuthorizationServer(value: string | null | undefined): string | null {
  const normalized = normalizeResourceUrl(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (url.pathname !== "/" && url.pathname !== "") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function resolveApollosMcpResourceUrl(input: {
  readonly configuredResourceUrl?: string | null;
  readonly protocol?: string | null;
  readonly host?: string | null;
}): string | null {
  const configured = normalizeResourceUrl(input.configuredResourceUrl, {
    allowPrivateHttp: true,
  });
  if (configured) return configured;

  const protocol = input.protocol?.split(",")[0]?.trim().toLowerCase();
  const host = input.host?.split(",")[0]?.trim();
  if (!protocol || !host) return null;

  return normalizeResourceUrl(`${protocol}://${host}/api/apollos/mcp`, {
    allowPrivateHttp: true,
  });
}

export function resolveApollosMcpAuthorizationServer(input: {
  readonly configuredAuthorizationServer?: string | null;
  readonly clerkPublishableKey?: string | null;
}): string | null {
  const configured = normalizeAuthorizationServer(input.configuredAuthorizationServer);
  if (configured) return configured;
  return clerkAuthorizationServerFromPublishableKey(input.clerkPublishableKey);
}

/** RFC 9728 path-specific protected-resource metadata URI. */
export function apollosMcpProtectedResourceMetadataUrl(resourceUrl: string): string {
  const url = new URL(resourceUrl);
  const suffix = url.pathname === "/" ? "" : url.pathname;
  return `${url.origin}/.well-known/oauth-protected-resource${suffix}`;
}

export function buildApollosMcpProtectedResourceMetadata(input: {
  readonly resourceUrl: string;
  readonly authorizationServer: string;
}) {
  return Object.freeze({
    resource: input.resourceUrl,
    authorization_servers: Object.freeze([input.authorizationServer]),
    scopes_supported: APOLLOS_MCP_OAUTH_SCOPES,
    bearer_methods_supported: Object.freeze(["header"] as const),
  });
}

export function buildApollosMcpWwwAuthenticate(resourceUrl: string): string {
  return `Bearer realm="ai-edge-apollos", resource_metadata="${apollosMcpProtectedResourceMetadataUrl(resourceUrl)}"`;
}

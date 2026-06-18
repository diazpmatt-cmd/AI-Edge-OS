/**
 * Google OAuth preflight: verifies that the redirect_uri the app will send
 * is actually registered as an Authorized Redirect URI on the configured
 * GOOGLE_OAUTH_CLIENT_ID in Google Cloud.
 *
 * Google does not expose an API to list a client's authorized redirect URIs,
 * so we probe the public authorize endpoint and inspect the response:
 *   - If the URI is NOT registered, Google responds with an HTML error page
 *     containing "Error 400: redirect_uri_mismatch".
 *   - If the URI IS registered, Google responds with the account chooser /
 *     consent page (HTTP 200/302, no `redirect_uri_mismatch` marker).
 */

export type GoogleRedirectCheck =
  | { ok: true; redirectUri: string; clientId: string; status: number }
  | {
      ok: false;
      redirectUri: string;
      clientId: string;
      status: number;
      reason: "redirect_uri_mismatch" | "invalid_client" | "unknown_error";
      detail?: string;
    };

export async function checkGoogleRedirectUri(): Promise<GoogleRedirectCheck> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const publicAppUrl = process.env.PUBLIC_APP_URL;
  if (!clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID not configured");
  if (!publicAppUrl) throw new Error("PUBLIC_APP_URL not configured");

  const redirectUri = `${publicAppUrl.replace(/\/$/, "")}/api/oauth/google/callback`;

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("access_type", "online");
  url.searchParams.set("state", "preflight");

  const res = await fetch(url.toString(), {
    method: "GET",
    redirect: "manual",
    headers: {
      // Mimic a real browser so Google returns the HTML error page if applicable.
      "user-agent":
        "Mozilla/5.0 (compatible; LovableOAuthPreflight/1.0)",
      accept: "text/html,application/xhtml+xml",
    },
  });

  const text = res.status >= 200 && res.status < 400 ? await res.text().catch(() => "") : "";
  const lower = text.toLowerCase();

  if (lower.includes("redirect_uri_mismatch") || lower.includes("redirect uri mismatch")) {
    return {
      ok: false,
      redirectUri,
      clientId,
      status: res.status,
      reason: "redirect_uri_mismatch",
      detail:
        `The redirect_uri "${redirectUri}" is not listed under Authorized redirect URIs for OAuth client ${clientId} in Google Cloud Console.`,
    };
  }

  if (lower.includes("invalid_client") || lower.includes("the oauth client was not found")) {
    return {
      ok: false,
      redirectUri,
      clientId,
      status: res.status,
      reason: "invalid_client",
      detail: `Google does not recognize client_id ${clientId}.`,
    };
  }

  // 302 to accounts.google.com sign-in, or 200 with the chooser/consent page,
  // both indicate the client + redirect_uri pair is accepted.
  if (res.status === 302 || (res.status === 200 && !lower.includes("error 400"))) {
    return { ok: true, redirectUri, clientId, status: res.status };
  }

  return {
    ok: false,
    redirectUri,
    clientId,
    status: res.status,
    reason: "unknown_error",
    detail: text.slice(0, 500),
  };
}

let cached: Promise<GoogleRedirectCheck> | null = null;
let cachedAt = 0;
const TTL_MS = 60_000;

export function checkGoogleRedirectUriCached() {
  const now = Date.now();
  if (!cached || now - cachedAt > TTL_MS) {
    cachedAt = now;
    cached = checkGoogleRedirectUri().catch((e) => {
      cached = null;
      throw e;
    });
  }
  return cached;
}

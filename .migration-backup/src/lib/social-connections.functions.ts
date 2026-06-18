import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Google OAuth in this app uses TWO intentionally separate flows:
 *
 *  1. Sign-in (identity)        → /auth page
 *     Uses lovable.auth.signInWithOAuth("google") — the Lovable Cloud
 *     managed broker. Callback is handled by the broker; the app only
 *     receives a Supabase session. No provider refresh_token is exposed.
 *
 *  2. Publishing connection      → /connections page (this file)
 *     Uses a custom OAuth client (GOOGLE_OAUTH_CLIENT_ID /
 *     GOOGLE_OAUTH_CLIENT_SECRET) with access_type=offline + prompt=consent
 *     so we receive a refresh_token. Callback is /api/oauth/google/callback,
 *     which stores tokens in the social_connections table for later use by
 *     publishing/posting server functions.
 *
 * Both flows redirect the user back to a route inside the app, but they
 * use different OAuth clients, different scopes, and different callback
 * URLs. Do not collapse them — sign-in cannot grant publishing tokens, and
 * the publishing flow must not be used to establish a user session.
 */


export const getGoogleOAuthPreflight = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { checkGoogleRedirectUriCached } = await import("./oauth-preflight.server");
    try {
      return await checkGoogleRedirectUriCached();
    } catch (e: any) {
      return {
        ok: false as const,
        redirectUri: "",
        clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
        status: 0,
        reason: "unknown_error" as const,
        detail: e?.message ?? String(e),
      };
    }
  });


export const listConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("social_connections")
      .select("id, provider, account_name, account_id, expires_at, last_error, last_verified_at, provider_metadata")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const disconnectProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { provider: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("social_connections")
      .delete()
      .eq("user_id", context.userId)
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const startGoogleOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID not configured");
    const { signState, GOOGLE_SCOPES } = await import("./oauth-state.server");

    const publicAppUrl = process.env.PUBLIC_APP_URL;
    if (!publicAppUrl) throw new Error("PUBLIC_APP_URL not configured");
    const redirectUri = `${publicAppUrl.replace(/\/$/, "")}/api/oauth/google/callback`;

    // Preflight: confirm this redirect_uri is registered on the Google OAuth client
    // before sending the user to Google (otherwise they hit a generic 403 page).
    const { checkGoogleRedirectUriCached } = await import("./oauth-preflight.server");
    try {
      const pre = await checkGoogleRedirectUriCached();
      if (!pre.ok) {
        console.error("[oauth-preflight] Google redirect_uri check failed", pre);
        throw new Error(
          pre.reason === "redirect_uri_mismatch"
            ? `Google OAuth misconfigured: redirect_uri "${redirectUri}" is not authorized on client ${clientId}. Add it under Google Cloud Console → Credentials → OAuth Client → Authorized redirect URIs.`
            : pre.reason === "invalid_client"
              ? `Google OAuth misconfigured: client_id ${clientId} is not recognized by Google.`
              : `Google OAuth preflight failed (status ${pre.status}). ${pre.detail ?? ""}`.trim(),
        );
      }
    } catch (e: any) {
      // Re-throw mismatch/invalid errors; only swallow network failures so OAuth can still proceed.
      if (/misconfigured|not authorized|not recognized/i.test(e?.message ?? "")) throw e;
      console.warn("[oauth-preflight] check skipped due to error:", e?.message);
    }

    const state = signState({ uid: context.userId, p: "google" });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    // Minimal scope set for basic-connection diagnostic. Re-add access_type=offline
    // and prompt=consent once the basic flow stops 403'ing.
    url.searchParams.set("scope", GOOGLE_SCOPES);
    url.searchParams.set("state", state);

    return { url: url.toString(), redirectUri };
  });

/**
 * Build the simplified Google OAuth URL and probe it server-side with
 * redirect:manual so we can show the user exactly what Google returns
 * (HTTP status, Location header, error/error_description params) without
 * leaving the app. Used by the "Test Google Connect" diagnostic button.
 */
export const testGoogleOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { promptConsent?: boolean; accessTypeOffline?: boolean } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const promptConsent = !!data.promptConsent;
    const accessTypeOffline = !!data.accessTypeOffline;
    const variant =
      `base${accessTypeOffline ? " + access_type=offline" : ""}${promptConsent ? " + prompt=consent" : ""}`;

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? "";
    const publicAppUrl = process.env.PUBLIC_APP_URL ?? "";
    const redirectUri = publicAppUrl
      ? `${publicAppUrl.replace(/\/$/, "")}/api/oauth/google/callback`
      : "";

    if (!clientId || !redirectUri) {
      return {
        ok: false as const,
        variant,
        promptConsent,
        accessTypeOffline,
        clientId,
        redirectUri,
        authUrl: "",
        status: 0,
        location: null,
        error: null,
        errorDescription: null,
        errorSubtype: null,
        bodySnippet: "GOOGLE_OAUTH_CLIENT_ID or PUBLIC_APP_URL not configured.",
      };
    }

    const { signState, GOOGLE_SCOPES } = await import("./oauth-state.server");
    const state = signState({ uid: context.userId, p: "google", t: "test" });

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_SCOPES);
    if (accessTypeOffline) url.searchParams.set("access_type", "offline");
    if (promptConsent) url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);

    const authUrl = url.toString();

    let status = 0;
    let location: string | null = null;
    let error: string | null = null;
    let errorDescription: string | null = null;
    let errorSubtype: string | null = null;
    let bodySnippet = "";

    try {
      const res = await fetch(authUrl, {
        method: "GET",
        redirect: "manual",
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; LovableOAuthTest/1.0)",
          accept: "text/html,application/xhtml+xml",
        },
      });
      status = res.status;
      location = res.headers.get("location");

      if (location) {
        try {
          const locUrl = new URL(location, "https://accounts.google.com");
          error = locUrl.searchParams.get("error");
          errorDescription = locUrl.searchParams.get("error_description");
          errorSubtype = locUrl.searchParams.get("error_subtype");
        } catch {
          /* ignore */
        }
      }

      if (!location || status >= 400) {
        const text = await res.text().catch(() => "");
        bodySnippet = text.slice(0, 800);
        const m = text.match(/error[_ ]?(?:code|subtype)?\s*[:=]\s*([a-z_\- ]+)/i);
        if (m && !error) error = m[1].trim();
      }
    } catch (e: any) {
      bodySnippet = `Fetch failed: ${e?.message ?? String(e)}`;
    }

    const ok = status === 302 && !error;
    return {
      ok,
      variant,
      promptConsent,
      accessTypeOffline,
      clientId,
      redirectUri,
      authUrl,
      status,
      location,
      error,
      errorDescription,
      errorSubtype,
      bodySnippet,
    };
  });

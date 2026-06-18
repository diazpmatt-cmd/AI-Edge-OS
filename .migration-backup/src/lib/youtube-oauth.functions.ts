import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * YouTube OAuth — reuses the same Google OAuth client as Google Business
 * (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET) but with YouTube
 * scopes and a distinct callback URL (/api/oauth/youtube/callback).
 *
 * The YouTube callback URL MUST be added to the Google OAuth client's
 * Authorized redirect URIs in Google Cloud Console.
 */

// Match the working Google Business / Google sign-in flow: openid + email +
// profile, and APPEND youtube.readonly (instead of replacing). Reusing the
// exact same parameter shape as the working Google connect avoids the
// "Google 400 malformed request" the YouTube-specific URL was producing.
export const YOUTUBE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");

function getYouTubeRedirectUri() {
  const publicAppUrl = process.env.PUBLIC_APP_URL;
  if (!publicAppUrl) throw new Error("PUBLIC_APP_URL not configured");
  return `${publicAppUrl.replace(/\/$/, "")}/api/oauth/youtube/callback`;
}

function buildYouTubeAuthUrl(opts: { clientId: string; redirectUri: string; state: string }) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", YOUTUBE_SCOPES);
  url.searchParams.set("state", opts.state);
  // Match the working Google Business flow exactly. No access_type / prompt /
  // include_granted_scopes — those are what triggered Google's malformed-request.
  return url;
}

export const startYouTubeOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID not configured");
    if (!process.env.GOOGLE_OAUTH_CLIENT_SECRET) throw new Error("GOOGLE_OAUTH_CLIENT_SECRET not configured");
    const redirectUri = getYouTubeRedirectUri();

    const { signState } = await import("./oauth-state.server");
    const state = signState({ uid: context.userId, p: "youtube" });

    const url = buildYouTubeAuthUrl({ clientId, redirectUri, state });

    // Log the exact params for side-by-side comparison with the working
    // Google Business Profile flow.
    console.log("[youtube-oauth] start", {
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: url.searchParams.get("response_type"),
      scope: url.searchParams.get("scope"),
      state,
      access_type: url.searchParams.get("access_type"),
      include_granted_scopes: url.searchParams.get("include_granted_scopes"),
      prompt: url.searchParams.get("prompt"),
      fullUrl: url.toString(),
    });

    return {
      url: url.toString(),
      redirectUri,
      state,
      params: {
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: url.searchParams.get("response_type"),
        scope: url.searchParams.get("scope"),
        state,
      },
    };
  });

/**
 * YouTube diagnostic — surfaces config, the exact OAuth URL/scopes, and
 * probes YouTube Data API v3 using the existing Google/YouTube access
 * token to confirm the API is enabled and a channel exists on the account.
 *
 * Important: YouTube cannot silently reuse the Google sign-in token because
 * that token was minted for openid/email/profile only. "Connect YouTube"
 * runs incremental auth (same Google account, additional YouTube scopes).
 */
export const getYouTubeDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? "";
    const clientSecretSet = !!process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const publicAppUrl = process.env.PUBLIC_APP_URL ?? "";
    const redirectUri = publicAppUrl
      ? `${publicAppUrl.replace(/\/$/, "")}/api/oauth/youtube/callback`
      : "";

    let authUrl = "";
    let state = "";
    let stateError: string | null = null;
    if (clientId && redirectUri) {
      try {
        const { signState } = await import("./oauth-state.server");
        state = signState({ uid: context.userId, p: "youtube" });
        const u = buildYouTubeAuthUrl({ clientId, redirectUri, state });
        authUrl = u.toString();
      } catch (e: any) {
        stateError = e?.message ?? "failed_to_sign_state";
      }
    }

    const { data: rows } = await context.supabase
      .from("social_connections")
      .select("provider, account_name, access_token, scope, expires_at")
      .eq("user_id", context.userId)
      .in("provider", ["google", "youtube"]);

    const googleConn = rows?.find((r: any) => r.provider === "google") ?? null;
    const youtubeConn = rows?.find((r: any) => r.provider === "youtube") ?? null;

    const grantedOnGoogle: string[] = googleConn?.scope
      ? String(googleConn.scope).split(/\s+/).filter(Boolean)
      : [];
    const hasYouTubeReadonly = grantedOnGoogle.includes("https://www.googleapis.com/auth/youtube.readonly");
    const hasYouTubeUpload = grantedOnGoogle.includes("https://www.googleapis.com/auth/youtube.upload");

    const tokenSource: "youtube" | "google" | null = youtubeConn?.access_token
      ? "youtube"
      : googleConn?.access_token
        ? "google"
        : null;
    const token = tokenSource === "youtube" ? youtubeConn?.access_token : googleConn?.access_token;

    type Probe = {
      attempted: boolean;
      usedToken: "google" | "youtube" | null;
      status: number;
      ok: boolean;
      channelId: string | null;
      channelTitle: string | null;
      error: string | null;
      errorReason: string | null;
      rawSnippet: string;
    };
    const probe: Probe = {
      attempted: false,
      usedToken: null,
      status: 0,
      ok: false,
      channelId: null,
      channelTitle: null,
      error: null,
      errorReason: null,
      rawSnippet: "",
    };

    if (token && tokenSource) {
      probe.attempted = true;
      probe.usedToken = tokenSource;
      try {
        const res = await fetch(
          "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
          { headers: { Authorization: `Bearer ${token}` } },
        );
        probe.status = res.status;
        const text = await res.text();
        probe.rawSnippet = text.slice(0, 600);
        if (res.ok) {
          try {
            const json = JSON.parse(text);
            const item = json.items?.[0];
            probe.ok = true;
            probe.channelId = item?.id ?? null;
            probe.channelTitle = item?.snippet?.title ?? null;
            if (!item) probe.error = "no_channel_on_account";
          } catch (e: any) {
            probe.error = "parse_error";
            probe.errorReason = e?.message ?? null;
          }
        } else {
          try {
            const json = JSON.parse(text);
            probe.error = json?.error?.message ?? `http_${res.status}`;
            probe.errorReason = json?.error?.errors?.[0]?.reason ?? null;
          } catch {
            probe.error = `http_${res.status}`;
          }
        }
      } catch (e: any) {
        probe.error = "fetch_failed";
        probe.errorReason = e?.message ?? null;
      }
    }

    return {
      config: {
        clientId,
        clientSecretSet,
        redirectUri,
        scopes: YOUTUBE_SCOPES.split(" "),
        state,
        stateError,
        authUrlUsesRealSignedState: !!state,
        publicAppUrlSet: !!publicAppUrl,
      },
      authUrlPreview: authUrl,
      reusesGoogleClient: true,
      note: "YouTube reuses the SAME Google OAuth client (GOOGLE_OAUTH_CLIENT_ID/SECRET), but a separate consent is required because the existing Google sign-in token was minted with only openid/email/profile scopes. 'Connect YouTube' is an incremental-auth flow on the same Google account.",
      googleConnection: googleConn
        ? {
            accountName: googleConn.account_name,
            scope: googleConn.scope,
            grantedScopes: grantedOnGoogle,
            hasYouTubeReadonly,
            hasYouTubeUpload,
            expiresAt: googleConn.expires_at,
          }
        : null,
      youtubeConnection: youtubeConn
        ? {
            accountName: youtubeConn.account_name,
            scope: youtubeConn.scope,
            expiresAt: youtubeConn.expires_at,
          }
        : null,
      probe,
      lastCallback: await (async () => {
        const { getYouTubeCallbackTrace } = await import("./youtube-callback-trace.server");
        return getYouTubeCallbackTrace(context.userId);
      })(),
    };
  });


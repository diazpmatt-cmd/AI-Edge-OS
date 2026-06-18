import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * TikTok OAuth (Login Kit / TikTok for Developers).
 *
 * Requires TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET configured on the
 * TikTok developer app. The redirect URI must be registered on the app
 * exactly as `${PUBLIC_APP_URL}/api/oauth/tiktok/callback`.
 */

export const TIKTOK_SCOPES = [
  "user.info.basic",
  "user.info.profile",
  "video.list",
  "video.upload",
  "video.publish",
].join(",");

function getTikTokRedirectUri() {
  const publicAppUrl = process.env.PUBLIC_APP_URL;
  if (!publicAppUrl) throw new Error("PUBLIC_APP_URL not configured");
  return `${publicAppUrl.replace(/\/$/, "")}/api/oauth/tiktok/callback`;
}

export const getTikTokOAuthConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const clientKey = process.env.TIKTOK_CLIENT_KEY ?? "";
    const hasSecret = !!process.env.TIKTOK_CLIENT_SECRET;
    let redirectUri = "";
    try { redirectUri = getTikTokRedirectUri(); } catch { /* ignore */ }
    return { configured: !!(clientKey && hasSecret && redirectUri), clientKey, hasSecret, redirectUri };
  });

export const startTikTokOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    if (!clientKey) throw new Error("TIKTOK_CLIENT_KEY not configured");
    if (!process.env.TIKTOK_CLIENT_SECRET) throw new Error("TIKTOK_CLIENT_SECRET not configured");
    const redirectUri = getTikTokRedirectUri();

    const { signState } = await import("./oauth-state.server");
    const state = signState({ uid: context.userId, p: "tiktok" });

    const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
    url.searchParams.set("client_key", clientKey);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", TIKTOK_SCOPES);
    url.searchParams.set("state", state);

    return { url: url.toString(), redirectUri };
  });

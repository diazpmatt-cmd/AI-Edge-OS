import { Router } from "express";
import { db } from "@workspace/db";
import { socialConnectionsTable } from "@workspace/db/schema";
import { verifyState } from "../lib/oauthState";
import { logCallback, getCallbackLog } from "../lib/callbackDebugLog";
import { getAuth } from "@clerk/express";

const router = Router();

function getAppBase(): string {
  return process.env.PUBLIC_APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN}`;
}

// Map internal provider IDs to short URL-friendly names
const PROVIDER_SLUG: Record<string, string> = {
  google_business: "google",
  youtube: "youtube",
  google_basic: "google_basic",
  youtube_readonly: "youtube_readonly",
  facebook: "facebook",
  instagram: "instagram",
  tiktok: "tiktok",
  linkedin: "linkedin",
};

function redirectSuccess(res: any, provider: string) {
  const base = getAppBase();
  const slug = PROVIDER_SLUG[provider] ?? provider;
  const url = `${base}/admin/connections?connected=${slug}`;
  logCallback({
    ts: new Date().toISOString(),
    provider,
    callbackReached: true,
    codeReceived: true,
    stateValid: true,
    tokenExchangeStatus: "success",
    connectionSaved: true,
    finalRedirectUrl: url,
  });
  res.redirect(url);
}

function redirectError(res: any, provider: string, reason: string, step: string, extra: Partial<{ codeReceived: boolean; stateValid: boolean | null }> = {}) {
  const base = getAppBase();
  const url = `${base}/admin/connections?oauth_error=${encodeURIComponent(reason)}&step=${encodeURIComponent(step)}&provider=${provider}`;
  logCallback({
    ts: new Date().toISOString(),
    provider,
    callbackReached: true,
    codeReceived: extra.codeReceived ?? false,
    stateValid: extra.stateValid ?? null,
    tokenExchangeStatus: `error:${step}`,
    connectionSaved: false,
    finalRedirectUrl: url,
    error: reason,
  });
  res.redirect(url);
}

// Expose debug log — auth required
router.get("/oauth/callback-debug-log", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  res.json(getCallbackLog());
});

// ── Google / YouTube ──────────────────────────────────────────────────────────
async function exchangeGoogleCode(code: string, redirectUri: string) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Token exchange failed (${r.status}): ${body}`);
  }
  return r.json() as Promise<{ access_token: string; refresh_token?: string; expires_in?: number; token_type: string }>;
}

async function getGoogleUserInfo(accessToken: string) {
  const r = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error("Failed to fetch Google userinfo");
  return r.json() as Promise<{ email: string; name?: string; id: string }>;
}

router.get("/oauth/google/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    redirectError(res, "google", error, "google_callback", { codeReceived: false });
    return;
  }
  if (!code || !state) {
    redirectError(res, "google", "missing_params", "google_callback", { codeReceived: !!code });
    return;
  }

  const verified = verifyState(state, ["google_business", "youtube", "google_basic", "youtube_readonly"]);
  if (!verified) {
    redirectError(res, "google", "invalid_state", "state_verify", { codeReceived: true, stateValid: false });
    return;
  }
  const { userId, provider } = verified;

  try {
    const redirectUri = `${getAppBase()}/api/oauth/google/callback`;
    const tokens = await exchangeGoogleCode(code, redirectUri);
    const userInfo = await getGoogleUserInfo(tokens.access_token);
    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;

    await db.insert(socialConnectionsTable).values({
      userId, provider,
      accountName: userInfo.name ?? userInfo.email,
      accountId: userInfo.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt,
    }).onConflictDoUpdate({
      target: [socialConnectionsTable.userId, socialConnectionsTable.provider],
      set: {
        accountName: userInfo.name ?? userInfo.email,
        accountId: userInfo.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        expiresAt,
        updatedAt: new Date(),
      },
    });

    redirectSuccess(res, provider);
  } catch (e: any) {
    redirectError(res, provider, e?.message ?? "token_exchange_failed", "google_token", { codeReceived: true, stateValid: true });
  }
});

// ── Meta (Facebook / Instagram) ───────────────────────────────────────────────
async function exchangeMetaCode(code: string, redirectUri: string) {
  const r = await fetch("https://graph.facebook.com/v19.0/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.META_APP_ID ?? "",
      client_secret: process.env.META_APP_SECRET ?? "",
      redirect_uri: redirectUri,
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Meta token exchange failed (${r.status}): ${body}`);
  }
  return r.json() as Promise<{ access_token: string; token_type: string }>;
}

async function getMetaUserInfo(accessToken: string) {
  const r = await fetch(`https://graph.facebook.com/me?fields=id,name&access_token=${accessToken}`);
  if (!r.ok) throw new Error("Failed to fetch Meta user info");
  return r.json() as Promise<{ id: string; name: string }>;
}

router.get("/oauth/meta/callback", async (req, res) => {
  const { code, state, error, error_reason } = req.query as Record<string, string>;

  if (error) {
    redirectError(res, "facebook", error_reason ?? error, "meta_callback", { codeReceived: false });
    return;
  }
  if (!code || !state) {
    redirectError(res, "facebook", "missing_params", "meta_callback", { codeReceived: !!code });
    return;
  }

  const verified = verifyState(state, ["facebook", "instagram"]);
  if (!verified) {
    redirectError(res, "facebook", "invalid_state", "state_verify", { codeReceived: true, stateValid: false });
    return;
  }
  const { userId, provider } = verified;

  try {
    const redirectUri = `${getAppBase()}/api/oauth/meta/callback`;
    const tokens = await exchangeMetaCode(code, redirectUri);
    const userInfo = await getMetaUserInfo(tokens.access_token);

    await db.insert(socialConnectionsTable).values({
      userId, provider,
      accountName: userInfo.name,
      accountId: userInfo.id,
      accessToken: tokens.access_token,
      refreshToken: null,
      expiresAt: null,
    }).onConflictDoUpdate({
      target: [socialConnectionsTable.userId, socialConnectionsTable.provider],
      set: {
        accountName: userInfo.name,
        accountId: userInfo.id,
        accessToken: tokens.access_token,
        updatedAt: new Date(),
      },
    });

    redirectSuccess(res, provider);
  } catch (e: any) {
    redirectError(res, provider, e?.message ?? "token_exchange_failed", "meta_token", { codeReceived: true, stateValid: true });
  }
});

// ── TikTok ────────────────────────────────────────────────────────────────────
router.get("/oauth/tiktok/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  if (error) { redirectError(res, "tiktok", error, "tiktok_callback"); return; }
  if (!code || !state) { redirectError(res, "tiktok", "missing_params", "tiktok_callback", { codeReceived: !!code }); return; }

  const verified = verifyState(state, ["tiktok"]);
  if (!verified) { redirectError(res, "tiktok", "invalid_state", "state_verify", { codeReceived: true, stateValid: false }); return; }
  const { userId } = verified;

  try {
    const redirectUri = `${getAppBase()}/api/oauth/tiktok/callback`;
    const r = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_key: process.env.TIKTOK_CLIENT_KEY ?? "",
        client_secret: process.env.TIKTOK_CLIENT_SECRET ?? "",
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    if (!r.ok) throw new Error(`TikTok token exchange failed: ${r.status}`);
    const tokens = await r.json() as any;

    await db.insert(socialConnectionsTable).values({
      userId, provider: "tiktok",
      accountName: tokens.open_id ?? null, accountId: tokens.open_id ?? null,
      accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? null,
      expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
    }).onConflictDoUpdate({
      target: [socialConnectionsTable.userId, socialConnectionsTable.provider],
      set: {
        accountName: tokens.open_id ?? null, accountId: tokens.open_id ?? null,
        accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? null,
        expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
        updatedAt: new Date(),
      },
    });

    redirectSuccess(res, "tiktok");
  } catch (e: any) {
    redirectError(res, "tiktok", e?.message ?? "token_exchange_failed", "tiktok_token", { codeReceived: true, stateValid: true });
  }
});

// ── LinkedIn ──────────────────────────────────────────────────────────────────
router.get("/oauth/linkedin/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  if (error) { redirectError(res, "linkedin", error, "linkedin_callback"); return; }
  if (!code || !state) { redirectError(res, "linkedin", "missing_params", "linkedin_callback", { codeReceived: !!code }); return; }

  const verified = verifyState(state, ["linkedin"]);
  if (!verified) { redirectError(res, "linkedin", "invalid_state", "state_verify", { codeReceived: true, stateValid: false }); return; }
  const { userId } = verified;

  try {
    const redirectUri = `${getAppBase()}/api/oauth/linkedin/callback`;
    const r = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code, redirect_uri: redirectUri,
        client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
        client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
      }),
    });
    if (!r.ok) throw new Error(`LinkedIn token exchange failed: ${r.status}`);
    const tokens = await r.json() as any;

    const meR = await fetch("https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName)", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const me = meR.ok ? await meR.json() as any : null;
    const accountName = me ? `${me.localizedFirstName ?? ""} ${me.localizedLastName ?? ""}`.trim() : null;

    await db.insert(socialConnectionsTable).values({
      userId, provider: "linkedin",
      accountName, accountId: me?.id ?? null,
      accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? null,
      expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
    }).onConflictDoUpdate({
      target: [socialConnectionsTable.userId, socialConnectionsTable.provider],
      set: {
        accountName, accountId: me?.id ?? null,
        accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? null,
        expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
        updatedAt: new Date(),
      },
    });

    redirectSuccess(res, "linkedin");
  } catch (e: any) {
    redirectError(res, "linkedin", e?.message ?? "token_exchange_failed", "linkedin_token", { codeReceived: true, stateValid: true });
  }
});

export default router;

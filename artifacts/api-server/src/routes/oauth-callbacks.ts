import { Router } from "express";
import { db } from "@workspace/db";
import { socialConnectionsTable } from "@workspace/db/schema";
import { verifyState } from "../lib/oauthState";

const router = Router();

function getAppBase(): string {
  return process.env.PUBLIC_APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN}`;
}

function redirectWithResult(res: any, status: "success" | "error", opts: Record<string, string> = {}) {
  const base = getAppBase();
  const params = new URLSearchParams({ oauth: status, ...opts });
  res.redirect(`${base}/connections?${params}`);
}

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
  if (!r.ok) throw new Error(`Token exchange failed: ${r.status}`);
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
  if (error) { redirectWithResult(res, "error", { reason: error, step: "google_callback" }); return; }
  if (!code || !state) { redirectWithResult(res, "error", { reason: "missing_params", step: "google_callback" }); return; }

  const verified = verifyState(state, ["google_business", "youtube"]);
  if (!verified) { redirectWithResult(res, "error", { reason: "invalid_state", step: "state_verify" }); return; }
  const { userId, provider } = verified;

  try {
    const redirectUri = `${getAppBase()}/api/oauth/google/callback`;
    const tokens = await exchangeGoogleCode(code, redirectUri);
    const userInfo = await getGoogleUserInfo(tokens.access_token);
    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;
    await db.insert(socialConnectionsTable).values({
      userId, provider, accountName: userInfo.name ?? userInfo.email, accountId: userInfo.id,
      accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? null, expiresAt,
    }).onConflictDoUpdate({
      target: [socialConnectionsTable.userId, socialConnectionsTable.provider],
      set: {
        accountName: userInfo.name ?? userInfo.email, accountId: userInfo.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        expiresAt,
        updatedAt: new Date(),
      },
    });
    redirectWithResult(res, "success", { provider });
  } catch (e: any) {
    redirectWithResult(res, "error", { reason: e?.message ?? "token_exchange_failed", step: "google_token" });
  }
});

async function exchangeMetaCode(code: string, redirectUri: string) {
  const r = await fetch("https://graph.facebook.com/v19.0/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: process.env.META_APP_ID ?? "",
      client_secret: process.env.META_APP_SECRET ?? "",
      redirect_uri: redirectUri,
    }),
  });
  if (!r.ok) throw new Error(`Meta token exchange failed: ${r.status}`);
  return r.json() as Promise<{ access_token: string; token_type: string }>;
}

async function getMetaUserInfo(accessToken: string) {
  const r = await fetch(`https://graph.facebook.com/me?fields=id,name&access_token=${accessToken}`);
  if (!r.ok) throw new Error("Failed to fetch Meta user info");
  return r.json() as Promise<{ id: string; name: string }>;
}

router.get("/oauth/meta/callback", async (req, res) => {
  const { code, state, error, error_reason } = req.query as Record<string, string>;
  if (error) { redirectWithResult(res, "error", { reason: error_reason ?? error, step: "meta_callback" }); return; }
  if (!code || !state) { redirectWithResult(res, "error", { reason: "missing_params", step: "meta_callback" }); return; }

  const verified = verifyState(state, ["facebook", "instagram"]);
  if (!verified) { redirectWithResult(res, "error", { reason: "invalid_state", step: "state_verify" }); return; }
  const { userId, provider } = verified;

  try {
    const redirectUri = `${getAppBase()}/api/oauth/meta/callback`;
    const tokens = await exchangeMetaCode(code, redirectUri);
    const userInfo = await getMetaUserInfo(tokens.access_token);
    await db.insert(socialConnectionsTable).values({
      userId, provider, accountName: userInfo.name, accountId: userInfo.id,
      accessToken: tokens.access_token, refreshToken: null, expiresAt: null,
    }).onConflictDoUpdate({
      target: [socialConnectionsTable.userId, socialConnectionsTable.provider],
      set: {
        accountName: userInfo.name, accountId: userInfo.id,
        accessToken: tokens.access_token,
        updatedAt: new Date(),
      },
    });
    redirectWithResult(res, "success", { provider });
  } catch (e: any) {
    redirectWithResult(res, "error", { reason: e?.message ?? "token_exchange_failed", step: "meta_token" });
  }
});

router.get("/oauth/tiktok/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  if (error) { redirectWithResult(res, "error", { reason: error, step: "tiktok_callback" }); return; }
  if (!code || !state) { redirectWithResult(res, "error", { reason: "missing_params", step: "tiktok_callback" }); return; }

  const verified = verifyState(state, ["tiktok"]);
  if (!verified) { redirectWithResult(res, "error", { reason: "invalid_state", step: "state_verify" }); return; }
  const { userId } = verified;

  try {
    const redirectUri = `${getAppBase()}/api/oauth/tiktok/callback`;
    const r = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_key: process.env.TIKTOK_CLIENT_KEY ?? "",
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
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
        updatedAt: new Date(),
      },
    });
    redirectWithResult(res, "success", { provider: "tiktok" });
  } catch (e: any) {
    redirectWithResult(res, "error", { reason: e?.message ?? "token_exchange_failed", step: "tiktok_token" });
  }
});

router.get("/oauth/linkedin/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  if (error) { redirectWithResult(res, "error", { reason: error, step: "linkedin_callback" }); return; }
  if (!code || !state) { redirectWithResult(res, "error", { reason: "missing_params", step: "linkedin_callback" }); return; }

  const verified = verifyState(state, ["linkedin"]);
  if (!verified) { redirectWithResult(res, "error", { reason: "invalid_state", step: "state_verify" }); return; }
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
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
        updatedAt: new Date(),
      },
    });
    redirectWithResult(res, "success", { provider: "linkedin" });
  } catch (e: any) {
    redirectWithResult(res, "error", { reason: e?.message ?? "token_exchange_failed", step: "linkedin_token" });
  }
});

export default router;

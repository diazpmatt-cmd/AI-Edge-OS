import { Router } from "express";
import { db } from "@workspace/db";
import { socialConnectionsTable } from "@workspace/db/schema";
import { verifyState } from "../lib/oauthState";
import { logCallback, getCallbackLog } from "../lib/callbackDebugLog";
import { getAuth } from "@clerk/express";
import { logger } from "../lib/logger";

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
  // Redirect to /oauth-close which handles both popup (postMessage + close)
  // and top-level navigation (redirects to /admin/connections) automatically.
  const url = `${base}/oauth-close?connected=${slug}`;
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

const META_REQUIRED_SCOPES = ["pages_show_list", "pages_manage_posts", "pages_read_engagement"];

router.get("/oauth/meta/callback", async (req, res) => {
  const { code, state, error, error_reason } = req.query as Record<string, string>;

  if (error) {
    logger.warn({ provider: "meta", error, error_reason }, "Meta OAuth callback error from Facebook");
    redirectError(res, "facebook", error_reason ?? error, "meta_callback", { codeReceived: false });
    return;
  }
  if (!code || !state) {
    logger.warn({ provider: "meta", hasCode: !!code, hasState: !!state }, "Meta OAuth callback missing params");
    redirectError(res, "facebook", "missing_params", "meta_callback", { codeReceived: !!code });
    return;
  }

  const verified = verifyState(state, ["facebook", "instagram"]);
  if (!verified) {
    logger.warn({ provider: "meta" }, "Meta OAuth callback invalid state");
    redirectError(res, "facebook", "invalid_state", "state_verify", { codeReceived: true, stateValid: false });
    return;
  }
  const { userId, provider, returnTo } = verified;
  logger.info({ provider, userId, returnTo }, "Meta OAuth callback: code received, state valid — exchanging token");

  try {
    const redirectUri = `${getAppBase()}/api/oauth/meta/callback`;

    // ── 1. Exchange code for access token ──
    let tokens: { access_token: string; token_type: string };
    try {
      tokens = await exchangeMetaCode(code, redirectUri);
      logger.info({ provider, userId }, "Meta token exchange succeeded");
    } catch (e: any) {
      logger.error({ provider, userId, error: e?.message }, "Meta token exchange FAILED");
      throw e;
    }

    // ── 2. Get user info ──
    const userInfo = await getMetaUserInfo(tokens.access_token);
    logger.info({ provider, userId, accountName: userInfo.name, accountId: userInfo.id }, "Meta user info fetched");

    // ── 3. Save token to DB ──
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
    logger.info({ provider, userId }, "Meta token saved to DB");

    // ── 4. Fetch /me/accounts — store first page token in metadata ──
    let pagesFound = 0;
    let pageNames: string[] = [];
    let storedMetadata: Record<string, any> = {};
    try {
      const acctR = await fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token&access_token=${tokens.access_token}`);
      if (acctR.ok) {
        const acctData = await acctR.json() as { data?: Array<{ id: string; name: string; access_token: string }> };
        pagesFound = acctData.data?.length ?? 0;
        pageNames = (acctData.data ?? []).map(p => p.name);
        logger.info({ provider, userId, pagesFound, pageNames }, "Meta /me/accounts OK");

        const firstPage = acctData.data?.[0];
        if (firstPage) {
          storedMetadata.pageId = firstPage.id;
          storedMetadata.pageName = firstPage.name;
          storedMetadata.pageAccessToken = firstPage.access_token;
          logger.info({ provider, userId, pageId: firstPage.id, pageName: firstPage.name }, "Stored page token from first page");

          // Try to get connected Instagram business account
          try {
            const igR = await fetch(`https://graph.facebook.com/v19.0/${firstPage.id}?fields=instagram_business_account&access_token=${firstPage.access_token}`);
            if (igR.ok) {
              const igData = await igR.json() as { instagram_business_account?: { id: string } };
              if (igData.instagram_business_account?.id) {
                storedMetadata.instagramBusinessAccountId = igData.instagram_business_account.id;
                logger.info({ provider, userId, igAccountId: igData.instagram_business_account.id }, "Instagram business account found");
              } else {
                logger.info({ provider, userId }, "No Instagram business account linked to this Page");
              }
            }
          } catch (igErr: any) {
            logger.warn({ provider, userId, error: igErr?.message }, "IG business account fetch exception");
          }

          // Update metadata in DB
          await db.update(socialConnectionsTable)
            .set({ metadata: JSON.stringify(storedMetadata), updatedAt: new Date() })
            .where(and(eq(socialConnectionsTable.userId, userId), eq(socialConnectionsTable.provider, provider)));
          logger.info({ provider, userId, metadata: { pageId: storedMetadata.pageId, pageName: storedMetadata.pageName, hasIg: !!storedMetadata.instagramBusinessAccountId } }, "Metadata stored in DB");
        } else {
          logger.warn({ provider, userId }, "Meta /me/accounts returned 0 pages — user may have no Pages or declined pages_show_list");
        }
      } else {
        const errBody = await acctR.text().catch(() => "");
        logger.error({ provider, userId, status: acctR.status, body: errBody }, "Meta /me/accounts FAILED");
      }
    } catch (pageErr: any) {
      logger.warn({ provider, userId, error: pageErr?.message }, "Meta /me/accounts exception");
    }

    // ── 5. Check granted permissions ──
    let grantedScopes: string[] = [];
    let missingScopes: string[] = [];
    try {
      const permR = await fetch(`https://graph.facebook.com/v19.0/me/permissions?access_token=${tokens.access_token}`);
      if (permR.ok) {
        const permData = await permR.json() as { data: Array<{ permission: string; status: string }> };
        grantedScopes = permData.data.filter(p => p.status === "granted").map(p => p.permission);
        missingScopes = META_REQUIRED_SCOPES.filter(s => !grantedScopes.includes(s));
        if (missingScopes.length > 0) {
          logger.warn({ provider, userId, missingScopes, grantedScopes }, "Meta OAuth: MISSING required scopes for publishing");
        } else {
          logger.info({ provider, userId, grantedScopes }, "Meta OAuth: all required publishing scopes granted");
        }
      }
    } catch (permErr: any) {
      logger.warn({ provider, userId, error: permErr?.message }, "Meta /me/permissions exception");
    }

    // ── 6. Log and redirect ──
    const base = getAppBase();
    const slug = PROVIDER_SLUG[provider] ?? provider;
    const returnToParam = returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : "";
    const finalRedirectUrl = `${base}/oauth-close?connected=${slug}${returnToParam}`;
    logCallback({
      ts: new Date().toISOString(),
      provider,
      callbackReached: true,
      codeReceived: true,
      stateValid: true,
      tokenExchangeStatus: "success",
      connectionSaved: true,
      finalRedirectUrl,
      pagesFound,
      pageNames,
      grantedScopes,
      missingScopes,
    });
    res.redirect(finalRedirectUrl);

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

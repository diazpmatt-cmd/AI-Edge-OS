import { Router, type Response as ExpressResponse } from "express";
import { createHmac } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { socialConnectionsTable } from "@workspace/db/schema";
import { verifyState } from "../lib/oauthState";
import { logCallback, getCallbackLog } from "../lib/callbackDebugLog";
import { getAuth } from "@clerk/express";
import { logger } from "../lib/logger";
type FetchResponse = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
};

const httpFetch = globalThis.fetch as unknown as (
  input: Parameters<typeof globalThis.fetch>[0],
  init?: Parameters<typeof globalThis.fetch>[1],
) => Promise<FetchResponse>;
// After saving to the production DB, notify the dev server so it can sync the
// same row to the dev DB.  This bridges the Replit dev/prod database split so
// the dev frontend sees the token without requiring Facebook app-settings changes.
async function syncToDevServer(devOrigin: string, payload: {
  provider: string; userId: string; accountName: string; accountId: string;
  accessToken: string; metadata: string | null;
}) {
  const secret = process.env.OAUTH_STATE_SECRET ?? process.env.CLERK_SECRET_KEY ?? "";
  const sig = createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");
  const syncUrl = `${devOrigin}/api/social-connections/oauth-sync`;

  console.log("[DEV-SYNC ATTEMPT]", {
    url: syncUrl,
    payloadUserId: payload.userId,
    provider: payload.provider,
    signaturePrefix: sig.slice(0, 12),
  });

let r: globalThis.Response;
try {
  r = await fetch(syncUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, sig }),
    signal: AbortSignal.timeout(8000),
  });
} catch (fetchErr: any) {
    console.error("[DEV-SYNC ERROR]", { error: fetchErr?.message ?? String(fetchErr) });
    throw fetchErr;
  }

  const body = await r.text().catch(() => "(could not read body)");
  if (!r.ok) {
    console.error("[DEV-SYNC FAILED]", { status: r.status, body: body.slice(0, 400) });
    throw new Error(`DEV-SYNC HTTP ${r.status}: ${body.slice(0, 300)}`);
  }
  console.log("[DEV-SYNC SUCCESS]", { status: r.status, body: body.slice(0, 300) });
}

const router = Router();

function getAppBase(): string {
  return process.env.PUBLIC_APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN}`;
}

// Prefer the dev origin embedded in the signed state so the popup window ends
// up on the same origin as the opener (avoids cross-origin postMessage issues
// between deployed callback and dev parent window).
function getRedirectBase(devOrigin?: string): string {
  return devOrigin ?? getAppBase();
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

function redirectSuccess(res: any, provider: string, devOrigin?: string, returnTo?: string) {
  const base = getRedirectBase(devOrigin);
  const slug = PROVIDER_SLUG[provider] ?? provider;
  const returnToParam = returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : "";
  const url = `${base}/oauth-close?connected=${slug}${returnToParam}`;
  console.log(`[OAUTH-CALLBACK] redirectSuccess provider=${provider} devOrigin=${devOrigin ?? "none"} url=${url}`);
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

function redirectError(res: any, provider: string, reason: string, step: string, devOrigin?: string, extra: Partial<{ codeReceived: boolean; stateValid: boolean | null }> = {}) {
  const base = getRedirectBase(devOrigin);
  // Always go to /oauth-close (not /admin/connections) so the popup window can
  // fire window.opener.postMessage({type:"oauth_error",...}) back to the parent.
  const url = `${base}/oauth-close?oauth_error=${encodeURIComponent(reason)}&step=${encodeURIComponent(step)}&provider=${provider}`;
  console.error(`[OAUTH-CALLBACK] redirectError provider=${provider} reason=${reason} step=${step} devOrigin=${devOrigin ?? "none"} url=${url}`);
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
  return r.json() as Promise<{ access_token: string; refresh_token?: string; expires_in?: number; token_type: string; scope?: string }>;
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

  console.log(`[GOOGLE-CALLBACK] hit: hasCode=${!!code} hasState=${!!state} error=${error ?? "none"} NODE_ENV=${process.env.NODE_ENV}`);

  if (error) {
    console.error(`[GOOGLE-CALLBACK] Google denied access: ${error}`);
    redirectError(res, "google", error, "google_callback", undefined, { codeReceived: false });
    return;
  }
  if (!code || !state) {
    console.error(`[GOOGLE-CALLBACK] missing params: code=${!!code} state=${!!state}`);
    redirectError(res, "google", "missing_params", "google_callback", undefined, { codeReceived: !!code });
    return;
  }

  const verified = verifyState(state, ["google_business", "youtube", "google_basic", "youtube_readonly"]);
  if (!verified) {
    console.error(`[GOOGLE-CALLBACK] invalid_state — HMAC mismatch or expired. OAUTH_STATE_SECRET set=${!!process.env.OAUTH_STATE_SECRET}`);
    redirectError(res, "google", "invalid_state", "state_verify", undefined, { codeReceived: true, stateValid: false });
    return;
  }
  const { userId, provider, devOrigin } = verified;
  console.log(`[GOOGLE-CALLBACK] state valid: userId=${userId} provider=${provider} devOrigin=${devOrigin ?? "none"}`);

  try {
    const redirectUri = `${getAppBase()}/api/oauth/google/callback`;
    console.log(`[GOOGLE-CALLBACK] exchanging code, redirect_uri=${redirectUri}`);

    // ── 1. Token exchange ──
    let tokens: { access_token: string; refresh_token?: string; expires_in?: number; token_type: string; scope?: string };
    try {
      tokens = await exchangeGoogleCode(code, redirectUri);
      console.log(`[GOOGLE-CALLBACK] token exchange OK: token_type=${tokens.token_type} token_len=${tokens.access_token?.length ?? 0} has_refresh=${!!tokens.refresh_token}`);
      console.log("[GOOGLE-OAUTH]", JSON.stringify({
        accessTokenPresent: !!tokens.access_token,
        refreshTokenPresent: !!tokens.refresh_token,
        scope: tokens.scope ?? "(not returned by Google)",
        tokenType: tokens.token_type,
        expiresIn: tokens.expires_in,
      }));
    } catch (tokenErr: any) {
      console.error(`[GOOGLE-CALLBACK] token exchange FAILED: ${tokenErr?.message}`);
      throw tokenErr;
    }

    // ── 2. User info ──
    let userInfo: { email: string; name?: string; id: string };
    try {
      userInfo = await getGoogleUserInfo(tokens.access_token);
      console.log(`[GOOGLE-CALLBACK] user info: email=${userInfo.email} name=${userInfo.name ?? "n/a"} id=${userInfo.id}`);
    } catch (uiErr: any) {
      console.error(`[GOOGLE-CALLBACK] get user info FAILED: ${uiErr?.message}`);
      throw uiErr;
    }

    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;

    // ── 3. Save token to DB ──
    console.log(`[GOOGLE-SAVE] attempting DB save: userId=${userId} provider=${provider} accountName="${userInfo.name ?? userInfo.email}"`);
    try {
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
      console.log(`[GOOGLE-SAVE] ✓ saved to DB: userId=${userId} provider=${provider}`);
    } catch (dbErr: any) {
      console.error(`[GOOGLE-SAVE] ✗ DB save FAILED: ${dbErr?.message} pg.code=${(dbErr as any)?.code ?? "n/a"} constraint=${(dbErr as any)?.constraint ?? "n/a"}`);
      throw dbErr;
    }

    // ── 4. Sync to dev server (bridges Replit dev/prod DB split) ──
    // devOrigin is now embedded in the signed state (same as Meta).
    // This fires BEFORE the popup redirect so the dev DB has the token
    // by the time the frontend verification runs.
    if (devOrigin) {
      console.log(`[GOOGLE-CALLBACK] dev-sync → ${devOrigin}`);
      try {
        await syncToDevServer(devOrigin, {
          provider, userId,
          accountName: userInfo.name ?? userInfo.email,
          accountId: userInfo.id,
          accessToken: tokens.access_token,
          metadata: null,
        });
        console.log(`[GOOGLE-CALLBACK] ✓ dev-sync OK`);
      } catch (syncErr: any) {
        console.warn(`[GOOGLE-CALLBACK] ✗ dev-sync FAILED (non-fatal): ${syncErr?.message}`);
      }
    } else {
      console.warn(`[GOOGLE-CALLBACK] devOrigin missing — dev DB will not receive token until pull-from-prod runs`);
    }

    // ── 4b. Verify granted scopes via tokeninfo ──
    if (provider === "youtube") {
      try {
        const tiR = await fetch(
          `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${tokens.access_token}`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (tiR.ok) {
          const ti = await tiR.json() as { scope?: string; email?: string; expires_in?: number };
          const grantedScopes = (ti.scope ?? "").split(" ").filter(Boolean);
          const hasUploadScope   = grantedScopes.some(s => s.includes("youtube.upload"));
          const hasReadonlyScope = grantedScopes.some(s => s.includes("youtube.readonly") || s.includes("youtube.upload"));
          console.log(`[YOUTUBE-SCOPE] granted=${ti.scope ?? "(none)"} hasUpload=${hasUploadScope} hasReadonly=${hasReadonlyScope}`);
          if (!hasUploadScope) {
            console.warn(`[YOUTUBE-SCOPE] ⚠️ youtube.upload NOT in granted scopes — user may have used an old read-only token`);
          }
          try {
            await db.update(socialConnectionsTable)
              .set({ metadata: JSON.stringify({ uploadScopeGranted: hasUploadScope, hasReadonlyScope, grantedScopes, scopeCheckedAt: new Date().toISOString() }), updatedAt: new Date() })
              .where(and(eq(socialConnectionsTable.userId, userId), eq(socialConnectionsTable.provider, "youtube")));
          } catch { /* non-fatal */ }
        } else {
          console.warn(`[YOUTUBE-SCOPE] tokeninfo check HTTP ${tiR.status} — skipping scope verification`);
        }
      } catch (tiErr: any) {
        console.warn(`[YOUTUBE-SCOPE] tokeninfo fetch failed (non-fatal): ${tiErr?.message}`);
      }
    }

    if (provider === "google_business") {
      try {
        const tiR = await fetch(
          `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${tokens.access_token}`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (tiR.ok) {
          const ti = await tiR.json() as { scope?: string; email?: string; expires_in?: number };
          const grantedScopes = (ti.scope ?? "").split(" ").filter(Boolean);
          const hasBusinessManage = grantedScopes.some(s => s.includes("business.manage"));
          console.log(`[GOOGLE-SCOPE] granted=${ti.scope ?? "(none)"} business.manage=${hasBusinessManage} expires_in=${ti.expires_in}`);
          if (!hasBusinessManage) {
            console.warn(`[GOOGLE-SCOPE] ⚠️ business.manage NOT in granted scopes — user did not approve it or cached grant is stale`);
          }
        } else {
          console.warn(`[GOOGLE-SCOPE] tokeninfo check HTTP ${tiR.status} — skipping scope verification`);
        }
      } catch (tiErr: any) {
        console.warn(`[GOOGLE-SCOPE] tokeninfo fetch failed (non-fatal): ${tiErr?.message}`);
      }
    }

    // ── 5. Verify GBP accounts + locations (google_business only) ──
    if (provider === "google_business") {
      console.log(`[GOOGLE-VERIFY] starting GBP account + location check...`);
      const gbpMeta: Record<string, any> = {};
      try {
        const acctR = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
          signal: AbortSignal.timeout(8000),
        });
        const acctBody = await acctR.text();
        console.log(`[GOOGLE-VERIFY] accounts API: status=${acctR.status} body=${acctBody.slice(0, 400)}`);

        if (acctR.ok) {
          const acctData = JSON.parse(acctBody) as { accounts?: Array<{ name: string; accountName: string }> };
          const accounts = acctData.accounts ?? [];
          console.log(`[GOOGLE-VERIFY] accounts found = ${accounts.length}`);

          if (accounts.length === 0) {
            console.warn(`[GOOGLE-VERIFY] no_accounts_found — GBP not set up or business.manage scope not granted`);
            gbpMeta.noAccounts = true;
          } else {
            gbpMeta.gbpAccountName = accounts[0].name;
            gbpMeta.gbpAccountDisplayName = accounts[0].accountName;

            // Fetch locations
            try {
              const locR = await fetch(
                `https://mybusinessbusinessinformation.googleapis.com/v1/${accounts[0].name}/locations?readMask=name,title`,
                { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(8000) }
              );
              const locBody = await locR.text();
              console.log(`[GOOGLE-VERIFY] locations API: status=${locR.status} body=${locBody.slice(0, 500)}`);

              if (locR.ok) {
                const locData = JSON.parse(locBody) as { locations?: Array<{ name: string; title: string }> };
                const locs = locData.locations ?? [];
                const locationNames = locs.map(l => l.title);
                console.log(`[GOOGLE-VERIFY] locations found = ${locs.length} names=${JSON.stringify(locationNames)}`);
                gbpMeta.locationCount = locs.length;
                gbpMeta.locationNames = locationNames;

                const match = locs.find(l =>
                  l.title?.toLowerCase().includes("bed bug") || l.title?.toLowerCase().includes("beyond")
                );
                if (match) {
                  console.log(`[GOOGLE-VERIFY] ✓ "Bed Bugs & Beyond" location found: "${match.title}" (${match.name})`);
                  gbpMeta.primaryLocation = match.name;
                  gbpMeta.primaryLocationTitle = match.title;
                } else if (locs.length > 0) {
                  console.log(`[GOOGLE-VERIFY] "Bed Bugs & Beyond" NOT matched — using first: "${locs[0].title}"`);
                  gbpMeta.primaryLocation = locs[0].name;
                  gbpMeta.primaryLocationTitle = locs[0].title;
                } else {
                  console.warn(`[GOOGLE-VERIFY] no_locations_found`);
                  gbpMeta.noLocations = true;
                }
              } else {
                console.warn(`[GOOGLE-VERIFY] locations API failed: ${locBody.slice(0, 200)}`);
                gbpMeta.locationsError = `HTTP ${locR.status}: ${locBody.slice(0, 100)}`;
              }
            } catch (locErr: any) {
              console.warn(`[GOOGLE-VERIFY] locations fetch exception: ${locErr?.message}`);
              gbpMeta.locationsError = locErr?.message;
            }
          }
        } else {
          console.warn(`[GOOGLE-VERIFY] accounts API failed — likely missing business.manage scope or API not enabled: ${acctBody.slice(0, 200)}`);
          gbpMeta.accountsError = `HTTP ${acctR.status}`;
          gbpMeta.accountsErrorBody = acctBody.slice(0, 200);
        }
      } catch (verifyErr: any) {
        console.warn(`[GOOGLE-VERIFY] exception: ${verifyErr?.message}`);
        gbpMeta.verifyError = verifyErr?.message;
      }

      // Persist whatever we learned into metadata
      if (Object.keys(gbpMeta).length > 0) {
        try {
          await db.update(socialConnectionsTable)
            .set({ metadata: JSON.stringify(gbpMeta), updatedAt: new Date() })
            .where(and(eq(socialConnectionsTable.userId, userId), eq(socialConnectionsTable.provider, provider)));
          console.log(`[GOOGLE-VERIFY] metadata saved: ${JSON.stringify(gbpMeta).slice(0, 200)}`);
        } catch (metaErr: any) {
          console.warn(`[GOOGLE-VERIFY] metadata save failed: ${metaErr?.message}`);
        }
      }
    }

    redirectSuccess(res, provider, devOrigin);
  } catch (e: any) {
    console.error(`[GOOGLE-CALLBACK] ✗ fatal: ${e?.message}`);
    redirectError(res, provider, e?.message ?? "token_exchange_failed", "google_token", devOrigin, { codeReceived: true, stateValid: true });
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

  console.log(`[META-CALLBACK] hit: hasCode=${!!code} hasState=${!!state} error=${error ?? "none"}`);

  if (error) {
    console.error(`[META-CALLBACK] facebook denied: ${error_reason ?? error}`);
    logger.warn({ provider: "meta", error, error_reason }, "Meta OAuth callback error from Facebook");
    redirectError(res, "facebook", error_reason ?? error, "meta_callback", undefined, { codeReceived: false });
    return;
  }
  if (!code || !state) {
    console.error(`[META-CALLBACK] missing params: code=${!!code} state=${!!state}`);
    logger.warn({ provider: "meta", hasCode: !!code, hasState: !!state }, "Meta OAuth callback missing params");
    redirectError(res, "facebook", "missing_params", "meta_callback", undefined, { codeReceived: !!code });
    return;
  }

  const verified = verifyState(state, ["facebook", "instagram"]);
  if (!verified) {
    console.error(`[META-CALLBACK] invalid_state — HMAC mismatch or expired. OAUTH_STATE_SECRET set=${!!process.env.OAUTH_STATE_SECRET} CLERK_SECRET_KEY set=${!!process.env.CLERK_SECRET_KEY}`);
    logger.warn({ provider: "meta", oauthSecretSet: !!process.env.OAUTH_STATE_SECRET }, "Meta OAuth callback invalid state");
    redirectError(res, "facebook", "invalid_state", "state_verify", undefined, { codeReceived: true, stateValid: false });
    return;
  }
  const { userId, provider, returnTo, devOrigin } = verified;
  console.log("[META-CALLBACK STATE]", {
    provider,
    userId: userId ?? "NULL",
    devOrigin: devOrigin ?? "NULL",
    returnTo: returnTo ?? "none",
    nodeEnv: process.env.NODE_ENV ?? "unset",
    databaseUrlSet: !!process.env.DATABASE_URL,
    databaseUrlPrefix: process.env.DATABASE_URL?.slice(0, 30) ?? "unset",
  });
  logger.info({ provider, userId, returnTo, devOrigin }, "Meta OAuth callback: state valid, exchanging token");

  try {
    const redirectUri = `${getAppBase()}/api/oauth/meta/callback`;
    console.log(`[META-CALLBACK] exchanging code, redirect_uri=${redirectUri}`);

    // ── 1. Exchange code for access token ──
    let tokens: { access_token: string; token_type: string };
    try {
      tokens = await exchangeMetaCode(code, redirectUri);
      console.log(`[META-CALLBACK] token exchange OK: token_type=${tokens.token_type} token_len=${tokens.access_token?.length ?? 0}`);
      logger.info({ provider, userId }, "Meta token exchange succeeded");
    } catch (e: any) {
      console.error(`[META-CALLBACK] token exchange FAILED: ${e?.message}`);
      logger.error({ provider, userId, error: e?.message }, "Meta token exchange FAILED");
      throw e;
    }

    // ── 2. Get user info ──
    const userInfo = await getMetaUserInfo(tokens.access_token);
    console.log(`[META-CALLBACK] user info: name=${userInfo.name} id=${userInfo.id}`);
    logger.info({ provider, userId, accountName: userInfo.name, accountId: userInfo.id }, "Meta user info fetched");

    // ── 3. Save token to DB ──
    const insertPayload = {
      userId, provider,
      accountName: userInfo.name,
      accountId: userInfo.id,
      accessToken: "[REDACTED]",
      refreshToken: null,
      expiresAt: null,
    };
    console.log(`[META-CALLBACK] DB save attempt: table=social_connections payload_keys=[${Object.keys(insertPayload).join(",")}] userId=${userId ?? "NULL"}`);
    console.log(`[META-CALLBACK] onConflict target: [userId, provider] conflictSet_keys=[accountName,accountId,accessToken,updatedAt]`);

    try {
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
      console.log(`[META-CALLBACK] ✓ DB save OK: provider=${provider} userId=${userId}`);
      logger.info({ provider, userId }, "Meta token saved to DB");
    } catch (dbErr: any) {
      const pgCode = (dbErr as any)?.code ?? "no_code";
      const pgDetail = (dbErr as any)?.detail ?? "";
      const pgConstraint = (dbErr as any)?.constraint ?? "";
      const pgTable = (dbErr as any)?.table ?? "";
      const pgColumn = (dbErr as any)?.column ?? "";
      const pgSchema = (dbErr as any)?.schema ?? "";
      console.error(
        `[META-CALLBACK] ✗ DB save FAILED:\n` +
        `  message=${dbErr?.message}\n` +
        `  pg.code=${pgCode}  pg.constraint=${pgConstraint}\n` +
        `  pg.table=${pgTable}  pg.schema=${pgSchema}  pg.column=${pgColumn}\n` +
        `  pg.detail=${pgDetail}\n` +
        `  DATABASE_URL_set=${!!process.env.DATABASE_URL}`
      );
      logger.error({ provider, userId, error: dbErr?.message, pgCode, pgConstraint, pgTable }, "Meta DB save FAILED");
      // Re-throw with enriched message so redirectError carries the real reason
      const enriched = new Error(
        `db_save_failed: ${dbErr?.message ?? "unknown"} [pg.code=${pgCode} constraint=${pgConstraint} table=${pgTable}]`
      );
      throw enriched;
    }

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
        console.log(`[META-CALLBACK] /me/accounts: pagesFound=${pagesFound} pages=${pageNames.join(",")}`);
        logger.info({ provider, userId, pagesFound, pageNames }, "Meta /me/accounts OK");

        const firstPage = acctData.data?.[0];
        if (firstPage) {
          storedMetadata.pageId = firstPage.id;
          storedMetadata.pageName = firstPage.name;
          storedMetadata.pageAccessToken = firstPage.access_token;

          // Try to get connected Instagram business account
          try {
            const igR = await fetch(`https://graph.facebook.com/v19.0/${firstPage.id}?fields=instagram_business_account&access_token=${firstPage.access_token}`);
            if (igR.ok) {
              const igData = await igR.json() as { instagram_business_account?: { id: string } };
              if (igData.instagram_business_account?.id) {
                storedMetadata.instagramBusinessAccountId = igData.instagram_business_account.id;
              }
            }
          } catch { /* ignore */ }

          // Update metadata in DB
          await db.update(socialConnectionsTable)
            .set({ metadata: JSON.stringify(storedMetadata), updatedAt: new Date() })
            .where(and(eq(socialConnectionsTable.userId, userId), eq(socialConnectionsTable.provider, provider)));
          console.log(`[META-CALLBACK] metadata saved: pageId=${firstPage.id} pageName=${firstPage.name}`);
          logger.info({ provider, userId, pageId: firstPage.id, pageName: firstPage.name }, "Metadata stored in DB");
        } else {
          console.log(`[META-CALLBACK] /me/accounts: 0 pages (user may have no Pages or declined pages_show_list)`);
          logger.warn({ provider, userId }, "Meta /me/accounts returned 0 pages");
        }
      } else {
        const errBody = await acctR.text().catch(() => "");
        console.error(`[META-CALLBACK] /me/accounts FAILED: status=${acctR.status} body=${errBody}`);
        logger.error({ provider, userId, status: acctR.status, body: errBody }, "Meta /me/accounts FAILED");
      }
    } catch (pageErr: any) {
      console.error(`[META-CALLBACK] /me/accounts exception: ${pageErr?.message}`);
      logger.warn({ provider, userId, error: pageErr?.message }, "Meta /me/accounts exception");
    }

    // ── 4b. Sync connection to dev server (bridges Replit dev/prod DB split) ──
    // The deployed server writes to the production DB; the dev server queries
    // the dev DB.  After saving to prod, we fire a signed POST to the dev
    // server so it can mirror the row into the dev DB before the popup closes.
    if (devOrigin) {
      console.log(`[META-CALLBACK] dev-sync: devOrigin=${devOrigin} secretPrefix=${(process.env.OAUTH_STATE_SECRET ?? process.env.CLERK_SECRET_KEY ?? "").slice(0,8)}...`);
      try {
        const syncMeta = Object.keys(storedMetadata).length ? JSON.stringify(storedMetadata) : null;
        await syncToDevServer(devOrigin, {
          provider, userId,
          accountName: userInfo.name,
          accountId: userInfo.id,
          accessToken: tokens.access_token,
          metadata: syncMeta,
        });
        console.log(`[META-CALLBACK] ✓ dev-sync OK → ${devOrigin}`);
        logger.info({ provider, userId, devOrigin }, "Dev-sync succeeded");
      } catch (syncErr: any) {
        console.error(`[META-CALLBACK] ✗ dev-sync FAILED (non-fatal): ${syncErr?.message}`);
        logger.warn({ provider, userId, devOrigin, error: syncErr?.message }, "Dev-sync failed (non-fatal)");
      }
    } else {
      console.warn("[DEV-SYNC SKIPPED]", {
        reason: "devOrigin missing — REPLIT_DEV_DOMAIN was unset when oauth-start ran on dev server",
        replitDevDomain: process.env.REPLIT_DEV_DOMAIN ?? "unset",
        publicAppUrl: process.env.PUBLIC_APP_URL ?? "unset",
        note: "Dev DB will NOT receive this token. User will see no_token error.",
      });
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
          console.log(`[META-CALLBACK] missing scopes: ${missingScopes.join(",")}`);
          logger.warn({ provider, userId, missingScopes, grantedScopes }, "Meta OAuth: MISSING required scopes");
        } else {
          console.log(`[META-CALLBACK] all required scopes granted: ${grantedScopes.join(",")}`);
          logger.info({ provider, userId, grantedScopes }, "Meta OAuth: all required scopes granted");
        }
      }
    } catch (permErr: any) {
      logger.warn({ provider, userId, error: permErr?.message }, "Meta /me/permissions exception");
    }

    // ── 6. Log and redirect ──
    logCallback({
      ts: new Date().toISOString(),
      provider,
      callbackReached: true,
      codeReceived: true,
      stateValid: true,
      tokenExchangeStatus: "success",
      connectionSaved: true,
      finalRedirectUrl: "pending",
      pagesFound,
      pageNames,
      grantedScopes,
      missingScopes,
    });
    redirectSuccess(res, provider, devOrigin, returnTo);

  } catch (e: any) {
    redirectError(res, provider, e?.message ?? "token_exchange_failed", "meta_token", devOrigin, { codeReceived: true, stateValid: true });
  }
});

// ── TikTok ────────────────────────────────────────────────────────────────────
router.get("/oauth/tiktok/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  if (error) { redirectError(res, "tiktok", error, "tiktok_callback"); return; }
  if (!code || !state) { redirectError(res, "tiktok", "missing_params", "tiktok_callback", undefined, { codeReceived: !!code }); return; }

  const verified = verifyState(state, ["tiktok"]);
  if (!verified) { redirectError(res, "tiktok", "invalid_state", "state_verify", undefined, { codeReceived: true, stateValid: false }); return; }
  const { userId, devOrigin } = verified;

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

    redirectSuccess(res, "tiktok", devOrigin);
  } catch (e: any) {
    redirectError(res, "tiktok", e?.message ?? "token_exchange_failed", "tiktok_token", devOrigin, { codeReceived: true, stateValid: true });
  }
});

// ── LinkedIn ──────────────────────────────────────────────────────────────────
router.get("/oauth/linkedin/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  if (error) { redirectError(res, "linkedin", error, "linkedin_callback"); return; }
  if (!code || !state) { redirectError(res, "linkedin", "missing_params", "linkedin_callback", undefined, { codeReceived: !!code }); return; }

  const verified = verifyState(state, ["linkedin"]);
  if (!verified) { redirectError(res, "linkedin", "invalid_state", "state_verify", undefined, { codeReceived: true, stateValid: false }); return; }
  const { userId, devOrigin } = verified;

  try {
    const redirectUri = `${getAppBase()}/api/oauth/linkedin/callback`;
    const r = await fetch(...);("https://www.linkedin.com/oauth/v2/accessToken", {
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

    redirectSuccess(res, "linkedin", devOrigin);
  } catch (e: any) {
    redirectError(res, "linkedin", e?.message ?? "token_exchange_failed", "linkedin_token", devOrigin, { codeReceived: true, stateValid: true });
  }
});

export default router;

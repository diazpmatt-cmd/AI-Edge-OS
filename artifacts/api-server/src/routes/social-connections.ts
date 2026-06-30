import { Router } from "express";
import { createHmac, randomBytes } from "node:crypto";
import { db } from "@workspace/db";
import { socialConnectionsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { generateState } from "../lib/oauthState";
import { getCallbackLog } from "../lib/callbackDebugLog";

const router = Router();

router.get("/social-connections/debug", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const ENV_KEYS: Record<string, string[]> = {
    google_business: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
    youtube:         ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
    facebook:        ["META_APP_ID", "META_APP_SECRET"],
    instagram:       ["META_APP_ID", "META_APP_SECRET"],
    tiktok:          ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    linkedin:        ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
  };

  const dbRows = await db.select().from(socialConnectionsTable).where(eq(socialConnectionsTable.userId, userId));
  const dbByProvider = new Map(dbRows.map((r) => [r.provider, r]));

  const result = Object.entries(ENV_KEYS).map(([provider, keys]) => {
    const dbRow = dbByProvider.get(provider);
    const configuredKeys = keys.filter((k) => !!process.env[k]);
    const source: string = dbRow
      ? "replit_database"
      : configuredKeys.length > 0
        ? "env_secrets_only"
        : "not_configured";
    return {
      provider,
      inDatabase: !!dbRow,
      accountName: dbRow?.accountName ?? null,
      accountId: dbRow?.accountId ?? null,
      expiresAt: dbRow?.expiresAt?.toISOString() ?? null,
      envKeysConfigured: configuredKeys,
      envKeysMissing: keys.filter((k) => !process.env[k]),
      source,
    };
  });

  res.json(result);
});

router.get("/social-connections", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const rows = await db.select().from(socialConnectionsTable)
    .where(eq(socialConnectionsTable.userId, userId));
  res.json(rows.map((r) => ({
    id: r.id, provider: r.provider,
    accountName: r.accountName, accountId: r.accountId,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  })));
});

router.delete("/social-connections/:provider", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  await db.delete(socialConnectionsTable)
    .where(and(
      eq(socialConnectionsTable.userId, userId),
      eq(socialConnectionsTable.provider, req.params.provider),
    ));
  res.status(204).send();
});

// ── Dev/prod DB bridge ──────────────────────────────────────────────────────
// The deployed API server saves OAuth tokens to the PRODUCTION database.
// This endpoint lets the deployed server mirror a freshly-saved connection
// into the DEV database so the dev frontend sees it immediately.
// Access is gated by an HMAC-SHA256 signature using OAUTH_STATE_SECRET
// (the same key the deployed server signs its state JWTs with), so no
// Clerk session is required — the caller is our own deployed server.
// ── dev-export: returns a connection row so the dev server can pull it ────────
// Auth: HMAC-signed request (userId + provider + nonce signed with OAUTH_STATE_SECRET).
// This avoids forwarding Clerk JWTs cross-environment, which fails because the
// deployed Clerk instance rejects JWTs issued by the dev frontend (azp mismatch).
router.get("/social-connections/dev-export", async (req, res) => {
  const { provider, userId, nonce, sig } = req.query as Record<string, string>;

  if (!provider || !userId || !nonce || !sig) {
    console.error(`[DEV-EXPORT] missing params: provider=${!!provider} userId=${!!userId} nonce=${!!nonce} sig=${!!sig}`);
    res.status(400).json({ error: "Missing required params (provider, userId, nonce, sig)" });
    return;
  }

  const secret = process.env.OAUTH_STATE_SECRET ?? process.env.CLERK_SECRET_KEY ?? "";
  if (!secret) {
    console.error(`[DEV-EXPORT] no signing secret — OAUTH_STATE_SECRET and CLERK_SECRET_KEY both unset`);
    res.status(500).json({ error: "No signing secret configured" });
    return;
  }

  const expected = createHmac("sha256", secret).update(`${userId}:${provider}:${nonce}`).digest("hex");
  if (sig !== expected) {
    console.error(`[DEV-EXPORT] ✗ HMAC mismatch for userId=${userId} provider=${provider}`);
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  console.log(`[DEV-EXPORT] ✓ HMAC OK: userId=${userId} provider=${provider} NODE_ENV=${process.env.NODE_ENV}`);

  const [row] = await db.select().from(socialConnectionsTable).where(
    and(eq(socialConnectionsTable.userId, userId), eq(socialConnectionsTable.provider, provider))
  );

  if (!row?.accessToken) {
    console.log(`[DEV-EXPORT] not found in DB`);
    res.json({ found: false, provider, userId });
    return;
  }

  console.log(`[DEV-EXPORT] ✓ found: accountName=${row.accountName} tokenLen=${row.accessToken.length}`);
  res.json({
    found: true,
    provider: row.provider,
    userId: row.userId,
    accountName: row.accountName,
    accountId: row.accountId,
    accessToken: row.accessToken,
    refreshToken: row.refreshToken ?? null,
    metadata: row.metadata ?? null,
  });
});

// ── pull-from-prod: dev server pulls a connection row from the deployed server ─
// Uses HMAC-signed requests to avoid Clerk JWT forwarding (which fails cross-env
// because the deployed Clerk instance rejects JWTs issued by the dev frontend).
router.post("/social-connections/pull-from-prod", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { provider } = req.body ?? {};
  if (!provider) { res.status(400).json({ error: "Missing provider" }); return; }

  const prodUrl = process.env.PUBLIC_APP_URL;
  if (!prodUrl) { res.status(500).json({ error: "PUBLIC_APP_URL not set" }); return; }

  const secret = process.env.OAUTH_STATE_SECRET ?? process.env.CLERK_SECRET_KEY ?? "";
  if (!secret) { res.status(500).json({ error: "No signing secret configured" }); return; }

  const nonce = randomBytes(8).toString("hex");
  const sig = createHmac("sha256", secret).update(`${userId}:${provider}:${nonce}`).digest("hex");

  console.log(`[PULL-FROM-PROD] userId=${userId} provider=${provider} → ${prodUrl} (HMAC auth)`);

  try {
    const exportUrl = `${prodUrl}/api/social-connections/dev-export?` +
      `provider=${encodeURIComponent(provider)}&userId=${encodeURIComponent(userId)}&nonce=${nonce}&sig=${sig}`;

    let exportRes: Response;
    try {
      exportRes = await fetch(exportUrl, { signal: AbortSignal.timeout(10000) });
    } catch (fetchErr: any) {
      console.error(`[PULL-FROM-PROD] fetch error: ${fetchErr?.message}`);
      res.status(502).json({ error: "fetch_failed", message: fetchErr?.message });
      return;
    }

    const rawBody = await exportRes.text().catch(() => "");
    console.log(`[PULL-FROM-PROD] export response: status=${exportRes.status} body=${rawBody.slice(0, 300)}`);

    if (!exportRes.ok) {
      res.status(502).json({ error: "prod_export_failed", status: exportRes.status, body: rawBody.slice(0, 200) });
      return;
    }

    let data: { found: boolean; provider?: string; accountName?: string; accountId?: string; accessToken?: string; refreshToken?: string | null; metadata?: string | null };
    try { data = JSON.parse(rawBody); } catch {
      res.status(502).json({ error: "parse_failed", raw: rawBody.slice(0, 200) });
      return;
    }

    if (!data.found || !data.accessToken) {
      console.log(`[PULL-FROM-PROD] not found in prod DB`);
      res.json({ synced: false, reason: "not_found_in_prod" });
      return;
    }

    await db.insert(socialConnectionsTable).values({
      userId,
      provider: data.provider ?? provider,
      accountName: data.accountName ?? null,
      accountId: data.accountId ?? null,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken ?? null,
      expiresAt: null,
      metadata: data.metadata ?? null,
    }).onConflictDoUpdate({
      target: [socialConnectionsTable.userId, socialConnectionsTable.provider],
      set: {
        accountName: data.accountName ?? null,
        accountId: data.accountId ?? null,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken ?? null,
        metadata: data.metadata ?? null,
        updatedAt: new Date(),
      },
    });

    console.log(`[PULL-FROM-PROD] ✓ written to dev DB: provider=${provider} userId=${userId}`);
    res.json({ synced: true, provider, userId });
  } catch (e: any) {
    console.error(`[PULL-FROM-PROD] ✗ unexpected error: ${e?.message}`);
    res.status(500).json({ error: e?.message });
  }
});

router.post("/social-connections/oauth-sync", async (req, res) => {
  const { provider, userId, accountName, accountId, accessToken, metadata, sig } = req.body ?? {};
  console.log(`[OAUTH-SYNC] received: provider=${provider} userId=${userId ?? "NULL"} hasAccessToken=${!!accessToken} hasSig=${!!sig} NODE_ENV=${process.env.NODE_ENV}`);

  if (!provider || !userId || !accessToken || !sig) {
    const missing = ["provider","userId","accessToken","sig"].filter(k => !(req.body ?? {})[k]);
    console.error(`[OAUTH-SYNC] missing required fields: ${missing.join(",")}`);
    res.status(400).json({ error: "Missing required fields", missing });
    return;
  }

  const secret = process.env.OAUTH_STATE_SECRET ?? process.env.CLERK_SECRET_KEY ?? "";
  if (!secret) {
    console.error(`[OAUTH-SYNC] no signing secret — OAUTH_STATE_SECRET and CLERK_SECRET_KEY both unset`);
    res.status(500).json({ error: "No signing secret configured" });
    return;
  }

  const payload = { provider, userId, accountName, accountId, accessToken, metadata: metadata ?? null };
  const expected = createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");
  if (sig !== expected) {
    console.error(`[OAUTH-SYNC] ✗ signature mismatch provider=${provider} userId=${userId} secretPrefix=${secret.slice(0,8)}...`);
    res.status(401).json({ error: "Invalid signature" });
    return;
  }
  console.log(`[OAUTH-SYNC] ✓ signature OK, saving to DB (DATABASE_URL_set=${!!process.env.DATABASE_URL})`);

  try {
    await db.insert(socialConnectionsTable).values({
      userId, provider,
      accountName: accountName ?? null,
      accountId: accountId ?? null,
      accessToken,
      refreshToken: null,
      expiresAt: null,
      metadata: metadata ?? null,
    }).onConflictDoUpdate({
      target: [socialConnectionsTable.userId, socialConnectionsTable.provider],
      set: {
        accountName: accountName ?? null,
        accountId: accountId ?? null,
        accessToken,
        metadata: metadata ?? null,
        updatedAt: new Date(),
      },
    });
    console.log(`[OAUTH-SYNC] ✓ DB save OK: provider=${provider} userId=${userId} metadata=${metadata ? "set" : "null"}`);
    res.json({ ok: true, provider, userId });
  } catch (dbErr: any) {
    const pgCode = (dbErr as any)?.code ?? "no_code";
    const pgDetail = (dbErr as any)?.detail ?? "";
    const pgConstraint = (dbErr as any)?.constraint ?? "";
    console.error(
      `[OAUTH-SYNC] ✗ DB save FAILED: ${dbErr?.message} [pg.code=${pgCode} constraint=${pgConstraint} detail=${pgDetail}]`
    );
    res.status(500).json({ error: "db_save_failed", message: dbErr?.message, pgCode, pgConstraint });
  }
});

router.post("/social-connections/oauth-start/:provider", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { provider } = req.params;
  const returnTo: string | undefined = req.body?.returnTo;
  // Pass the current dev-server origin into the signed state so the deployed
  // callback can redirect the popup window back to the dev server's /oauth-close
  // (same origin as the opener → postMessage works even cross-deployment).
  const devOrigin: string | undefined = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : undefined;

  const OAUTH_CONFIG: Record<string, { envKey: string; buildUrl: (baseUrl: string) => string }> = {
    google_business: {
      envKey: "GOOGLE_OAUTH_CLIENT_ID",
      buildUrl: (base) => {
        const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
        if (!clientId) return "";
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: `${base}/api/oauth/google/callback`,
          response_type: "code",
          scope: "https://www.googleapis.com/auth/business.manage openid email",
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
          state: generateState(userId, "google_business", undefined, devOrigin),
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
      },
    },
    youtube: {
      envKey: "GOOGLE_OAUTH_CLIENT_ID",
      buildUrl: (base) => {
        const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
        if (!clientId) return "";
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: `${base}/api/oauth/google/callback`,
          response_type: "code",
          scope: "https://www.googleapis.com/auth/youtube.readonly openid email profile",
          access_type: "offline",
          prompt: "consent",
          state: generateState(userId, "youtube", undefined, devOrigin),
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
      },
    },
    google_basic: {
      envKey: "GOOGLE_OAUTH_CLIENT_ID",
      buildUrl: (base) => {
        const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
        if (!clientId) return "";
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: `${base}/api/oauth/google/callback`,
          response_type: "code",
          scope: "openid email profile",
          access_type: "offline",
          prompt: "consent",
          state: generateState(userId, "google_basic", undefined, devOrigin),
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
      },
    },
    youtube_readonly: {
      envKey: "GOOGLE_OAUTH_CLIENT_ID",
      buildUrl: (base) => {
        const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
        if (!clientId) return "";
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: `${base}/api/oauth/google/callback`,
          response_type: "code",
          scope: "https://www.googleapis.com/auth/youtube.readonly openid email profile",
          access_type: "offline",
          prompt: "consent",
          state: generateState(userId, "youtube_readonly", undefined, devOrigin),
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
      },
    },
    facebook: {
      envKey: "META_APP_ID",
      buildUrl: (base) => {
        const appId = process.env.META_APP_ID;
        if (!appId) return "";
        const params = new URLSearchParams({
          client_id: appId,
          redirect_uri: `${base}/api/oauth/meta/callback`,
          response_type: "code",
          // pages_manage_posts + pages_read_engagement are required to publish posts
          scope: "public_profile,pages_show_list,pages_manage_posts,pages_read_engagement",
          state: generateState(userId, "facebook", returnTo, devOrigin),
        });
        return `https://www.facebook.com/v19.0/dialog/oauth?${params}`;
      },
    },
    instagram: {
      envKey: "META_APP_ID",
      buildUrl: (base) => {
        const appId = process.env.META_APP_ID;
        if (!appId) return "";
        const params = new URLSearchParams({
          client_id: appId,
          redirect_uri: `${base}/api/oauth/meta/callback`,
          response_type: "code",
          // Full set: pages needed for FB publishing + instagram for IG publishing
          scope: "public_profile,pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish",
          state: generateState(userId, "instagram", returnTo, devOrigin),
        });
        return `https://www.facebook.com/v19.0/dialog/oauth?${params}`;
      },
    },
    tiktok: {
      envKey: "TIKTOK_CLIENT_KEY",
      buildUrl: (base) => {
        const clientKey = process.env.TIKTOK_CLIENT_KEY;
        if (!clientKey) return "";
        const params = new URLSearchParams({
          client_key: clientKey,
          redirect_uri: `${base}/api/oauth/tiktok/callback`,
          response_type: "code",
          // video.publish — required for Content Posting API.
          // NOTE: video.publish requires TikTok app review/approval before it
          // works in production. In sandbox mode the token exchange will succeed
          // but the Content Posting API will return error_code 2061 (permission
          // denied). Request approval in TikTok Developer Portal → Products tab.
          scope: "user.info.basic,user.info.profile,video.list,video.publish",
          state: generateState(userId, "tiktok"),
        });
        return `https://www.tiktok.com/v2/auth/authorize?${params}`;
      },
    },
    linkedin: {
      envKey: "LINKEDIN_CLIENT_ID",
      buildUrl: (base) => {
        const clientId = process.env.LINKEDIN_CLIENT_ID;
        if (!clientId) return "";
        const params = new URLSearchParams({
          response_type: "code",
          client_id: clientId,
          redirect_uri: `${base}/api/oauth/linkedin/callback`,
          scope: "w_organization_social r_organization_social",
          state: generateState(userId, "linkedin"),
        });
        return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
      },
    },
  };

  const cfg = OAUTH_CONFIG[provider];
  if (!cfg) { res.status(400).json({ error: "Unknown provider" }); return; }

  const envValue = process.env[cfg.envKey];
  if (!envValue) {
    res.json({ configured: false, url: "", message: `${cfg.envKey} not set in Secrets` });
    return;
  }

  const appBase = process.env.PUBLIC_APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN}`;
  const url = cfg.buildUrl(appBase);

  // DIAGNOSTIC LOG — parse and print each OAuth param clearly
  try {
    const parsed = new URL(url);
    const scopeParam = parsed.searchParams.get("scope") ?? "";
    const scopes = scopeParam.split(/[ +]/).filter(Boolean);
    const authUrlIncludesBusinessManage = scopes.some(s => s.includes("business.manage"));
    console.log("[GOOGLE-OAUTH-START]", JSON.stringify({
      provider,
      scopes,
      authUrlIncludesBusinessManage,
      redirectUri: parsed.searchParams.get("redirect_uri"),
      prompt: parsed.searchParams.get("prompt"),
      accessType: parsed.searchParams.get("access_type"),
      includeGrantedScopes: parsed.searchParams.get("include_granted_scopes"),
      nodeEnv: process.env.NODE_ENV ?? "unset",
    }));
  } catch { /* ignore parse errors */ }

  res.json({ configured: true, url });
});

router.get("/social-connections/meta-publish-status", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const REQUIRED_SCOPES = ["pages_show_list", "pages_manage_posts", "pages_read_engagement"];

  type FailureReason =
    | "no_token"
    | "no_pages_found"
    | "missing_permissions"
    | "missing_page_token"
    | "missing_instagram_business"
    | "unknown_error"
    | null;

  const [fbRow] = await db.select().from(socialConnectionsTable).where(
    and(eq(socialConnectionsTable.userId, userId), eq(socialConnectionsTable.provider, "facebook"))
  );

  console.log(`[META-STATUS] userId=${userId} fbRow=${fbRow ? "found" : "NOT FOUND"}`);

  if (!fbRow) {
    console.log(`[META-STATUS] no_token — no facebook row in DB for this user`);
    res.json({
      connected: false,
      statusLabel: "not_connected",
      failureReason: "no_token" as FailureReason,
      userTokenExists: false,
      accountName: null,
      grantedScopes: [],
      missingScopes: REQUIRED_SCOPES,
      hasPublishPermissions: false,
      pagesFound: 0,
      pageNames: [],
      pageTokenStored: false,
      pageName: null,
      pageId: null,
      instagramBusinessFound: false,
      instagramBusinessAccountId: null,
      permissionsError: null,
    });
    return;
  }

  let metadata: Record<string, any> = {};
  try { if (fbRow.metadata) metadata = JSON.parse(fbRow.metadata); } catch {}

  console.log(`[META-STATUS] metadata keys=${Object.keys(metadata).join(",") || "(empty)"}`);
  console.log(`[META-STATUS] metadata.pageId=${metadata.pageId ?? "null"} pageName=${metadata.pageName ?? "null"} pageAccessToken=${metadata.pageAccessToken ? "set" : "null"} instagramBusinessAccountId=${metadata.instagramBusinessAccountId ?? "null"}`);

  let grantedScopes: string[] = [];
  let permissionsError: string | null = null;
  let pagesFound = 0;
  let pageNames: string[] = [];

  if (fbRow.accessToken) {
    // ── /me/permissions ──────────────────────────────────────────────────────
    try {
      const permR = await fetch(`https://graph.facebook.com/v19.0/me/permissions?access_token=${fbRow.accessToken}`);
      if (permR.ok) {
        const permData = await permR.json() as { data: Array<{ permission: string; status: string }> };
        grantedScopes = permData.data.filter(p => p.status === "granted").map(p => p.permission);
        const declinedScopes = permData.data.filter(p => p.status !== "granted").map(p => p.permission);
        console.log(`[META-STATUS] /me/permissions OK — granted=${grantedScopes.join(",") || "(none)"} declined=${declinedScopes.join(",") || "(none)"}`);
      } else {
        const body = await permR.text().catch(() => "");
        permissionsError = `permissions API ${permR.status}: ${body.slice(0, 120)}`;
        console.error(`[META-STATUS] /me/permissions FAILED ${permR.status}: ${body.slice(0, 200)}`);
      }
    } catch (e: any) {
      permissionsError = e?.message ?? "unknown error";
      console.error(`[META-STATUS] /me/permissions exception: ${permissionsError}`);
    }

    // ── /me/accounts ─────────────────────────────────────────────────────────
    try {
      const acctR = await fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token&access_token=${fbRow.accessToken}`);
      const rawText = await acctR.text();
      console.log(`[META-STATUS] /me/accounts HTTP ${acctR.status} raw: ${rawText.slice(0, 500)}`);
      let acctData: { data?: Array<{ id: string; name: string; access_token?: string }>; error?: { message: string; code: number } } = {};
      try { acctData = JSON.parse(rawText); } catch { console.error(`[META-STATUS] /me/accounts JSON parse failed`); }
      if (acctData.error) {
        console.error(`[META-STATUS] /me/accounts Graph error code=${acctData.error.code}: ${acctData.error.message}`);
      } else {
        pagesFound = acctData.data?.length ?? 0;
        pageNames = (acctData.data ?? []).map(p => p.name);
        console.log(`[META-STATUS] /me/accounts → pagesFound=${pagesFound} pageNames=[${pageNames.join(", ")}]`);
        (acctData.data ?? []).forEach((p, i) => {
          console.log(`[META-STATUS]   page[${i}]: id=${p.id} name="${p.name}" hasAccessToken=${!!p.access_token}`);
        });
      }
    } catch (e: any) {
      console.error(`[META-STATUS] /me/accounts exception: ${e?.message}`);
    }
  }

  const missingScopes = REQUIRED_SCOPES.filter(s => !grantedScopes.includes(s));
  const hasPublishPermissions = missingScopes.length === 0;
  const pageTokenStored = !!(metadata.pageAccessToken);
  const instagramBusinessFound = !!(metadata.instagramBusinessAccountId);

  console.log(`[META-STATUS] missingScopes=[${missingScopes.join(",")}] hasPublishPermissions=${hasPublishPermissions} pageTokenStored=${pageTokenStored} pagesFound=${pagesFound} instagramBusinessFound=${instagramBusinessFound}`);

  // ── Determine primary failure reason ─────────────────────────────────────
  let failureReason: FailureReason = null;
  if (permissionsError && grantedScopes.length === 0) {
    failureReason = "unknown_error";
  } else if (missingScopes.length > 0) {
    failureReason = "missing_permissions";
  } else if (pagesFound === 0 && !pageTokenStored) {
    failureReason = "no_pages_found";
  } else if (pagesFound > 0 && !pageTokenStored) {
    failureReason = "missing_page_token";
  } else if (pageTokenStored && !instagramBusinessFound) {
    failureReason = "missing_instagram_business";
  }

  let statusLabel: "not_connected" | "missing_permissions" | "ready_to_publish";
  if (!hasPublishPermissions || (pagesFound === 0 && !pageTokenStored)) {
    statusLabel = "missing_permissions";
  } else {
    statusLabel = "ready_to_publish";
  }

  console.log(`[META-STATUS] → statusLabel=${statusLabel} failureReason=${failureReason ?? "null (success)"}`);

  res.json({
    connected: true,
    statusLabel,
    failureReason,
    userTokenExists: true,
    accountName: fbRow.accountName,
    grantedScopes,
    missingScopes,
    hasPublishPermissions,
    pagesFound,
    pageNames,
    pageTokenStored,
    pageName: metadata.pageName ?? (pageNames[0] ?? null),
    pageId: metadata.pageId ?? null,
    instagramBusinessFound,
    instagramBusinessAccountId: metadata.instagramBusinessAccountId ?? null,
    permissionsError,
  });
});

// ── Google Business Profile status (detailed, mirrors meta-publish-status) ────
router.get("/social-connections/google-business-status", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  type GBPFailureReason =
    | "token_not_found_in_dev"
    | "token_saved_but_no_refresh_token"
    | "missing_business_manage_scope"
    | "google_api_not_enabled"
    | "no_gbp_accounts_found"
    | "no_gbp_locations_found"
    | "google_api_error"
    | null;

  const [row] = await db.select().from(socialConnectionsTable).where(
    and(eq(socialConnectionsTable.userId, userId), eq(socialConnectionsTable.provider, "google_business"))
  );

  console.log(`[GBP-STATUS] userId=${userId} row=${row ? "found" : "NOT FOUND"}`);
  console.log(`[GOOGLE-VERIFY-LOOKUP] provider=google_business userId=${userId} found=${!!row}`);

  if (!row?.accessToken) {
    console.log(`[GBP-STATUS] token_not_found_in_dev — no google_business row in DB for this user`);
    res.json({
      connected: false,
      statusLabel: "not_connected",
      failureReason: "token_not_found_in_dev" as GBPFailureReason,
      tokenExists: false,
      refreshTokenExists: false,
      accountName: null,
      businessManageScopeGranted: false,
      gbpAccountsFound: 0,
      gbpLocationsFound: 0,
      locationNames: [],
      selectedLocationName: null,
      apiError: null,
    });
    return;
  }

  let metadata: Record<string, any> = {};
  try { if (row.metadata) metadata = JSON.parse(row.metadata); } catch {}

  console.log(`[GBP-STATUS] metadata keys=${Object.keys(metadata).join(",") || "(empty)"}`);

  const refreshTokenExists = !!(row.refreshToken);
  let gbpAccountsFound = 0;
  let gbpLocationsFound = 0;
  let locationNames: string[] = [];
  let selectedLocationName: string | null = metadata.primaryLocationTitle ?? null;
  let businessManageScopeGranted = false;
  let apiError: string | null = null;
  let failureReason: GBPFailureReason = null;

  // ── Check granted scopes via tokeninfo ──
  let grantedScopes: string[] = [];
  let hasBusinessManage = false;
  try {
    const tiR = await fetch(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${row.accessToken}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (tiR.ok) {
      const ti = await tiR.json() as { scope?: string; email?: string; expires_in?: number };
      grantedScopes = (ti.scope ?? "").split(" ").filter(Boolean);
      hasBusinessManage = grantedScopes.some(s => s.includes("business.manage"));
      console.log("[GOOGLE-VERIFY]", JSON.stringify({
        grantedScopes,
        hasBusinessManage,
        tokenInfoEmail: ti.email,
        tokenExpiresIn: ti.expires_in,
      }));
    } else {
      const tiBody = await tiR.text();
      console.warn(`[GOOGLE-VERIFY] tokeninfo HTTP ${tiR.status}: ${tiBody.slice(0, 200)}`);
    }
  } catch (tiErr: any) {
    console.warn(`[GOOGLE-VERIFY] tokeninfo fetch failed: ${tiErr?.message}`);
  }

  // ── Fetch GBP accounts ──
  console.log(`[GOOGLE-VERIFY] fetching GBP accounts (hasBusinessManage=${hasBusinessManage})...`);
  try {
    const acctR = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
      headers: { Authorization: `Bearer ${row.accessToken}` },
      signal: AbortSignal.timeout(8000),
    });
    const acctBody = await acctR.text();
    console.log("[GOOGLE-VERIFY]", JSON.stringify({
      accountsResponseStatus: acctR.status,
      accountsResponseBody: acctBody.slice(0, 800),
    }));

    if (acctR.ok) {
      const acctData = JSON.parse(acctBody) as { accounts?: Array<{ name: string; accountName: string }> };
      gbpAccountsFound = acctData.accounts?.length ?? 0;
      businessManageScopeGranted = true;
      console.log(`[GOOGLE-VERIFY] accounts found = ${gbpAccountsFound}`);

      if (gbpAccountsFound === 0) {
        failureReason = "no_gbp_accounts_found";
      } else {
        // ── Fetch locations ──
        const firstAccount = acctData.accounts![0];
        try {
          const locR = await fetch(
            `https://mybusinessbusinessinformation.googleapis.com/v1/${firstAccount.name}/locations?readMask=name,title`,
            { headers: { Authorization: `Bearer ${row.accessToken}` }, signal: AbortSignal.timeout(8000) }
          );
          const locBody = await locR.text();
          console.log(`[GOOGLE-VERIFY] locations API status=${locR.status} body=${locBody.slice(0, 500)}`);

          if (locR.ok) {
            const locData = JSON.parse(locBody) as { locations?: Array<{ name: string; title: string }> };
            const locs = locData.locations ?? [];
            gbpLocationsFound = locs.length;
            locationNames = locs.map(l => l.title);
            console.log(`[GOOGLE-VERIFY] locations found = ${gbpLocationsFound} names=${JSON.stringify(locationNames)}`);

            if (gbpLocationsFound === 0) {
              failureReason = "no_gbp_locations_found";
            } else {
              const primaryLoc = locs[0];
              selectedLocationName = primaryLoc.title;
              console.log(`[GOOGLE-VERIFY] selectedLocationName="${selectedLocationName}" locationName="${primaryLoc.name}"`);

              // Update metadata with latest location info (includes resource names for API caching)
              try {
                const updatedMeta = {
                  ...metadata,
                  accountName: firstAccount.name,
                  locationName: primaryLoc.name,
                  locationTitle: primaryLoc.title,
                  primaryLocationTitle: primaryLoc.title,
                  locationNames,
                  gbpAccountsFound,
                  gbpLocationsFound,
                };
                await db.update(socialConnectionsTable)
                  .set({ metadata: JSON.stringify(updatedMeta), updatedAt: new Date() })
                  .where(and(eq(socialConnectionsTable.userId, userId), eq(socialConnectionsTable.provider, "google_business")));
              } catch { /* non-fatal */ }
            }
          } else {
            const errJson = JSON.parse(locBody) as any;
            apiError = `Locations API: HTTP ${locR.status} — ${errJson?.error?.message ?? locBody.slice(0, 120)}`;
            console.warn(`[GOOGLE-VERIFY] locations API failed: ${apiError}`);
            failureReason = "google_api_error";
          }
        } catch (locErr: any) {
          apiError = `Locations fetch error: ${locErr?.message}`;
          console.warn(`[GOOGLE-VERIFY] ${apiError}`);
          failureReason = "google_api_error";
        }
      }
    } else {
      let errMsg = acctBody.slice(0, 400);
      try { errMsg = (JSON.parse(acctBody) as any)?.error?.message ?? errMsg; } catch {}
      console.warn(`[GOOGLE-VERIFY] accounts API failed HTTP ${acctR.status}: ${errMsg}`);
      if (acctR.status === 403 || acctR.status === 401) {
        // Distinguish "API not enabled in GCP" from "business.manage scope not granted"
        const isApiDisabled = /has not been used|is disabled|SERVICE_DISABLED|PROJECT_INVALID/i.test(errMsg);
        const isScopeError = /insufficient.*scope|authError|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(errMsg);
        if (isApiDisabled) {
          failureReason = "google_api_not_enabled";
          console.warn(`[GOOGLE-VERIFY] → google_api_not_enabled (API not enabled in GCP Console)`);
        } else if (isScopeError || !isApiDisabled) {
          failureReason = "missing_business_manage_scope";
          console.warn(`[GOOGLE-VERIFY] → missing_business_manage_scope (scope not granted or insufficient)`);
        }
        apiError = `Accounts API: HTTP ${acctR.status} — ${errMsg}`;
      } else {
        failureReason = "google_api_error";
        apiError = `Accounts API: HTTP ${acctR.status} — ${errMsg}`;
      }
    }
  } catch (acctErr: any) {
    apiError = `Accounts fetch error: ${acctErr?.message}`;
    console.warn(`[GOOGLE-VERIFY] ${apiError}`);
    failureReason = "google_api_error";
  }

  if (!refreshTokenExists && !failureReason) {
    failureReason = "token_saved_but_no_refresh_token";
  }

  const statusLabel = !failureReason ? "connected" : failureReason;
  console.log(`[GBP-STATUS] → statusLabel=${statusLabel} failureReason=${failureReason ?? "null (success)"} accounts=${gbpAccountsFound} locations=${gbpLocationsFound} location="${selectedLocationName ?? "none"}"`);

  res.json({
    connected: !failureReason,
    statusLabel,
    failureReason,
    tokenExists: true,
    refreshTokenExists,
    accountName: row.accountName,
    businessManageScopeGranted,
    gbpAccountsFound,
    gbpLocationsFound,
    locationNames,
    selectedLocationName,
    locationTitle: metadata.locationTitle ?? selectedLocationName ?? null,
    locationName: metadata.locationName ?? null,
    apiError,
  });
});

// ── Google Business Profile: force-refresh cached account + location ──────────
router.post("/social-connections/google-business-refresh-location", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [row] = await db.select().from(socialConnectionsTable)
    .where(and(eq(socialConnectionsTable.userId, userId), eq(socialConnectionsTable.provider, "google_business")));
  if (!row?.accessToken) { res.status(400).json({ error: "Google Business Profile not connected" }); return; }

  let metadata: Record<string, any> = {};
  try { if (row.metadata) metadata = JSON.parse(row.metadata); } catch {}

  const now = new Date();

  // ── Single cooldown guard (quota OR button cooldown — same 10-min window) ────
  if (metadata.cooldownUntil) {
    const cd = new Date(metadata.cooldownUntil);
    if (cd > now) {
      const minsLeft = Math.ceil((cd.getTime() - now.getTime()) / 60000);
      res.status(429).json({
        error: `Google quota cooldown active — try again in ${minsLeft} minute${minsLeft !== 1 ? "s" : ""}.`,
        cooldownUntil: cd.toISOString(),
        minsLeft,
      });
      return;
    }
    delete metadata.cooldownUntil;
  }

  const saveCooldown = async (durationMs = 15 * 60 * 1000) => {
    const cooldownUntil = new Date(now.getTime() + durationMs).toISOString();
    try {
      await db.update(socialConnectionsTable)
        .set({ metadata: JSON.stringify({ ...metadata, cooldownUntil }), updatedAt: now })
        .where(and(eq(socialConnectionsTable.userId, userId), eq(socialConnectionsTable.provider, "google_business")));
    } catch {}
    return cooldownUntil;
  };

  try {
    const acctRes = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
      headers: { Authorization: `Bearer ${row.accessToken}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!acctRes.ok) {
      if (acctRes.status === 429) {
        const cooldownUntil = await saveCooldown();
        res.status(429).json({ error: `Google quota cooldown active. Try again in 15 minutes.`, cooldownUntil, minsLeft: 15 }); return;
      }
      const acctErrText = await acctRes.text();
      res.status(502).json({ error: `Accounts API: HTTP ${acctRes.status} — ${acctErrText.slice(0, 200)}` }); return;
    }
    const acctData = await acctRes.json() as { accounts?: { name: string; accountName: string }[] };
    const account = acctData.accounts?.[0];
    if (!account) { res.status(400).json({ error: "No Google Business Profile account found." }); return; }

    const locRes = await fetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,storefrontAddress`,
      { headers: { Authorization: `Bearer ${row.accessToken}` }, signal: AbortSignal.timeout(10000) },
    );
    if (!locRes.ok) {
      if (locRes.status === 429) {
        const cooldownUntil = await saveCooldown();
        res.status(429).json({ error: `Google quota cooldown active. Try again in 15 minutes.`, cooldownUntil, minsLeft: 15 }); return;
      }
      res.status(502).json({ error: `Locations API: HTTP ${locRes.status}` }); return;
    }
    const locData = await locRes.json() as { locations?: { name: string; title: string; storefrontAddress?: { addressLines?: string[]; locality?: string; administrativeArea?: string; postalCode?: string } }[] };
    const locs = locData.locations ?? [];
    if (!locs.length) { res.status(400).json({ error: "No locations found on this Google Business Profile account." }); return; }

    const primaryLoc = locs[0];
    // Extract IDs from resource names (e.g. "accounts/123456789" → "123456789")
    const accountId = account.name.split("/").pop() ?? null;
    const locationId = primaryLoc.name.split("/").pop() ?? null;
    // Format a human-readable address from storefrontAddress
    const sa = primaryLoc.storefrontAddress;
    const address = sa
      ? [
          ...(sa.addressLines ?? []),
          [sa.locality, sa.administrativeArea].filter(Boolean).join(", "),
          sa.postalCode,
        ].filter(Boolean).join(", ")
      : null;
    // 15-min cooldown after a successful refresh (prevents button hammering)
    const cooldownUntil = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
    const updatedMeta = {
      ...metadata,
      accountName: account.name,
      accountId,
      locationName: primaryLoc.name,
      locationId,
      locationTitle: primaryLoc.title,
      address,
      primaryLocationTitle: primaryLoc.title,
      locationNames: locs.map((l: { title: string }) => l.title),
      gbpAccountsFound: acctData.accounts!.length,
      gbpLocationsFound: locs.length,
      cachedAt: now.toISOString(),
      cooldownUntil,
    };
    await db.update(socialConnectionsTable)
      .set({ metadata: JSON.stringify(updatedMeta), updatedAt: now })
      .where(and(eq(socialConnectionsTable.userId, userId), eq(socialConnectionsTable.provider, "google_business")));

    console.log(`[GBP-REFRESH-LOCATION] userId=${userId} location="${primaryLoc.title}" address="${address}" locationId=${locationId} cooldownUntil=${cooldownUntil}`);
    res.json({ ok: true, accountName: account.name, accountId, locationName: primaryLoc.name, locationId, locationTitle: primaryLoc.title, address, locationCount: locs.length, cooldownUntil });
  } catch (e: any) {
    console.error("[GBP-REFRESH-LOCATION] error:", e?.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Google Business Profile: read cached location (no API call) ─────────────
router.get("/social-connections/google-business-cache", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [row] = await db.select().from(socialConnectionsTable)
    .where(and(eq(socialConnectionsTable.userId, userId), eq(socialConnectionsTable.provider, "google_business")));
  if (!row?.accessToken) { res.status(400).json({ error: "Google Business Profile not connected" }); return; }

  let metadata: Record<string, any> = {};
  try { if (row.metadata) metadata = JSON.parse(row.metadata); } catch {}

  const now = new Date();
  const cd = metadata.cooldownUntil ? new Date(metadata.cooldownUntil) : null;
  const activeCooldown = (cd && cd > now) ? cd.toISOString() : null;
  const hasCache = !!(metadata.locationName && metadata.accountName);

  res.json({
    hasCache,
    accountName: metadata.accountName ?? null,
    accountId: metadata.accountId ?? null,
    locationName: metadata.locationName ?? null,
    locationId: metadata.locationId ?? null,
    locationTitle: metadata.locationTitle ?? null,
    cachedAt: metadata.cachedAt ?? null,
    cooldownUntil: activeCooldown,
    minsLeft: activeCooldown ? Math.ceil((new Date(activeCooldown).getTime() - now.getTime()) / 60000) : null,
  });
});

router.get("/social-connections/meta-oauth-debug", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const appBase = process.env.PUBLIC_APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN}`;
  const redirectUri = `${appBase}/api/oauth/meta/callback`;
  const appId = process.env.META_APP_ID ?? "";
  const appSecretSet = !!process.env.META_APP_SECRET;
  const requestedScopes = "public_profile,pages_show_list,pages_manage_posts,pages_read_engagement";

  // Check for existing FB connection
  const [fbRow] = await db.select().from(socialConnectionsTable).where(
    and(eq(socialConnectionsTable.userId, userId), eq(socialConnectionsTable.provider, "facebook"))
  );

  let grantedScopes: string[] = [];
  let declinedScopes: string[] = [];
  let meAccountsResult: any = null;
  let permissionsError: string | null = null;

  let meIdentity: any = null;

  if (fbRow?.accessToken) {
    const tok = fbRow.accessToken;

    // ── /me — confirm token identity ──────────────────────────────────────────
    try {
      const meR = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${tok}`);
      const meBody = await meR.json();
      meIdentity = { httpStatus: meR.status, ...meBody };
      console.log(`[META-DEBUG] /me → status=${meR.status} id=${meBody.id ?? "?"} name="${meBody.name ?? "?"}"`);
      if (meBody.error) console.error(`[META-DEBUG] /me error code=${meBody.error.code}: ${meBody.error.message}`);
    } catch (e: any) {
      meIdentity = { error: e?.message };
      console.error(`[META-DEBUG] /me exception: ${e?.message}`);
    }

    // ── /me/permissions ───────────────────────────────────────────────────────
    try {
      const permR = await fetch(`https://graph.facebook.com/v19.0/me/permissions?access_token=${tok}`);
      if (permR.ok) {
        const permData = await permR.json() as { data: Array<{ permission: string; status: string }> };
        grantedScopes = permData.data.filter(p => p.status === "granted").map(p => p.permission);
        declinedScopes = permData.data.filter(p => p.status === "declined").map(p => p.permission);
        console.log(`[META-DEBUG] /me/permissions → granted=[${grantedScopes.join(",")}] declined=[${declinedScopes.join(",")}]`);
      } else {
        const body = await permR.text().catch(() => "");
        permissionsError = `HTTP ${permR.status}: ${body.slice(0, 120)}`;
        console.error(`[META-DEBUG] /me/permissions FAILED ${permR.status}: ${body.slice(0, 200)}`);
      }
    } catch (e: any) {
      permissionsError = e?.message ?? "unknown error";
      console.error(`[META-DEBUG] /me/permissions exception: ${e?.message}`);
    }

    // ── /me/accounts — request ALL fields including per-page access_token ─────
    try {
      const acctR = await fetch(
        `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,tasks,category&access_token=${tok}`
      );
      const rawText = await acctR.text();
      console.log(`[META-DEBUG] /me/accounts HTTP ${acctR.status} raw:\n${rawText}`);
      try {
        meAccountsResult = JSON.parse(rawText);
      } catch {
        meAccountsResult = { parseError: "could not parse JSON", raw: rawText };
      }
      const pages: any[] = meAccountsResult?.data ?? [];
      console.log(`[META-DEBUG] /me/accounts → pagesFound=${pages.length}`);
      pages.forEach((p: any, i: number) => {
        console.log(
          `[META-DEBUG]   page[${i}]: id=${p.id} name="${p.name}" ` +
          `hasAccessToken=${!!p.access_token} tasks=${JSON.stringify(p.tasks ?? [])} category=${p.category ?? "?"}`
        );
      });
      if (meAccountsResult?.error) {
        console.error(
          `[META-DEBUG] /me/accounts Graph error — code=${meAccountsResult.error.code} ` +
          `type=${meAccountsResult.error.type} msg="${meAccountsResult.error.message}"`
        );
      }
    } catch (e: any) {
      meAccountsResult = { error: e?.message ?? "unknown error" };
      console.error(`[META-DEBUG] /me/accounts exception: ${e?.message}`);
    }
  }

  res.json({
    appId: appId || null,
    appIdSet: !!appId,
    appSecretSet,
    redirectUri,
    requestedScopes,
    connected: !!fbRow,
    accountName: fbRow?.accountName ?? null,
    tokenLength: fbRow?.accessToken?.length ?? 0,
    meIdentity,
    grantedScopes,
    declinedScopes,
    permissionsError,
    meAccountsResult,
  });
});

router.get("/social-connections/callback-debug-log", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  res.json(getCallbackLog());
});

router.get("/social-connections/google-oauth-debug", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const appBase = process.env.PUBLIC_APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN}`;
  const callbackRoute = "/api/oauth/google/callback";
  const redirectUri = `${appBase}${callbackRoute}`;
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? "";
  const clientSecretSet = !!process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  const PROVIDER_DEFS = [
    {
      id: "google_business",
      label: "Google Business Profile",
      scopes: ["https://www.googleapis.com/auth/business.manage", "openid", "email"],
      sensitiveScope: true,
      sensitiveScopeNote: "business.manage is a restricted scope — requires the Business Profile API to be enabled AND the user added as a test user (or app published).",
      successSlug: "google",
      requiredApi: "Business Profile API",
      enableApiUrl: "https://console.cloud.google.com/apis/library/mybusinessaccountmanagement.googleapis.com",
      apiLibraryId: "mybusinessaccountmanagement.googleapis.com",
    },
    {
      id: "youtube",
      label: "YouTube",
      scopes: ["https://www.googleapis.com/auth/youtube.readonly", "openid", "email", "profile"],
      sensitiveScope: true,
      sensitiveScopeNote: "youtube.readonly is a Google Sensitive scope. Your app must be in Production mode OR your Google account must be added as a Test User in the OAuth consent screen — otherwise Google shows a 403. Also ensure the YouTube Data API v3 is enabled in your project.",
      successSlug: "youtube",
      requiredApi: "YouTube Data API v3",
      enableApiUrl: "https://console.cloud.google.com/apis/library/youtube.googleapis.com",
      apiLibraryId: "youtube.googleapis.com",
    },
    {
      id: "youtube_readonly",
      label: "YouTube Readonly (Testing Panel)",
      scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/youtube.readonly"],
      sensitiveScope: true,
      sensitiveScopeNote: "Same as YouTube above — only openid email profile youtube.readonly. No business.manage. No youtube.upload.",
      successSlug: "youtube",
      requiredApi: "YouTube Data API v3",
      enableApiUrl: "https://console.cloud.google.com/apis/library/youtube.googleapis.com",
      apiLibraryId: "youtube.googleapis.com",
    },
  ];

  const providers = PROVIDER_DEFS.map(def => {
    const scopeString = def.scopes.join(" ");
    let fullOAuthUrl = "";
    if (clientId) {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: scopeString,
        access_type: "offline",
        prompt: "consent",
      });
      fullOAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    }
    return {
      id: def.id,
      label: def.label,
      scopes: def.scopes,
      scopeString,
      sensitiveScope: def.sensitiveScope,
      sensitiveScopeNote: def.sensitiveScopeNote,
      requiredApi: def.requiredApi,
      enableApiUrl: def.enableApiUrl,
      apiLibraryId: def.apiLibraryId,
      callbackRoute,
      redirectUri,
      successRedirect: `${appBase}/admin/connections?connected=${def.successSlug}`,
      fullOAuthUrl,
    };
  });

  // Minimal-scope test URL — openid + email only, no restricted scopes.
  // If this works but the full URL 403s, the issue is scope declaration on the consent screen.
  let minimalTestUrl = "";
  if (clientId) {
    const p = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email",
      access_type: "offline",
      prompt: "consent",
    });
    minimalTestUrl = `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
  }

  res.json({
    publicAppUrl: appBase,
    callbackRoute,
    redirectUri,
    clientId: clientId || null,
    clientIdSet: !!clientId,
    clientSecretSet,
    providers,
    minimalTestUrl,
  });
});

router.get("/social-connections/tiktok-oauth-debug", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const appBase = process.env.PUBLIC_APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN}`;
  const callbackRoute = "/api/oauth/tiktok/callback";
  const redirectUri = `${appBase}${callbackRoute}`;
  const clientKey = process.env.TIKTOK_CLIENT_KEY ?? "";
  const clientSecretSet = !!process.env.TIKTOK_CLIENT_SECRET;
  const scopes = "user.info.basic,user.info.profile,video.list,video.publish";

  let authUrl = "";
  if (clientKey) {
    const params = new URLSearchParams({
      client_key: clientKey,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes,
      state: "debug_preview",
    });
    authUrl = `https://www.tiktok.com/v2/auth/authorize?${params}`;
  }

  res.json({
    publicAppUrl: appBase,
    callbackRoute,
    redirectUri,
    clientKeySet: !!clientKey,
    clientKeyPrefix: clientKey ? clientKey.slice(0, 8) + "…" : null,
    clientSecretSet,
    scopes,
    authUrl,
  });
});

// ── TikTok publish-readiness test ────────────────────────────────────────────
// POST /api/social-connections/tiktok-test-publish-readiness
// Checks credentials, stored token, token validity, and publish capability.
// Does NOT create a post. Returns exact TikTok API error if any step fails.
router.post("/social-connections/tiktok-test-publish-readiness", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const clientKey    = process.env.TIKTOK_CLIENT_KEY ?? "";
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET ?? "";
  const appBase      = process.env.PUBLIC_APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN}`;
  const redirectUri  = `${appBase}/api/oauth/tiktok/callback`;

  const SCOPES_REQUESTED = "user.info.basic,user.info.profile,video.list,video.publish";
  const SCOPES_REQUIRED_FOR_PUBLISH = ["video.publish"];

  // ── 1. Credential check ────────────────────────────────────────────────────
  const credentialsOk = !!clientKey && !!clientSecret;

  // ── 2. Stored connection check ─────────────────────────────────────────────
  const [conn] = await db
    .select()
    .from(socialConnectionsTable)
    .where(and(eq(socialConnectionsTable.userId, userId), eq(socialConnectionsTable.provider, "tiktok")));

  const now = new Date();
  const tokenExists    = !!conn?.accessToken;
  const tokenExpired   = conn?.expiresAt ? new Date(conn.expiresAt) < now : false;
  const expiresAt      = conn?.expiresAt?.toISOString() ?? null;
  const accountId      = conn?.accountId ?? conn?.accountName ?? null;

  // ── 3. Token validity — call TikTok /v2/user/info/ ──────────────────────
  let tokenValid = false;
  let tokenError: string | null = null;
  let tiktokUser: { openId?: string; displayName?: string } | null = null;

  if (tokenExists && !tokenExpired) {
    try {
      const r = await fetch(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
        { headers: { Authorization: `Bearer ${conn!.accessToken}` } }
      );
      const data = await r.json() as any;
      if (r.ok && data.error?.code === "ok") {
        tokenValid = true;
        tiktokUser = { openId: data.data?.user?.open_id, displayName: data.data?.user?.display_name };
      } else {
        tokenError = data.error?.message ?? `TikTok API ${r.status}`;
      }
    } catch (e: any) {
      tokenError = e.message ?? "Network error calling TikTok API";
    }
  }

  // ── 4. Publish capability check — call creator_info endpoint ─────────────
  // POST /v2/post/publish/creator_info/query/ reveals which privacy levels and
  // features the connected account actually has access to.
  let creatorInfoOk = false;
  let creatorInfoData: any = null;
  let creatorInfoError: string | null = null;

  if (tokenValid && conn?.accessToken) {
    try {
      const r = await fetch("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${conn.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({}),
      });
      const data = await r.json() as any;
      console.log("[TIKTOK-READINESS] creator_info:", JSON.stringify(data));
      if (r.ok && data.error?.code === "ok") {
        creatorInfoOk = true;
        creatorInfoData = data.data ?? null;
      } else {
        const code = data.error?.code;
        const msg  = data.error?.message ?? `TikTok API ${r.status}`;
        creatorInfoError = code === 2061
          ? `${msg} — video.publish scope not yet approved. Request app review in TikTok Developer Portal → Products tab. [code: ${code}]`
          : `${msg} [code: ${code}]`;
      }
    } catch (e: any) {
      creatorInfoError = e.message ?? "Network error";
    }
  }

  // ── 5. Build overall readiness status ─────────────────────────────────────
  const blockers: string[] = [];
  if (!credentialsOk)           blockers.push("TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET not set");
  if (!tokenExists)              blockers.push("No stored TikTok connection — user must complete OAuth flow");
  if (tokenExpired)              blockers.push("Access token expired — reconnect TikTok in Connected Accounts");
  if (tokenExists && !tokenValid && tokenError) blockers.push(`Token invalid: ${tokenError}`);
  if (tokenValid && !creatorInfoOk && creatorInfoError) blockers.push(creatorInfoError);

  const publishReady = blockers.length === 0 && creatorInfoOk;
  const overallStatus =
    publishReady        ? "ready" :
    tokenValid          ? "connected_no_publish_permission" :
    tokenExists         ? "token_invalid" :
    credentialsOk       ? "not_connected" :
                          "missing_credentials";

  res.json({
    overallStatus,
    publishReady,
    blockers,
    credentials: {
      clientKeySet:    !!clientKey,
      clientKeyPrefix: clientKey ? clientKey.slice(0, 8) + "…" : null,
      clientSecretSet: !!clientSecret,
    },
    redirectUri,
    scopesRequested:         SCOPES_REQUESTED,
    scopesRequiredForPublish: SCOPES_REQUIRED_FOR_PUBLISH,
    connection: tokenExists ? {
      accountId,
      tokenValid,
      tokenExpired,
      expiresAt,
      tokenError,
      tiktokUser,
    } : null,
    creatorInfo: {
      ok:    creatorInfoOk,
      data:  creatorInfoData,
      error: creatorInfoError,
    },
    notes: [
      "video.publish scope requires TikTok app review before it works in production.",
      "In sandbox/dev mode, creator_info/query returns error_code 2061 (permission denied).",
      "Redirect URI must exactly match what is registered in TikTok Developer Portal.",
      `Current redirect URI: ${redirectUri}`,
      "To switch to custom domain: update PUBLIC_APP_URL env var and re-register the URI in TikTok portal.",
    ],
  });
});

router.get("/social-connections/youtube/channel-info", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [conn] = await db.select().from(socialConnectionsTable)
    .where(and(
      eq(socialConnectionsTable.userId, userId),
      eq(socialConnectionsTable.provider, "youtube"),
    ));

  if (!conn) { res.status(404).json({ error: "YouTube not connected" }); return; }

  let accessToken = conn.accessToken;

  if (conn.expiresAt && conn.expiresAt < new Date() && conn.refreshToken) {
    try {
      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
          client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
          refresh_token: conn.refreshToken,
          grant_type: "refresh_token",
        }),
      });
      if (r.ok) {
        const data = await r.json() as { access_token: string; expires_in?: number };
        accessToken = data.access_token;
        const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;
        await db.update(socialConnectionsTable)
          .set({ accessToken, expiresAt, updatedAt: new Date() })
          .where(and(
            eq(socialConnectionsTable.userId, userId),
            eq(socialConnectionsTable.provider, "youtube"),
          ));
      }
    } catch { /* continue with existing token */ }
  }

  try {
    const [channelRes, videosRes] = await Promise.all([
      fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
        { headers: { Authorization: `Bearer ${accessToken}` } }),
      fetch("https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&order=date&maxResults=5",
        { headers: { Authorization: `Bearer ${accessToken}` } }),
    ]);

    const channelData = await channelRes.json() as {
      items?: Array<{
        id: string;
        snippet: { title: string; thumbnails?: { default?: { url: string } } };
        statistics: { subscriberCount?: string; videoCount?: string; viewCount?: string };
      }>;
    };
    const videosData = await videosRes.json() as {
      items?: Array<{
        id: { videoId: string };
        snippet: { title: string; publishedAt: string; thumbnails?: { default?: { url: string } } };
      }>;
    };

    const ch = channelData.items?.[0];
    res.json({
      channelId: ch?.id ?? null,
      channelName: ch?.snippet.title ?? conn.accountName,
      subscriberCount: ch?.statistics.subscriberCount ?? null,
      videoCount: ch?.statistics.videoCount ?? null,
      viewCount: ch?.statistics.viewCount ?? null,
      thumbnail: ch?.snippet.thumbnails?.default?.url ?? null,
      recentVideos: (videosData.items ?? []).map(v => ({
        videoId: v.id.videoId,
        title: v.snippet.title,
        publishedAt: v.snippet.publishedAt,
        thumbnail: v.snippet.thumbnails?.default?.url ?? null,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Failed to fetch YouTube data" });
  }
});

export default router;

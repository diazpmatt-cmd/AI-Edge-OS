import { Router } from "express";
import { createHmac } from "node:crypto";
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
          state: generateState(userId, "google_business"),
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
          state: generateState(userId, "youtube"),
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
          state: generateState(userId, "google_basic"),
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
          state: generateState(userId, "youtube_readonly"),
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
          scope: "user.info.basic,user.info.profile,video.list",
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
    console.log("[OAUTH-START]", {
      provider,
      nodeEnv: process.env.NODE_ENV ?? "unset",
      publicAppUrl: process.env.PUBLIC_APP_URL ?? "unset",
      replitDevDomain: process.env.REPLIT_DEV_DOMAIN ?? "unset",
      devOrigin: devOrigin ?? "NULL",
      returnTo: returnTo ?? "none",
      redirectUri: parsed.searchParams.get("redirect_uri"),
    });
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
  const scopes = "user.info.basic,user.info.profile,video.list";

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

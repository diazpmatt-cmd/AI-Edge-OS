import { Router } from "express";
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

router.post("/social-connections/oauth-start/:provider", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { provider } = req.params;

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
          scope: "public_profile,pages_show_list",
          state: generateState(userId, "facebook"),
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
          scope: "pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish",
          state: generateState(userId, "instagram"),
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
          scope: "user.info.basic,video.publish",
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
  res.json({ configured: true, url });
});

router.get("/social-connections/meta-oauth-debug", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const appBase = process.env.PUBLIC_APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN}`;
  const redirectUri = `${appBase}/api/oauth/meta/callback`;
  const appId = process.env.META_APP_ID ?? "";
  const appSecretSet = !!process.env.META_APP_SECRET;
  const requestedScopes = "public_profile,pages_show_list";

  // Check for existing FB connection
  const [fbRow] = await db.select().from(socialConnectionsTable).where(
    and(eq(socialConnectionsTable.userId, userId), eq(socialConnectionsTable.provider, "facebook"))
  );

  let grantedScopes: string[] = [];
  let declinedScopes: string[] = [];
  let meAccountsResult: any = null;
  let permissionsError: string | null = null;

  if (fbRow?.accessToken) {
    try {
      const permR = await fetch(`https://graph.facebook.com/me/permissions?access_token=${fbRow.accessToken}`);
      if (permR.ok) {
        const permData = await permR.json() as { data: Array<{ permission: string; status: string }> };
        grantedScopes = permData.data.filter(p => p.status === "granted").map(p => p.permission);
        declinedScopes = permData.data.filter(p => p.status === "declined").map(p => p.permission);
      } else {
        permissionsError = `permissions API ${permR.status}`;
      }
    } catch (e: any) {
      permissionsError = e?.message ?? "unknown error";
    }

    try {
      const acctR = await fetch(`https://graph.facebook.com/me/accounts?access_token=${fbRow.accessToken}`);
      meAccountsResult = acctR.ok ? await acctR.json() : { error: `accounts API ${acctR.status}` };
    } catch (e: any) {
      meAccountsResult = { error: e?.message ?? "unknown error" };
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
      sensitiveScope: false,
      sensitiveScopeNote: null,
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

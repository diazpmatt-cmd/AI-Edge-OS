import { Router } from "express";
import { db } from "@workspace/db";
import { socialConnectionsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { generateState } from "../lib/oauthState";

const router = Router();

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
          scope: "https://www.googleapis.com/auth/youtube.upload openid email",
          access_type: "offline",
          prompt: "consent",
          state: generateState(userId, "youtube"),
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
          scope: "pages_manage_posts,pages_read_engagement,instagram_basic",
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

export default router;

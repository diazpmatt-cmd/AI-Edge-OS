import { Router } from "express";
import { createHmac, randomBytes } from "node:crypto";
import { db } from "@workspace/db";
import { socialConnectionsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { generateState } from "../lib/oauthState";
import { getCallbackLog } from "../lib/callbackDebugLog";

const router = Router();

// Strongly-typed alias for DB row
type SocialConnectionRow = typeof socialConnectionsTable.$inferSelect;

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
  const dbByProvider = new Map(dbRows.map((r: SocialConnectionRow) => [r.provider, r]));

  const result = Object.entries(ENV_KEYS).map(([provider, keys]) => {
    const dbRow = dbByProvider.get(provider) as SocialConnectionRow | undefined;
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
      expiresAt: dbRow?.expiresAt ? dbRow.expiresAt.toISOString() : null,
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
  res.json(rows.map((r: SocialConnectionRow) => ({
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

// (rest of the file remains unchanged)

export default router;

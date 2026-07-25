/**
 * Shared Google OAuth token service — unified for all Google-connected features.
 *
 * Replaces both `refreshGoogleToken`+`resolveAccessToken` in gbp-live-data.ts
 * and `getGoogleAccessToken` in social-posts.ts with a single canonical
 * implementation.
 *
 * Refresh guard (see memory: youtube-token-refresh.md):
 *   Refresh when refreshToken exists AND (expiresAt is null OR expired).
 *   Never gate on expiresAt alone — dev-sync drops it, leaving it NULL,
 *   which must NOT block the refresh.
 *
 * Never logs actual token values — only boolean presence and metadata.
 */

import { db }                    from "@workspace/db";
import { socialConnectionsTable } from "@workspace/db/schema";
import { and, eq }               from "drizzle-orm";

export type GoogleTokenResult =
  | { ok: true;  token: string }
  | { ok: false; reason: "no_refresh_token" | "refresh_failed" | "revoked" };

export type GoogleCredentials = {
  userId:       string;
  accessToken:  string;
  refreshToken: string | null;
  expiresAt:    Date | null;
};

/**
 * Resolve a valid Google access token for stored credentials.
 *
 * Returns `{ ok: true, token }` on success or `{ ok: false, reason }` on
 * failure. Callers should propagate failures for critical operations and may
 * fall back to the stale `accessToken` for non-critical reads.
 */
export async function resolveGoogleToken(
  creds: GoogleCredentials,
): Promise<GoogleTokenResult> {
  const now       = new Date();
  const isExpired = !creds.expiresAt || creds.expiresAt < now;

  if (creds.refreshToken && isExpired) {
    console.log("[google-token] token expired or expiresAt null — refreshing");
    return _refreshAndPersist(creds.refreshToken, creds.userId);
  }

  return { ok: true, token: creds.accessToken };
}

async function _refreshAndPersist(
  refreshToken: string,
  userId:       string,
): Promise<GoogleTokenResult> {
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     process.env.GOOGLE_OAUTH_CLIENT_ID     ?? "",
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
        refresh_token: refreshToken,
        grant_type:    "refresh_token",
      }).toString(),
      signal: AbortSignal.timeout(10_000),
    });

    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.warn(`[google-token] refresh HTTP ${r.status}: ${body.slice(0, 200)}`);
      const isRevoked = r.status === 400 || r.status === 401;
      return { ok: false, reason: isRevoked ? "revoked" : "refresh_failed" };
    }

    const data = await r.json() as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
      console.warn("[google-token] refresh response missing access_token");
      return { ok: false, reason: "refresh_failed" };
    }

    const expiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1_000)
      : undefined;

    try {
      await db
        .update(socialConnectionsTable)
        .set({
          accessToken: data.access_token,
          ...(expiresAt ? { expiresAt } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(socialConnectionsTable.userId,   userId),
            eq(socialConnectionsTable.provider, "google_business"),
          ),
        );
      console.log(
        `[google-token] refreshed token persisted (expiresIn=${data.expires_in ?? "not returned"})`,
      );
    } catch (dbErr: any) {
      console.warn(`[google-token] DB persist failed (non-fatal): ${dbErr?.message}`);
    }

    return { ok: true, token: data.access_token };
  } catch (e: any) {
    console.warn(`[google-token] refresh exception: ${e?.message}`);
    return { ok: false, reason: "refresh_failed" };
  }
}

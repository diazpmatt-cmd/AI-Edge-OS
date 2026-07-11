/**
 * BB&B Google Business Profile — First Pilot Post Script
 *
 * Approved post text and CTA confirmed by Matthew before this script was run.
 * This script:
 *   1. Inserts the approved draft into social_posts
 *   2. Refreshes the Google access token if expired
 *   3. Calls the Google Business Profile localPosts API
 *   4. Updates the social_posts record with the final state
 *   5. Prints a full result report (no raw tokens exposed)
 *
 * Run: pnpm --filter @workspace/api-server exec tsx scripts/publish-gbp-pilot.ts
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { socialPostsTable, socialConnectionsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

// ── DB setup ───────────────────────────────────────────────────────────────────
const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

// ── Approved post content ──────────────────────────────────────────────────────
const USER_ID    = "user_3FKEVWfSuyNsJz3oQ9kPH5nzKDm";
const CLIENT     = "Bed Bugs & Beyond";
const PLATFORMS  = JSON.stringify(["google"]);
const CAPTION    =
  "Staying in a vacation rental this summer? Here are the early warning signs of bed bugs to check before you settle in.\n\n" +
  "🔍 Tiny rust-colored or dark spots on mattress seams and sheets\n" +
  "🔍 Small shed skins or pale eggshells in mattress folds\n" +
  "🔍 Bite clusters on arms, legs, or neck — especially in the morning\n" +
  "🔍 A faint musty odor near the bed or headboard\n\n" +
  "Bed bugs spread fast and are much easier to treat early. Bed Bugs & Beyond provides fast, discreet inspections and treatment across all of Baldwin County — Foley, Gulf Shores, Orange Beach, Fairhope, and more. Call us today for a free phone consultation.";
const CTA_TYPE  = "call_now";
const CTA_VALUE = "(251) 324-9090";

// ── Token refresh ──────────────────────────────────────────────────────────────
async function getGoogleAccessToken(conn: {
  userId: string; provider: string; accessToken: string;
  refreshToken: string | null; expiresAt: Date | null;
}): Promise<string> {
  const isExpired = conn.expiresAt ? new Date(conn.expiresAt) < new Date() : false;
  console.log("[TOKEN]", {
    expired: isExpired,
    expiresAt: conn.expiresAt?.toISOString() ?? "none",
    hasRefresh: !!conn.refreshToken,
  });
  if (!isExpired) return conn.accessToken;
  if (!conn.refreshToken) {
    console.warn("[TOKEN] no refresh token — using existing (may be expired)");
    return conn.accessToken;
  }
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      refresh_token: conn.refreshToken,
      grant_type:    "refresh_token",
    }),
  });
  const body = await r.text();
  if (!r.ok) {
    console.error("[TOKEN] refresh failed", r.status, body.slice(0, 200));
    return conn.accessToken;
  }
  const data = JSON.parse(body) as { access_token: string; expires_in?: number };
  const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;
  console.log("[TOKEN] refreshed — new expiry:", expiresAt?.toISOString() ?? "none");
  await db.update(socialConnectionsTable)
    .set({ accessToken: data.access_token, expiresAt, updatedAt: new Date() })
    .where(and(
      eq(socialConnectionsTable.userId, conn.userId),
      eq(socialConnectionsTable.provider, conn.provider),
    ));
  return data.access_token;
}

// ── GBP publish ────────────────────────────────────────────────────────────────
async function publishToGBP(
  token: string,
  conn: { userId: string; provider: string },
  caption: string,
  ctaType: string,
  ctaValue: string | null,
): Promise<{ id: string }> {
  // 0 — verify token
  const tiR  = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`, { signal: AbortSignal.timeout(6000) });
  const tiTxt = await tiR.text();
  const ti   = tiR.ok ? JSON.parse(tiTxt) as { scope?: string; email?: string; expires_in?: number; error?: string } : null;
  console.log("[TOKENINFO]", {
    status:            tiR.status,
    email:             ti?.email ?? null,
    hasBusinessManage: ti?.scope?.includes("business.manage") ?? false,
    expiresIn:         ti?.expires_in ?? null,
    tokenError:        ti?.error ?? null,
  });

  // 1 — load metadata / cached location
  const [row] = await db.select().from(socialConnectionsTable)
    .where(and(eq(socialConnectionsTable.userId, conn.userId), eq(socialConnectionsTable.provider, conn.provider)));
  let metadata: Record<string, any> = {};
  try { if (row?.metadata) metadata = JSON.parse(row.metadata); } catch {}

  let locationResourceName: string | null = metadata.locationName ?? null;
  let accountResourceName:  string | null = metadata.accountName  ?? null;
  let locationTitle:         string | null = metadata.locationTitle ?? metadata.primaryLocationTitle ?? null;

  const cooldownUntil  = metadata.cooldownUntil ? new Date(metadata.cooldownUntil) : null;
  const isInCooldown   = !!(cooldownUntil && cooldownUntil > new Date());

  if (!locationResourceName || !accountResourceName) {
    if (isInCooldown) {
      const mins = Math.ceil((cooldownUntil!.getTime() - Date.now()) / 60000);
      throw new Error(`GBP quota cooldown active (${mins}m remaining) — try again later`);
    }
    console.log("[GBP] no cached location — fetching from API");

    const acctRes  = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000),
    });
    if (!acctRes.ok) {
      const err = await acctRes.text();
      if (acctRes.status === 429) {
        const until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        await db.update(socialConnectionsTable).set({ metadata: JSON.stringify({ ...metadata, cooldownUntil: until }), updatedAt: new Date() })
          .where(and(eq(socialConnectionsTable.userId, conn.userId), eq(socialConnectionsTable.provider, conn.provider)));
        throw new Error(`GBP quota exceeded — cooldown set for 15 min. Try again after ${until}`);
      }
      throw new Error(`GBP accounts API error (${acctRes.status}): ${err.slice(0, 200)}`);
    }
    const acctData = await acctRes.json() as { accounts?: { name: string; accountName: string }[] };
    console.log("[GBP] accounts found:", acctData.accounts?.length ?? 0);
    const account = acctData.accounts?.[0];
    if (!account) throw new Error("No Google Business Profile account found on this Google account.");
    accountResourceName = account.name;

    const locRes = await fetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000) },
    );
    if (!locRes.ok) {
      const err = await locRes.text();
      if (locRes.status === 429) {
        const until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        await db.update(socialConnectionsTable).set({ metadata: JSON.stringify({ ...metadata, cooldownUntil: until }), updatedAt: new Date() })
          .where(and(eq(socialConnectionsTable.userId, conn.userId), eq(socialConnectionsTable.provider, conn.provider)));
        throw new Error(`GBP quota exceeded on locations lookup — cooldown set for 15 min.`);
      }
      throw new Error(`GBP locations API error (${locRes.status}): ${err.slice(0, 200)}`);
    }
    const locData = await locRes.json() as { locations?: { name: string; title: string }[] };
    console.log("[GBP] locations found:", locData.locations?.length ?? 0, locData.locations?.map(l => l.title));
    const location = locData.locations?.[0];
    if (!location) throw new Error("No Google Business Profile location found for this account.");
    locationResourceName = location.name;
    locationTitle        = location.title;

    // Cache location
    const updatedMeta = {
      ...metadata,
      accountName:   accountResourceName,
      accountId:     accountResourceName?.split("/").pop() ?? null,
      locationName:  locationResourceName,
      locationId:    locationResourceName?.split("/").pop() ?? null,
      locationTitle,
      primaryLocationTitle: locationTitle,
      cachedAt:      new Date().toISOString(),
    };
    // Strip old cooldown from meta now that it's past
    delete updatedMeta.cooldownUntil;
    delete updatedMeta.google429Endpoint;
    delete updatedMeta.google429Reason;
    delete updatedMeta.google429At;
    await db.update(socialConnectionsTable)
      .set({ metadata: JSON.stringify(updatedMeta), updatedAt: new Date() })
      .where(and(eq(socialConnectionsTable.userId, conn.userId), eq(socialConnectionsTable.provider, conn.provider)));
    console.log("[GBP] cached location:", locationResourceName, "—", locationTitle);
  } else {
    console.log("[GBP] using cached location:", locationResourceName, "—", locationTitle);
  }

  // 2 — build post body
  const GBP_CTA: Record<string, string> = {
    call_now:   "CALL",
    learn_more: "LEARN_MORE",
    book_now:   "BOOK",
    sign_up:    "SIGN_UP",
    contact_us: "LEARN_MORE",
  };
  const gbpAction = ctaType && ctaType !== "none" ? GBP_CTA[ctaType] : null;
  const body: Record<string, any> = {
    languageCode: "en-US",
    summary:      caption,
    topicType:    "STANDARD",
  };
  if (gbpAction) {
    body.callToAction = { actionType: gbpAction };
    if (gbpAction !== "CALL" && ctaValue) body.callToAction.url = ctaValue;
  }
  console.log("[GBP] post body:", JSON.stringify(body).slice(0, 400));

  // 3 — create local post
  const postUrl = `https://mybusinessposts.googleapis.com/v1/${locationResourceName}/localPosts`;
  const postRes = await fetch(postUrl, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  const postBody = await postRes.text();
  if (!postRes.ok) {
    console.error("[GBP] post failed", postRes.status, postBody.slice(0, 400));
    if (postRes.status === 429) {
      const until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      try {
        const [m] = await db.select().from(socialConnectionsTable)
          .where(and(eq(socialConnectionsTable.userId, conn.userId), eq(socialConnectionsTable.provider, conn.provider)));
        const meta = m?.metadata ? JSON.parse(m.metadata) : {};
        await db.update(socialConnectionsTable).set({ metadata: JSON.stringify({ ...meta, cooldownUntil: until }), updatedAt: new Date() })
          .where(and(eq(socialConnectionsTable.userId, conn.userId), eq(socialConnectionsTable.provider, conn.provider)));
      } catch {}
      throw new Error(`GBP quota exceeded on post creation — cooldown set for 15 min.`);
    }
    if (postRes.status === 404) {
      // Stale cached location — clear cache
      try {
        const [m] = await db.select().from(socialConnectionsTable)
          .where(and(eq(socialConnectionsTable.userId, conn.userId), eq(socialConnectionsTable.provider, conn.provider)));
        const meta = m?.metadata ? JSON.parse(m.metadata) : {};
        const freshMeta = { ...meta };
        delete freshMeta.locationName; delete freshMeta.locationId;
        delete freshMeta.accountName; delete freshMeta.accountId;
        delete freshMeta.locationTitle; delete freshMeta.cachedAt;
        await db.update(socialConnectionsTable).set({ metadata: JSON.stringify(freshMeta), updatedAt: new Date() })
          .where(and(eq(socialConnectionsTable.userId, conn.userId), eq(socialConnectionsTable.provider, conn.provider)));
      } catch {}
    }
    throw new Error(`GBP post error (${postRes.status}): ${postBody.slice(0, 300)}`);
  }
  const postData = JSON.parse(postBody) as { name: string };
  console.log("[GBP] ✅ success — post name:", postData.name);
  return { id: postData.name };
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== BB&B GBP Pilot Publish ===");
  console.log("User:     ", USER_ID);
  console.log("Caption:  ", CAPTION.slice(0, 80) + "...");
  console.log("CTA:      ", CTA_TYPE, "/", CTA_VALUE);
  console.log("");

  // Step 1 — Create draft
  const [draft] = await db.insert(socialPostsTable).values({
    userId:    USER_ID,
    clientName: CLIENT,
    platforms: PLATFORMS,
    caption:   CAPTION,
    ctaType:   CTA_TYPE,
    ctaValue:  CTA_VALUE,
    status:    "draft",
  }).returning();
  console.log("[DRAFT] created id:", draft.id);

  // Step 2 — Get connection
  const [conn] = await db.select().from(socialConnectionsTable)
    .where(and(
      eq(socialConnectionsTable.userId, USER_ID),
      eq(socialConnectionsTable.provider, "google_business"),
    ));
  if (!conn?.accessToken) {
    console.error("[ERROR] No google_business connection found");
    await pool.end();
    process.exit(1);
  }
  console.log("[CONN] found — account:", conn.accountName, "| expires:", conn.expiresAt?.toISOString() ?? "none");

  // Step 3 — Publish
  let status:       "published" | "failed" = "failed";
  let errorMessage: string | null           = null;
  let providerPostId: string | null         = null;
  let publishedAt:  Date | null             = null;

  try {
    const token = await getGoogleAccessToken({
      userId:       conn.userId,
      provider:     conn.provider,
      accessToken:  conn.accessToken!,
      refreshToken: conn.refreshToken ?? null,
      expiresAt:    conn.expiresAt ?? null,
    });

    const result = await publishToGBP(token, { userId: USER_ID, provider: "google_business" }, CAPTION, CTA_TYPE, CTA_VALUE);
    status         = "published";
    providerPostId = result.id;
    publishedAt    = new Date();
    console.log("[RESULT] ✅ PUBLISHED — GBP post name:", result.id);
  } catch (e: any) {
    errorMessage = e.message ?? String(e);
    console.error("[RESULT] ❌ FAILED —", errorMessage);
  }

  // Step 4 — Update draft with result
  const [updated] = await db.update(socialPostsTable).set({
    status,
    publishedAt,
    errorMessage,
    updatedAt: new Date(),
  }).where(eq(socialPostsTable.id, draft.id)).returning();

  console.log("");
  console.log("=== PHASE 9 REPORT ===");
  console.log("Draft ID:        ", draft.id);
  console.log("Final status:    ", updated.status);
  console.log("Published at:    ", updated.publishedAt?.toISOString() ?? "—");
  console.log("Provider post ID:", providerPostId
    ? providerPostId.replace(/\/localPosts\/(.{4}).+/, "/localPosts/$1…[masked]")
    : "—");
  console.log("Error:           ", errorMessage ?? "none");
  console.log("==============================");

  await pool.end();
  process.exit(status === "published" ? 0 : 1);
}

main().catch(err => {
  console.error("[FATAL]", err);
  pool.end();
  process.exit(1);
});

/**
 * BB&B Google Business Profile — First Pilot Post Script (plain ESM/JS)
 * Approved by Matthew before this file was executed.
 *
 * Run: node artifacts/api-server/scripts/publish-gbp-pilot.mjs
 */

import pg from "pg";

const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
if (!process.env.GOOGLE_OAUTH_CLIENT_ID) throw new Error("GOOGLE_OAUTH_CLIENT_ID not set");
if (!process.env.GOOGLE_OAUTH_CLIENT_SECRET) throw new Error("GOOGLE_OAUTH_CLIENT_SECRET not set");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Approved post content ──────────────────────────────────────────────────────
const USER_ID   = "user_3FKEVWfSuyNsJz3oQ9kPH5nzKDm";
const CLIENT    = "Bed Bugs & Beyond";
const PLATFORMS = JSON.stringify(["google"]);
const CAPTION   =
  "Staying in a vacation rental this summer? Here are the early warning signs of bed bugs to check before you settle in.\n\n" +
  "🔍 Tiny rust-colored or dark spots on mattress seams and sheets\n" +
  "🔍 Small shed skins or pale eggshells in mattress folds\n" +
  "🔍 Bite clusters on arms, legs, or neck — especially in the morning\n" +
  "🔍 A faint musty odor near the bed or headboard\n\n" +
  "Bed bugs spread fast and are much easier to treat early. Bed Bugs & Beyond provides fast, discreet inspections and treatment across all of Baldwin County — Foley, Gulf Shores, Orange Beach, Fairhope, and more. Call us today for a free phone consultation.";
const CTA_TYPE  = "call_now";
const CTA_VALUE = "(251) 324-9090";

// ── DB helpers ─────────────────────────────────────────────────────────────────
async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    const res = await client.query(sql, params);
    return res;
  } finally {
    client.release();
  }
}

// ── Token refresh ──────────────────────────────────────────────────────────────
async function getGoogleAccessToken(conn) {
  const isExpired = conn.expires_at ? new Date(conn.expires_at) < new Date() : false;
  console.log("[TOKEN]", {
    expired:    isExpired,
    expiresAt:  conn.expires_at ? new Date(conn.expires_at).toISOString() : "none",
    hasRefresh: !!conn.refresh_token,
  });
  if (!isExpired) return conn.access_token;
  if (!conn.refresh_token) {
    console.warn("[TOKEN] no refresh token — using existing (may be expired)");
    return conn.access_token;
  }
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      client_id:     process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: conn.refresh_token,
      grant_type:    "refresh_token",
    }),
  });
  const body = await r.text();
  if (!r.ok) {
    console.error("[TOKEN] refresh failed", r.status, body.slice(0, 200));
    return conn.access_token;
  }
  const data = JSON.parse(body);
  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000)
    : null;
  console.log("[TOKEN] refreshed — new expiry:", expiresAt?.toISOString() ?? "none");
  await query(
    "UPDATE social_connections SET access_token=$1, expires_at=$2, updated_at=NOW() WHERE user_id=$3 AND provider=$4",
    [data.access_token, expiresAt, USER_ID, "google_business"]
  );
  return data.access_token;
}

// ── GBP publish ────────────────────────────────────────────────────────────────
async function publishToGBP(token) {
  // 0 — verify token scope
  const tiR = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`, {
    signal: AbortSignal.timeout(8000),
  });
  const tiTxt = await tiR.text();
  const ti = tiR.ok ? JSON.parse(tiTxt) : null;
  console.log("[TOKENINFO]", {
    status:            tiR.status,
    email:             ti?.email ?? null,
    hasBusinessManage: ti?.scope?.includes("business.manage") ?? false,
    expiresIn:         ti?.expires_in ?? null,
    error:             ti?.error ?? null,
  });

  // 1 — load cached location from metadata
  const metaRes = await query(
    "SELECT metadata FROM social_connections WHERE user_id=$1 AND provider=$2",
    [USER_ID, "google_business"]
  );
  let metadata = {};
  try { if (metaRes.rows[0]?.metadata) metadata = JSON.parse(metaRes.rows[0].metadata); } catch {}

  let locationResourceName = metadata.locationName ?? null;
  let accountResourceName  = metadata.accountName  ?? null;
  let locationTitle        = metadata.locationTitle ?? metadata.primaryLocationTitle ?? null;

  const cooldownUntil = metadata.cooldownUntil ? new Date(metadata.cooldownUntil) : null;
  if (cooldownUntil && cooldownUntil > new Date()) {
    const mins = Math.ceil((cooldownUntil.getTime() - Date.now()) / 60000);
    throw new Error(`GBP quota cooldown active (${mins}m remaining) — try again later`);
  }

  if (!locationResourceName || !accountResourceName) {
    console.log("[GBP] no cached location — fetching from API");

    // Accounts
    const acctRes = await fetch(
      "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000) }
    );
    if (!acctRes.ok) {
      const err = await acctRes.text();
      if (acctRes.status === 429) await setCooldown(metadata, "accounts");
      throw new Error(`GBP accounts API error (${acctRes.status}): ${err.slice(0, 200)}`);
    }
    const acctData = await acctRes.json();
    console.log("[GBP] accounts found:", acctData.accounts?.length ?? 0);
    const account = acctData.accounts?.[0];
    if (!account) throw new Error("No Google Business Profile account found on this Google account.");
    accountResourceName = account.name;

    // Locations
    const locRes = await fetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000) }
    );
    if (!locRes.ok) {
      const err = await locRes.text();
      if (locRes.status === 429) await setCooldown(metadata, "locations");
      throw new Error(`GBP locations API error (${locRes.status}): ${err.slice(0, 200)}`);
    }
    const locData = await locRes.json();
    console.log("[GBP] locations found:", locData.locations?.length ?? 0, locData.locations?.map(l => l.title));
    const location = locData.locations?.[0];
    if (!location) throw new Error("No GBP location found for this account.");
    locationResourceName = location.name;
    locationTitle        = location.title;

    // Cache
    const updatedMeta = {
      ...metadata,
      accountName:          accountResourceName,
      accountId:            accountResourceName?.split("/").pop() ?? null,
      locationName:         locationResourceName,
      locationId:           locationResourceName?.split("/").pop() ?? null,
      locationTitle,
      primaryLocationTitle: locationTitle,
      cachedAt:             new Date().toISOString(),
    };
    delete updatedMeta.cooldownUntil;
    await query(
      "UPDATE social_connections SET metadata=$1, updated_at=NOW() WHERE user_id=$2 AND provider=$3",
      [JSON.stringify(updatedMeta), USER_ID, "google_business"]
    );
    console.log("[GBP] cached location:", locationResourceName, "—", locationTitle);
  } else {
    console.log("[GBP] using cached location:", locationResourceName, "—", locationTitle);
  }

  // 2 — build post body
  const GBP_CTA = { call_now: "CALL", learn_more: "LEARN_MORE", book_now: "BOOK", sign_up: "SIGN_UP", contact_us: "LEARN_MORE" };
  const gbpAction = GBP_CTA[CTA_TYPE] ?? null;
  const postBody = {
    languageCode: "en-US",
    summary:      CAPTION,
    topicType:    "STANDARD",
  };
  if (gbpAction) {
    postBody.callToAction = { actionType: gbpAction };
  }
  console.log("[GBP] POST to:", `https://mybusinessposts.googleapis.com/v1/${locationResourceName}/localPosts`);

  // 3 — create local post
  const postRes = await fetch(
    `https://mybusinessposts.googleapis.com/v1/${locationResourceName}/localPosts`,
    {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify(postBody),
    }
  );
  const postResBody = await postRes.text();
  if (!postRes.ok) {
    console.error("[GBP] post failed", postRes.status, postResBody.slice(0, 500));
    if (postRes.status === 429) await setCooldown(metadata, "localPosts");
    throw new Error(`GBP post error (${postRes.status}): ${postResBody.slice(0, 300)}`);
  }
  const postData = JSON.parse(postResBody);
  console.log("[GBP] ✅ success — GBP post name:", postData.name);
  return postData.name;
}

async function setCooldown(existingMeta, endpoint) {
  const until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const meta  = { ...existingMeta, cooldownUntil: until, google429Endpoint: endpoint, google429At: new Date().toISOString() };
  await query(
    "UPDATE social_connections SET metadata=$1, updated_at=NOW() WHERE user_id=$2 AND provider=$3",
    [JSON.stringify(meta), USER_ID, "google_business"]
  );
  throw new Error(`GBP quota 429 on ${endpoint} — cooldown set until ${until}`);
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== BB&B GBP Pilot Publish ===");
  console.log("Approved by: Matthew (explicit approval received 2026-07-11)");
  console.log("Caption (first 80 chars):", CAPTION.slice(0, 80) + "...");
  console.log("CTA:", CTA_TYPE, "/", CTA_VALUE);
  console.log("");

  // Step 1 — Create draft
  const draftRes = await query(
    `INSERT INTO social_posts (user_id, client_name, platforms, caption, cta_type, cta_value, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,'draft',NOW(),NOW()) RETURNING id`,
    [USER_ID, CLIENT, PLATFORMS, CAPTION, CTA_TYPE, CTA_VALUE]
  );
  const draftId = draftRes.rows[0].id;
  console.log("[DRAFT] created id:", draftId);

  // Step 2 — Get connection
  const connRes = await query(
    "SELECT * FROM social_connections WHERE user_id=$1 AND provider=$2",
    [USER_ID, "google_business"]
  );
  const conn = connRes.rows[0];
  if (!conn?.access_token) {
    console.error("[ERROR] No google_business connection found");
    await pool.end();
    process.exit(1);
  }
  console.log("[CONN] account:", conn.account_name, "| expires:", conn.expires_at ? new Date(conn.expires_at).toISOString() : "none");

  // Step 3 — Publish
  let finalStatus  = "failed";
  let errorMessage = null;
  let providerPostId = null;

  try {
    const token = await getGoogleAccessToken(conn);
    providerPostId = await publishToGBP(token);
    finalStatus = "published";
  } catch (e) {
    errorMessage = e.message ?? String(e);
    console.error("[RESULT] ❌ FAILED —", errorMessage);
  }

  // Step 4 — Update record
  await query(
    `UPDATE social_posts
     SET status=$1, published_at=$2, error_message=$3,
         provider_post_id=$4, updated_at=NOW()
     WHERE id=$5`,
    [
      finalStatus,
      finalStatus === "published" ? new Date() : null,
      errorMessage,
      providerPostId,
      draftId,
    ]
  );

  console.log("");
  console.log("=== PHASE 4 RESULT ===");
  console.log("Draft ID:        ", draftId);
  console.log("Final status:    ", finalStatus);
  console.log("Provider post ID:", providerPostId
    ? providerPostId.replace(/\/localPosts\/(.{6}).+/, "/localPosts/$1…[truncated]")
    : "—");
  console.log("Error:           ", errorMessage ?? "none");
  console.log("======================");

  await pool.end();
  process.exit(finalStatus === "published" ? 0 : 1);
}

main().catch(async err => {
  console.error("[FATAL]", err);
  await pool.end();
  process.exit(1);
});

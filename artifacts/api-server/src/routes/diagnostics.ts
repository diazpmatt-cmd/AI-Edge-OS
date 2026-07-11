import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, pool } from "@workspace/db";
import { socialConnectionsTable, socialPostsTable, autoContentSettingsTable, integrationHealthHistoryTable } from "@workspace/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import fs from "fs";
import path from "path";
import {
  HEARTBEAT_INTERVAL_MS,
  sanitizeDetail,
  healthScore,
  safeMeta,
  decideInsert,
  parseLimit,
} from "../lib/health-history-utils.js";

const BACKUP_DIR = path.resolve(process.cwd(), "backups");

const router = Router();

// ── Integration Health History — raw-SQL table + index bootstrap ─────────────
// drizzle-kit push is blocked by a pre-existing constraint conflict in the DB,
// so we manage the table and indexes directly via pool.query on startup.
// Composite indexes replace the original separate ones; all statements are
// idempotent (CREATE/DROP IF EXISTS).
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS integration_health_history (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         TEXT        NOT NULL,
        provider        TEXT        NOT NULL,
        status          TEXT        NOT NULL,
        checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_success_at TIMESTAMPTZ,
        response_time_ms INTEGER,
        error_code      TEXT,
        error_message   TEXT,
        health_score    INTEGER,
        metadata        JSONB,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Replace old separate indexes with composite indexes aligned to
      -- actual query patterns (user+provider newest-first, user newest-first).
      DROP INDEX IF EXISTS idx_ihh_user_provider;
      DROP INDEX IF EXISTS idx_ihh_checked_at;
      CREATE INDEX IF NOT EXISTS idx_ihh_user_provider_time
        ON integration_health_history(user_id, provider, checked_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ihh_user_time
        ON integration_health_history(user_id, checked_at DESC);
    `);
    console.log("[HEALTH-HISTORY] Table and indexes ready");
  } catch (err) {
    console.error("[HEALTH-HISTORY] Bootstrap failed:", err);
  }
})();

// ── Prune guard — runs at most once per 24 h per server process ───────────────

const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
let lastPruneAt: Date | null = null;

async function maybePrune(now: Date): Promise<void> {
  if (lastPruneAt && now.getTime() - lastPruneAt.getTime() < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;
  try {
    const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    await pool.query(
      "DELETE FROM integration_health_history WHERE checked_at < $1",
      [cutoff],
    );
    console.log("[HEALTH-HISTORY] Pruned records older than 90 days");
  } catch (err) {
    // Reset so the next request retries instead of silently skipping.
    lastPruneAt = null;
    console.error("[HEALTH-HISTORY] Prune failed:", err);
  }
}

// ── Deduplication + heartbeat persistence ────────────────────────────────────

async function persistHealthSnapshot(
  userId: string,
  platforms: Record<string, unknown>,
  checkedAt: Date,
): Promise<void> {
  // Fetch the most recent stored record for each provider in one query.
  // DISTINCT ON (provider) with ORDER BY provider, checked_at DESC returns the
  // newest row per provider — efficient with the idx_ihh_user_provider_time index.
  const { rows: latestRows } = await pool.query<{
    provider: string;
    status: string;
    error_message: string | null;
    health_score: number | null;
    checked_at: Date;
    metadata: Record<string, unknown> | null;
  }>(
    `SELECT DISTINCT ON (provider)
       provider, status, error_message, health_score, checked_at, metadata
     FROM integration_health_history
     WHERE user_id = $1
     ORDER BY provider, checked_at DESC`,
    [userId],
  );

  const latestByProvider = new Map(latestRows.map(r => [r.provider, r]));

  const toInsert: Array<{
    userId: string;
    provider: string;
    status: string;
    checkedAt: Date;
    lastSuccessAt: Date | null;
    errorMessage: string | null;
    healthScore: number;
    metadata: Record<string, unknown>;
  }> = [];

  for (const [provider, ph] of Object.entries(platforms)) {
    const ph_ = ph as Record<string, unknown>;
    const decision = decideInsert(provider, ph_, latestByProvider.get(provider), checkedAt);
    if (!decision) continue;

    toInsert.push({
      userId,
      provider: decision.provider,
      status: decision.status,
      checkedAt: decision.checkedAt,
      lastSuccessAt: decision.lastSuccessAt,
      errorMessage: decision.errorMessage,
      healthScore: decision.healthScore,
      metadata: decision.metadata,
    });
  }

  if (toInsert.length > 0) {
    await db.insert(integrationHealthHistoryTable).values(toInsert);
  }

  // Pruning is best-effort and must not block the health response.
  maybePrune(checkedAt).catch(err =>
    console.error("[HEALTH-HISTORY] Prune error:", err),
  );
}

// ── In-memory log buffer (populated by console interception) ─────────────────

export type LogLevel = "info" | "warn" | "error";
export type LogTag = "api" | "publishing" | "oauth" | "ai" | "telnyx" | "system";

export interface LogEntry {
  id: string;
  ts: string;
  level: LogLevel;
  tag: LogTag;
  message: string;
}

const LOG_BUFFER: LogEntry[] = [];
const MAX_ENTRIES = 500;
let logSeq = 0;

function tagFromMessage(msg: string): LogTag {
  const u = msg.toUpperCase();
  if (/GBP-PUBLISH|GBP-REFRESH|TOKENINFO|SOCIAL.POST|FACEBOOK|INSTAGRAM|META.PUBLISH/.test(u)) return "publishing";
  if (/OAUTH|GOOGLE-REFRESH|GOOGLE-VERIFY|GOOGLE-OAUTH|META-OAUTH|TIKTOK-OAUTH|LINKEDIN-OAUTH/.test(u)) return "oauth";
  if (/AUTO-CONTENT|AI-GENERATE|OPENAI|\[AI\]/.test(u)) return "ai";
  if (/TELNYX|SMS|MISSED.CALL|\[TELNYX\]/.test(u)) return "telnyx";
  if (/\[API\]|REQUEST|ROUTE|ENDPOINT/.test(u)) return "api";
  return "system";
}

function addLog(level: LogLevel, args: any[]) {
  const message = args
    .map(a => (typeof a === "string" ? a : JSON.stringify(a)))
    .join(" ")
    .slice(0, 600);
  const entry: LogEntry = {
    id: String(++logSeq),
    ts: new Date().toISOString(),
    level,
    tag: tagFromMessage(message),
    message,
  };
  LOG_BUFFER.unshift(entry);
  if (LOG_BUFFER.length > MAX_ENTRIES) LOG_BUFFER.pop();
}

const _origLog   = console.log.bind(console);
const _origWarn  = console.warn.bind(console);
const _origError = console.error.bind(console);
console.log   = (...a: any[]) => { _origLog(...a);   addLog("info",  a); };
console.warn  = (...a: any[]) => { _origWarn(...a);  addLog("warn",  a); };
console.error = (...a: any[]) => { _origError(...a); addLog("error", a); };

// ── GET /diagnostics/health ──────────────────────────────────────────────────
router.get("/diagnostics/health", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [connections, posts] = await Promise.all([
    db.select().from(socialConnectionsTable).where(eq(socialConnectionsTable.userId, userId)),
    db.select().from(socialPostsTable).where(eq(socialPostsTable.userId, userId)).orderBy(desc(socialPostsTable.updatedAt)),
  ]);

  const now = new Date();

  // Google-style OAuth: uses refresh tokens for token renewal → flag if missing
  function googleConnHealth(provider: string): { status: "healthy" | "warning" | "failed"; detail: string; connectedAt: string | null } {
    const c = connections.find(r => r.provider === provider);
    if (!c?.accessToken) return { status: "failed", detail: "Not connected", connectedAt: null };
    const exp = c.expiresAt ? new Date(c.expiresAt) : null;
    const expired = exp ? exp < now : false;
    if (expired && !c.refreshToken) return { status: "warning", detail: "Token expired — no refresh token stored", connectedAt: c.createdAt?.toISOString() ?? null };
    if (expired && c.refreshToken) return { status: "warning", detail: "Token expired (auto-refresh on next publish)", connectedAt: c.createdAt?.toISOString() ?? null };
    if (!c.refreshToken) return { status: "warning", detail: "Connected but no refresh token — re-authorize to ensure long-term access", connectedAt: c.createdAt?.toISOString() ?? null };
    return { status: "healthy", detail: c.accountName ? `Connected — ${c.accountName}` : "Connected", connectedAt: c.createdAt?.toISOString() ?? null };
  }

  // Meta OAuth: does NOT use refresh tokens. Facebook issues long-lived user tokens
  // (~60 days) and permanent page access tokens. Health is based on:
  // access token present + not expired + page access token stored + no recent FB-specific failures.
  function metaHealth(meta: Record<string, any>): { status: "healthy" | "warning" | "failed"; detail: string; connectedAt: string | null } {
    const c = connections.find(r => r.provider === "facebook");
    if (!c?.accessToken) return { status: "failed", detail: "Not connected", connectedAt: null };

    const exp = c.expiresAt ? new Date(c.expiresAt) : null;
    if (exp && exp < now) {
      return { status: "warning", detail: "Access token expired — reconnect Facebook to refresh", connectedAt: c.createdAt?.toISOString() ?? null };
    }

    if (!meta.pageAccessToken) {
      return { status: "warning", detail: "No page access token — complete Facebook Page setup in Connected Accounts", connectedAt: c.createdAt?.toISOString() ?? null };
    }

    // Check recent publish failures on Facebook/Instagram platforms (last 24h).
    // For "partial" posts (one platform succeeded, one failed), only flag as a Facebook
    // failure if the error message clearly indicates a Facebook/Instagram error.
    // Google quota failures on a multi-platform post must NOT count as a Facebook failure.
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentFbFailed = posts.filter(p => {
      if (p.status !== "failed" && p.status !== "partial") return false;
      const ts = p.updatedAt ?? p.createdAt;
      if (new Date(ts) < cutoff) return false;
      try {
        const pl: string[] = JSON.parse(p.platforms ?? "[]");
        if (!pl.some(x => x === "facebook" || x === "instagram")) return false;
        // For partial posts: only count as FB failure if error is not Google/quota-related
        if (p.status === "partial" && p.errorMessage) {
          const errUp = p.errorMessage.toUpperCase();
          if (/GOOGLE|GBP|QUOTA|MYBUSINESS|LOCATIONS|429|COOLDOWN/.test(errUp)) return false;
        }
        return true;
      } catch { return false; }
    });

    if (recentFbFailed.length > 0) {
      return { status: "warning", detail: `Page connected — ${recentFbFailed.length} Facebook/Instagram failure(s) in last 24h (see Error Center)`, connectedAt: c.createdAt?.toISOString() ?? null };
    }

    const pageName = meta.pageName ?? c.accountName ?? null;
    return { status: "healthy", detail: pageName ? `Page connected — ${pageName}` : "Page connected", connectedAt: c.createdAt?.toISOString() ?? null };
  }

  // Generic OAuth health (for providers like TikTok, YouTube where we store refresh tokens)
  function connHealth(provider: string): { status: "healthy" | "warning" | "failed"; detail: string; connectedAt: string | null } {
    const c = connections.find(r => r.provider === provider);
    if (!c?.accessToken) return { status: "warning", detail: "Not connected", connectedAt: null };
    const exp = c.expiresAt ? new Date(c.expiresAt) : null;
    const expired = exp ? exp < now : false;
    if (expired) return { status: "warning", detail: "Token expired — reconnect to restore access", connectedAt: c.createdAt?.toISOString() ?? null };
    return { status: "healthy", detail: c.accountName ? `Connected — ${c.accountName}` : "Connected", connectedAt: c.createdAt?.toISOString() ?? null };
  }

  // YouTube-specific health with clearer messaging
  function youtubeHealth(): { status: "healthy" | "warning" | "failed"; detail: string; connectedAt: string | null; uploadScopeGranted: boolean; uploadPermissionVerified: boolean; channelName: string | null } {
    const c = connections.find(r => r.provider === "youtube");
    const base = { uploadScopeGranted: false, uploadPermissionVerified: false, channelName: null as string | null };
    if (!c?.accessToken) return { status: "warning", detail: "Not connected — reconnect YouTube in Connected Accounts to restore access", connectedAt: null, ...base };
    const exp = c.expiresAt ? new Date(c.expiresAt) : null;
    const expired = exp ? exp < now : false;
    if (expired) return { status: "warning", detail: "Token expired — reconnect YouTube to restore access", connectedAt: c.createdAt?.toISOString() ?? null, ...base };

    let meta: Record<string, any> = {};
    try { if (c.metadata) meta = JSON.parse(c.metadata); } catch {}

    const uploadScopeGranted      = !!meta.uploadScopeGranted;
    const uploadPermissionVerified = !!meta.uploadPermissionVerified;
    const channelName = c.accountName ?? null;

    if (!uploadScopeGranted && meta.scopeCheckedAt) {
      return {
        status: "warning",
        detail: `Connected as ${channelName ?? "unknown"} — missing youtube.upload scope. Reconnect YouTube to grant upload permissions, then run the Test Upload to verify.`,
        connectedAt: c.createdAt?.toISOString() ?? null,
        uploadScopeGranted: false, uploadPermissionVerified: false, channelName,
      };
    }

    const uploadStatus = uploadPermissionVerified
      ? "Upload permissions verified ✓"
      : uploadScopeGranted
        ? "Upload scope granted — run Test Upload to verify end-to-end"
        : "Run Test Upload to verify permissions";

    return {
      status: "healthy",
      detail: `Connected — ${channelName ?? "channel linked"} | ${uploadStatus}`,
      connectedAt: c.createdAt?.toISOString() ?? null,
      uploadScopeGranted,
      uploadPermissionVerified,
      channelName,
    };
  }

  // OpenAI health — checks key presence and recent quota errors in the log buffer
  function openaiHealth(): { status: "healthy" | "warning" | "failed"; detail: string; connectedAt: string | null } {
    const hasKey = !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY);
    if (!hasKey) return { status: "failed", detail: "No API key configured — AI content generation unavailable", connectedAt: null };
    const recentQuota = LOG_BUFFER.slice(0, 100).some(e => {
      const u = e.message.toUpperCase();
      return /QUOTA|INSUFFICIENT_QUOTA|429|RATE.LIMIT/.test(u) && /OPENAI|AI.GENERATE|AUTO.CONTENT|\[AI\]/.test(u);
    });
    if (recentQuota) return { status: "warning", detail: "AI unavailable — OpenAI quota exhausted. Content generation is paused until quota resets.", connectedAt: null };
    return { status: "healthy", detail: "API key configured — AI content generation ready", connectedAt: null };
  }

  const fbConn = connections.find(c => c.provider === "facebook");
  let fbMeta: Record<string, any> = {};
  try { if (fbConn?.metadata) fbMeta = JSON.parse(fbConn.metadata); } catch {}

  let gbpMeta: Record<string, any> = {};
  const gbpConn = connections.find(c => c.provider === "google_business");
  try { if (gbpConn?.metadata) gbpMeta = JSON.parse(gbpConn.metadata); } catch {}

  const platforms = {
    facebook: metaHealth(fbMeta),
    instagram: (() => {
      if (!fbConn?.accessToken) return { status: "failed" as const, detail: "Requires Facebook connection", connectedAt: null };
      const exp = fbConn.expiresAt ? new Date(fbConn.expiresAt) : null;
      if (exp && exp < now) return { status: "warning" as const, detail: "Facebook token expired — reconnect to restore Instagram", connectedAt: fbConn.createdAt?.toISOString() ?? null };
      if (!fbMeta.instagramBusinessAccountId) return { status: "warning" as const, detail: "Facebook connected — no IG Business account linked", connectedAt: fbConn.createdAt?.toISOString() ?? null };
      const igName = fbMeta.instagramUsername ?? fbMeta.pageName ?? null;
      return { status: "healthy" as const, detail: igName ? `Connected — ${igName}` : "Connected via Facebook Page", connectedAt: fbConn.createdAt?.toISOString() ?? null };
    })(),
    google_business: {
      ...googleConnHealth("google_business"),
      locationTitle: gbpMeta.locationTitle ?? null,
      locationId: gbpMeta.locationId ?? null,
      accountId: gbpMeta.accountId ?? null,
      address: gbpMeta.address ?? null,
      cachedAt: gbpMeta.cachedAt ?? null,
      cooldownUntil: (() => {
        const cd = gbpMeta.cooldownUntil ? new Date(gbpMeta.cooldownUntil) : null;
        return (cd && cd > now) ? cd.toISOString() : null;
      })(),
    },
    tiktok: (() => {
      const c = connections.find(r => r.provider === "tiktok");
      const credentialsSet = !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
      const SCOPES = "user.info.basic,user.info.profile,video.list,video.publish";

      if (!credentialsSet) {
        return { status: "failed" as const, detail: "Missing TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET", connectedAt: null, scopesRequested: SCOPES, publishReady: false };
      }
      if (!c?.accessToken) {
        return { status: "warning" as const, detail: "Waiting for TikTok authorization — credentials configured, OAuth not yet completed", connectedAt: null, scopesRequested: SCOPES, publishReady: false };
      }
      const exp     = c.expiresAt ? new Date(c.expiresAt) : null;
      const expired = exp ? exp < now : false;
      if (expired) {
        return { status: "warning" as const, detail: "Token expired — reconnect TikTok to restore access", connectedAt: c.createdAt?.toISOString() ?? null, scopesRequested: SCOPES, publishReady: false };
      }
      const name = c.accountName ?? c.accountId ?? null;
      return {
        status: "healthy" as const,
        detail: name ? `Connected — ${name} | Awaiting TikTok app-review approval for video.publish` : `Connected | Awaiting TikTok app-review approval for video.publish`,
        connectedAt: c.createdAt?.toISOString() ?? null,
        scopesRequested: SCOPES,
        publishReady: false,
        publishNote: "video.publish requires TikTok app review — pending approval",
      };
    })(),
    youtube: youtubeHealth(),
    openai: openaiHealth(),
    telnyx: {
      status: ((): "healthy" | "warning" | "failed" => {
        const missing: string[] = [];
        if (!process.env.TELNYX_API_KEY)            missing.push("TELNYX_API_KEY");
        if (!process.env.TELNYX_FROM_NUMBER)         missing.push("TELNYX_FROM_NUMBER");
        if (!process.env.BUSINESS_FORWARD_NUMBER)    missing.push("BUSINESS_FORWARD_NUMBER");
        if (missing.length === 3) return "failed";
        if (missing.length > 0)  return "warning";
        return "healthy";
      })(),
      detail: (() => {
        const missing: string[] = [];
        if (!process.env.TELNYX_API_KEY)            missing.push("TELNYX_API_KEY");
        if (!process.env.TELNYX_FROM_NUMBER)         missing.push("TELNYX_FROM_NUMBER");
        if (!process.env.BUSINESS_FORWARD_NUMBER)    missing.push("BUSINESS_FORWARD_NUMBER");
        if (missing.length === 0) {
          return `Configured — from ${process.env.TELNYX_FROM_NUMBER}, forwarding to ${process.env.BUSINESS_FORWARD_NUMBER}`;
        }
        return `Missing env vars: ${missing.join(", ")}`;
      })(),
      connectedAt: null,
    },
  };

  const postCounts = { draft: 0, scheduled: 0, pending: 0, published: 0, failed: 0, partial: 0 };
  for (const p of posts) {
    const s = p.status as keyof typeof postCounts;
    if (s in postCounts) postCounts[s]++;
  }

  const recentErrors = posts
    .filter(p => (p.status === "failed" || p.status === "partial") && p.errorMessage)
    .slice(0, 25)
    .map(p => {
      const platforms2: string[] = [];
      try { JSON.parse(p.platforms || "[]").forEach((pl: string) => platforms2.push(pl)); } catch {}
      return {
        id: p.id,
        ts: (p.updatedAt ?? p.createdAt).toISOString(),
        platform: platforms2.join(", ") || "unknown",
        status: p.status,
        severity: p.status === "failed" ? "error" : "warn",
        message: p.errorMessage ?? "",
        caption: (p.caption ?? "").slice(0, 60),
      };
    });

  const [acRow] = await db.select().from(autoContentSettingsTable).where(eq(autoContentSettingsTable.userId, userId));

  const scheduled = posts.filter(p => p.status === "scheduled");
  const nextPost = scheduled
    .filter(p => p.scheduledAt && new Date(p.scheduledAt) > now)
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())[0];

  const healthPayload = {
    platforms,
    postCounts,
    recentPosts: posts.slice(0, 50).map(p => {
      const pl: string[] = [];
      try { JSON.parse(p.platforms || "[]").forEach((x: string) => pl.push(x)); } catch {}
      return {
        id: p.id,
        status: p.status,
        platforms: pl,
        caption: (p.caption ?? "").slice(0, 80),
        scheduledAt: p.scheduledAt?.toISOString() ?? null,
        publishedAt: p.publishedAt?.toISOString() ?? null,
        errorMessage: p.errorMessage ?? null,
        createdAt: p.createdAt.toISOString(),
      };
    }),
    recentErrors,
    aiEngine: {
      active: !!acRow,
      clientName: acRow?.clientName ?? null,
      industry: acRow?.industry ?? null,
      frequency: acRow?.frequency ?? null,
      platforms: (() => { try { return JSON.parse(acRow?.platforms ?? "[]"); } catch { return []; } })(),
      toneStyle: (() => { try { return JSON.parse(acRow?.toneStyle ?? "[]"); } catch { return []; } })(),
      postAngles: (() => { try { return JSON.parse(acRow?.postAngles ?? "[]"); } catch { return []; } })(),
      autoGenerateEnabled: acRow?.autoGenerateEnabled !== "false",
      enginePaused: acRow?.enginePaused === "true",
      scheduledCount: scheduled.length,
      draftCount: posts.filter(p => p.status === "draft").length,
      nextScheduledPost: nextPost?.scheduledAt ? new Date(nextPost.scheduledAt).toISOString() : null,
      totalPosts: posts.length,
      lastGeneratedAt: acRow?.lastGeneratedAt?.toISOString() ?? null,
      lastUpdated: acRow?.updatedAt?.toISOString() ?? null,
    },
    checkedAt: now.toISOString(),
  };
  res.json(healthPayload);

  // Persist health snapshot in the background — must not block the response.
  persistHealthSnapshot(userId, platforms, now).catch(err =>
    console.error("[HEALTH-PERSIST] failed:", err),
  );
});

// ── GET /diagnostics/health-history ─────────────────────────────────────────
router.get("/diagnostics/health-history", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const provider =
    typeof req.query.provider === "string" && req.query.provider
      ? req.query.provider
      : null;
  const limit = parseLimit(req.query.limit);

  try {
    const params: any[] = [userId];
    let query = `
      SELECT provider, status, checked_at, last_success_at,
             error_message, health_score, metadata
      FROM integration_health_history
      WHERE user_id = $1
    `;
    if (provider) {
      params.push(provider);
      query += ` AND provider = $${params.length}`;
    }
    params.push(limit);
    query += ` ORDER BY checked_at DESC LIMIT $${params.length}`;

    const { rows } = await pool.query(query, params);
    res.json({ history: rows });
  } catch (err) {
    console.error("[HEALTH-HISTORY] Read failed:", err);
    res.status(500).json({ error: "Failed to load health history" });
  }
});

// ── GET /diagnostics/logs ────────────────────────────────────────────────────
router.get("/diagnostics/logs", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const tab    = ((req.query.tab as string) || "all").toLowerCase();
  const limit  = Math.min(parseInt((req.query.limit as string) || "150", 10), 500);
  const after  = req.query.after ? String(req.query.after) : null;

  let entries  = tab === "all" ? LOG_BUFFER : LOG_BUFFER.filter(e => e.tag === tab);
  if (after) {
    const idx = entries.findIndex(e => e.id === after);
    if (idx !== -1) entries = entries.slice(0, idx);
  }

  res.json({ logs: entries.slice(0, limit), total: entries.length });
});

// ── POST /diagnostics/clear-gbp-cache ───────────────────────────────────────
router.post("/diagnostics/clear-gbp-cache", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [row] = await db.select().from(socialConnectionsTable)
    .where(and(eq(socialConnectionsTable.userId, userId), eq(socialConnectionsTable.provider, "google_business")));
  if (!row) { res.json({ ok: true, message: "No GBP connection found" }); return; }

  let meta: Record<string, any> = {};
  try { if (row.metadata) meta = JSON.parse(row.metadata); } catch {}
  delete meta.locationName; delete meta.accountName; delete meta.locationTitle; delete meta.primaryLocationTitle;

  await db.update(socialConnectionsTable)
    .set({ metadata: JSON.stringify(meta), updatedAt: new Date() })
    .where(and(eq(socialConnectionsTable.userId, userId), eq(socialConnectionsTable.provider, "google_business")));

  console.log(`[DIAGNOSTICS] GBP cache cleared userId=${userId}`);
  res.json({ ok: true, message: "GBP location cache cleared — next publish will re-fetch from API" });
});

// ── POST /diagnostics/retry-failed ──────────────────────────────────────────
router.post("/diagnostics/retry-failed", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const failed = await db.select().from(socialPostsTable)
    .where(and(eq(socialPostsTable.userId, userId), eq(socialPostsTable.status, "failed")));
  if (!failed.length) { res.json({ ok: true, retried: 0, message: "No failed posts found" }); return; }

  await db.update(socialPostsTable)
    .set({ status: "scheduled", errorMessage: null, updatedAt: new Date() })
    .where(and(eq(socialPostsTable.userId, userId), eq(socialPostsTable.status, "failed")));

  console.log(`[DIAGNOSTICS] Retried ${failed.length} failed posts userId=${userId}`);
  res.json({ ok: true, retried: failed.length, message: `Reset ${failed.length} failed post(s) to scheduled` });
});

// ── POST /diagnostics/force-health-check ────────────────────────────────────
router.post("/diagnostics/force-health-check", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  console.log(`[DIAGNOSTICS] force-health-check userId=${userId} at ${new Date().toISOString()}`);
  res.json({ ok: true, checkedAt: new Date().toISOString() });
});

// ── POST /diagnostics/db-backup — export all tables to JSON ─────────────────
router.post("/diagnostics/db-backup", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

    // Discover all public tables dynamically
    const tablesResult = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const tables: Record<string, unknown[]> = {};
    const rowCounts: Record<string, number> = {};

    for (const row of tablesResult.rows) {
      const tbl = row.table_name as string;
      const rows = await db.execute(sql.raw(`SELECT * FROM "${tbl}"`));
      tables[tbl] = rows.rows as unknown[];
      rowCounts[tbl] = rows.rows.length;
    }

    const exportedAt = new Date().toISOString();
    const backup = { exportedAt, version: "1.0", tables, rowCounts };

    const ts = exportedAt.replace(/[:.]/g, "-").slice(0, 19);
    const filename = `backup-${ts}.json`;
    const filepath = path.join(BACKUP_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(backup, null, 2));

    const totalRows = Object.values(rowCounts).reduce((a, b) => a + b, 0);
    console.log(`[DIAGNOSTICS] db-backup created ${filename} (${totalRows} rows, ${Object.keys(tables).length} tables)`);
    res.json({ ok: true, filename, totalRows, rowCounts, exportedAt, tableNames: Object.keys(tables) });
  } catch (err: any) {
    console.error("[DIAGNOSTICS] db-backup error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /diagnostics/backups — list saved backup files ──────────────────────
router.get("/diagnostics/backups", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    if (!fs.existsSync(BACKUP_DIR)) { res.json({ backups: [] }); return; }
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith("backup-") && f.endsWith(".json"))
      .map(filename => {
        const stat = fs.statSync(path.join(BACKUP_DIR, filename));
        return { filename, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ backups: files });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /diagnostics/backups/:filename — download a backup file ──────────────
router.get("/diagnostics/backups/:filename", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { filename } = req.params;
  if (!/^backup-[\dT\-]+\.json$/.test(filename)) {
    res.status(400).json({ error: "Invalid filename" }); return;
  }
  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) { res.status(404).json({ error: "Backup not found" }); return; }
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  fs.createReadStream(filepath).pipe(res);
});

// ── DELETE /diagnostics/backups/:filename — delete a backup file ─────────────
router.delete("/diagnostics/backups/:filename", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { filename } = req.params;
  if (!/^backup-[\dT\-]+\.json$/.test(filename)) {
    res.status(400).json({ error: "Invalid filename" }); return;
  }
  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) { res.status(404).json({ error: "Not found" }); return; }
  fs.unlinkSync(filepath);
  res.json({ ok: true });
});

export default router;

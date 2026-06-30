import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { socialConnectionsTable, socialPostsTable, autoContentSettingsTable } from "@workspace/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

const BACKUP_DIR = path.resolve(process.cwd(), "backups");

const router = Router();

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
  // access token present + not expired + page access token stored + no recent failures.
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

    // Check recent publish failures on Facebook/Instagram platforms (last 24h)
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentFailed = posts.filter(p => {
      if (p.status !== "failed" && p.status !== "partial") return false;
      const ts = p.updatedAt ?? p.createdAt;
      if (new Date(ts) < cutoff) return false;
      try {
        const pl: string[] = JSON.parse(p.platforms ?? "[]");
        return pl.some(x => x === "facebook" || x === "instagram");
      } catch { return false; }
    });

    if (recentFailed.length > 0) {
      return { status: "warning", detail: `Page connected — ${recentFailed.length} failed post(s) in last 24h`, connectedAt: c.createdAt?.toISOString() ?? null };
    }

    const pageName = meta.pageName ?? c.accountName ?? null;
    return { status: "healthy", detail: pageName ? `Page connected — ${pageName}` : "Page connected", connectedAt: c.createdAt?.toISOString() ?? null };
  }

  // Generic OAuth health (for providers like TikTok, YouTube where we store refresh tokens)
  function connHealth(provider: string): { status: "healthy" | "warning" | "failed"; detail: string; connectedAt: string | null } {
    const c = connections.find(r => r.provider === provider);
    if (!c?.accessToken) return { status: "failed", detail: "Not connected", connectedAt: null };
    const exp = c.expiresAt ? new Date(c.expiresAt) : null;
    const expired = exp ? exp < now : false;
    if (expired) return { status: "warning", detail: "Token expired — reconnect to restore access", connectedAt: c.createdAt?.toISOString() ?? null };
    return { status: "healthy", detail: c.accountName ? `Connected — ${c.accountName}` : "Connected", connectedAt: c.createdAt?.toISOString() ?? null };
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
        return { status: "warning" as const, detail: "Credentials set — OAuth not completed. Connect TikTok in Connected Accounts.", connectedAt: null, scopesRequested: SCOPES, publishReady: false };
      }
      const exp     = c.expiresAt ? new Date(c.expiresAt) : null;
      const expired = exp ? exp < now : false;
      if (expired) {
        return { status: "warning" as const, detail: "Token expired — reconnect TikTok to restore access", connectedAt: c.createdAt?.toISOString() ?? null, scopesRequested: SCOPES, publishReady: false };
      }
      const name = c.accountName ?? c.accountId ?? null;
      // Token exists and is not expired — consider connected.
      // publishReady will only be true once video.publish scope is approved via app review.
      return {
        status: "healthy" as const,
        detail: name ? `Connected — ${name} | Scopes: ${SCOPES}` : `Connected | Scopes: ${SCOPES}`,
        connectedAt: c.createdAt?.toISOString() ?? null,
        scopesRequested: SCOPES,
        publishReady: false, // set to true once TikTok app review approves video.publish
        publishNote: "video.publish requires TikTok app review — run Test Publish Readiness to check status",
      };
    })(),
    youtube:        connHealth("youtube"),
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

  res.json({
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
  });
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

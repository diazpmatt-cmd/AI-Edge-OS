import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { socialConnectionsTable, socialPostsTable, autoContentSettingsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";

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

  function connHealth(provider: string): { status: "healthy" | "warning" | "failed"; detail: string; connectedAt: string | null } {
    const c = connections.find(r => r.provider === provider);
    if (!c?.accessToken) return { status: "failed", detail: "Not connected", connectedAt: null };
    const exp = c.expiresAt ? new Date(c.expiresAt) : null;
    const expired = exp ? exp < now : false;
    if (expired && !c.refreshToken) return { status: "warning", detail: "Token expired — no refresh token stored", connectedAt: c.createdAt?.toISOString() ?? null };
    if (expired && c.refreshToken) return { status: "warning", detail: "Token expired (auto-refresh on next publish)", connectedAt: c.createdAt?.toISOString() ?? null };
    if (!c.refreshToken) return { status: "warning", detail: `Connected but no refresh token`, connectedAt: c.createdAt?.toISOString() ?? null };
    return { status: "healthy", detail: c.accountName ? `Connected — ${c.accountName}` : "Connected", connectedAt: c.createdAt?.toISOString() ?? null };
  }

  const fbConn = connections.find(c => c.provider === "facebook");
  let fbMeta: Record<string, any> = {};
  try { if (fbConn?.metadata) fbMeta = JSON.parse(fbConn.metadata); } catch {}

  let gbpMeta: Record<string, any> = {};
  const gbpConn = connections.find(c => c.provider === "google_business");
  try { if (gbpConn?.metadata) gbpMeta = JSON.parse(gbpConn.metadata); } catch {}

  const platforms = {
    facebook:       connHealth("facebook"),
    instagram: (() => {
      if (!fbConn?.accessToken) return { status: "failed" as const, detail: "Requires Facebook connection", connectedAt: null };
      if (!fbMeta.instagramBusinessAccountId) return { status: "warning" as const, detail: "Facebook connected — no IG Business account linked", connectedAt: fbConn.createdAt?.toISOString() ?? null };
      return { status: "healthy" as const, detail: "Connected via Facebook Page", connectedAt: fbConn.createdAt?.toISOString() ?? null };
    })(),
    google_business: {
      ...connHealth("google_business"),
      locationTitle: gbpMeta.locationTitle ?? null,
    },
    tiktok:         connHealth("tiktok"),
    youtube:        connHealth("youtube"),
    telnyx: {
      status: (process.env.TELNYX_API_KEY ? "healthy" : "warning") as "healthy" | "warning" | "failed",
      detail: process.env.TELNYX_API_KEY ? "API key configured" : "TELNYX_API_KEY secret not set",
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
      frequency: acRow?.frequency ?? null,
      platforms: (() => { try { return JSON.parse(acRow?.platforms ?? "[]"); } catch { return []; } })(),
      scheduledCount: scheduled.length,
      nextScheduledPost: nextPost?.scheduledAt ? new Date(nextPost.scheduledAt).toISOString() : null,
      totalPosts: posts.length,
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

export default router;

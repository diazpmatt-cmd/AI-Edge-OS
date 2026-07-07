import { Router } from "express";
import { getAuth } from "@clerk/express";
import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { db } from "@workspace/db";
import {
  socialPostsTable,
  socialConnectionsTable,
  reviewRequestsTable,
  reviewPlatformStatsTable,
  leadsTable,
} from "@workspace/db/schema";
import { eq, desc, gte } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router = Router();

function getAiModel() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set. Add it in Secrets.");
  const gw = createOpenAICompatible({
    name: "openai",
    baseURL: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    headers: { Authorization: `Bearer ${key}` },
  });
  return gw(process.env.OPENAI_MODEL ?? "gpt-4o-mini");
}

// ── POST /apollos/chat ─────────────────────────────────────────────────────────
router.post("/apollos/chat", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { message } = req.body as { message: string };
  if (!message?.trim()) { res.status(400).json({ error: "Message required" }); return; }

  const ctx = {
    // Publishing
    postsPublished: 0, postsDraft: 0, postsPartial: 0, postsFailed: 0,
    lastPublishedAt: null as string | null,
    lastPublishedPlatforms: null as string | null,
    // Connections
    fbConnected: false, igConnected: false, tikTokConnected: false,
    gbpConnected: false, gbpHasLocation: false,
    gbpInCooldown: false, gbpCooldownMinsLeft: 0,
    // Leads
    leadsTotal: 0, leadsNew: 0, leadsThisMonth: 0, leadsLive: false,
    // Calls
    callsTotal: 0, callsMissed: 0, callsLive: false,
    // Reviews
    reviewsSent: 0, reviewsFailed: 0, reviewsThisWeek: 0, reviewsLive: false,
    googleReviewCount: 0, googleRating: 0,
    fbReviewCount: 0, fbRating: 0,
    reviewStatsLive: false,
    // AI Receptionist
    receptionistPhone: null as string | null, receptionistConfigured: false,
    // GorillaDesk
    gorilladeskSynced: false, gorilladeskJobCount: 0,
  };

  const now = new Date();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);
  const firstOfMonth  = new Date(now.getFullYear(), now.getMonth(), 1);

  // ── Fetch all DB data in parallel ──────────────────────────────────────────
  await Promise.allSettled([
    // Social posts
    (async () => {
      const posts = await db.select({
        status: socialPostsTable.status,
        platforms: socialPostsTable.platforms,
        publishedAt: socialPostsTable.publishedAt,
      }).from(socialPostsTable)
        .where(eq(socialPostsTable.userId, userId))
        .orderBy(desc(socialPostsTable.publishedAt))
        .limit(50);
      ctx.postsPublished = posts.filter(p => p.status === "published").length;
      ctx.postsDraft     = posts.filter(p => p.status === "draft").length;
      ctx.postsPartial   = posts.filter(p => p.status === "partial").length;
      ctx.postsFailed    = posts.filter(p => p.status === "failed").length;
      const lastPub = posts.find(p => p.status === "published");
      if (lastPub) {
        ctx.lastPublishedAt = lastPub.publishedAt?.toISOString() ?? null;
        ctx.lastPublishedPlatforms = lastPub.platforms ?? null;
      }
    })(),

    // Social connections
    (async () => {
      const conns = await db.select().from(socialConnectionsTable)
        .where(eq(socialConnectionsTable.userId, userId));
      ctx.fbConnected      = conns.some(c => c.provider === "facebook"       && !!c.accessToken);
      ctx.igConnected      = conns.some(c => c.provider === "instagram"      && !!c.accessToken);
      ctx.tikTokConnected  = conns.some(c => c.provider === "tiktok"         && !!c.accessToken);
      const gbp = conns.find(c => c.provider === "google_business");
      ctx.gbpConnected     = !!(gbp?.accessToken);
      if (gbp?.metadata) {
        try {
          const meta = JSON.parse(gbp.metadata) as Record<string, unknown>;
          ctx.gbpHasLocation = !!(meta.locationName);
          const cooldownUntil = meta.cooldownUntil as string | undefined;
          if (cooldownUntil && new Date(cooldownUntil) > now) {
            ctx.gbpInCooldown        = true;
            ctx.gbpCooldownMinsLeft  = Math.ceil((new Date(cooldownUntil).getTime() - now.getTime()) / 60000);
          }
        } catch {}
      }
    })(),

    // Leads
    (async () => {
      const allLeads = await db.select({
        status: leadsTable.status,
        createdAt: leadsTable.createdAt,
      }).from(leadsTable).where(gte(leadsTable.createdAt, thirtyDaysAgo));
      ctx.leadsTotal     = allLeads.length;
      ctx.leadsNew       = allLeads.filter(l => l.status === "new").length;
      ctx.leadsThisMonth = allLeads.filter(l => new Date(l.createdAt!) >= firstOfMonth).length;
      ctx.leadsLive      = true;
    })(),

    // Review requests
    (async () => {
      const reviews = await db.select({
        status: reviewRequestsTable.status,
        sentAt: reviewRequestsTable.sentAt,
      }).from(reviewRequestsTable).where(gte(reviewRequestsTable.sentAt, thirtyDaysAgo));
      ctx.reviewsSent     = reviews.filter(r => r.status === "sent").length;
      ctx.reviewsFailed   = reviews.filter(r => r.status === "failed").length;
      ctx.reviewsThisWeek = reviews.filter(r => r.sentAt && new Date(r.sentAt) >= sevenDaysAgo).length;
      ctx.reviewsLive     = true;
    })(),

    // Review platform stats (Google / Facebook ratings)
    (async () => {
      const stats = await db.select().from(reviewPlatformStatsTable);
      const g = stats.find(s => s.platform === "google");
      const f = stats.find(s => s.platform === "facebook");
      ctx.googleReviewCount = g?.reviewCount ?? 0;
      ctx.googleRating      = typeof g?.averageRating === "string" ? parseFloat(g.averageRating) : (g?.averageRating ?? 0);
      ctx.fbReviewCount     = f?.reviewCount ?? 0;
      ctx.fbRating          = typeof f?.averageRating === "string" ? parseFloat(f.averageRating) : (f?.averageRating ?? 0);
      ctx.reviewStatsLive   = true;
    })(),

    // Calls (raw SQL)
    (async () => {
      const result = await db.execute(sql`
        SELECT COUNT(*)::int                                    AS total,
               COUNT(*) FILTER (WHERE outcome = 'missed')::int AS missed
        FROM calls
        WHERE created_at > NOW() - INTERVAL '30 days'
      `);
      const row = result.rows?.[0] as { total?: number; missed?: number } | undefined;
      if (row) {
        ctx.callsTotal  = row.total  ?? 0;
        ctx.callsMissed = row.missed ?? 0;
        ctx.callsLive   = true;
      }
    })(),

    // AI Receptionist configuration
    (async () => {
      const result = await db.execute(sql`
        SELECT transfer_phone FROM ai_receptionist_settings
        WHERE client_id = 'default' LIMIT 1
      `);
      const row = result.rows?.[0] as { transfer_phone?: string } | undefined;
      ctx.receptionistPhone      = row?.transfer_phone ?? null;
      ctx.receptionistConfigured = !!(row?.transfer_phone);
    })(),

    // GorillaDesk sync status
    (async () => {
      const result = await db.execute(sql`
        SELECT COUNT(*)::int AS total FROM gorilladesk_jobs
      `);
      const row = result.rows?.[0] as { total?: number } | undefined;
      ctx.gorilladeskJobCount = row?.total ?? 0;
      ctx.gorilladeskSynced   = (ctx.gorilladeskJobCount > 0);
    })(),
  ]);

  // ── Build context string ───────────────────────────────────────────────────
  const fmtPlatforms = (raw: string | null) => {
    if (!raw) return "unknown";
    try { return (JSON.parse(raw) as string[]).join(", "); } catch { return raw; }
  };
  const ld = (n: number, live: boolean) => live ? String(n) : "No live data yet";
  const fmtRating = (r: number) => r > 0 ? r.toFixed(1) : "not set";

  const today = now.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  const contextBlock = `
Today: ${today}
Client: Bed Bugs & Beyond (BB&B) — pest control, Baldwin County, AL. Owner: Matt Diaz.

PLATFORM CONNECTIONS:
- Facebook: ${ctx.fbConnected ? "✅ Connected" : "❌ Not connected"}
- Instagram: ${ctx.igConnected ? "✅ Connected" : "❌ Not connected"}
- TikTok: ${ctx.tikTokConnected ? "✅ Connected" : "❌ Not connected"}
- Google Business Profile: ${ctx.gbpConnected ? "✅ Connected" : "❌ Not connected"}${ctx.gbpConnected && !ctx.gbpHasLocation ? " ⚠️ location cache missing — run 'Refresh GBP Location' in System Diagnostics" : ""}${ctx.gbpInCooldown ? ` ⛔ quota cooldown active — ${ctx.gbpCooldownMinsLeft}m remaining before retry` : ""}

PUBLISHING (all time):
- Posts published: ${ctx.postsPublished}
- Posts draft/queued: ${ctx.postsDraft}
- Posts partial (some platforms failed): ${ctx.postsPartial}
- Posts fully failed: ${ctx.postsFailed}
- Last published: ${ctx.lastPublishedAt ? `${new Date(ctx.lastPublishedAt).toLocaleDateString("en-US")} on ${fmtPlatforms(ctx.lastPublishedPlatforms)}` : "Never"}

LEADS & CALLS (last 30 days):
- Total leads: ${ld(ctx.leadsTotal, ctx.leadsLive)}
- Leads needing follow-up (status = new): ${ctx.leadsLive ? ctx.leadsNew : "No live data yet"}
- Leads this month: ${ld(ctx.leadsThisMonth, ctx.leadsLive)}
- Total calls: ${ld(ctx.callsTotal, ctx.callsLive)}
- Missed calls: ${ctx.callsLive ? ctx.callsMissed : "No live data yet"}

REVIEWS (last 30 days):
- Review requests sent via SMS: ${ld(ctx.reviewsSent, ctx.reviewsLive)}
- Review requests failed: ${ctx.reviewsLive ? ctx.reviewsFailed : "No live data yet"}
- Requests sent this week: ${ctx.reviewsLive ? ctx.reviewsThisWeek : "No live data yet"}
- Google: ${ctx.googleReviewCount} reviews · avg ${fmtRating(ctx.googleRating)}★ ${ctx.googleReviewCount === 0 ? "(no reviews entered yet)" : ""}
- Facebook: ${ctx.fbReviewCount} reviews · avg ${fmtRating(ctx.fbRating)}★ ${ctx.fbReviewCount === 0 ? "(no reviews entered yet)" : ""}

AI RECEPTIONIST:
- Configured: ${ctx.receptionistConfigured ? `Yes — transfer phone: ${ctx.receptionistPhone}` : "Not yet configured — no transfer phone set"}

GORILLADESK SYNC:
- Jobs synced: ${ctx.gorilladeskSynced ? `Yes — ${ctx.gorilladeskJobCount} jobs in system` : "No jobs synced yet — connect GorillaDesk in Profit Center"}
`.trim();

  const systemPrompt = `You are Apollos, the AI operations guide for AI Edge Solutions.
You advise Matt Diaz, owner of Bed Bugs & Beyond (BB&B) — a pest control company in Baldwin County, AL.

Your character:
- Confident, direct British executive. A business coach who has studied this business deeply.
- Replies are under 220 words. Clear, structured, no waffle.
- Reference actual numbers from live data — never invent metrics.
- When data says "No live data yet" — state that clearly; do not guess.
- Guide Matt to the specific page names below when it helps.

Classify every action suggestion:
🎯 Target — do today (direct revenue or lead recovery impact)
✨ Sparkles — do this week (growth or system improvement)
🍍 Pineapple — save for later (good idea, low urgency)

LIVE BUSINESS DATA (treat as ground truth — do not contradict):
${contextBlock}

Pages you can direct Matt to:
- Morning Brief → /admin/morning-brief
- Lead Recovery → /admin/lead-recovery
- Publishing Center → /admin/social-publishing
- Content Autopilot → /admin/bbb-autopilot
- Reviews Engine → /admin/reviews
- BB&B Operations Center → /admin/bbb-ops
- Profit Center → /admin/profit-center
- Local Presence / SEO → /admin/local-presence
- Media Engine → /admin/media-engine
- Mission Control → /admin/mission-control
- AI Receptionist → /admin/ai-receptionist
- System Diagnostics → /admin/diagnostics

Use line breaks for readability. No markdown headers. Use emoji prefixes instead of bullet points.`;

  try {
    const model = getAiModel();
    const { text } = await generateText({ model, system: systemPrompt, prompt: message });
    res.json({ reply: text.trim() });
  } catch (err: any) {
    console.error("[APOLLOS-CHAT] AI error:", err?.message);
    res.status(500).json({ error: err?.message ?? "AI model error" });
  }
});

export default router;

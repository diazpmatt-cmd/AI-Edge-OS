import { Router } from "express";
import { getAuth } from "@clerk/express";
import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { db } from "@workspace/db";
import {
  socialPostsTable,
  socialConnectionsTable,
  reviewRequestsTable,
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
    postsPublished: 0, postsDraft: 0, postsPartial: 0, postsFailed: 0,
    lastPublishedAt: null as string | null,
    lastPublishedPlatforms: null as string | null,
    fbConnected: false, igConnected: false,
    gbpConnected: false, gbpHasLocation: false, gbpInCooldown: false,
    leadsTotal: 0, leadsNew: 0, leadsThisMonth: 0,
    reviewsSent: 0, reviewsFailed: 0, reviewsThisWeek: 0,
    callsTotal: 0, callsMissed: 0,
    callsLive: false, leadsLive: false, reviewsLive: false,
  };

  // ── Social posts ──
  try {
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
  } catch {}

  // ── Social connections ──
  try {
    const conns = await db.select().from(socialConnectionsTable)
      .where(eq(socialConnectionsTable.userId, userId));
    ctx.fbConnected = conns.some(c => c.provider === "facebook"  && !!c.accessToken);
    ctx.igConnected = conns.some(c => c.provider === "instagram" && !!c.accessToken);
    const gbp = conns.find(c => c.provider === "google_business");
    ctx.gbpConnected = !!(gbp?.accessToken);
    if (gbp?.metadata) {
      try {
        const meta = JSON.parse(gbp.metadata) as Record<string, unknown>;
        ctx.gbpHasLocation = !!(meta.locationName);
        const cooldown = meta.cooldownUntil as string | undefined;
        ctx.gbpInCooldown = !!(cooldown && new Date(cooldown) > new Date());
      } catch {}
    }
  } catch {}

  // ── Leads (last 30 days) ──
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const firstOfMonth  = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const allLeads = await db.select({
      status: leadsTable.status,
      createdAt: leadsTable.createdAt,
    }).from(leadsTable).where(gte(leadsTable.createdAt, thirtyDaysAgo));

    ctx.leadsTotal     = allLeads.length;
    ctx.leadsNew       = allLeads.filter(l => l.status === "new").length;
    ctx.leadsThisMonth = allLeads.filter(l => new Date(l.createdAt!) >= firstOfMonth).length;
    ctx.leadsLive      = true;
  } catch {}

  // ── Review requests (last 30 days) ──
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);
    const reviews = await db.select({
      status: reviewRequestsTable.status,
      sentAt: reviewRequestsTable.sentAt,
    }).from(reviewRequestsTable).where(gte(reviewRequestsTable.sentAt, thirtyDaysAgo));

    ctx.reviewsSent     = reviews.filter(r => r.status === "sent").length;
    ctx.reviewsFailed   = reviews.filter(r => r.status === "failed").length;
    ctx.reviewsThisWeek = reviews.filter(r => r.sentAt && new Date(r.sentAt) >= sevenDaysAgo).length;
    ctx.reviewsLive     = true;
  } catch {}

  // ── Calls (raw SQL — table created outside Drizzle schema) ──
  try {
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
  } catch {}

  // ── Format helpers ──
  const fmtPlatforms = (raw: string | null) => {
    if (!raw) return "unknown";
    try { return (JSON.parse(raw) as string[]).join(", "); } catch { return raw; }
  };
  const ld = (n: number, live: boolean) => live ? String(n) : "No live data yet";

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  const contextBlock = `
Today: ${today}
Client: Bed Bugs & Beyond (BB&B) — pest control, Baldwin County, AL. Owner: Matt Diaz.

PUBLISHING:
- Facebook connected: ${ctx.fbConnected ? "Yes" : "No"}
- Instagram connected: ${ctx.igConnected ? "Yes" : "No"}
- Google Business Profile connected: ${ctx.gbpConnected ? "Yes" : "No"}${ctx.gbpConnected && !ctx.gbpHasLocation ? " ⚠️ location cache missing — needs 'Refresh GBP Location' in System Diagnostics before first Google publish" : ""}${ctx.gbpInCooldown ? " (quota cooldown active — wait before retrying Google)" : ""}
- Posts published (all time): ${ctx.postsPublished}
- Posts draft/pending: ${ctx.postsDraft}
- Posts partially published (some platforms failed): ${ctx.postsPartial}
- Posts fully failed: ${ctx.postsFailed}
- Last published: ${ctx.lastPublishedAt ? `${new Date(ctx.lastPublishedAt).toLocaleDateString("en-US")} on ${fmtPlatforms(ctx.lastPublishedPlatforms)}` : "Never"}

LEADS & CALLS (last 30 days):
- Total leads captured: ${ld(ctx.leadsTotal, ctx.leadsLive)}
- Leads in 'new' status (need follow-up): ${ctx.leadsLive ? ctx.leadsNew : "No live data yet"}
- Leads this month: ${ld(ctx.leadsThisMonth, ctx.leadsLive)}
- Total calls: ${ld(ctx.callsTotal, ctx.callsLive)}
- Missed calls: ${ctx.callsLive ? ctx.callsMissed : "No live data yet"}

REVIEWS (last 30 days):
- Review requests sent via SMS: ${ld(ctx.reviewsSent, ctx.reviewsLive)}
- Review requests failed: ${ctx.reviewsLive ? ctx.reviewsFailed : "No live data yet"}
- Requests sent this week: ${ctx.reviewsLive ? ctx.reviewsThisWeek : "No live data yet"}
`.trim();

  const systemPrompt = `You are Apollos, the AI operations guide for AI Edge Solutions.
You advise Matt Diaz, owner of Bed Bugs & Beyond (BB&B) — a pest control company in Baldwin County, AL.

Your character:
- Confident, direct British executive. A business coach who has studied this business deeply.
- Replies are under 220 words. Clear, structured, no waffle.
- Reference actual numbers from live data — never invent metrics.
- When data says "No live data yet" — state that clearly; do not guess.
- Guide Matt to specific pages by name when it helps.

Classify every action suggestion with a prefix:
🎯 Target — do today (direct revenue or lead recovery impact)
✨ Sparkles — do this week (growth or system improvement)
🍍 Pineapple — save for later (good idea, not urgent)

LIVE BUSINESS DATA (do not contradict these):
${contextBlock}

Pages Matt can navigate to (use these names when directing him):
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

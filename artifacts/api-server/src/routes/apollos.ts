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

// ═══════════════════════════════════════════════════════════════════════════════
// Health score deduction helpers
// ═══════════════════════════════════════════════════════════════════════════════
interface Deduction {
  name: string;
  points: number;
  note: string;
  waitingOn?: string;
}

function buildHealthScore(deductions: Deduction[]) {
  const total = deductions.reduce((s, d) => s + d.points, 0);
  return Math.max(0, 100 - total);
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /apollos/chat
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/apollos/chat", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { message } = req.body as { message: string };
  if (!message?.trim()) { res.status(400).json({ error: "Message required" }); return; }

  // ── Context buckets ─────────────────────────────────────────────────────────
  const ctx = {
    // Connections
    fbConnected: false, igConnected: false, tikTokConnected: false,
    gbpConnected: false, gbpHasLocation: false,
    gbpInCooldown: false, gbpCooldownMinsLeft: 0,
    // Publishing
    postsPublished: 0, postsDraft: 0, postsPartial: 0, postsFailed: 0,
    lastPublishedAt: null as string | null, lastPublishedPlatforms: null as string | null,
    // Leads
    leadsTotal: 0, leadsNew: 0, leadsThisMonth: 0,
    // Calls
    callsTotal: 0, callsMissed: 0,
    // Reviews
    reviewsSent: 0, reviewsFailed: 0, reviewsThisWeek: 0,
    googleReviewCount: 0, googleRating: 0, fbReviewCount: 0, fbRating: 0,
    // AI Receptionist
    receptionistPhone: null as string | null, receptionistConfigured: false,
    // GorillaDesk
    gorilladeskJobCount: 0, gorilladeskCustomerCount: 0,
    // Content Autopilot
    autopilotEnabled: false, autopilotPaused: false,
    autopilotPlatforms: [] as string[], autopilotFrequency: "",
    autopilotLastGeneratedAt: null as string | null,
    daysSinceLastGenerated: null as number | null,
    // Local Presence
    localPresenceChannels: [] as { name: string; status: string; score: number; verification: string; action: string }[],
    // Revenue
    revenueTotal: 0, revenueJobsCount: 0,
  };

  const now = new Date();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);
  const firstOfMonth  = new Date(now.getFullYear(), now.getMonth(), 1);

  // ── Parallel DB fetches ─────────────────────────────────────────────────────
  await Promise.allSettled([

    // Social connections
    (async () => {
      const conns = await db.select().from(socialConnectionsTable)
        .where(eq(socialConnectionsTable.userId, userId));
      ctx.fbConnected     = conns.some(c => c.provider === "facebook"        && !!c.accessToken);
      ctx.igConnected     = conns.some(c => c.provider === "instagram"       && !!c.accessToken);
      ctx.tikTokConnected = conns.some(c => c.provider === "tiktok"          && !!c.accessToken);
      const gbp = conns.find(c  => c.provider === "google_business");
      ctx.gbpConnected    = !!(gbp?.accessToken);
      if (gbp?.metadata) {
        try {
          const meta = JSON.parse(gbp.metadata) as Record<string, unknown>;
          ctx.gbpHasLocation = !!(meta.locationName);
          const cu = meta.cooldownUntil as string | undefined;
          if (cu && new Date(cu) > now) {
            ctx.gbpInCooldown       = true;
            ctx.gbpCooldownMinsLeft = Math.ceil((new Date(cu).getTime() - now.getTime()) / 60000);
          }
        } catch {}
      }
    })(),

    // Social posts
    (async () => {
      const posts = await db.select({ status: socialPostsTable.status, platforms: socialPostsTable.platforms, publishedAt: socialPostsTable.publishedAt })
        .from(socialPostsTable).where(eq(socialPostsTable.userId, userId))
        .orderBy(desc(socialPostsTable.publishedAt)).limit(50);
      ctx.postsPublished = posts.filter(p => p.status === "published").length;
      ctx.postsDraft     = posts.filter(p => p.status === "draft").length;
      ctx.postsPartial   = posts.filter(p => p.status === "partial").length;
      ctx.postsFailed    = posts.filter(p => p.status === "failed").length;
      const lastPub = posts.find(p => p.status === "published");
      if (lastPub) {
        ctx.lastPublishedAt       = lastPub.publishedAt?.toISOString() ?? null;
        ctx.lastPublishedPlatforms = lastPub.platforms ?? null;
      }
    })(),

    // Leads
    (async () => {
      const leads = await db.select({ status: leadsTable.status, createdAt: leadsTable.createdAt })
        .from(leadsTable).where(gte(leadsTable.createdAt, thirtyDaysAgo));
      ctx.leadsTotal     = leads.length;
      ctx.leadsNew       = leads.filter(l => l.status === "new").length;
      ctx.leadsThisMonth = leads.filter(l => new Date(l.createdAt!) >= firstOfMonth).length;
    })(),

    // Review requests
    (async () => {
      const reviews = await db.select({ status: reviewRequestsTable.status, sentAt: reviewRequestsTable.sentAt })
        .from(reviewRequestsTable).where(gte(reviewRequestsTable.sentAt, thirtyDaysAgo));
      ctx.reviewsSent     = reviews.filter(r => r.status === "sent").length;
      ctx.reviewsFailed   = reviews.filter(r => r.status === "failed").length;
      ctx.reviewsThisWeek = reviews.filter(r => r.sentAt && new Date(r.sentAt) >= sevenDaysAgo).length;
    })(),

    // Review platform stats
    (async () => {
      const stats = await db.select().from(reviewPlatformStatsTable);
      const g = stats.find(s => s.platform === "google");
      const f = stats.find(s => s.platform === "facebook");
      ctx.googleReviewCount = g?.reviewCount ?? 0;
      ctx.googleRating      = typeof g?.averageRating === "string" ? parseFloat(g.averageRating) : (g?.averageRating ?? 0);
      ctx.fbReviewCount     = f?.reviewCount ?? 0;
      ctx.fbRating          = typeof f?.averageRating === "string" ? parseFloat(f.averageRating) : (f?.averageRating ?? 0);
    })(),

    // Calls
    (async () => {
      const r = await db.execute(sql`
        SELECT COUNT(*)::int                                    AS total,
               COUNT(*) FILTER (WHERE outcome = 'missed')::int AS missed
        FROM calls WHERE created_at > NOW() - INTERVAL '30 days'
      `);
      const row = r.rows?.[0] as { total?: number; missed?: number } | undefined;
      ctx.callsTotal  = row?.total  ?? 0;
      ctx.callsMissed = row?.missed ?? 0;
    })(),

    // AI Receptionist
    (async () => {
      const r = await db.execute(sql`SELECT transfer_phone FROM ai_receptionist_settings WHERE client_id = 'default' LIMIT 1`);
      const row = r.rows?.[0] as { transfer_phone?: string } | undefined;
      ctx.receptionistPhone      = row?.transfer_phone ?? null;
      ctx.receptionistConfigured = !!(row?.transfer_phone);
    })(),

    // GorillaDesk
    (async () => {
      const [jobs, customers] = await Promise.all([
        db.execute(sql`SELECT COUNT(*)::int AS total FROM gorilladesk_jobs`),
        db.execute(sql`SELECT COUNT(*)::int AS total FROM gorilladesk_customers`),
      ]);
      ctx.gorilladeskJobCount      = (jobs.rows?.[0] as { total?: number })?.total ?? 0;
      ctx.gorilladeskCustomerCount = (customers.rows?.[0] as { total?: number })?.total ?? 0;
    })(),

    // Content Autopilot
    (async () => {
      const r = await db.execute(sql`
        SELECT platforms, frequency, auto_generate_enabled, engine_paused, last_generated_at
        FROM auto_content_settings WHERE user_id = ${userId} LIMIT 1
      `);
      const row = r.rows?.[0] as {
        platforms?: string; frequency?: string;
        auto_generate_enabled?: boolean; engine_paused?: boolean;
        last_generated_at?: string;
      } | undefined;
      if (row) {
        ctx.autopilotEnabled   = !!(row.auto_generate_enabled);
        ctx.autopilotPaused    = !!(row.engine_paused);
        ctx.autopilotFrequency = row.frequency ?? "";
        ctx.autopilotLastGeneratedAt = row.last_generated_at ? new Date(row.last_generated_at).toISOString() : null;
        if (ctx.autopilotLastGeneratedAt) {
          ctx.daysSinceLastGenerated = Math.floor((now.getTime() - new Date(ctx.autopilotLastGeneratedAt).getTime()) / 86400000);
        }
        try { ctx.autopilotPlatforms = JSON.parse(row.platforms ?? "[]") as string[]; } catch {}
      }
    })(),

    // Local Presence channels
    (async () => {
      const r = await db.execute(sql`
        SELECT channel_name, status, score, verification_status, recommended_action
        FROM local_presence_channels ORDER BY score DESC
      `);
      ctx.localPresenceChannels = (r.rows ?? []).map(row => {
        const rw = row as { channel_name?: string; status?: string; score?: number; verification_status?: string; recommended_action?: string };
        return {
          name:         rw.channel_name         ?? "",
          status:       rw.status               ?? "",
          score:        rw.score                ?? 0,
          verification: rw.verification_status  ?? "",
          action:       rw.recommended_action   ?? "",
        };
      });
    })(),

    // Revenue attribution
    (async () => {
      const r = await db.execute(sql`
        SELECT COUNT(*)::int AS cnt, COALESCE(SUM(revenue), 0)::numeric AS total
        FROM revenue_attribution WHERE revenue IS NOT NULL AND revenue > 0
      `);
      const row = r.rows?.[0] as { cnt?: number; total?: string | number } | undefined;
      ctx.revenueJobsCount = row?.cnt ?? 0;
      ctx.revenueTotal     = parseFloat(String(row?.total ?? "0"));
    })(),
  ]);

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — Business Health Score
  // ═══════════════════════════════════════════════════════════════════════════
  const deductions: Deduction[] = [];

  const deduct = (name: string, points: number, note: string, waitingOn?: string) => {
    deductions.push({ name, points, note, ...(waitingOn ? { waitingOn } : {}) });
  };

  // Platform connections (high impact — direct revenue + reach)
  if (!ctx.gbpConnected) {
    deduct("Google Business Profile", 8, "Not connected — local search and GBP posting completely blocked.");
  } else if (!ctx.gbpHasLocation) {
    deduct("GBP Location Cache", 4, "Connected but location not cached. Run 'Refresh GBP Location' in System Diagnostics.");
  }
  if (ctx.gbpInCooldown) {
    deduct("GBP Quota Cooldown", 2, `Google hit the rate limit — ${ctx.gbpCooldownMinsLeft}m until retry is safe.`, "Google API quota");
  }
  if (!ctx.fbConnected) {
    deduct("Facebook", 5, "Not connected — no Facebook publishing, no ad audience sync.");
  }
  if (!ctx.igConnected) {
    deduct("Instagram", 5, "Not connected — Instagram reach and Reels publishing unavailable.");
  }
  if (!ctx.tikTokConnected) {
    deduct("TikTok", 3, "Not connected — TikTok Business registration still pending.", "TikTok Business");
  }

  // Operations
  if (!ctx.receptionistConfigured) {
    deduct("AI Receptionist", 5, "Transfer phone not set. Every missed call is a lost lead with no fallback.");
  }
  if (ctx.gorilladeskCustomerCount > 50 && ctx.gorilladeskJobCount === 0) {
    deduct("GorillaDesk Job Sync", 5, `${ctx.gorilladeskCustomerCount} customers synced but 0 jobs — revenue attribution and job history blind.`);
  }

  // Content consistency
  if (ctx.autopilotEnabled && ctx.autopilotPaused) {
    deduct("Content Autopilot", 3, "Engine is paused. Content is not auto-generating.");
  }
  const recentPosts = ctx.postsPublished; // we don't have a 7-day filter here, use daysSinceLastGenerated as proxy
  if (ctx.daysSinceLastGenerated !== null && ctx.daysSinceLastGenerated > 7) {
    deduct("Content Cadence", 5, `Autopilot last generated content ${ctx.daysSinceLastGenerated} days ago — momentum lost.`);
  } else if (ctx.postsPublished === 0) {
    deduct("Content Published", 5, "No posts ever published. Publishing Center connected but not used.");
  }

  // Review coverage
  const reviewCoverage = ctx.gorilladeskCustomerCount > 0
    ? ctx.reviewsSent / ctx.gorilladeskCustomerCount
    : null;
  if (reviewCoverage !== null && reviewCoverage < 0.1) {
    deduct("Review Coverage", 5, `Only ${Math.round(reviewCoverage * 100)}% of ${ctx.gorilladeskCustomerCount} customers have been asked for a review.`);
  } else if (ctx.reviewsSent === 0) {
    deduct("Review Coverage", 5, "No review requests sent yet. Reviews Engine is connected but unused.");
  }

  // Unaddressed leads
  if (ctx.leadsNew > 0) {
    const pts = Math.min(6, ctx.leadsNew * 2);
    deduct("New Leads", pts, `${ctx.leadsNew} lead${ctx.leadsNew > 1 ? "s" : ""} marked 'new' with no follow-up yet.`);
  }

  // Missed calls
  if (ctx.callsTotal > 0 && ctx.callsMissed / ctx.callsTotal > 0.3) {
    deduct("Missed Call Rate", 4, `${ctx.callsMissed} of ${ctx.callsTotal} calls (${Math.round(ctx.callsMissed / ctx.callsTotal * 100)}%) went unanswered in the last 30 days.`);
  }

  const healthScore = buildHealthScore(deductions);

  // ═══════════════════════════════════════════════════════════════════════════
  // Build context string
  // ═══════════════════════════════════════════════════════════════════════════
  const fmtPlatforms = (raw: string | null) => {
    if (!raw) return "unknown";
    try { return (JSON.parse(raw) as string[]).join(", "); } catch { return raw; }
  };
  const connected   = (v: boolean) => v ? "✅ Connected" : "❌ Not connected";
  const fmtRating   = (r: number)  => r > 0 ? `${r.toFixed(1)}★` : "no data";
  const today = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const healthBlock = `
BUSINESS HEALTH SCORE: ${healthScore}/100
${deductions.length === 0 ? "✅ All systems optimal." : deductions.map(d =>
  `  -${d.points}pts  ${d.name}: ${d.note}${d.waitingOn ? ` [Waiting on: ${d.waitingOn}]` : ""}`
).join("\n")}`.trim();

  const localPresenceBlock = ctx.localPresenceChannels.length === 0 ? "No data" :
    ctx.localPresenceChannels.map(ch => {
      const icon = ch.status === "connected" || ch.status === "verified_publishing" ? "✅"
        : ch.status === "setup_in_progress" ? "🟡"
        : "🔴";
      return `  ${icon} ${ch.name} (score: ${ch.score}/35, ${ch.verification}) → ${ch.action}`;
    }).join("\n");

  const contextBlock = `
Today: ${today}
Client: Bed Bugs & Beyond (BB&B) — pest control, Baldwin County, AL. Owner: Matt Diaz.

${healthBlock}

PLATFORM CONNECTIONS:
- Facebook: ${connected(ctx.fbConnected)}
- Instagram: ${connected(ctx.igConnected)}
- TikTok: ${connected(ctx.tikTokConnected)}${!ctx.tikTokConnected ? " — pending TikTok Business registration" : ""}
- Google Business Profile: ${connected(ctx.gbpConnected)}${ctx.gbpConnected && !ctx.gbpHasLocation ? " ⚠️ location cache missing" : ""}${ctx.gbpInCooldown ? ` ⛔ cooldown — ${ctx.gbpCooldownMinsLeft}m remaining` : ""}

PUBLISHING (all time):
- Published: ${ctx.postsPublished}, Draft: ${ctx.postsDraft}, Partial: ${ctx.postsPartial}, Failed: ${ctx.postsFailed}
- Last published: ${ctx.lastPublishedAt ? `${new Date(ctx.lastPublishedAt).toLocaleDateString("en-US")} on ${fmtPlatforms(ctx.lastPublishedPlatforms)}` : "Never"}

CONTENT AUTOPILOT:
- Status: ${ctx.autopilotEnabled ? (ctx.autopilotPaused ? "⏸ Paused" : "▶ Running") : "Not configured"}
- Platforms: ${ctx.autopilotPlatforms.join(", ") || "none"}
- Frequency: ${ctx.autopilotFrequency || "not set"}
- Last generated: ${ctx.autopilotLastGeneratedAt ? `${ctx.daysSinceLastGenerated} days ago (${new Date(ctx.autopilotLastGeneratedAt).toLocaleDateString("en-US")})` : "Never"}

LEADS & CALLS (last 30 days):
- Leads: ${ctx.leadsTotal} total, ${ctx.leadsNew} need follow-up, ${ctx.leadsThisMonth} this month
- Calls: ${ctx.callsTotal} total, ${ctx.callsMissed} missed

REVIEWS (last 30 days):
- Requests sent: ${ctx.reviewsSent}, Failed: ${ctx.reviewsFailed}, This week: ${ctx.reviewsThisWeek}
- Review coverage: ${reviewCoverage !== null ? `${Math.round(reviewCoverage * 100)}% of ${ctx.gorilladeskCustomerCount} customers asked` : "Cannot calculate (no customer count)"}
- Google: ${ctx.googleReviewCount} reviews, ${fmtRating(ctx.googleRating)}${ctx.googleReviewCount === 0 ? " (not entered yet)" : ""}
- Facebook: ${ctx.fbReviewCount} reviews, ${fmtRating(ctx.fbRating)}${ctx.fbReviewCount === 0 ? " (not entered yet)" : ""}

AI RECEPTIONIST:
- ${ctx.receptionistConfigured ? `✅ Configured — transfer: ${ctx.receptionistPhone}` : "❌ Not configured — no transfer phone set"}

GORILLADESK:
- Customers synced: ${ctx.gorilladeskCustomerCount}
- Jobs synced: ${ctx.gorilladeskJobCount}${ctx.gorilladeskJobCount === 0 && ctx.gorilladeskCustomerCount > 0 ? " ⚠️ zero jobs despite " + ctx.gorilladeskCustomerCount + " customers" : ""}

REVENUE ATTRIBUTION:
- Jobs with revenue matched: ${ctx.revenueJobsCount}
- Total attributed revenue: $${ctx.revenueTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${ctx.revenueTotal === 0 ? " (GorillaDesk job sync needed to populate)" : ""}

LOCAL PRESENCE (9 directories):
${localPresenceBlock}
`.trim();

  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTEM PROMPT — Phase 4 coach + Phase 5 platform self-knowledge
  // ═══════════════════════════════════════════════════════════════════════════
  const systemPrompt = `You are Apollos, AI Chief Operating Officer for AI Edge Solutions.
You serve Matt Diaz, owner of Bed Bugs & Beyond (BB&B) — pest control in Baldwin County, AL.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHARACTER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Confident British executive. Experienced business coach. Direct, structured, no waffle.
Replies under 220 words. Reference actual live numbers — never invent metrics.
When data says zero or unavailable: state it honestly. Never fabricate.
Use line breaks for readability. No markdown headers. Emoji prefixes over bullet points.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RECOMMENDATION FORMAT (Phase 3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Classify every action with:
🎯 TARGET — do today (direct revenue or lead recovery impact)
✨ SPARKLES — do this week (growth or system improvement)
🍍 PINEAPPLE — save for later (good idea, low urgency)

Every recommendation must include:
→ Priority: 🎯 / ✨ / 🍍
→ Impact: High / Medium / Low
→ Est. time: (5 min / 15 min / 30 min / 1 hour)
→ Status: Ready / Blocked: [reason] / Waiting on: [third party]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COACH MODE (Phase 4) — answer naturally
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"What should I do next?" → Give top 3 ranked recommendations using live health deductions. Highest-impact items first. Include time estimate.

"How are we doing?" → Report the Business Health score. Name the top 3 deductions and what fixing each one would unlock. End with one positive observation.

"What can I improve?" → List each health deduction as an opportunity. Group by: Quick Wins (≤5 min), This Week, Waiting on Third Parties.

"I only have 30 minutes." → Filter to actions estimated ≤30 min. Prioritise lead recovery and review requests. Skip anything blocked or waiting.

"What is still disconnected?" → List each platform not connected. For each: what it unlocks, estimated time to connect, any dependency.

"What's waiting on third parties?" → TikTok Business approval (pending registration), Apple Business Connect (pending verification), Google API quota cooldown (give exact minutes), any pending local presence verifications.

"Teach me AI Edge." → Explain the platform: what it does for BB&B, the core modules, and what "fully operational" looks like. Keep it conversational, not a product pitch.

"Why isn't my score 100%?" → List every deduction from the health score, points lost, and the specific action to recover each one.

"What does [page] do?" → Use your platform knowledge below to explain it directly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PLATFORM SELF-KNOWLEDGE (Phase 5)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Morning Brief (/admin/morning-brief)
Overnight AI summary. Matt opens it to see: new leads, missed calls, review requests sent, content queued, and the top 3 priority actions. Use this every morning before anything else.

Mission Control (/admin/mission-control)
Real-time operations view. Live call activity, lead velocity, content performance, and system health in one screen. Use when you want a snapshot of everything happening right now.

Publishing Center (/admin/social-publishing)
Manual content scheduling and distribution. Posts to Facebook, Instagram, TikTok, and GBP. Shows what's published, queued, or failed. Use when you want to post manually or review content status.

Content Autopilot (/admin/bbb-autopilot)
AI-powered automatic content engine. Generates posts based on BB&B's service areas, tone, and topics. Can auto-approve or hold for review. Last generated content ${ctx.daysSinceLastGenerated !== null ? `${ctx.daysSinceLastGenerated} days ago` : "never"}.

Reviews Engine (/admin/reviews)
Sends SMS review requests to GorillaDesk customers. Tracks Google and Facebook ratings. Currently ${ctx.reviewsSent} requests sent in 30 days, covering ${reviewCoverage !== null ? Math.round(reviewCoverage * 100) + "%" : "unknown %"} of the customer base.

Profit Center (/admin/profit-center)
Revenue attribution and ROI. Matches leads to GorillaDesk jobs to show which marketing channels generate real money. Currently ${ctx.revenueJobsCount} jobs matched. Needs GorillaDesk job sync to fully populate.

Customer Timeline (/admin/customer-journey)
Full chronological view of every customer touchpoint — calls, leads, review requests, and revenue events. Use to understand a specific customer's journey from first contact to payment.

BB&B Operations Center (/admin/bbb-ops)
BB&B-specific command centre. GorillaDesk scheduling, customer records, and service history. Central hub for day-to-day pest control operations.

Lead Recovery (/admin/lead-recovery)
Captures and follows up missed leads. Shows leads by status (new / contacted / won / lost). Currently ${ctx.leadsNew} leads need follow-up. Sends AI-generated text-back messages.

AI Receptionist (/admin/ai-receptionist)
Emma — 24/7 virtual receptionist. Handles missed calls with immediate text-back, qualifies leads, and routes to Matt. ${ctx.receptionistConfigured ? `Transfer phone set to ${ctx.receptionistPhone}.` : "Not yet configured — transfer phone needed."}

Local Presence (/admin/local-presence)
Tracks BB&B visibility across 9 directories: Google Business, Bing Places, Yelp, Nextdoor, Angi, Thumbtack, Waze, Apple Business, and Facebook. Shows verification status and the next action for each.

Media Engine (/admin/media-engine)
AI content creation: social posts, ad copy, before/after photo captions, and video scripts. Feed this weekly with new job photos.

System Diagnostics (/admin/diagnostics)
Platform health check. Connection status, GBP cache, API cooldown timers, integration health. Go here when something isn't working.

Connections (/admin/connections or within each page)
OAuth management for Facebook, Instagram, TikTok, and GBP. Where you link and refresh social accounts.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIVE BUSINESS DATA (ground truth — do not contradict or invent values)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${contextBlock}`;

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

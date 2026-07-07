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
  // Prefer Replit-managed integration (no billing quota); fall back to direct key
  const replitBase = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const replitKey  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const directKey  = process.env.OPENAI_API_KEY;
  const baseURL = replitBase ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const key = replitKey ?? directKey;

  // ── DIAGNOSTIC LOG (temporary) ───────────────────────────────────────────
  const baseSource = replitBase
    ? "AI_INTEGRATIONS_OPENAI_BASE_URL"
    : process.env.OPENAI_BASE_URL
      ? "OPENAI_BASE_URL"
      : "hardcoded:api.openai.com/v1";
  const keySource = replitKey ? "AI_INTEGRATIONS_OPENAI_API_KEY" : directKey ? "OPENAI_API_KEY" : "NONE";
  console.log(
    "[APOLLOS-DIAG] getAiModel — baseSource:", baseSource,
    "| baseURL:", baseURL,
    "| keySource:", keySource,
    "| model:", process.env.OPENAI_MODEL ?? "gpt-4o-mini (default)",
  );
  // ── END DIAGNOSTIC LOG ───────────────────────────────────────────────────

  if (!key) throw new Error("No OpenAI API key configured. Add OPENAI_API_KEY to Secrets.");
  const gw = createOpenAICompatible({
    name: "openai",
    baseURL,
    headers: { Authorization: `Bearer ${key}` },
  });
  return gw(process.env.OPENAI_MODEL ?? "gpt-4o-mini");
}

// ── Quota / billing error detection ─────────────────────────────────────────
function isQuotaError(err: any): boolean {
  const msg  = (err?.message ?? "").toLowerCase();
  const code = err?.error?.code ?? err?.code ?? "";
  const status = err?.status ?? err?.statusCode ?? 0;
  return (
    code === "insufficient_quota" ||
    msg.includes("insufficient_quota") ||
    msg.includes("exceeded your current quota") ||
    msg.includes("quota exceeded") ||
    msg.includes("you exceeded") ||
    msg.includes("billing") ||
    (status === 429 && (msg.includes("quota") || msg.includes("exceeded")))
  );
}

function isMissingKeyError(err: any): boolean {
  const msg = (err?.message ?? "").toLowerCase();
  return msg.includes("openai_api_key is not set") || msg.includes("api key") || msg.includes("invalid_api_key");
}

// ── Fallback brief built from live data (no OpenAI call) ────────────────────
function buildFallbackBrief(snap: {
  callsTotal: number; callsMissed: number;
  leadsTotal: number; leadsNew: number;
  postsPublished: number; postsDraft: number; postsFailed: number;
  reviewsThisWeek: number; reviewsSent: number;
  fbConnected: boolean; igConnected: boolean; gbpConnected: boolean;
  autopilotEnabled: boolean; autopilotPaused: boolean;
  gorilladeskCustomerCount: number;
}): string {
  const conn: string[] = [];
  if (snap.fbConnected) conn.push("Facebook ✅");
  if (snap.igConnected) conn.push("Instagram ✅");
  if (snap.gbpConnected) conn.push("Google Business ✅");
  if (!snap.fbConnected) conn.push("Facebook ❌");
  if (!snap.igConnected) conn.push("Instagram ❌");
  if (!snap.gbpConnected) conn.push("Google Business ❌");

  const autopilot = snap.autopilotEnabled
    ? (snap.autopilotPaused ? "Enabled — currently paused" : "Running ✅")
    : "Off";

  return `Apollos is temporarily unavailable because the AI API quota is exhausted.

Here is your live BB&B snapshot as of right now:

📞 Calls (30 days): ${snap.callsTotal} total · ${snap.callsMissed} missed
👥 Leads: ${snap.leadsTotal} total · ${snap.leadsNew} need follow-up
📣 Content: ${snap.postsPublished} published · ${snap.postsDraft} drafts queued${snap.postsFailed > 0 ? ` · ${snap.postsFailed} failed` : ""}
⭐ Reviews: ${snap.reviewsThisWeek} sent this week (${snap.reviewsSent} total)
🏢 Customers: ${snap.gorilladeskCustomerCount > 0 ? `${snap.gorilladeskCustomerCount} in GorillaDesk` : "GorillaDesk not connected"}
🔗 Connections: ${conn.join(" · ")}
⚙️ Content Autopilot: ${autopilot}

To restore AI responses, add credits at:
👉 platform.openai.com → Settings → Billing → Add to credit balance

Your live data above is accurate. All dashboard features remain fully functional.`;
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
// Weather intelligence — free wttr.in API, no key required
// ═══════════════════════════════════════════════════════════════════════════════
interface WeatherData {
  tempF: number;
  feelsLikeF: number;
  maxTempF: number;
  minTempF: number;
  description: string;
  humidity: number;
  windMph: number;
  chanceOfRain: number;
  chanceOfThunder: number;
}

async function fetchWeather(): Promise<WeatherData | null> {
  try {
    const resp = await fetch("https://wttr.in/Foley+AL?format=j1", {
      signal: AbortSignal.timeout(4500),
      headers: { "User-Agent": "BBB-Apollos/1.0" },
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    const cur = data?.current_condition?.[0];
    const day = data?.weather?.[0];
    if (!cur || !day) return null;
    const hourly: any[] = day.hourly ?? [];
    const maxRain     = hourly.reduce((m: number, h: any) => Math.max(m, Number(h.chanceofrain     ?? 0)), 0);
    const maxThunder  = hourly.reduce((m: number, h: any) => Math.max(m, Number(h.chanceofthunder  ?? 0)), 0);
    return {
      tempF:         Number(cur.temp_F       ?? 0),
      feelsLikeF:    Number(cur.FeelsLikeF   ?? cur.temp_F ?? 0),
      maxTempF:      Number(day.maxtempF     ?? 0),
      minTempF:      Number(day.mintempF     ?? 0),
      description:   cur.weatherDesc?.[0]?.value ?? "Unknown",
      humidity:      Number(cur.humidity     ?? 0),
      windMph:       Number(cur.windspeedMiles ?? 0),
      chanceOfRain:  maxRain,
      chanceOfThunder: maxThunder,
    };
  } catch {
    return null;
  }
}

function interpretWeather(w: WeatherData): string {
  const lines: string[] = [];
  lines.push(`${w.description}, ${w.tempF}°F (feels ${w.feelsLikeF}°F) | H: ${w.maxTempF}°F  L: ${w.minTempF}°F`);
  lines.push(`Wind: ${w.windMph}mph | Humidity: ${w.humidity}% | Rain chance: ${w.chanceOfRain}%${w.chanceOfThunder > 20 ? ` | ⚡ Thunder: ${w.chanceOfThunder}%` : ""}`);
  lines.push("Operational impact:");
  lines.push("  🟢 Bed Bug Treatments — interior, weather-independent");
  lines.push("  🟢 Indoor Pest Control — interior, weather-independent");
  if (w.chanceOfRain >= 50) {
    lines.push("  🔴 Exterior Treatments — high rain chance, product will wash out");
  } else if (w.chanceOfRain >= 25) {
    lines.push("  🟡 Exterior Treatments — rain risk, schedule earlier in day");
  } else {
    lines.push("  🟢 Exterior Treatments — good conditions");
  }
  if (w.windMph >= 15 || w.chanceOfRain >= 50) {
    lines.push("  🔴 Mosquito/Fogging — wind or rain makes treatment ineffective, reschedule");
  } else if (w.windMph >= 10 || w.chanceOfRain >= 25) {
    lines.push("  🟡 Mosquito/Fogging — marginal conditions, complete early in day");
  } else {
    lines.push("  🟢 Mosquito/Fogging — good conditions");
  }
  if (w.chanceOfRain >= 60) lines.push("⚠️ ADVISORY: High rain — move outdoor treatments earlier or reschedule.");
  if (w.windMph >= 15)      lines.push("⚠️ ADVISORY: Wind >15mph — suspend fogging until conditions improve.");
  if (w.chanceOfThunder >= 30) lines.push("⚠️ ADVISORY: Thunderstorm risk — prioritise inspections and indoor work today.");
  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// Intent router — lightweight keyword detection
// ═══════════════════════════════════════════════════════════════════════════════
type Intent =
  | "auto_brief"
  | "greeting"
  | "target_single"
  | "idea"
  | "pineapple_cmd"
  | "done_advance"
  | "next_task"
  | "stuck"
  | "revenue_only"
  | "marketing_only"
  | "calls_only"
  | "leads_only"
  | "diagnose"
  | "launch_checklist"
  | "coo_mode"
  | "next_action"
  | "publishing_status"
  | "reviews_status"
  | "leads_calls_status"
  | "integrations_status"
  | "platform_teacher"
  | "business_health"
  | "end_of_day"
  | "general";

function detectIntent(msg: string): Intent {
  if (msg === "__auto_brief__") return "auto_brief";
  const m = msg.toLowerCase();
  // ── Emoji / single-word command shortcuts (checked first — highest specificity) ──
  const t = m.trim();
  if (/^🎯[\s!.]*$|^target[\s!.]*$/.test(t))                          return "target_single";
  if (/^✨[\s!.]*$|^sparkles?[\s!.]*$/.test(t))                       return "idea";
  if (/^🍍[\s!.]*$|^pineapple[\s!.]*$/.test(t))                       return "pineapple_cmd";
  if (/^✅[\s!.]*$|^done[\s!.]*$|^finished?[\s!.]*$|^completed?[\s!.]*$/.test(t)) return "done_advance";
  if (/^➡[\s!.]*$|^next[\s!.]*$/.test(t))                             return "next_task";
  if (/^🚧[\s!.]*$|^stuck[\s!.]*$|^blocked[\s!.]*$/.test(t))         return "stuck";
  if (/^📊[\s!.]*$|^status[\s!.]*$/.test(t))                          return "business_health";
  if (/^💰[\s!.]*$|^revenue[\s!.]*$/.test(t))                         return "revenue_only";
  if (/^📣[\s!.]*$|^marketing[\s!.]*$/.test(t))                       return "marketing_only";
  if (/^☎[\s!.]*$|^calls?[\s!.]*$/.test(t))                          return "calls_only";
  if (/^👥[\s!.]*$|^leads?[\s!.]*$/.test(t))                          return "leads_only";
  if (/^🛠[\s!.]*$|^diagnos\w*[\s!.]*$/.test(t))                      return "diagnose";
  if (/^🚀[\s!.]*$|^launch(?:\s+checklist)?[\s!.]*$/.test(t))        return "launch_checklist";
  if (/^💼[\s!.]*$|^coo(?:\s+mode)?[\s!.]*$/.test(t))                return "coo_mode";
  // next_action
  if (/what should i (do|focus|prioriti[sz]e)|only have \d+ min|what('s| is) my priority|what('s| is) (first|next)|where (should i |do i )?start/.test(m)) return "next_action";
  // publishing
  if (/did (the |any )?post|what (published|went out|posted)|did (anything|it) fail|post(s| go| went) out|publish(ing|ed)|content (fail|go out|went out)|fail.*post|post.*fail/.test(m)) return "publishing_status";
  // reviews
  if (/review request|review text|how are.*review|review.*go out|who need.*review|review.*status|send.*review|did.*review/.test(m)) return "reviews_status";
  // leads + calls
  if (/missed call|any (lead|call)|who.*call back|lead.*status|new lead|follow.{0,5}up|call back|who called/.test(m)) return "leads_calls_status";
  // integrations
  if (/what('s| is) (dis)?connected|what('s| is) waiting|is google (working|connected)|tiktok|apple business|facebook.*connect|instagram.*connect|integration|what about.*connect/.test(m)) return "integrations_status";
  // platform teacher
  if (/teach me|what does .* do|how does .* work|explain (the |my )?(platform|system|page|tool|engine|center)|what is (mission|profit|morning|media|review|publishing|customer|lead|receptionist|local|connection|diagnostic)|where should i start/.test(m)) return "platform_teacher";
  // business health
  if (/how are we doing|why (isn'?t?|aren'?t?) (my |our |the )?score|business health|health score|how (do we|can we) improve|overall (status|performance)|are we on track/.test(m)) return "business_health";
  // end of day
  if (/end.{0,5}of.{0,5}day|end.{0,5}day|eod recap|day recap|today'?s? recap|wrap.{0,5}up|daily summary/.test(m)) return "end_of_day";
  // greeting — natural hellos, time-of-day greetings, casual openers
  if (/^(hi|hello|hey)([\s,!.]*apollos)?[\s!.?]*$|^good (morning|afternoon|evening)[\s,!.]*$|^(morning|afternoon|evening)[\s,!.]*$|^what'?s up\??[\s!.]*$|^ready to work\??[\s!.]*$/.test(m.trim())) return "greeting";
  return "general";
}

interface IntentCtxSnapshot {
  healthScore: number;
  deductions: Deduction[];
  postsPublished: number; postsDraft: number; postsPartial: number; postsFailed: number;
  lastPublishedAt: string | null; lastPublishedPlatforms: string | null;
  reviewsSent: number; reviewsFailed: number; reviewsThisWeek: number;
  googleReviewCount: number; googleRating: number;
  fbReviewCount: number; fbRating: number;
  reviewCoverage: number | null; gorilladeskCustomerCount: number;
  leadsTotal: number; leadsNew: number; callsTotal: number; callsMissed: number;
  fbConnected: boolean; igConnected: boolean; tikTokConnected: boolean;
  gbpConnected: boolean; gbpHasLocation: boolean;
  gbpInCooldown: boolean; gbpCooldownMinsLeft: number;
  receptionistConfigured: boolean;
  gorilladeskJobCount: number;
  autopilotEnabled: boolean; autopilotPaused: boolean;
  daysSinceLastGenerated: number | null;
  localPresenceChannels: { name: string; status: string; score: number; verification: string; action: string }[];
}

function buildIntentDirective(intent: Intent, snap: IntentCtxSnapshot): string {
  const fmtPlatforms = (raw: string | null) => {
    if (!raw) return "unknown";
    try { return (JSON.parse(raw) as string[]).join(", "); } catch { return raw ?? "unknown"; }
  };

  switch (intent) {
    case "greeting": {
      const h = new Date().getHours();
      // 5am–11:59am → morning brief
      if (h >= 5 && h < 12) {
        const topDeductions = snap.deductions.slice(0, 3)
          .map(d => `  -${d.points}pts ${d.name}: ${d.note}${d.waitingOn ? ` [Waiting: ${d.waitingOn}]` : ""}`)
          .join("\n") || "  None — all systems optimal.";
        return `DETECTED INTENT: greeting → morning brief
FOCUS: Matt said good morning (or a natural hello during morning hours). Respond warmly and naturally — do NOT robotically say "Good morning, Matt." Make it feel like a real COO checking in. Then transition directly into the Morning Brief using ONLY live data below.

Structure:
1. One natural sentence acknowledging the time / start of day (vary — e.g. "Morning — let's see where things stand." or "Right on time. Here's your day.")
2. BUSINESS HEALTH: ${snap.healthScore}/100
${topDeductions}
3. 🌤 WEATHER: Use the WEATHER section of LIVE BUSINESS DATA. State conditions in one line. If rain ≥50% or wind ≥15mph, flag the operational impact on outdoor jobs. If weather affects operations, make it today's 🎯 Target advisory.
4. ✅ Top win or positive data point (from live data — posts, leads, calls)
5. ⚠️ Single most urgent action today (from health deductions or live data)
6. One sentence hand-off ("Ask me anything or say 'what should I do first' for your top 3 priorities.")

Keep it under 220 words. Conversational, not corporate. Never say "Certainly!" or "Absolutely!".`;
      }
      // 5pm–4:59am → end of day recap
      if (h >= 17 || h < 5) {
        return `DETECTED INTENT: greeting → end of day
FOCUS: Matt said hello during evening hours. Respond naturally and transition into the End-of-Day Recap. One sentence acknowledgement (e.g. "Wrapping up? Here's how today went."), then:
1. Today's Wins — what published, leads gained, calls handled (live data only)
2. Missed Opportunities — unaddressed leads, missed calls, failed posts
3. Tomorrow's #1 Priority — single most impactful action
If data shows zero activity, state that honestly. Under 200 words.`;
      }
      // 12pm–4:59pm → afternoon operational summary
      return `DETECTED INTENT: greeting → afternoon check-in
FOCUS: Matt said hello during afternoon hours. Respond naturally (e.g. "Afternoon. Here's where things stand mid-day.") then give a concise operational pulse:
1. What's active right now (posts published, leads in queue, calls handled)
2. One thing that needs attention before end of day (from health deductions or live data)
3. One sentence close ("Say 'what should I do next' for a prioritised list.")
Under 150 words. Conversational, direct.`;
    }

    case "next_action":
      return `DETECTED INTENT: next_action
FOCUS: The user wants their top prioritised actions right now. List exactly 3, each with 🎯/✨/🍍, Impact (High/Medium/Low), Est. time, and Status (Ready / Blocked / Waiting on). Derive from the health deductions and live data below. Most urgent first.`;

    case "publishing_status":
      return `DETECTED INTENT: publishing_status
FOCUS: Report exactly what happened with publishing. Use the numbers below:
- Published: ${snap.postsPublished}, Draft: ${snap.postsDraft}, Partial (some platforms failed): ${snap.postsPartial}, Failed: ${snap.postsFailed}
- Last published: ${snap.lastPublishedAt ? `${new Date(snap.lastPublishedAt).toLocaleDateString("en-US")} on ${fmtPlatforms(snap.lastPublishedPlatforms)}` : "Never"}
${snap.gbpInCooldown ? `- GBP in cooldown: ${snap.gbpCooldownMinsLeft}m remaining before retry.` : ""}
Do not pad with unrelated topics. If something failed, say so directly. Direct Matt to Publishing Center (/admin/social-publishing) or System Diagnostics (/admin/diagnostics) where relevant.`;

    case "reviews_status":
      return `DETECTED INTENT: reviews_status
FOCUS: Report review request activity and reputation status using live data:
- Requests sent (30 days): ${snap.reviewsSent}, Failed: ${snap.reviewsFailed}, This week: ${snap.reviewsThisWeek}
- Review coverage: ${snap.reviewCoverage !== null ? `${Math.round(snap.reviewCoverage * 100)}% of ${snap.gorilladeskCustomerCount} customers` : "Cannot calculate"}
- Google: ${snap.googleReviewCount} reviews, ${snap.googleRating > 0 ? `${snap.googleRating.toFixed(1)}★` : "no rating data yet"}
- Facebook: ${snap.fbReviewCount} reviews, ${snap.fbRating > 0 ? `${snap.fbRating.toFixed(1)}★` : "no rating data yet"}
Recommend next action with 🎯/✨/🍍. Direct to Reviews Engine (/admin/reviews) where relevant.`;

    case "leads_calls_status":
      return `DETECTED INTENT: leads_calls_status
FOCUS: Report lead and call data only. Use these exact numbers:
- Leads (30 days): ${snap.leadsTotal} total, ${snap.leadsNew} unaddressed (status = new)
- Calls (30 days): ${snap.callsTotal} total, ${snap.callsMissed} missed
${snap.callsMissed > 0 ? `- ${snap.callsMissed} missed call${snap.callsMissed > 1 ? "s" : ""} — each is a potential lost job.` : ""}
${snap.leadsNew > 0 ? `- ${snap.leadsNew} lead${snap.leadsNew > 1 ? "s" : ""} with no follow-up yet.` : ""}
Be direct about urgency. Direct to Lead Recovery (/admin/lead-recovery) or AI Receptionist (/admin/ai-receptionist).`;

    case "integrations_status":
      return `DETECTED INTENT: integrations_status
FOCUS: Give a clear platform connection status report. Use only these facts:
- Facebook: ${snap.fbConnected ? "✅ Connected" : "❌ Not connected"}
- Instagram: ${snap.igConnected ? "✅ Connected" : "❌ Not connected"}
- TikTok: ${snap.tikTokConnected ? "✅ Connected" : "❌ Not connected — pending TikTok Business registration"}
- Google Business Profile: ${snap.gbpConnected ? "✅ Connected" : "❌ Not connected"}${snap.gbpConnected && !snap.gbpHasLocation ? " (location not cached — run Refresh in Diagnostics)" : ""}${snap.gbpInCooldown ? ` (cooldown: ${snap.gbpCooldownMinsLeft}m remaining)` : ""}
- AI Receptionist: ${snap.receptionistConfigured ? "✅ Configured" : "❌ Transfer phone not set"}
- GorillaDesk jobs: ${snap.gorilladeskJobCount === 0 ? `❌ 0 jobs synced (${snap.gorilladeskCustomerCount} customers exist)` : `✅ ${snap.gorilladeskJobCount} jobs synced`}
Local presence channels:
${snap.localPresenceChannels.map(ch => {
  const icon = ch.status === "connected" || ch.status === "verified_publishing" ? "✅" : ch.status === "setup_in_progress" ? "🟡" : "🔴";
  return `  ${icon} ${ch.name}: ${ch.status}`;
}).join("\n")}
Group your response: Connected, Pending (third party), Action needed. For each disconnected item state what reconnecting unlocks.`;

    case "platform_teacher":
      return `DETECTED INTENT: platform_teacher
FOCUS: Answer the platform knowledge question simply and conversationally. Use the platform documentation below. Do not list every page — answer only what was asked. If "where should I start?" or "teach me", give a 3-step onboarding path for BB&B.`;

    case "business_health":
      return `DETECTED INTENT: business_health
FOCUS: Give the Business Health score and explain every deduction using live data. Score: ${snap.healthScore}/100.
Deductions:
${snap.deductions.length === 0 ? "  None — all systems optimal." : snap.deductions.map(d => `  -${d.points}pts ${d.name}: ${d.note}${d.waitingOn ? ` [Waiting: ${d.waitingOn}]` : ""}`).join("\n")}
Group by: Quick Wins (can fix today), This Week, Waiting on Third Parties. End with one positive.`;

    case "end_of_day":
      return `DETECTED INTENT: end_of_day
FOCUS: Summarise the day for BB&B using only live data. Cover:
1. Today's Wins — what published, leads gained, calls handled
2. Missed Opportunities — unaddressed leads, missed calls, failed posts
3. Revenue Notes — any revenue data available
4. Tomorrow's #1 Priority — single most impactful action
If data shows zero or "no live data", state that honestly.`;

    case "auto_brief": {
      const greetHour = new Date().getHours();
      const greeting = greetHour < 12 ? "Good morning" : greetHour < 17 ? "Good afternoon" : "Good evening";
      const topDeductions = snap.deductions.slice(0, 3)
        .map(d => `  -${d.points}pts ${d.name}: ${d.note}${d.waitingOn ? ` [Waiting: ${d.waitingOn}]` : ""}`)
        .join("\n") || "  None — all systems optimal.";
      const waitingOn = snap.deductions.filter(d => d.waitingOn)
        .map(d => `  ⏳ ${d.name} — waiting on ${d.waitingOn}`)
        .join("\n") || "  None currently.";
      return `DETECTED INTENT: auto_brief
FOCUS: Generate the proactive Operational Brief. Use ONLY live data below. Never fabricate.
Use this EXACT structure (replace bracketed placeholders with real data):

${greeting}, Matt.

BUSINESS HEALTH: ${snap.healthScore}/100
${topDeductions}

🌤 WEATHER (Foley, AL)
[Use the WEATHER section of LIVE BUSINESS DATA. One line: conditions + temp. Then one line: operational impact — if rain ≥50% or wind ≥15mph, flag which outdoor treatments are affected and recommend scheduling earlier. If perfect conditions, say so. If no weather data, omit this section.]

✅ TOP SUCCESS TODAY
[Identify the single strongest positive data point from live data — e.g. posts published, leads captured, reviews sent. If nothing, say "No activity recorded yet."]

⚠️ TOP CONCERN
[Identify the single most urgent problem from the health deductions. Be specific — use the actual number or status.]

🎯 TARGET TODAY
[Highest-impact action Matt can do right now. Include: Impact: High | Est. time | Status: Ready or Blocked]
→ Open [Exact Page Name]

✨ SPARKLE THIS WEEK
[Medium-priority improvement. Include: Impact: Medium | Est. time]
→ Open [Exact Page Name]

🍍 PINEAPPLE
[Low-urgency or third-party-blocked item.]
→ [Waiting on: third party name, if applicable]

⏳ WAITING ON THIRD PARTIES
${waitingOn}

📤 PUBLISHING
[Summarise: X published, last on [date] via [platforms]. Note any failures or cooldowns.]

🔥 LEADS & CALLS
[Summarise: X leads (Y unaddressed), X calls (Z missed). Flag urgency if missed calls are high.]

⭐ REVIEWS
[Summarise: X requests sent, coverage %, Google/Facebook rating if available.]

Keep total response under 350 words. Every section must reference a real number from live data or say "No live data yet."`;
    }

    case "target_single":
      return `DETECTED INTENT: target_single
FOCUS: Matt wants his single highest-priority action right now. Return EXACTLY ONE task.
Format:
🎯 TARGET: [action name]
What: [one sentence — what to do]
Why now: [why this is #1 — cite live data]
Impact: High | Est. time: [X min] | Status: Ready / Blocked: [reason if blocked]
→ Open [Exact Page Name] (/path)

Do not list secondary tasks. One target only. Under 80 words.`;

    case "idea":
      return `DETECTED INTENT: idea
FOCUS: Matt sent ✨ — he has a great idea he wants acknowledged. Respond:
1. Brief enthusiastic acknowledgement (e.g. "Noted — solid thinking.")
2. Confirm it's tracked: "I'll add that as a Sparkle for this week."
3. Redirect cleanly: "For now, today's 🎯 Target is [derive from top health deduction or live data]."
Under 60 words. Light tone.`;

    case "pineapple_cmd":
      return `DETECTED INTENT: pineapple_cmd
FOCUS: Matt sent 🍍 — we got distracted. Redirect politely:
1. Acknowledge: "Noted — pineapple."
2. Redirect: "Back to today's Target."
3. State today's 🎯 Target (from top health deduction).
Under 50 words. Casual, not corporate.`;

    case "done_advance":
      return `DETECTED INTENT: done_advance
FOCUS: Matt completed a task. Acknowledge briefly, then surface the NEXT target.
1. One-line acknowledgement (vary: "Good — ticked off." / "Nice work." / "One down.")
2. Next 🎯 TARGET — second-highest priority from health deductions / live data. Same format as target_single.
Under 80 words total.`;

    case "next_task":
      return `DETECTED INTENT: next_task
FOCUS: Matt wants the next priority — give the second-highest action from health deductions and live data. Do not repeat what was already shown if context reveals it. Same format as target_single. Under 80 words.`;

    case "stuck":
      return `DETECTED INTENT: stuck
FOCUS: Matt is stuck or blocked. Diagnose and respond with:
1. What's blocking (specific — name the deduction, connection status, or third party)
2. Who controls the blocker (Matt / TikTok / Google / etc.)
3. Best workaround right now
4. What to work on instead while waiting
Direct. No padding. Under 120 words.`;

    case "revenue_only":
      return `DETECTED INTENT: revenue_only
FOCUS: Revenue summary only. Use REVENUE ATTRIBUTION and LEADS & CALLS from LIVE BUSINESS DATA:
- Total attributed revenue and jobs matched
- Unaddressed leads: ${snap.leadsNew} (each = unbooked job)
- Missed calls (30 days): ${snap.callsMissed} (each = potential lost job)
One action recommendation to increase captured revenue. If GorillaDesk jobs = 0, explain what's needed. Under 100 words.`;

    case "marketing_only":
      return `DETECTED INTENT: marketing_only
FOCUS: Marketing/publishing summary only.
- Published: ${snap.postsPublished} | Draft: ${snap.postsDraft} | Failed: ${snap.postsFailed}
- Last published: ${snap.lastPublishedAt ? new Date(snap.lastPublishedAt).toLocaleDateString("en-US") : "Never"}
- Active channels: ${[snap.fbConnected && "Facebook", snap.igConnected && "Instagram", snap.tikTokConnected && "TikTok", snap.gbpConnected && "GBP"].filter(Boolean).join(", ") || "None connected"}
${snap.gbpInCooldown ? `- GBP cooldown: ${snap.gbpCooldownMinsLeft}m remaining` : ""}
One recommendation: what to post next and where. Under 100 words.`;

    case "calls_only":
      return `DETECTED INTENT: calls_only
FOCUS: Calls summary only.
- Calls (30 days): ${snap.callsTotal} total, ${snap.callsMissed} missed
${snap.callsMissed > 0 ? `- ${snap.callsMissed} missed calls = potential lost jobs.` : "- No missed calls — excellent coverage."}
- AI Receptionist: ${snap.receptionistConfigured ? "✅ configured" : "❌ not configured — missed calls go unanswered"}
One action to improve call capture. Under 80 words.`;

    case "leads_only":
      return `DETECTED INTENT: leads_only
FOCUS: Leads summary only.
- Leads (30 days): ${snap.leadsTotal} total, ${snap.leadsNew} need follow-up
${snap.leadsNew > 0 ? `- ${snap.leadsNew} lead${snap.leadsNew > 1 ? "s" : ""} uncontacted — these are unbooked jobs.` : "- All leads addressed — well done."}
One action to convert leads. Under 80 words.`;

    case "diagnose":
      return `DETECTED INTENT: diagnose
FOCUS: Run a full platform diagnostic. Report each system status:

CONNECTIONS: Facebook ${snap.fbConnected ? "✅" : "❌"} | Instagram ${snap.igConnected ? "✅" : "❌"} | TikTok ${snap.tikTokConnected ? "✅" : "❌"} | GBP ${snap.gbpConnected ? "✅" : "❌"}${snap.gbpInCooldown ? ` ⛔ cooldown ${snap.gbpCooldownMinsLeft}m` : ""}
CONTENT: ${snap.postsPublished} published, ${snap.postsFailed} failed
RECEPTIONIST: ${snap.receptionistConfigured ? "✅ configured" : "❌ not configured"}
GORILLADESK: ${snap.gorilladeskJobCount} jobs / ${snap.gorilladeskCustomerCount} customers
HEALTH SCORE: ${snap.healthScore}/100

Prioritise top 2 issues. Direct to System Diagnostics (/admin/diagnostics). Under 120 words.`;

    case "launch_checklist":
      return `DETECTED INTENT: launch_checklist
FOCUS: Run the Production Launch Checklist. Check each item against live data:

1. Social connections — FB ${snap.fbConnected ? "✅" : "❌"} | IG ${snap.igConnected ? "✅" : "❌"} | TikTok ${snap.tikTokConnected ? "✅" : "❌"} | GBP ${snap.gbpConnected ? "✅" : "❌"}
2. Content published — ${snap.postsPublished > 0 ? "✅" : "❌"} (${snap.postsPublished} posts)
3. AI Receptionist — ${snap.receptionistConfigured ? "✅" : "❌"} transfer phone configured
4. Review requests running — ${snap.reviewsSent > 0 ? "✅" : "❌"} (${snap.reviewsSent} sent)
5. Leads monitored — ${snap.leadsNew === 0 ? "✅" : `⚠️ ${snap.leadsNew} unaddressed`}
6. GorillaDesk sync — ${snap.gorilladeskJobCount > 0 ? "✅" : "❌"} (${snap.gorilladeskJobCount} jobs)
7. Health score — ${snap.healthScore >= 80 ? "✅" : "⚠️"} ${snap.healthScore}/100

State overall launch readiness and the single blocking item (if any). Under 150 words.`;

    case "coo_mode":
      return `DETECTED INTENT: coo_mode
FOCUS: Matt has activated COO Mode. Respond exactly:
"💼 COO Mode active.

I'm operating as Chief Operating Officer for Bed Bugs & Beyond. All decisions follow executive hierarchy: Revenue → Acquisition → Retention → Efficiency → Growth.

What's on your agenda?"

Then wait for Matt's input. No extra commentary.`;

    default:
      return `DETECTED INTENT: general
FOCUS: Answer naturally using live BB&B data as context. Stay within 220 words.`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Session focus detection — scans conversation history for stated focus
// ═══════════════════════════════════════════════════════════════════════════════
interface HistoryMsg { role: string; content: string }

function detectSessionFocus(history: HistoryMsg[]): string | null {
  const focusPatterns = [
    /(?:focusing|focus|let'?s? focus|working|let'?s? work|concentrat\w+) on (.{3,40?}?)(?:\s+tonight|\s+today|\s+now|\.?$)/i,
    /(?:prioriti[sz]ing|prioriti[sz]e) (.{3,40?}?)(?:\s+tonight|\s+today|\s+now|\.?$)/i,
    /tonight(?:'?s?)? (?:we'?re? |i'?m? )?(?:focusing|working|doing) on (.{3,40?}?)(?:\.?$)/i,
    /(?:my |our )?focus (?:is |tonight |today |now )?(?:is |on |=\s*)?(.{3,40?}?)(?:\s+tonight|\s+today|\.?$)/i,
  ];
  // Scan last 30 user messages, most recent first
  const userMsgs = history.filter(m => m.role === "user").slice(-30).reverse();
  for (const msg of userMsgs) {
    for (const pattern of focusPatterns) {
      const match = pattern.exec(msg.content);
      if (match) {
        const topic = (match[1] ?? "").trim().replace(/[.!?]+$/, "");
        if (topic.length >= 3) return topic;
      }
    }
  }
  return null;
}

function buildFocusDirective(focus: string): string {
  // Map common topic words to intent-aware directives
  const lower = focus.toLowerCase();
  const domain =
    /review/.test(lower)     ? "reviews and review requests" :
    /lead/.test(lower)       ? "leads and lead follow-up" :
    /call/.test(lower)       ? "calls and missed call recovery" :
    /publish|post|content/.test(lower) ? "social publishing and content" :
    /google|gbp/.test(lower) ? "Google Business Profile" :
    /tiktok/.test(lower)     ? "TikTok connection and content" :
    /revenue|profit/.test(lower) ? "revenue attribution and profit tracking" :
    focus;
  return `SESSION FOCUS: "${focus}"
Matt has stated he is focusing on ${domain} this session.
Prioritise ${domain} in every recommendation. Surface ${domain}-related actions first, even if other items have slightly higher general priority. Acknowledge the focus at the start of your response when relevant.`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /apollos/chat
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/apollos/chat", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { message, history = [] } = req.body as { message: string; history?: HistoryMsg[] };
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

  // Weather — runs after DB fetches to avoid blocking them
  const weather = await fetchWeather();

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
${weather ? `\nWEATHER (Foley, AL — current):\n${interpretWeather(weather)}` : "\nWEATHER: Data unavailable (network timeout or service down)."}
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
COMMAND LANGUAGE — single-word shortcuts Matt can send
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
These are recognized commands. Respond in character — short, action-oriented.
🎯 / "target"     → single highest-priority action right now
✨ / "sparkles"   → acknowledge idea, roadmap it, redirect to today's Target
🍍 / "pineapple"  → we got distracted — redirect back to today's Target
✅ / "done"       → task complete, advance to next Target
➡ / "next"        → show next priority
🚧 / "stuck"      → diagnose the blocker, give workaround
📊 / "status"     → business health summary
💰 / "revenue"    → revenue summary only
📣 / "marketing"  → marketing/publishing summary only
☎ / "calls"       → calls summary only
👥 / "leads"      → leads summary only
🛠 / "diagnose"   → full platform diagnostic
🚀 / "launch"     → production launch checklist
💼 / "coo"        → activate COO Mode

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
CONFIDENCE ENGINE (Phase 2) — classify every statement internally
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before stating anything, internally classify it as one of:

🟢 VERIFIED — came directly from live DB data or API in the context block below.
  Use when: publishing counts, lead counts, call counts, review request counts,
  connection status, health score, business health deductions, GorillaDesk sync,
  receptionist configuration, local presence channel status, revenue totals.
  Language: state as fact. "You have 2 unaddressed leads." "GBP is connected."

🟡 INFERENCE — recommendation or judgment derived from verified data.
  Use when: suggesting an action, ranking priorities, projecting impact,
  interpreting what a number means for the business.
  Language: signal the inference. "Based on your data, I'd recommend…"
  "Given that [fact], the highest-impact move is…" "I think [X] should be today's Target."
  Never present inference as verified fact.

⚪ UNKNOWN — live data does not exist for this topic.
  Use when: review ratings are 0 with no data, revenue attribution has no rows,
  GorillaDesk jobs = 0, conversation history not persisted, a topic not covered by the context.
  Language: be honest and specific. "I don't have live data for that yet."
  "That requires GorillaDesk job sync — currently 0 jobs synced."
  "I can't verify that — no data in the context."
  Never fabricate. Never estimate a zero as a real number. Never invent a rating.

Expose these labels in responses only when clarity helps Matt. For most responses, just use appropriate language naturally without printing the label.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPERATIONAL AWARENESS (Phase 3) — recognise and explain blockers
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
When a blocker is relevant to the question or recommendation, surface it with:
  → Why it matters (business impact)
  → What is blocking it (technical or third-party reason)
  → Who controls it (Matt / third party / AI Edge team)
  → Whether Matt can act right now

Known blockers (use live data to determine if active):
- GBP quota cooldown → Why: blocks all GBP publishing and review posts. Who: Google controls the quota window. Matt: wait for cooldown, then retry via Publishing Center or System Diagnostics.
- TikTok not connected → Why: zero TikTok reach. Who: TikTok Business registration required — third party approval. Matt: nothing actionable until approved.
- Apple Business Connect pending → Why: Apple local presence score blocked at 2/35. Who: Apple verification — third party. Matt: check business.apple.com for status.
- GorillaDesk 0 jobs synced → Why: revenue attribution, job history, and customer-level review targeting all blind. Who: GorillaDesk API only exposes /company, /users, /customers — no jobs endpoint. Matt: cannot resolve via API; GorillaDesk must add jobs access.
- No review ratings data → Why: Google/Facebook review counts show 0 — reputation score unverifiable. Who: requires manual entry in Reviews Engine or a review API sync. Matt: can enter manually in Reviews Engine (/admin/reviews).
- No conversation persistence → Why: Apollos cannot recall previous sessions. Who: no DB table for session history yet. Matt: context resets on page refresh — this is a known platform limitation.
- Disconnected platforms → Why: no publishing, no audience reach on that platform. Who: Matt controls reconnection. Matt: reconnect via the platform's connection page.
- Expired tokens → Why: API calls will fail silently or with auth errors. Who: Matt must reconnect. Matt: go to System Diagnostics (/admin/diagnostics) or the platform's connection page.
- AI Receptionist not configured → Why: every missed call has no fallback — lost lead. Who: Matt. Matt: set transfer phone in AI Receptionist (/admin/ai-receptionist).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELF-CHECK (Phase 4) — run before every response
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before finalising any response, internally verify:

1. Am I using only verified data from the context block? If stating a number, it must appear in the data below.
2. Am I clearly signalling when I'm making an inference rather than reporting a fact?
3. Am I acknowledging missing data as ⚪ UNKNOWN rather than guessing?
4. Is my top recommendation genuinely the highest-impact + lowest-effort option given live data?
5. Am I directing Matt to an existing page rather than suggesting something that doesn't exist?
6. Am I within 220 words (320 for auto_brief)?
7. Am I being direct — no waffle, no filler, no vague encouragement?

This checklist is internal. Only surface it if Matt asks "how did you decide that?" or similar.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COO MODE (Phase 5) — prioritisation framework for "What should I do?"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
When Matt asks what to do next, prioritise strictly in this order:

1. 💰 REVENUE — actions that recover or generate immediate revenue (missed leads, missed calls, revenue attribution gaps)
2. 🔥 ACQUISITION — actions that capture new customers (review requests, GBP posts, social publishing)
3. ⚙️ SYSTEMS — actions that fix broken or disconnected systems blocking 1 and 2 (reconnect platforms, configure receptionist)
4. 📈 GROWTH — actions that build long-term reach (local presence, content cadence, autopilot tuning)
5. 🍍 LATER — everything else (new features, low-urgency improvements, third-party waits)

Rules:
→ Never recommend new development unless it directly unblocks revenue or acquisition.
→ Never recommend building something that already exists on the platform.
→ If Matt has ≤30 minutes, filter to Revenue and Acquisition actions only.
→ Always state Impact (High / Medium / Low), Est. time, and Status (Ready / Blocked / Waiting on).
→ Always name the specific page. Never say "somewhere in the platform."

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

  // ── Intent detection + focused directive injection ─────────────────────────
  const intent = detectIntent(message);
  const snap: IntentCtxSnapshot = {
    healthScore,
    deductions,
    postsPublished: ctx.postsPublished,
    postsDraft: ctx.postsDraft,
    postsPartial: ctx.postsPartial,
    postsFailed: ctx.postsFailed,
    lastPublishedAt: ctx.lastPublishedAt,
    lastPublishedPlatforms: ctx.lastPublishedPlatforms,
    reviewsSent: ctx.reviewsSent,
    reviewsFailed: ctx.reviewsFailed,
    reviewsThisWeek: ctx.reviewsThisWeek,
    googleReviewCount: ctx.googleReviewCount,
    googleRating: ctx.googleRating,
    fbReviewCount: ctx.fbReviewCount,
    fbRating: ctx.fbRating,
    reviewCoverage,
    gorilladeskCustomerCount: ctx.gorilladeskCustomerCount,
    leadsTotal: ctx.leadsTotal,
    leadsNew: ctx.leadsNew,
    callsTotal: ctx.callsTotal,
    callsMissed: ctx.callsMissed,
    fbConnected: ctx.fbConnected,
    igConnected: ctx.igConnected,
    tikTokConnected: ctx.tikTokConnected,
    gbpConnected: ctx.gbpConnected,
    gbpHasLocation: ctx.gbpHasLocation,
    gbpInCooldown: ctx.gbpInCooldown,
    gbpCooldownMinsLeft: ctx.gbpCooldownMinsLeft,
    receptionistConfigured: ctx.receptionistConfigured,
    gorilladeskJobCount: ctx.gorilladeskJobCount,
    autopilotEnabled: ctx.autopilotEnabled,
    autopilotPaused: ctx.autopilotPaused,
    daysSinceLastGenerated: ctx.daysSinceLastGenerated,
    localPresenceChannels: ctx.localPresenceChannels,
  };
  const intentDirective = buildIntentDirective(intent, snap);
  const sessionFocus    = detectSessionFocus(history);
  const focusBlock      = sessionFocus ? `\n${buildFocusDirective(sessionFocus)}\n` : "";
  const finalSystemPrompt = systemPrompt.replace(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nLIVE BUSINESS DATA",
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${intentDirective}${focusBlock}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nLIVE BUSINESS DATA`,
  );

  try {
    const model = getAiModel();
    const { text } = await generateText({ model, system: finalSystemPrompt, prompt: message });
    res.json({ reply: text.trim(), intent });
  } catch (err: any) {
    // Always log the full technical error server-side — never expose it to the client
    console.error("[APOLLOS-CHAT] AI error:", err?.status ?? err?.statusCode, err?.message, err?.error ?? "");

    // ── DIAGNOSTIC LOG (temporary) ─────────────────────────────────────────
    console.log("[APOLLOS-DIAG] err type:", typeof err, "| constructor:", err?.constructor?.name);
    console.log("[APOLLOS-DIAG] err.message:", JSON.stringify(err?.message));
    console.log("[APOLLOS-DIAG] err.lastError?.message:", JSON.stringify(err?.lastError?.message));
    console.log("[APOLLOS-DIAG] err.cause?.message:", JSON.stringify(err?.cause?.message));
    console.log("[APOLLOS-DIAG] err.errors (count):", Array.isArray(err?.errors) ? err.errors.length : "none",
      "| last:", JSON.stringify(err?.errors?.[err.errors?.length - 1]?.message));
    console.log("[APOLLOS-DIAG] err.status:", err?.status, "| err.statusCode:", err?.statusCode,
      "| err.error?.code:", err?.error?.code);
    console.log("[APOLLOS-DIAG] isQuotaError result:", isQuotaError(err));
    // ── END DIAGNOSTIC LOG ─────────────────────────────────────────────────

    if (isQuotaError(err)) {
      // Quota exhausted — return a live-data fallback brief instead of an error
      console.warn("[APOLLOS-CHAT] Quota exceeded — serving data-only fallback brief");
      const fallback = buildFallbackBrief({
        callsTotal:              ctx.callsTotal,
        callsMissed:             ctx.callsMissed,
        leadsTotal:              ctx.leadsTotal,
        leadsNew:                ctx.leadsNew,
        postsPublished:          ctx.postsPublished,
        postsDraft:              ctx.postsDraft,
        postsFailed:             ctx.postsFailed,
        reviewsThisWeek:         ctx.reviewsThisWeek,
        reviewsSent:             ctx.reviewsSent,
        fbConnected:             ctx.fbConnected,
        igConnected:             ctx.igConnected,
        gbpConnected:            ctx.gbpConnected,
        autopilotEnabled:        ctx.autopilotEnabled,
        autopilotPaused:         ctx.autopilotPaused,
        gorilladeskCustomerCount: ctx.gorilladeskCustomerCount,
      });
      res.json({ reply: fallback, intent });
    } else if (isMissingKeyError(err)) {
      res.status(500).json({ error: "Apollos AI is not configured. The OpenAI API key is missing — contact your administrator." });
    } else {
      res.status(500).json({ error: "Apollos is temporarily unavailable. Please try again in a moment." });
    }
  }
});

export default router;

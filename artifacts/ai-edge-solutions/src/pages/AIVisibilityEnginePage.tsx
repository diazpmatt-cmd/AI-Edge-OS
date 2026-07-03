import React, { useState, useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { useTheme } from "@/contexts/theme-context";
import { useApiFetch } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Channel {
  id: string; name: string; category: string;
  status: string; score: number; priority: string; action: string;
}
interface Competitor {
  name: string; reviewGap: number; keywordGap: string;
  backlinkGap: string; aiGap: number; opportunityScore: number;
}
interface Recommendation {
  priority: string; task: string; reason: string; impact: string; status: string;
}
interface AuditData {
  businessName: string;
  overallScore: number; searchScore: number; mapsScore: number;
  aiSearchScore: number; authorityScore: number; reviewScore: number;
  competitorGapScore: number;
  channelsJson: string; competitorsJson: string; recommendationsJson: string;
}

// ─── Demo fallback (identical to API demo) ────────────────────────────────────

const DEMO: AuditData = {
  businessName: "Bed Bugs & Beyond",
  overallScore: 34, searchScore: 42, mapsScore: 51,
  aiSearchScore: 18, authorityScore: 29, reviewScore: 61, competitorGapScore: 27,
  channelsJson: JSON.stringify([
    { id: "google_search",    name: "Google Search",    category: "search",    status: "Connected",   score: 58, priority: "high",     action: "Add LocalBusiness schema" },
    { id: "bing_search",      name: "Bing Search",      category: "search",    status: "Needs Setup", score: 22, priority: "high",     action: "Claim Bing Places listing" },
    { id: "google_maps",      name: "Google Maps",      category: "maps",      status: "Connected",   score: 64, priority: "high",     action: "Add more photos & posts" },
    { id: "apple_maps",       name: "Apple Maps",       category: "maps",      status: "Needs Setup", score: 0,  priority: "critical", action: "Claim Apple Business Connect" },
    { id: "bing_places",      name: "Bing Places",      category: "maps",      status: "Needs Setup", score: 0,  priority: "high",     action: "Claim Bing Places for Business" },
    { id: "waze",             name: "Waze",             category: "maps",      status: "Opportunity", score: 15, priority: "medium",   action: "Add Waze business listing" },
    { id: "yelp",             name: "Yelp",             category: "directory", status: "Connected",   score: 44, priority: "medium",   action: "Increase review velocity" },
    { id: "facebook",         name: "Facebook",         category: "directory", status: "Connected",   score: 52, priority: "medium",   action: "Enable recommendations" },
    { id: "nextdoor",         name: "Nextdoor",         category: "directory", status: "Opportunity", score: 8,  priority: "medium",   action: "Create Nextdoor business page" },
    { id: "chatgpt",          name: "ChatGPT",          category: "ai",        status: "Monitoring",  score: 12, priority: "critical", action: "Build citation authority" },
    { id: "claude",           name: "Claude",           category: "ai",        status: "Monitoring",  score: 9,  priority: "high",     action: "Add structured data + FAQ" },
    { id: "gemini",           name: "Gemini",           category: "ai",        status: "Monitoring",  score: 21, priority: "high",     action: "Strengthen GBP signals" },
    { id: "perplexity",       name: "Perplexity",       category: "ai",        status: "Monitoring",  score: 7,  priority: "high",     action: "Build high-authority citations" },
    { id: "copilot",          name: "Copilot",          category: "ai",        status: "Monitoring",  score: 14, priority: "high",     action: "Claim Bing Places + schema" },
    { id: "grok",             name: "Grok",             category: "ai",        status: "Monitoring",  score: 5,  priority: "low",      action: "Monitor for future integration" },
    { id: "siri",             name: "Siri / Voice",     category: "voice",     status: "Needs Setup", score: 0,  priority: "high",     action: "Claim Apple Business Connect" },
    { id: "alexa",            name: "Alexa / Voice",    category: "voice",     status: "Opportunity", score: 6,  priority: "medium",   action: "Add Yext or Alexa listing" },
    { id: "google_assistant", name: "Google Assistant", category: "voice",     status: "Connected",   score: 38, priority: "medium",   action: "Optimize for voice queries" },
  ]),
  competitorsJson: JSON.stringify([
    { name: "Havard Pest Control",            reviewGap: -24, keywordGap: "High",   backlinkGap: "High",   aiGap: -16, opportunityScore: 78 },
    { name: "Beebe's Pest & Termite",         reviewGap: -8,  keywordGap: "Medium", backlinkGap: "Medium", aiGap: -9,  opportunityScore: 55 },
    { name: "Knox Pest Control",              reviewGap: -3,  keywordGap: "Low",    backlinkGap: "Low",    aiGap: -7,  opportunityScore: 42 },
    { name: "Arrow Exterminators",            reviewGap: -41, keywordGap: "High",   backlinkGap: "High",   aiGap: -22, opportunityScore: 91 },
  ]),
  recommendationsJson: JSON.stringify([
    { priority: "critical", task: "Claim Apple Business Connect",          reason: "Siri & Apple Maps send zero customers without this",           impact: "High",   status: "pending" },
    { priority: "critical", task: "Add LocalBusiness JSON-LD schema",      reason: "AI platforms can't identify business as a local entity",       impact: "High",   status: "pending" },
    { priority: "critical", task: "Build 20+ citation listings",           reason: "Citation count is 18 below competitor average",               impact: "High",   status: "pending" },
    { priority: "high",     task: "Claim Bing Places for Business",        reason: "Copilot AI pulls from Bing Places — currently missing",       impact: "High",   status: "pending" },
    { priority: "high",     task: "Add FAQPage schema to service pages",   reason: "FAQ schema is top signal for AI search snippet selection",    impact: "Medium", status: "pending" },
    { priority: "high",     task: "Launch post-job review request campaign",reason: "Review velocity is 68% below competitor average",            impact: "High",   status: "pending" },
    { priority: "high",     task: "Create 6 city-specific service pages",  reason: "Location pages unlock long-tail AI visibility per city",      impact: "High",   status: "pending" },
    { priority: "medium",   task: "Add llms.txt to website root",          reason: "Allows AI crawlers to index business info directly",          impact: "Medium", status: "pending" },
    { priority: "medium",   task: "Create AI-optimized About page",        reason: "Entity recognition needs a clear, crawlable business bio",    impact: "Medium", status: "pending" },
    { priority: "medium",   task: "Build local backlink profile",          reason: "Chamber links + news citations improve authority signals",    impact: "Medium", status: "pending" },
    { priority: "low",      task: "Set up Nextdoor business page",         reason: "Nextdoor drives hyper-local neighborhood word-of-mouth",      impact: "Low",    status: "pending" },
    { priority: "low",      task: "Add Waze business listing",             reason: "Captures nearby navigation-intent customers",                 impact: "Low",    status: "pending" },
  ]),
};

// ─── Authority engine items ───────────────────────────────────────────────────

const AUTHORITY_ITEMS = [
  { label: "Citation Health",          icon: "📋", score: 28, status: "weak",    note: "~12 active citations vs. competitor avg 30+" },
  { label: "NAP Consistency",          icon: "🏢", score: 71, status: "good",    note: "Name, Address, Phone is consistent on major platforms" },
  { label: "Backlink Opportunities",   icon: "🔗", score: 19, status: "weak",    note: "3 local backlinks found — target 20+ for AI authority" },
  { label: "Directory Listings",       icon: "📁", score: 44, status: "medium",  note: "8 of 18 major directories claimed" },
  { label: "Structured Data (Schema)", icon: "🏷", score: 0,  status: "missing", note: "No LocalBusiness, FAQ, or Service schema detected" },
  { label: "llms.txt / AI Crawler",    icon: "🤖", score: 0,  status: "missing", note: "No llms.txt found — AI crawlers cannot index business data" },
];

const AI_READINESS = [
  { platform: "ChatGPT",    icon: "🤖", score: 12, recs: ["Add FAQ schema", "Build citations", "Create AI-readable About page"] },
  { platform: "Gemini",     icon: "💎", score: 21, recs: ["Strengthen GBP", "Add review schema", "Publish weekly GBP posts"] },
  { platform: "Perplexity", icon: "🧠", score: 7,  recs: ["High-authority citations", "Add backlinks", "Create expert content"] },
  { platform: "Claude",     icon: "✦",  score: 9,  recs: ["Structured data", "FAQ content", "Authoritative service pages"] },
  { platform: "Copilot",    icon: "🪟", score: 14, recs: ["Claim Bing Places", "Add schema", "Increase Bing citations"] },
  { platform: "Grok",       icon: "✗",  score: 5,  recs: ["Monitor integration", "Build general authority", "Social presence"] },
];

// ─── Style helpers ────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  "Connected":   { color: "#10B981", label: "Connected"   },
  "Needs Setup": { color: "#EF4444", label: "Needs Setup" },
  "Opportunity": { color: "#F59E0B", label: "Opportunity" },
  "Monitoring":  { color: "#8B5CF6", label: "Monitoring"  },
};

const PRIORITY_STYLE: Record<string, { color: string }> = {
  critical: { color: "#EF4444" },
  high:     { color: "#F59E0B" },
  medium:   { color: "#00AEEF" },
  low:      { color: "#64748B" },
};

const AUTHORITY_STATUS: Record<string, { color: string; label: string }> = {
  missing: { color: "#EF4444", label: "Missing" },
  weak:    { color: "#F59E0B", label: "Weak"    },
  medium:  { color: "#00AEEF", label: "Fair"    },
  good:    { color: "#10B981", label: "Good"    },
};

const CATEGORY_ICONS: Record<string, string> = {
  search: "🔍", maps: "🗺️", directory: "📁", ai: "🤖", voice: "🔊",
};
const CATEGORY_LABELS: Record<string, string> = {
  search: "Search Engines", maps: "Maps & Navigation", directory: "Directories & Social", ai: "AI Search Platforms", voice: "Voice Assistants",
};

// ─── Small components ─────────────────────────────────────────────────────────

function SectionDivider({ title, sub, isDark }: { title: string; sub?: string; isDark: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <div style={{ whiteSpace: "nowrap" }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: isDark ? "#475569" : "#4B5563", letterSpacing: "1px", textTransform: "uppercase" }}>{title}</div>
        {sub && <div style={{ fontSize: 10, color: isDark ? "#334155" : "#9CA3AF", marginTop: 1 }}>{sub}</div>}
      </div>
      <div style={{ flex: 1, height: 1, background: isDark ? "rgba(255,255,255,0.05)" : "#E5E7EB" }} />
    </div>
  );
}

function ScoreRing({ score, size = 56, color }: { score: number; size?: number; color: string }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={5} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.8s ease" }} />
    </svg>
  );
}

function Bar({ value, color, isDark }: { value: number; color: string; isDark: boolean }) {
  return (
    <div style={{ height: 5, background: isDark ? "rgba(255,255,255,0.06)" : "#E5E7EB", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${value}%`, background: color, borderRadius: 3, transition: "width 0.7s ease" }} />
    </div>
  );
}

function StatusChip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: `${color}18`, color, fontSize: 9, fontWeight: 800,
      padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap",
      border: `1px solid ${color}30`,
    }}>
      <span style={{ width: 4, height: 4, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AIVisibilityEnginePage() {
  const { colors: t, isDark } = useTheme();
  const apiFetch = useApiFetch();

  // Read clientId from URL query string (?clientId=xxx)
  const clientId = new URLSearchParams(window.location.search).get("clientId") ?? "default";
  const isClientView = clientId !== "default";

  const [audit, setAudit]         = useState<AuditData>(DEMO);
  const [loading, setLoading]     = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [actionFilter, setActionFilter]     = useState<string>("all");

  useEffect(() => {
    setLoading(true);
    apiFetch<AuditData>(`/ai-visibility/${clientId}`)
      .then(data => setAudit(data))
      .catch(() => setAudit(DEMO))
      .finally(() => setLoading(false));
  }, [clientId]);

  const channels: Channel[]         = JSON.parse(audit.channelsJson       || "[]");
  const competitors: Competitor[]   = JSON.parse(audit.competitorsJson    || "[]");
  const recommendations: Recommendation[] = JSON.parse(audit.recommendationsJson || "[]");

  const filteredChannels = categoryFilter === "all"
    ? channels
    : channels.filter(c => c.category === categoryFilter);

  const criticalRecs = recommendations.filter(r => r.priority === "critical");
  const highRecs     = recommendations.filter(r => r.priority === "high");
  const mediumRecs   = recommendations.filter(r => r.priority === "medium");
  const lowRecs      = recommendations.filter(r => r.priority === "low");

  const displayRecs = actionFilter === "all" ? recommendations
    : actionFilter === "critical" ? criticalRecs
    : actionFilter === "high"     ? highRecs
    : actionFilter === "medium"   ? mediumRecs
    : lowRecs;

  // ── Theme-aware card styles ──
  const card = {
    background: isDark ? "rgba(11,22,41,0.8)" : "#FFFFFF",
    border: isDark ? "1px solid rgba(255,255,255,0.07)" : "1px solid #E5E7EB",
    borderRadius: 14,
  } as const;

  const kpiCards = [
    { icon: "⚡", label: "Overall Visibility",  value: audit.overallScore,       color: audit.overallScore  >= 70 ? "#10B981" : audit.overallScore  >= 40 ? "#F59E0B" : "#EF4444", suffix: "/100" },
    { icon: "🔍", label: "Search Visibility",   value: audit.searchScore,        color: "#00AEEF",  suffix: "/100" },
    { icon: "🗺️", label: "Maps Visibility",     value: audit.mapsScore,          color: "#10B981",  suffix: "/100" },
    { icon: "🤖", label: "AI Search",           value: audit.aiSearchScore,      color: "#8B5CF6",  suffix: "/100" },
    { icon: "🏛️", label: "Authority Score",     value: audit.authorityScore,     color: "#F59E0B",  suffix: "/100" },
    { icon: "⭐", label: "Review Strength",     value: audit.reviewScore,        color: "#FBBF24",  suffix: "/100" },
    { icon: "⚔️", label: "Competitor Gap",      value: audit.competitorGapScore, color: "#EF4444",  suffix: "/100" },
  ];

  const categories = [
    { id: "all",       label: `All (${channels.length})` },
    { id: "search",    label: `Search (${channels.filter(c => c.category === "search").length})` },
    { id: "maps",      label: `Maps (${channels.filter(c => c.category === "maps").length})` },
    { id: "directory", label: `Directories (${channels.filter(c => c.category === "directory").length})` },
    { id: "ai",        label: `AI (${channels.filter(c => c.category === "ai").length})` },
    { id: "voice",     label: `Voice (${channels.filter(c => c.category === "voice").length})` },
  ];

  return (
    <AppShell>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 26 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.22)",
            borderRadius: 20, padding: "4px 14px", marginBottom: 12,
          }}>
            <span style={{ fontSize: 12, color: "#FBBF24", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" }}>
              ✨ AI Visibility Engine
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 800, color: t.text, letterSpacing: "-0.5px", margin: "0 0 5px" }}>
                AI Visibility Engine
              </h1>
              <p style={{ fontSize: 13, color: t.text2, margin: 0, maxWidth: 620 }}>
                {isClientView && audit.businessName
                  ? <>Visibility audit for <strong style={{ color: t.text }}>{audit.businessName}</strong> — track & improve presence across all channels.</>
                  : <>Track & improve visibility across search engines, maps, directories, AI search platforms, and voice assistants.</>
                }
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {isClientView && audit.businessName && !loading && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 7,
                  background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)",
                  borderRadius: 10, padding: "7px 13px",
                }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#10B981" }} />
                  <span style={{ fontSize: 11, color: "#10B981", fontWeight: 700 }}>{audit.businessName}</span>
                </div>
              )}
              {loading && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 10, padding: "7px 13px" }}>
                  <span style={{ fontSize: 11, color: "#FBBF24", fontWeight: 600 }}>⚡ Loading audit…</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── 1. KPI Score Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10, marginBottom: 30 }}>
          {kpiCards.map(k => (
            <div key={k.label} style={{
              ...card,
              padding: "16px 14px",
              boxShadow: `0 0 20px ${k.color}10`,
              borderTop: `2px solid ${k.color}50`,
            }}>
              <div style={{ fontSize: 18, marginBottom: 8 }}>{k.icon}</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: isDark ? "#475569" : "#6B7280", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>{k.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                <span style={{ fontSize: 28, fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.value}</span>
                <span style={{ fontSize: 11, color: isDark ? "#475569" : "#9CA3AF" }}>{k.suffix}</span>
              </div>
              <Bar value={k.value} color={k.color} isDark={isDark} />
            </div>
          ))}
        </div>

        {/* ── 2. Get Found Everywhere ── */}
        <div style={{ marginBottom: 30 }}>
          <SectionDivider title="Get Found Everywhere — 18 Channels" sub="Status, score, and recommended action for each platform" isDark={isDark} />

          {/* Category filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                style={{
                  padding: "5px 12px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                  cursor: "pointer", border: "none",
                  background: categoryFilter === cat.id
                    ? "rgba(251,191,36,0.15)"
                    : (isDark ? "rgba(255,255,255,0.05)" : "#F3F4F6"),
                  color: categoryFilter === cat.id
                    ? "#FBBF24"
                    : (isDark ? "#64748B" : "#6B7280"),
                  transition: "all 0.15s",
                }}
              >{cat.label}</button>
            ))}
          </div>

          {/* Group by category when showing all */}
          {categoryFilter === "all" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {["search", "maps", "directory", "ai", "voice"].map(cat => {
                const catChannels = channels.filter(c => c.category === cat);
                if (!catChannels.length) return null;
                return (
                  <div key={cat}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 14 }}>{CATEGORY_ICONS[cat]}</span>
                      <span style={{ fontSize: 10, fontWeight: 800, color: isDark ? "#475569" : "#6B7280", textTransform: "uppercase", letterSpacing: "0.8px" }}>
                        {CATEGORY_LABELS[cat]}
                      </span>
                    </div>
                    <ChannelGrid channels={catChannels} card={card} isDark={isDark} />
                  </div>
                );
              })}
            </div>
          ) : (
            <ChannelGrid channels={filteredChannels} card={card} isDark={isDark} />
          )}
        </div>

        {/* ── 3. Competitor Intelligence ── */}
        <div style={{ marginBottom: 30 }}>
          <SectionDivider title="Competitor Intelligence" sub="Review, keyword, backlink, and AI visibility gaps" isDark={isDark} />
          <div style={{ ...card, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid #E5E7EB" }}>
                  {["Competitor", "Review Gap", "Keyword Gap", "Backlink Gap", "AI Gap", "Opportunity Score"].map(h => (
                    <th key={h} style={{ padding: "11px 16px", fontSize: 9, fontWeight: 800, color: isDark ? "#475569" : "#6B7280", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.7px", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {competitors.map((c, i) => (
                  <tr key={i} style={{ borderBottom: i < competitors.length - 1 ? (isDark ? "1px solid rgba(255,255,255,0.04)" : "1px solid #F3F4F6") : "none" }}>
                    <td style={{ padding: "13px 16px", fontSize: 13, fontWeight: 700, color: t.text }}>{c.name}</td>
                    <td style={{ padding: "13px 16px" }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: c.reviewGap < -15 ? "#EF4444" : c.reviewGap < -5 ? "#F59E0B" : "#10B981" }}>
                        {c.reviewGap}
                      </span>
                    </td>
                    <td style={{ padding: "13px 16px" }}><GapBadge level={c.keywordGap} /></td>
                    <td style={{ padding: "13px 16px" }}><GapBadge level={c.backlinkGap} /></td>
                    <td style={{ padding: "13px 16px" }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: Math.abs(c.aiGap) > 15 ? "#EF4444" : "#F59E0B" }}>
                        {c.aiGap}
                      </span>
                    </td>
                    <td style={{ padding: "13px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, maxWidth: 80, height: 5, background: isDark ? "rgba(255,255,255,0.06)" : "#E5E7EB", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${c.opportunityScore}%`, background: c.opportunityScore > 70 ? "#EF4444" : "#F59E0B", borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 800, color: c.opportunityScore > 70 ? "#EF4444" : "#F59E0B" }}>{c.opportunityScore}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: "11px 16px", borderTop: isDark ? "1px solid rgba(255,255,255,0.04)" : "1px solid #F3F4F6", background: isDark ? "rgba(239,68,68,0.03)" : "#FEF2F2" }}>
              <span style={{ fontSize: 11, color: isDark ? "#94A3B8" : "#6B7280" }}>
                📊 <strong style={{ color: "#F87171" }}>Bed Bugs &amp; Beyond</strong> has an estimated <strong style={{ color: "#F87171" }}>2 AI mentions</strong> vs. competitor average of <strong style={{ color: "#FBBF24" }}>14</strong>. Closing this gap is the #1 growth lever.
              </span>
            </div>
          </div>
        </div>

        {/* ── 4. Authority Engine ── */}
        <div style={{ marginBottom: 30 }}>
          <SectionDivider title="Authority Engine" sub="Citation health, NAP consistency, backlinks, directories, schema, AI crawler readiness" isDark={isDark} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {AUTHORITY_ITEMS.map(item => {
              const st = AUTHORITY_STATUS[item.status];
              return (
                <div key={item.label} style={{
                  ...card,
                  padding: "16px 18px",
                  borderLeft: `3px solid ${st.color}60`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                      background: `${st.color}12`, border: `1px solid ${st.color}25`,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                    }}>{item.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 1 }}>{item.label}</div>
                      <StatusChip label={st.label} color={st.color} />
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: st.color, lineHeight: 1 }}>{item.score}</div>
                      <div style={{ fontSize: 9, color: isDark ? "#475569" : "#9CA3AF" }}>/100</div>
                    </div>
                  </div>
                  <Bar value={item.score} color={st.color} isDark={isDark} />
                  <div style={{ fontSize: 11, color: isDark ? "#64748B" : "#6B7280", marginTop: 8, lineHeight: 1.4 }}>{item.note}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 5. AI Search Readiness ── */}
        <div style={{ marginBottom: 30 }}>
          <SectionDivider title="AI Search Readiness" sub="How ready each AI platform is to recommend this business" isDark={isDark} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {AI_READINESS.map(p => {
              const col = p.score >= 50 ? "#10B981" : p.score >= 25 ? "#F59E0B" : "#EF4444";
              return (
                <div key={p.platform} style={{ ...card, padding: "18px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                      background: `${col}10`, border: `1px solid ${col}25`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 20, fontWeight: 900,
                    }}>{p.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: t.text, marginBottom: 3 }}>{p.platform}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 5, background: isDark ? "rgba(255,255,255,0.06)" : "#E5E7EB", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${p.score}%`, background: col, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 900, color: col }}>{p.score}%</span>
                      </div>
                    </div>
                    <ScoreRing score={p.score} size={44} color={col} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {p.recs.map((rec, j) => (
                      <div key={j} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                        <span style={{ color: col, fontSize: 10, marginTop: 1, flexShrink: 0 }}>→</span>
                        <span style={{ fontSize: 11, color: isDark ? "#64748B" : "#6B7280", lineHeight: 1.4 }}>{rec}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 6. Action Plan ── */}
        <div style={{ marginBottom: 30 }}>
          <SectionDivider title={`Action Plan — ${recommendations.length} items`} sub="Prioritized tasks to improve AI visibility" isDark={isDark} />

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {[
              { id: "all",      label: `All (${recommendations.length})`,    color: "#94A3B8" },
              { id: "critical", label: `Critical (${criticalRecs.length})`,  color: "#EF4444" },
              { id: "high",     label: `High (${highRecs.length})`,          color: "#F59E0B" },
              { id: "medium",   label: `Medium (${mediumRecs.length})`,      color: "#00AEEF" },
              { id: "low",      label: `Low (${lowRecs.length})`,            color: "#64748B" },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setActionFilter(f.id)}
                style={{
                  padding: "5px 12px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                  cursor: "pointer", border: "none",
                  background: actionFilter === f.id ? `${f.color}18` : (isDark ? "rgba(255,255,255,0.05)" : "#F3F4F6"),
                  color: actionFilter === f.id ? f.color : (isDark ? "#64748B" : "#6B7280"),
                  transition: "all 0.15s",
                }}
              >{f.label}</button>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {displayRecs.map((rec, i) => {
              const ps = PRIORITY_STYLE[rec.priority] || PRIORITY_STYLE.low;
              const impactColor = rec.impact === "High" ? "#10B981" : rec.impact === "Medium" ? "#00AEEF" : "#64748B";
              return (
                <div key={i} style={{
                  ...card,
                  padding: "14px 18px",
                  display: "flex", alignItems: "flex-start", gap: 14,
                  borderLeft: `3px solid ${ps.color}60`,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                    background: `${ps.color}12`, border: `1px solid ${ps.color}25`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 900, color: ps.color,
                    textTransform: "uppercase",
                  }}>
                    {rec.priority === "critical" ? "!" : rec.priority.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 3 }}>{rec.task}</div>
                    <div style={{ fontSize: 11, color: isDark ? "#64748B" : "#6B7280", lineHeight: 1.4 }}>{rec.reason}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: ps.color, background: `${ps.color}12`, border: `1px solid ${ps.color}25`, padding: "3px 8px", borderRadius: 20 }}>
                      {rec.priority.charAt(0).toUpperCase() + rec.priority.slice(1)}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: impactColor, background: `${impactColor}12`, border: `1px solid ${impactColor}25`, padding: "3px 8px", borderRadius: 20 }}>
                      {rec.impact} Impact
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </AppShell>
  );
}

// ─── Channel grid sub-component ───────────────────────────────────────────────

function ChannelGrid({ channels, card, isDark }: { channels: Channel[]; card: React.CSSProperties; isDark: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
      {channels.map(ch => {
        const st = STATUS_STYLE[ch.status] || { color: "#64748B", label: ch.status };
        const ps = PRIORITY_STYLE[ch.priority] || PRIORITY_STYLE.low;
        return (
          <div key={ch.id} style={{
            ...card,
            padding: "14px 13px",
            display: "flex", flexDirection: "column", gap: 8,
            borderTop: `2px solid ${st.color}40`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{CATEGORY_ICONS[ch.category] || "🌐"}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: isDark ? "#E2E8F0" : "#111827", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.name}</span>
            </div>
            <StatusChip label={st.label} color={st.color} />
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 9, color: isDark ? "#475569" : "#9CA3AF", fontWeight: 700 }}>Score</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: st.color }}>{ch.score}%</span>
              </div>
              <div style={{ height: 4, background: isDark ? "rgba(255,255,255,0.06)" : "#E5E7EB", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${ch.score}%`, background: st.color, borderRadius: 2 }} />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 8, fontWeight: 800, color: ps.color, textTransform: "uppercase", letterSpacing: "0.4px" }}>
                {ch.priority}
              </span>
            </div>
            <div style={{ fontSize: 9, color: isDark ? "#64748B" : "#6B7280", lineHeight: 1.35, borderTop: isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid #F3F4F6", paddingTop: 6, marginTop: "auto" }}>
              → {ch.action}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Gap badge ────────────────────────────────────────────────────────────────

function GapBadge({ level }: { level: string }) {
  const col = level === "High" ? "#EF4444" : level === "Medium" ? "#F59E0B" : "#10B981";
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: col, background: `${col}12`, border: `1px solid ${col}25`, padding: "2px 9px", borderRadius: 6 }}>
      {level}
    </span>
  );
}

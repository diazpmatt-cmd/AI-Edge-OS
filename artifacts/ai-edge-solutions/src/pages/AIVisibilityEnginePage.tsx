import React, { useState } from "react";
import { AppShell } from "@/components/app-shell";

// ─────────────────────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────────────────────

const CHANNELS = [
  {
    id: "chatgpt",
    name: "ChatGPT Search",
    icon: "🤖",
    status: "Not Verified",
    statusColor: "#EF4444",
    signal: 0,
    lastChecked: "Never",
    missingFactor: "No web citations or verified business data",
    action: "Improve Citations",
  },
  {
    id: "google_ai",
    name: "Google AI Overviews",
    icon: "🔍",
    status: "Partial Signal",
    statusColor: "#F59E0B",
    signal: 42,
    lastChecked: "Today",
    missingFactor: "Missing structured schema and low review velocity",
    action: "Add Schema",
  },
  {
    id: "bing_copilot",
    name: "Bing Copilot",
    icon: "🪟",
    status: "Weak Signal",
    statusColor: "#F97316",
    signal: 18,
    lastChecked: "Today",
    missingFactor: "Bing Places not claimed",
    action: "Claim Bing Places",
  },
  {
    id: "perplexity",
    name: "Perplexity AI",
    icon: "🧠",
    status: "Not Verified",
    statusColor: "#EF4444",
    signal: 5,
    lastChecked: "Never",
    missingFactor: "No high-quality citations or authority content",
    action: "Build Authority",
  },
  {
    id: "apple_siri",
    name: "Apple / Siri Discovery",
    icon: "🍎",
    status: "Missing Listing",
    statusColor: "#EF4444",
    signal: 0,
    lastChecked: "Never",
    missingFactor: "Apple Business Connect not claimed",
    action: "Claim Apple Listing",
  },
];

const PROMPT_TESTS = [
  {
    prompt: "Best pest control company in Foley AL",
    result: "Not mentioned",
    competitors: 3,
    status: "gap",
    fix: "Create Foley location-specific service page",
  },
  {
    prompt: "Bed bug treatment near Gulf Shores",
    result: "Mentioned indirectly",
    competitors: 2,
    status: "partial",
    fix: "Add FAQ schema + strengthen GBP categories",
  },
  {
    prompt: "Who removes bed bugs in Baldwin County Alabama?",
    result: "Not mentioned",
    competitors: 4,
    status: "gap",
    fix: "Add local citations + authority content",
  },
  {
    prompt: "Emergency pest control near Orange Beach",
    result: "Not mentioned",
    competitors: 3,
    status: "gap",
    fix: "Create Orange Beach emergency service page",
  },
  {
    prompt: "Affordable roach exterminator in Fairhope",
    result: "Not mentioned",
    competitors: 2,
    status: "gap",
    fix: "Add comparison/affordability content + reviews",
  },
  {
    prompt: "Pest control Spanish Fort Alabama",
    result: "Not mentioned",
    competitors: 2,
    status: "gap",
    fix: "Create Spanish Fort service page + citations",
  },
  {
    prompt: "Termite inspection Gulf Shores",
    result: "Not mentioned",
    competitors: 3,
    status: "gap",
    fix: "Add termite service schema + local mentions",
  },
  {
    prompt: "Bed Bugs and Beyond pest control reviews",
    result: "Brand recognized",
    competitors: 0,
    status: "found",
    fix: "Maintain review velocity, add review schema",
  },
];

const COMPETITORS = [
  { name: "Havard Pest Control",           mentions: 18, reviews: "High",   authority: "High",   content: "Strong",  threat: "high"   },
  { name: "Beebe's Pest & Termite Control", mentions: 11, reviews: "Medium", authority: "Medium", content: "Medium",  threat: "medium" },
  { name: "Knox Pest Control",             mentions: 9,  reviews: "Medium", authority: "Medium", content: "Weak",    threat: "medium" },
  { name: "Arrow Exterminators",           mentions: 24, reviews: "High",   authority: "High",   content: "Strong",  threat: "high"   },
  { name: "Wayne's Pest Control",          mentions: 6,  reviews: "Low",    authority: "Low",    content: "Weak",    threat: "low"    },
];

const GAPS = [
  { title: "Missing AI-optimized service pages",       severity: "critical", impact: "High", action: "Create city-specific landing pages for each service area" },
  { title: "Weak citation authority",                  severity: "critical", impact: "High", action: "Build local business citations on 20+ directories" },
  { title: "Limited review velocity",                  severity: "high",     impact: "High", action: "Launch automated review request campaign after each job" },
  { title: "Apple/Bing/Nextdoor listings incomplete",  severity: "high",     impact: "High", action: "Claim and optimize all 3 missing platform listings" },
  { title: "Missing FAQ schema",                       severity: "high",     impact: "Medium", action: "Add FAQPage JSON-LD schema to all service pages" },
  { title: "Missing location-specific content",        severity: "medium",   impact: "Medium", action: "Write 1 dedicated page per city served (6 pages needed)" },
  { title: "No AI-readable business summary",          severity: "medium",   impact: "Medium", action: "Create an 'About' page optimized for AI entity recognition" },
  { title: "Limited backlink authority",               severity: "low",      impact: "Medium", action: "Pursue local chamber links, news citations, and sponsorships" },
];

const CONTENT_PAGES = [
  { title: "Bed Bug Treatment in Foley AL",              type: "Location Page",  priority: "high"   },
  { title: "Bed Bug Treatment in Gulf Shores AL",        type: "Location Page",  priority: "high"   },
  { title: "Roach Exterminator in Baldwin County AL",    type: "Service Page",   priority: "high"   },
  { title: "Emergency Pest Control in Orange Beach AL",  type: "Location Page",  priority: "high"   },
  { title: "Pest Control FAQ for Baldwin County",        type: "FAQ Page",       priority: "medium" },
  { title: "Why Bed Bugs & Beyond is Different",         type: "Authority Page", priority: "medium" },
  { title: "Local Pest Control Service Area Page",       type: "Area Page",      priority: "medium" },
];

const SCHEMA_RECS = [
  { type: "LocalBusiness",  status: "Missing", impact: "High"   },
  { type: "PestControl",    status: "Missing", impact: "High"   },
  { type: "FAQPage",        status: "Missing", impact: "High"   },
  { type: "Review",         status: "Partial", impact: "Medium" },
  { type: "Service",        status: "Missing", impact: "Medium" },
  { type: "Breadcrumb",     status: "Missing", impact: "Low"    },
];

const PRIORITIES = [
  { rank: 1, action: "Claim & optimize Apple Business Connect",   effort: "30 min", impact: "High"   },
  { rank: 2, action: "Claim & optimize Bing Places for Business", effort: "30 min", impact: "High"   },
  { rank: 3, action: "Create AI-readable business summary page",  effort: "2 hrs",  impact: "High"   },
  { rank: 4, action: "Create city-specific pest control pages",   effort: "1 day",  impact: "High"   },
  { rank: 5, action: "Add FAQ schema to all service pages",       effort: "2 hrs",  impact: "Medium" },
  { rank: 6, action: "Launch review request campaign",            effort: "1 day",  impact: "High"   },
  { rank: 7, action: "Build local backlinks & citations",         effort: "Ongoing",impact: "Medium" },
];

const DIAGNOSTICS = [
  { label: "AI Visibility Scan",     status: "warning",      note: "Score 38/100 — needs significant improvement" },
  { label: "Google Signal Health",   status: "warning",      note: "GBP connected, but quota throttled. Schema missing." },
  { label: "Bing Signal Health",     status: "missing",      note: "Bing Places not claimed" },
  { label: "Citation Health",        status: "warning",      note: "Low citation count — estimated < 20 active" },
  { label: "Schema Health",          status: "missing",      note: "No LocalBusiness, FAQ, or Service schema detected" },
  { label: "Review Signal Health",   status: "warning",      note: "Review volume below competitor average" },
  { label: "Local Content Health",   status: "missing",      note: "No city-specific pages found" },
  { label: "AI Content Scanner",     status: "coming_soon",  note: "Automated AI mention monitoring — coming soon" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers + small components
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  critical: { bg: "rgba(239,68,68,0.1)",   color: "#F87171", label: "Critical" },
  high:     { bg: "rgba(245,158,11,0.1)",  color: "#FCD34D", label: "High"     },
  medium:   { bg: "rgba(0,174,239,0.1)",   color: "#00AEEF", label: "Medium"   },
  low:      { bg: "rgba(100,116,139,0.1)", color: "#94A3B8", label: "Low"      },
};

const THREAT_STYLE: Record<string, { color: string; label: string }> = {
  high:   { color: "#EF4444", label: "High"   },
  medium: { color: "#F59E0B", label: "Medium" },
  low:    { color: "#10B981", label: "Low"    },
};

const DIAG_STYLE: Record<string, { color: string; icon: string; label: string }> = {
  healthy:      { color: "#10B981", icon: "✓",  label: "Healthy"      },
  warning:      { color: "#F59E0B", icon: "⚠",  label: "Warning"      },
  missing:      { color: "#EF4444", icon: "✕",  label: "Missing"      },
  coming_soon:  { color: "#8B5CF6", icon: "⋯",  label: "Coming Soon"  },
};

const PROMPT_STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  gap:     { color: "#F87171", bg: "rgba(239,68,68,0.1)",   label: "Gap Found" },
  partial: { color: "#FCD34D", bg: "rgba(245,158,11,0.1)",  label: "Partial"   },
  found:   { color: "#10B981", bg: "rgba(16,185,129,0.1)",  label: "Detected"  },
};

const PRIORITY_COLOR: Record<string, string> = {
  high:   "#EF4444",
  medium: "#F59E0B",
  low:    "#94A3B8",
};

function SectionDivider({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "1.2px", textTransform: "uppercase", whiteSpace: "nowrap" }}>{title}</div>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
      {right}
    </div>
  );
}

function KPICard({ icon, label, value, sub, color, glow }: { icon: string; label: string; value: string | number; sub?: string; color: string; glow?: boolean }) {
  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(11,22,41,0.95), rgba(3,6,18,0.8))",
      border: `1px solid ${color}22`,
      borderRadius: 14, padding: "20px 22px",
      boxShadow: glow ? `0 0 28px ${color}18` : "none",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: -18, right: -18, width: 72, height: 72, borderRadius: "50%",
        background: `${color}0C`, border: `1px solid ${color}14`,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
      }}>{icon}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 34, fontWeight: 900, color, lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#64748B" }}>{sub}</div>}
    </div>
  );
}

function SignalBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden", width: "100%", marginTop: 8 }}>
      <div style={{ height: "100%", width: `${value}%`, background: color, borderRadius: 3, transition: "width 0.6s" }} />
    </div>
  );
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: `${color}18`, color, fontSize: 10, fontWeight: 700,
      padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap",
      border: `1px solid ${color}30`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function AIVisibilityEnginePage() {
  const [activePromptFilter, setActivePromptFilter] = useState<"all" | "gap" | "partial" | "found">("all");

  const filteredPrompts = activePromptFilter === "all"
    ? PROMPT_TESTS
    : PROMPT_TESTS.filter(p => p.status === activePromptFilter);

  const gapCount    = PROMPT_TESTS.filter(p => p.status === "gap").length;
  const partialCount = PROMPT_TESTS.filter(p => p.status === "partial").length;
  const foundCount  = PROMPT_TESTS.filter(p => p.status === "found").length;

  return (
    <AppShell>
      <div style={{ maxWidth: 1140, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.22)",
            borderRadius: 20, padding: "4px 14px", marginBottom: 14,
          }}>
            <span style={{ fontSize: 12, color: "#A78BFA", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" }}>
              ✨ AI Visibility Engine — V1
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.5px", margin: "0 0 6px" }}>
                AI Visibility Engine
              </h1>
              <p style={{ fontSize: 14, color: "#6B7280", margin: 0, maxWidth: 580 }}>
                Track whether <strong style={{ color: "#CBD5E1" }}>Bed Bugs &amp; Beyond</strong> appears in AI-powered search across ChatGPT, Google AI Overviews, Bing Copilot, Perplexity, and Siri. Identify gaps and fix them before competitors do.
              </p>
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)",
              borderRadius: 10, padding: "8px 14px",
            }}>
              <span style={{ fontSize: 11, color: "#F59E0B", fontWeight: 600 }}>⚡ Live integrations coming in V2</span>
            </div>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 32 }}>
          <KPICard icon="📡" label="AI Visibility Score"   value="38/100" sub="Needs significant improvement" color="#EF4444" glow />
          <KPICard icon="🎯" label="Prompt Coverage"       value="2/8"    sub="Appearing in 2 of 8 test prompts" color="#F59E0B" />
          <KPICard icon="⚔️" label="Competitor Gap"        value="High"   sub="Competitors avg 13 AI mentions"   color="#8B5CF6" />
          <KPICard icon="🔧" label="Optimization Status"   value="Needs Work" sub="7 critical actions pending"   color="#00AEEF" />
        </div>

        {/* ── AI Search Channel Cards ── */}
        <div style={{ marginBottom: 32 }}>
          <SectionDivider title="AI Search Channels" right={
            <span style={{ fontSize: 10, color: "#334155", whiteSpace: "nowrap" }}>Signal strength based on estimated data signals</span>
          } />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
            {CHANNELS.map(ch => (
              <div key={ch.id} style={{
                background: "linear-gradient(160deg, rgba(11,22,41,0.95), rgba(3,6,18,0.85))",
                border: "1px solid rgba(255,255,255,0.07)",
                borderTop: `2px solid ${ch.statusColor}33`,
                borderRadius: 14, padding: "18px 16px",
                display: "flex", flexDirection: "column", gap: 10,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{ch.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F0" }}>{ch.name}</span>
                </div>
                <StatusBadge label={ch.status} color={ch.statusColor} />
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: "#475569", fontWeight: 600 }}>Signal</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: ch.statusColor }}>{ch.signal}%</span>
                  </div>
                  <SignalBar value={ch.signal} color={ch.statusColor} />
                </div>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 3 }}>Missing</div>
                  <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.4 }}>{ch.missingFactor}</div>
                </div>
                <div style={{ fontSize: 9, color: "#334155" }}>Last checked: {ch.lastChecked}</div>
                <button style={{
                  marginTop: "auto", padding: "7px 0", borderRadius: 8, fontSize: 11, fontWeight: 700,
                  cursor: "pointer", border: `1px solid ${ch.statusColor}30`,
                  background: `${ch.statusColor}0C`, color: ch.statusColor,
                }}>
                  {ch.action} →
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── Prompt Testing Dashboard ── */}
        <div style={{ marginBottom: 32 }}>
          <SectionDivider title={`Prompt Testing — ${PROMPT_TESTS.length} queries simulated`} right={
            <div style={{ display: "flex", gap: 4 }}>
              {[
                { id: "all",     label: `All (${PROMPT_TESTS.length})`, color: "#64748B" },
                { id: "gap",     label: `Gap (${gapCount})`,            color: "#EF4444" },
                { id: "partial", label: `Partial (${partialCount})`,    color: "#F59E0B" },
                { id: "found",   label: `Found (${foundCount})`,        color: "#10B981" },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setActivePromptFilter(f.id as any)}
                  style={{
                    padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer", border: "none",
                    background: activePromptFilter === f.id ? `${f.color}18` : "transparent",
                    color: activePromptFilter === f.id ? f.color : "#475569",
                    transition: "all 0.15s",
                  }}
                >{f.label}</button>
              ))}
            </div>
          } />
          <div style={{
            background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 14, overflow: "hidden",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["Prompt", "B&B Result", "Competitors", "Status", "Recommended Fix"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", fontSize: 10, fontWeight: 700, color: "#475569", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.7px", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredPrompts.map((row, i) => {
                  const st = PROMPT_STATUS_STYLE[row.status];
                  return (
                    <tr key={i} style={{ borderBottom: i < filteredPrompts.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                      <td style={{ padding: "13px 16px", fontSize: 12, color: "#CBD5E1", maxWidth: 240 }}>
                        <span style={{ fontStyle: "italic", color: "#94A3B8" }}>"{row.prompt}"</span>
                      </td>
                      <td style={{ padding: "13px 16px", fontSize: 12, color: row.status === "found" ? "#10B981" : row.status === "partial" ? "#FCD34D" : "#F87171", fontWeight: 600, whiteSpace: "nowrap" }}>
                        {row.result}
                      </td>
                      <td style={{ padding: "13px 16px" }}>
                        <span style={{
                          display: "inline-block", minWidth: 28, textAlign: "center",
                          background: row.competitors > 2 ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
                          color: row.competitors > 2 ? "#F87171" : "#FCD34D",
                          fontSize: 12, fontWeight: 800, borderRadius: 6, padding: "2px 8px",
                        }}>{row.competitors}</span>
                      </td>
                      <td style={{ padding: "13px 16px" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          background: st.bg, color: st.color, fontSize: 10, fontWeight: 700,
                          padding: "3px 9px", borderRadius: 20,
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: st.color, flexShrink: 0 }} />
                          {st.label}
                        </span>
                      </td>
                      <td style={{ padding: "13px 16px", fontSize: 11, color: "#64748B", maxWidth: 220 }}>{row.fix}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Competitor Mentions ── */}
        <div style={{ marginBottom: 32 }}>
          <SectionDivider title="Competitor AI Visibility" />
          <div style={{
            background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 14, overflow: "hidden",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["Competitor", "AI Mentions", "Review Strength", "Local Authority", "Content Depth", "Threat Level"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", fontSize: 10, fontWeight: 700, color: "#475569", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.7px", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPETITORS.map((c, i) => {
                  const thr = THREAT_STYLE[c.threat];
                  return (
                    <tr key={i} style={{ borderBottom: i < COMPETITORS.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                      <td style={{ padding: "13px 16px", fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>{c.name}</td>
                      <td style={{ padding: "13px 16px" }}>
                        <span style={{ fontSize: 14, fontWeight: 900, color: c.mentions > 15 ? "#EF4444" : c.mentions > 8 ? "#F59E0B" : "#64748B" }}>{c.mentions}</span>
                      </td>
                      <td style={{ padding: "13px 16px" }}><LevelDot level={c.reviews} /></td>
                      <td style={{ padding: "13px 16px" }}><LevelDot level={c.authority} /></td>
                      <td style={{ padding: "13px 16px" }}><LevelDot level={c.content} /></td>
                      <td style={{ padding: "13px 16px" }}>
                        <span style={{
                          fontSize: 10, fontWeight: 800, color: thr.color,
                          background: `${thr.color}15`, border: `1px solid ${thr.color}30`,
                          padding: "3px 10px", borderRadius: 20,
                        }}>{thr.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{
              borderTop: "1px solid rgba(255,255,255,0.06)",
              padding: "12px 16px", display: "flex", alignItems: "center", gap: 10,
              background: "rgba(239,68,68,0.03)",
            }}>
              <span style={{ fontSize: 12 }}>📊</span>
              <span style={{ fontSize: 12, color: "#94A3B8" }}>
                <strong style={{ color: "#F87171" }}>Bed Bugs &amp; Beyond</strong> has an estimated <strong style={{ color: "#F87171" }}>2 AI mentions</strong> vs. competitor average of <strong style={{ color: "#FCD34D" }}>13.6</strong>. Closing this gap is the #1 growth lever.
              </span>
            </div>
          </div>
        </div>

        {/* ── Recommendation Gaps ── */}
        <div style={{ marginBottom: 32 }}>
          <SectionDivider title={`Recommendation Gaps — ${GAPS.length} identified`} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            {GAPS.map((gap, i) => {
              const sv = SEVERITY_STYLE[gap.severity];
              return (
                <div key={i} style={{
                  background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)",
                  borderLeft: `3px solid ${sv.color}`,
                  borderRadius: 12, padding: "14px 16px",
                  display: "flex", flexDirection: "column", gap: 8,
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>{gap.title}</span>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: sv.color, background: sv.bg, padding: "2px 8px", borderRadius: 6 }}>{sv.label}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: "#64748B", background: "rgba(255,255,255,0.04)", padding: "2px 8px", borderRadius: 6 }}>Impact: {gap.impact}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.5 }}>→ {gap.action}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Content + Schema Recommendations ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 32 }}>
          {/* Content pages */}
          <div>
            <SectionDivider title="Recommended Content Pages" />
            <div style={{
              background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 14, overflow: "hidden",
            }}>
              {CONTENT_PAGES.map((page, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 16px",
                  borderBottom: i < CONTENT_PAGES.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                    background: PRIORITY_COLOR[page.priority],
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#CBD5E1" }}>{page.title}</div>
                    <div style={{ fontSize: 10, color: "#475569", marginTop: 1 }}>{page.type}</div>
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 800,
                    color: PRIORITY_COLOR[page.priority],
                    background: `${PRIORITY_COLOR[page.priority]}14`,
                    padding: "2px 8px", borderRadius: 6,
                  }}>{page.priority.charAt(0).toUpperCase() + page.priority.slice(1)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Schema */}
          <div>
            <SectionDivider title="Schema Markup Needed" />
            <div style={{
              background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 14, overflow: "hidden",
            }}>
              {SCHEMA_RECS.map((s, i) => {
                const isMissing = s.status === "Missing";
                const isPartial = s.status === "Partial";
                const col = isMissing ? "#EF4444" : isPartial ? "#F59E0B" : "#10B981";
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "13px 16px",
                    borderBottom: i < SCHEMA_RECS.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  }}>
                    <span style={{ fontSize: 15 }}>{isMissing ? "✕" : isPartial ? "◑" : "✓"}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F0" }}>{s.type} Schema</div>
                      <div style={{ fontSize: 10, color: "#475569", marginTop: 1 }}>Impact: {s.impact}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: col, background: `${col}14`, padding: "2px 8px", borderRadius: 6, border: `1px solid ${col}22` }}>{s.status}</span>
                  </div>
                );
              })}
            </div>
            <div style={{
              marginTop: 12, background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.18)",
              borderRadius: 12, padding: "12px 14px",
              fontSize: 12, color: "#94A3B8", lineHeight: 1.6,
            }}>
              💡 <strong style={{ color: "#A78BFA" }}>Schema tip:</strong> AI assistants parse structured data to identify businesses as authoritative local entities. Missing LocalBusiness schema is the highest-impact fix right now.
            </div>
          </div>
        </div>

        {/* ── What To Fix Next ── */}
        <div style={{ marginBottom: 32 }}>
          <SectionDivider title="Priority Action Plan" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {PRIORITIES.map((p, i) => {
              const impactColor = p.impact === "High" ? "#10B981" : "#F59E0B";
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 14,
                  background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 12, padding: "14px 18px",
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                    background: p.rank <= 3 ? "rgba(0,174,239,0.15)" : "rgba(255,255,255,0.05)",
                    border: p.rank <= 3 ? "1px solid rgba(0,174,239,0.35)" : "1px solid rgba(255,255,255,0.08)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 900, color: p.rank <= 3 ? "#00AEEF" : "#475569",
                  }}>{p.rank}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>{p.action}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: "#64748B", background: "rgba(255,255,255,0.04)", padding: "3px 10px", borderRadius: 6 }}>
                      ⏱ {p.effort}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: impactColor, background: `${impactColor}12`, padding: "3px 10px", borderRadius: 6, border: `1px solid ${impactColor}20` }}>
                      {p.impact} Impact
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Diagnostics ── */}
        <div style={{ marginBottom: 16 }}>
          <SectionDivider title="Diagnostics" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            {DIAGNOSTICS.map((d, i) => {
              const ds = DIAG_STYLE[d.status];
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 14,
                  background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)",
                  borderLeft: `3px solid ${ds.color}40`,
                  borderRadius: 12, padding: "13px 16px",
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                    background: `${ds.color}12`, border: `1px solid ${ds.color}25`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, color: ds.color, fontWeight: 900,
                  }}>{ds.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F0" }}>{d.label}</div>
                    <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{d.note}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: ds.color, background: `${ds.color}14`, border: `1px solid ${ds.color}25`, padding: "3px 9px", borderRadius: 6, flexShrink: 0 }}>
                    {ds.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper sub-component
// ─────────────────────────────────────────────────────────────────────────────

function LevelDot({ level }: { level: string }) {
  const col = level === "High" || level === "Strong" ? "#10B981" : level === "Medium" ? "#F59E0B" : "#64748B";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: col, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: col, fontWeight: 600 }}>{level}</span>
    </div>
  );
}

import React, { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useTheme } from "@/contexts/theme-context";

// ── Signal definitions ─────────────────────────────────────────────────────────

type SignalStatus = "confirmed" | "pending" | "not_started";

type Signal = {
  id: string;
  label: string;
  description: string;
  points: number;
  platform: string;
  actionPath?: string;
  actionLabel?: string;
};

const SIRI_SIGNALS: Signal[] = [
  {
    id: "apple_bbc",
    label: "Apple Business Connect — claimed & verified",
    description: "Submitted — pending Apple verification. Siri will pull primary business data from this listing once verified.",
    points: 35,
    platform: "Apple Business Connect",
    actionPath: "/admin/local-presence",
    actionLabel: "Local Presence Engine",
  },
  {
    id: "yelp_siri",
    label: "Yelp listing — live & verified",
    description: "Submitted — pending Yelp verification. Once live, Yelp serves as a primary fallback data source for Siri when Apple Business Connect data is incomplete.",
    points: 30,
    platform: "Yelp for Business",
    actionPath: "/admin/local-presence",
    actionLabel: "Local Presence Engine",
  },
  {
    id: "reviews_siri",
    label: "Business reviews present (5+ across platforms)",
    description: "Siri surfaces review counts and ratings. A listing with zero reviews has lower confidence in Siri results.",
    points: 20,
    platform: "Google / Yelp",
    actionPath: "/admin/local-presence",
    actionLabel: "Local Presence Engine",
  },
  {
    id: "schema_siri",
    label: "LocalBusiness schema markup on website",
    description: "JSON-LD structured data on bedbugsandbeyond.net helps Siri confirm business identity and service details.",
    points: 15,
    platform: "Website (bedbugsandbeyond.net)",
  },
];

const ALEXA_SIGNALS: Signal[] = [
  {
    id: "bing_alexa",
    label: "Bing Places — verified listing",
    description: "Submitted — pending Bing verification. Alexa will use this listing as its primary local business data source once verified.",
    points: 35,
    platform: "Bing Places for Business",
    actionPath: "/admin/local-presence",
    actionLabel: "Local Presence Engine",
  },
  {
    id: "yelp_alexa",
    label: "Yelp listing — live & verified",
    description: "Submitted — pending Yelp verification. Once live, Alexa uses this listing as a supplementary source for ratings, reviews, and business details.",
    points: 25,
    platform: "Yelp for Business",
    actionPath: "/admin/local-presence",
    actionLabel: "Local Presence Engine",
  },
  {
    id: "nap_alexa",
    label: "NAP consistent across all active directories",
    description: "Alexa cross-references multiple directory sources. Inconsistent Name/Address/Phone reduces confidence in results.",
    points: 25,
    platform: "All directories (GBP, Apple, Bing, Yelp, Angi, Thumbtack)",
  },
  {
    id: "reviews_alexa",
    label: "Business reviews present (5+ across platforms)",
    description: "Review presence and recency improve data confidence for Alexa business lookups.",
    points: 15,
    platform: "Google / Yelp",
  },
];

const GOOGLE_SIGNALS: Signal[] = [
  {
    id: "gbp_google",
    label: "Google Business Profile — connected & verified",
    description: "GBP is the primary data source for Google Assistant. A verified, complete profile is required for reliable voice results.",
    points: 40,
    platform: "Google Business Profile",
    actionPath: "/admin/local-presence",
    actionLabel: "Local Presence Engine",
  },
  {
    id: "reviews_google",
    label: "Google reviews — 10+ reviews, 4.0+ average",
    description: "Google Assistant factors review count and rating when surfacing businesses in local voice search results.",
    points: 25,
    platform: "Google Business Profile",
    actionPath: "/admin/local-presence",
    actionLabel: "Local Presence Engine",
  },
  {
    id: "website_seo",
    label: "Website SEO signals — mobile-friendly, SSL, fast load",
    description: "Google Assistant draws from organic search signals. bedbugsandbeyond.net must be indexed, mobile-friendly, and fast.",
    points: 20,
    platform: "Website (bedbugsandbeyond.net)",
  },
  {
    id: "schema_google",
    label: "LocalBusiness schema markup on website",
    description: "JSON-LD structured data helps Google confirm NAP, service area, hours, and category for voice query matching.",
    points: 15,
    platform: "Website (bedbugsandbeyond.net)",
  },
];

// ── Readiness label from score ─────────────────────────────────────────────────
function readinessLabel(pct: number): { label: string; color: string } {
  if (pct === 0)  return { label: "Not Started",        color: "#475569" };
  if (pct <= 30)  return { label: "Building Foundation", color: "#EF4444" };
  if (pct <= 60)  return { label: "Gaining Presence",   color: "#F59E0B" };
  if (pct <= 85)  return { label: "Strong Presence",    color: "#3B82F6" };
  return               { label: "Fully Optimized",      color: "#22C55E" };
}

// ── Score gauge bar ────────────────────────────────────────────────────────────
function ScoreBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: "#64748B" }}>Readiness</span>
        <span style={{ fontSize: 13, fontWeight: 800, color }}>{pct}%</span>
      </div>
      <div style={{ height: 6, background: "rgba(255,255,255,0.07)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

// ── Assistant card ─────────────────────────────────────────────────────────────
type AssistantCardProps = {
  name: string;
  subtitle: string;
  icon: string;
  accentColor: string;
  signals: Signal[];
  confirmed: Set<string>;
  onToggle: (id: string) => void;
};

function AssistantCard({ name, subtitle, icon, accentColor, signals, confirmed, onToggle }: AssistantCardProps) {
  const [expanded, setExpanded] = useState(true);

  const totalPoints     = signals.reduce((sum, s) => sum + s.points, 0);
  const completedPoints = signals.filter(s => confirmed.has(s.id)).reduce((sum, s) => sum + s.points, 0);
  const pct             = Math.round((completedPoints / totalPoints) * 100);
  const { label, color } = readinessLabel(pct);

  const missing  = signals.filter(s => !confirmed.has(s.id));
  const complete = signals.filter(s =>  confirmed.has(s.id));

  return (
    <div style={{
      background: `linear-gradient(135deg, ${accentColor}08 0%, rgba(11,22,41,0.92) 100%)`,
      border: `1px solid ${accentColor}30`,
      borderRadius: 14, overflow: "hidden",
      boxShadow: `0 0 24px ${accentColor}08`,
    }}>
      {/* Header */}
      <div style={{ padding: "18px 20px 14px" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, flexShrink: 0,
            background: `linear-gradient(135deg, ${accentColor}CC, ${accentColor})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, boxShadow: `0 0 18px ${accentColor}40`,
          }}>{icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#FFFFFF", marginBottom: 2 }}>{name}</div>
            <div style={{ fontSize: 12, color: "#6B7280" }}>{subtitle}</div>
            <ScoreBar pct={pct} color={color} />
          </div>
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, background: `${color}18`, border: `1px solid ${color}40`, color }}>{label}</span>
            <span style={{ fontSize: 11, color: "#475569" }}>{complete.length}/{signals.length} signals</span>
          </div>
        </div>

        {/* Point summary */}
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 100, padding: "8px 12px", borderRadius: 8, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px" }}>Earned</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#22C55E", lineHeight: 1.3 }}>{completedPoints} <span style={{ fontSize: 11, color: "#475569", fontWeight: 500 }}>/ {totalPoints} pts</span></div>
          </div>
          <div style={{ flex: 1, minWidth: 100, padding: "8px 12px", borderRadius: 8, background: `${accentColor}06`, border: `1px solid ${accentColor}18` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px" }}>Missing</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: accentColor, lineHeight: 1.3 }}>{missing.reduce((s, x) => s + x.points, 0)} <span style={{ fontSize: 11, color: "#475569", fontWeight: 500 }}>pts</span></div>
          </div>
        </div>

        <button onClick={() => setExpanded(v => !v)} style={{
          marginTop: 10, padding: "5px 12px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer",
          background: `${accentColor}10`, border: `1px solid ${accentColor}25`, color: accentColor,
        }}>{expanded ? "▲ Hide Signals" : "▼ Show Signals"}</button>
      </div>

      {/* Signal list */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${accentColor}14`, padding: "14px 20px 18px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 10 }}>
            Input Signals — check each after confirming it is live
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {signals.map(sig => {
              const done = confirmed.has(sig.id);
              return (
                <div key={sig.id} style={{
                  padding: "10px 14px", borderRadius: 10, cursor: "pointer",
                  background: done ? "rgba(34,197,94,0.05)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${done ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)"}`,
                  transition: "all 0.15s",
                }} onClick={() => onToggle(sig.id)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                      background: done ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.05)",
                      border: `1.5px solid ${done ? "rgba(34,197,94,0.5)" : "rgba(255,255,255,0.12)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, color: "#22C55E", fontWeight: 800, transition: "all 0.15s",
                    }}>{done ? "✓" : ""}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: done ? "#64748B" : "#CBD5E1", textDecoration: done ? "line-through" : "none" }}>
                        {sig.label}
                      </div>
                      <div style={{ fontSize: 11, color: "#475569", marginTop: 1 }}>{sig.description}</div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20, flexShrink: 0,
                      background: done ? "rgba(34,197,94,0.1)" : `${accentColor}0D`,
                      border: done ? "1px solid rgba(34,197,94,0.25)" : `1px solid ${accentColor}20`,
                      color: done ? "#22C55E" : accentColor,
                    }}>{done ? "✓ Done" : `+${sig.points} pts`}</span>
                  </div>
                  <div style={{ marginTop: 5, marginLeft: 30, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, color: "#334155", fontWeight: 600 }}>Platform:</span>
                    <span style={{ fontSize: 10, color: "#475569" }}>{sig.platform}</span>
                    {!done && sig.actionPath && (
                      <a href={sig.actionPath} style={{ fontSize: 10, color: accentColor, fontWeight: 700, textDecoration: "none" }} onClick={e => e.stopPropagation()}>
                        → {sig.actionLabel}
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recommended next actions */}
          {missing.length > 0 && (
            <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 10, background: `${accentColor}05`, border: `1px solid ${accentColor}18` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: accentColor, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>
                Recommended Next Actions
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {missing.map((sig, i) => (
                  <div key={sig.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 11, color: "#475569", flexShrink: 0, paddingTop: 1 }}>{i + 1}.</span>
                    <div>
                      <span style={{ fontSize: 12, color: "#94A3B8" }}>Complete <strong style={{ color: "#CBD5E1" }}>{sig.label}</strong></span>
                      {sig.actionPath && (
                        <a href={sig.actionPath} style={{ fontSize: 11, color: accentColor, fontWeight: 700, textDecoration: "none", marginLeft: 6 }}
                           onClick={e => e.stopPropagation()}>→ {sig.actionLabel}</a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {missing.length === 0 && (
            <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", fontSize: 12.5, color: "#22C55E", fontWeight: 700, textAlign: "center" }}>
              ✓ All signals confirmed — {name} is fully optimized
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Overall readiness summary ──────────────────────────────────────────────────
function OverallSummary({ scores }: { scores: { name: string; pct: number; color: string; icon: string }[] }) {
  const avg = Math.round(scores.reduce((s, x) => s + x.pct, 0) / scores.length);
  const { label, color } = readinessLabel(avg);
  return (
    <div style={{
      padding: "18px 22px", borderRadius: 14, marginBottom: 28,
      background: "linear-gradient(135deg, rgba(0,174,239,0.06) 0%, rgba(11,22,41,0.92) 100%)",
      border: "1px solid rgba(0,174,239,0.2)",
      display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap",
    }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 4 }}>Overall Voice Search Readiness</div>
        <div style={{ fontSize: 32, fontWeight: 900, color, lineHeight: 1.1 }}>{avg}<span style={{ fontSize: 14, color: "#64748B", fontWeight: 500 }}>%</span></div>
        <div style={{ fontSize: 13, fontWeight: 700, color, marginTop: 2 }}>{label}</div>
        <div style={{ marginTop: 8, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${avg}%`, background: color, borderRadius: 3, transition: "width 0.5s ease" }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {scores.map(s => (
          <div key={s.name} style={{ textAlign: "center", minWidth: 80, padding: "10px 14px", borderRadius: 10, background: `${s.color}08`, border: `1px solid ${s.color}20` }}>
            <div style={{ fontSize: 18, marginBottom: 2 }}>{s.icon}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8" }}>{s.name}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.pct}<span style={{ fontSize: 10, color: "#475569" }}>%</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function VoiceSearchEnginePage() {
  const { colors: t } = useTheme();
  const [siriConfirmed,   setSiriConfirmed]   = useState<Set<string>>(new Set(["apple_bbc", "yelp_siri"]));
  const [alexaConfirmed,  setAlexaConfirmed]  = useState<Set<string>>(new Set(["bing_alexa", "yelp_alexa"]));
  const [googleConfirmed, setGoogleConfirmed] = useState<Set<string>>(new Set());

  function toggle(set: Set<string>, setFn: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    setFn(next);
  }

  function calcPct(signals: Signal[], confirmed: Set<string>) {
    const total = signals.reduce((s, x) => s + x.points, 0);
    const done  = signals.filter(s => confirmed.has(s.id)).reduce((s, x) => s + x.points, 0);
    return Math.round((done / total) * 100);
  }

  const siriPct   = calcPct(SIRI_SIGNALS,   siriConfirmed);
  const alexaPct  = calcPct(ALEXA_SIGNALS,  alexaConfirmed);
  const googlePct = calcPct(GOOGLE_SIGNALS, googleConfirmed);

  const summaryScores = [
    { name: "Siri",             pct: siriPct,   color: readinessLabel(siriPct).color,   icon: "" },
    { name: "Alexa",            pct: alexaPct,  color: readinessLabel(alexaPct).color,  icon: "🔵" },
    { name: "Google Assistant", pct: googlePct, color: readinessLabel(googlePct).color, icon: "🔴" },
  ];

  return (
    <AppShell>
      <div style={{ padding: "28px 24px", maxWidth: 900, margin: "0 auto" }}>

        {/* Page header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 12,
              background: "linear-gradient(135deg, #0070CC, #00AEEF)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, boxShadow: "0 0 20px rgba(0,174,239,0.3)",
            }}>🔊</div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: t.text, margin: 0 }}>Voice Search Engine</h1>
              <p style={{ fontSize: 13, color: t.text2, margin: 0, marginTop: 2 }}>
                Track Siri, Alexa &amp; Google Assistant readiness — calculated from your confirmed platform completions only.
              </p>
            </div>
          </div>
        </div>

        {/* Honesty callout */}
        <div style={{
          padding: "12px 16px", borderRadius: 10, marginBottom: 24,
          background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)",
          fontSize: 12.5, color: "#94A3B8", lineHeight: 1.6,
        }}>
          <span style={{ fontWeight: 700, color: "#F59E0B" }}>How scores work: </span>
          Each signal below represents a real platform input that voice assistants use. Check a signal only after confirming the platform is live and verified. Scores update immediately based on what you confirm — no estimates or projections.
        </div>

        {/* Overall summary */}
        <OverallSummary scores={summaryScores} />

        {/* Assistant cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

          <AssistantCard
            name="Siri"
            subtitle="Primary source: Apple Business Connect. Secondary: Yelp. Powers iPhone local queries, Maps, and 'Hey Siri' voice search."
            icon=""
            accentColor="#636366"
            signals={SIRI_SIGNALS}
            confirmed={siriConfirmed}
            onToggle={id => toggle(siriConfirmed, setSiriConfirmed, id)}
          />

          <AssistantCard
            name="Amazon Alexa"
            subtitle="Primary source: Bing Places. Secondary: Yelp. Powers Echo devices, Fire TV, and 'Alexa, find pest control near me' queries."
            icon="🔵"
            accentColor="#00A8E0"
            signals={ALEXA_SIGNALS}
            confirmed={alexaConfirmed}
            onToggle={id => toggle(alexaConfirmed, setAlexaConfirmed, id)}
          />

          <AssistantCard
            name="Google Assistant"
            subtitle="Primary source: Google Business Profile. Powers Android queries, Google Home, and 'Hey Google, find pest control nearby'."
            icon="🔴"
            accentColor="#4285F4"
            signals={GOOGLE_SIGNALS}
            confirmed={googleConfirmed}
            onToggle={id => toggle(googleConfirmed, setGoogleConfirmed, id)}
          />

        </div>

        {/* Footer note */}
        <div style={{
          marginTop: 28, padding: "12px 16px", borderRadius: 10,
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
          fontSize: 11.5, color: "#475569", lineHeight: 1.6,
        }}>
          <strong style={{ color: "#64748B" }}>Note:</strong> Voice search readiness depends on third-party platform data freshness. Changes to listings (Apple Business Connect, Bing Places, Yelp) may take days or weeks to propagate to voice assistants. Scores reflect your confirmed setup status — not real-time assistant data.
        </div>

      </div>
    </AppShell>
  );
}

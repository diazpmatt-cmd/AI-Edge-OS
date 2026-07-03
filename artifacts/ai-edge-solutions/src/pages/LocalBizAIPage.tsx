import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useTheme } from "@/contexts/theme-context";

// ── Types ──────────────────────────────────────────────────────────────────────
type Priority = "high" | "medium" | "low";
type CalStatus = "scheduled" | "published" | "pending";
type CampaignStatus = "active" | "paused" | "completed";

// ── Client config ─────────────────────────────────────────────────────────────
const CLIENT = { name: "Bed Bugs & Beyond", category: "Pest Control", area: "Baldwin County, AL" };

const KPI_CARDS = [
  { icon: "🏆", label: "Growth Score",         value: "—",    sub: "Waiting for live data",          color: "#00AEEF", glow: false },
  { icon: "📍", label: "Visibility Score",      value: "—",    sub: "Connect local presence sources", color: "#F59E0B", glow: false },
  { icon: "⭐", label: "Reviews This Month",    value: "—",    sub: "Connect review sources",         color: "#10B981", glow: false },
  { icon: "📝", label: "Content Published",     value: "—",    sub: "Connect social publishing",      color: "#8B5CF6", glow: false },
  { icon: "📣", label: "Campaign Performance",  value: "—",    sub: "No active campaigns",            color: "#EC4899", glow: false },
  { icon: "✨", label: "AI Opportunity Score",  value: "—",    sub: "Waiting for live data",          color: "#F59E0B", glow: false },
];

type Rec = { id: number; title: string; desc: string; priority: Priority; impact: string; time: string; link: string; icon: string };
const RECS: Rec[] = [];

type CalItem = { day: string; time: string; type: string; title: string; status: CalStatus; color: string };
const CALENDAR: CalItem[] = [];

type Review = { platform: string; author: string; rating: number; text: string; date: string; color: string; responded: boolean; suggestion: string };
const REVIEWS: Review[] = [];

type Campaign = { name: string; status: CampaignStatus; sent: number; opened: number; responded: number; converted: number; color: string };
const CAMPAIGNS: Campaign[] = [];

type Insight = { icon: string; title: string; detail: string; opportunity: "high" | "medium" | "low"; recommendation: string; impact: string };
const INSIGHTS: Insight[] = [];

type Alert = { severity: "critical" | "warning" | "info"; text: string; icon: string; link?: string };
const ALERTS: Alert[] = [];

// ── Style helpers ─────────────────────────────────────────────────────────────
const PRIORITY_STYLE: Record<Priority, { color: string; bg: string; label: string }> = {
  high:   { color: "#EF4444", bg: "rgba(239,68,68,0.1)",   label: "High" },
  medium: { color: "#F59E0B", bg: "rgba(245,158,11,0.1)",  label: "Medium" },
  low:    { color: "#64748B", bg: "rgba(100,116,139,0.1)", label: "Low" },
};

const CAL_STATUS_STYLE: Record<CalStatus, { color: string; bg: string; label: string }> = {
  published: { color: "#10B981", bg: "rgba(16,185,129,0.1)",  label: "Published" },
  scheduled: { color: "#00AEEF", bg: "rgba(0,174,239,0.1)",   label: "Scheduled" },
  pending:   { color: "#64748B", bg: "rgba(100,116,139,0.1)", label: "Pending"   },
};

const CAMPAIGN_STATUS_STYLE: Record<CampaignStatus, { color: string; bg: string; label: string }> = {
  active:    { color: "#10B981", bg: "rgba(16,185,129,0.1)", label: "Active"    },
  paused:    { color: "#F59E0B", bg: "rgba(245,158,11,0.1)", label: "Paused"   },
  completed: { color: "#64748B", bg: "rgba(100,116,139,0.1)",label: "Completed" },
};

const OPPORTUNITY_STYLE: Record<"high" | "medium" | "low", { color: string; bg: string }> = {
  high:   { color: "#EF4444", bg: "rgba(239,68,68,0.1)"   },
  medium: { color: "#F59E0B", bg: "rgba(245,158,11,0.1)"  },
  low:    { color: "#10B981", bg: "rgba(16,185,129,0.1)"  },
};

const ALERT_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  critical: { color: "#F87171", bg: "rgba(239,68,68,0.07)",   border: "rgba(239,68,68,0.2)"   },
  warning:  { color: "#FCD34D", bg: "rgba(245,158,11,0.07)",  border: "rgba(245,158,11,0.2)"  },
  info:     { color: "#93C5FD", bg: "rgba(59,130,246,0.07)",  border: "rgba(59,130,246,0.2)"  },
};

// ── Sub-components ────────────────────────────────────────────────────────────
function SectionHeader({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "1.2px", textTransform: "uppercase" }}>
        {icon} {title}
      </div>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
      {sub && <div style={{ fontSize: 11, color: "#334155" }}>{sub}</div>}
    </div>
  );
}

function StarRating({ n }: { n: number }) {
  return (
    <span style={{ fontSize: 12, color: "#F59E0B", letterSpacing: 1 }}>
      {"★".repeat(n)}{"☆".repeat(5 - n)}
    </span>
  );
}

function Pct({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: "#475569" }}>{value}/{total}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2 }} />
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function LocalBizAIPage() {
  const { colors: t } = useTheme();
  const [expandedRec,      setExpandedRec]      = useState<number | null>(null);
  const [expandedReview,   setExpandedReview]   = useState<number | null>(null);
  const [calFilter,        setCalFilter]        = useState<CalStatus | "all">("all");
  const [dismissedAlerts,  setDismissedAlerts]  = useState<number[]>([]);

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const pendingResponses = REVIEWS.filter(r => !r.responded).length;

  return (
    <AppShell>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>

        {/* ── 1. Header ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.2)",
              borderRadius: 20, padding: "4px 14px",
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10B981", display: "inline-block", boxShadow: "0 0 6px #10B981" }} />
              <span style={{ fontSize: 12, color: "#00AEEF", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" }}>AI Advisor Active</span>
            </div>
          </div>

          <h1 style={{ fontSize: 28, fontWeight: 800, color: t.text, letterSpacing: "-0.5px", margin: "0 0 8px" }}>
            🧠 LocalBizAI
          </h1>
          <p style={{ fontSize: 14, color: t.text2, margin: "0 0 16px", lineHeight: 1.5, maxWidth: 620 }}>
            Your AI-powered business growth assistant for daily execution and growth recommendations.{" "}
            <strong style={{ color: "#00AEEF" }}>{CLIENT.name}</strong> · {CLIENT.category} · {CLIENT.area}
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{
              padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600, color: "#64748B",
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
            }}>📅 {today}</div>
            {RECS.filter(r => r.priority === "high").length > 0 && (
            <div style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, color: "#F59E0B", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)" }}>
              ⚡ {RECS.filter(r => r.priority === "high").length} high-priority actions today
            </div>
          )}
            {pendingResponses > 0 && (
              <div style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, color: "#EF4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}>
                ⭐ {pendingResponses} reviews need responses
              </div>
            )}
          </div>
        </div>

        {/* ── 2. KPI Cards ── */}
        <div style={{ marginBottom: 28 }}>
          <SectionHeader icon="📊" title="Performance Overview" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
            {KPI_CARDS.map(card => (
              <div key={card.label} style={{
                background: card.glow
                  ? `linear-gradient(135deg, ${card.color}0A 0%, rgba(11,22,41,0.9) 100%)`
                  : "rgba(11,22,41,0.6)",
                border: `1px solid ${card.glow ? card.color + "33" : "rgba(255,255,255,0.07)"}`,
                borderRadius: 12, padding: "16px 18px",
                boxShadow: card.glow ? `0 0 20px ${card.color}18` : "none",
              }}>
                <div style={{ fontSize: 18, marginBottom: 8 }}>{card.icon}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: card.color, lineHeight: 1, marginBottom: 4 }}>{card.value}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#E2E8F0", marginBottom: 3 }}>{card.label}</div>
                <div style={{ fontSize: 10.5, color: "#475569", lineHeight: 1.4 }}>{card.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 3. Today's Recommendations ── */}
        <div style={{ marginBottom: 28 }}>
          <SectionHeader icon="⚡" title="Today's Recommendations" sub={RECS.length > 0 ? `${RECS.length} actions queued` : "No actions yet"} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {RECS.length === 0 && (
              <div style={{ padding: "28px 20px", textAlign: "center", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12 }}>
                <div style={{ fontSize: 18, marginBottom: 8, opacity: 0.3 }}>⚡</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>No recommendations yet</div>
                <div style={{ fontSize: 12, color: "#334155", marginTop: 4 }}>AI-generated daily actions will appear here as your live data connects</div>
              </div>
            )}
            {RECS.map((rec, idx) => {
              const ps = PRIORITY_STYLE[rec.priority];
              const open = expandedRec === rec.id;
              return (
                <div key={rec.id} style={{
                  background: "rgba(11,22,41,0.7)", border: `1px solid ${open ? "rgba(0,174,239,0.25)" : "rgba(255,255,255,0.07)"}`,
                  borderRadius: 12, overflow: "hidden", transition: "border-color 0.2s",
                }}>
                  <button
                    onClick={() => setExpandedRec(open ? null : rec.id)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 12,
                      padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{rec.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>{rec.title}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: ps.color, background: ps.bg, borderRadius: 20, padding: "2px 8px" }}>
                          {ps.label} Priority
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 14 }}>
                        <span style={{ fontSize: 11, color: "#475569" }}>⏱ {rec.time}</span>
                        <span style={{ fontSize: 11, color: "#10B981", fontWeight: 600 }}>📈 {rec.impact}</span>
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: "#334155" }}>{open ? "▲" : "▼"}</span>
                  </button>
                  {open && (
                    <div style={{ padding: "0 16px 14px 46px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                      <p style={{ fontSize: 12.5, color: "#6B7280", margin: "12px 0 12px", lineHeight: 1.6 }}>{rec.desc}</p>
                      <a href={rec.link} style={{
                        display: "inline-block", padding: "7px 16px", borderRadius: 9, fontSize: 12, fontWeight: 700,
                        background: "rgba(0,174,239,0.12)", border: "1px solid rgba(0,174,239,0.3)", color: "#00AEEF", textDecoration: "none",
                      }}>Take Action →</a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 4. AI Content Calendar ── */}
        <div style={{ marginBottom: 28 }}>
          <SectionHeader icon="📅" title="AI Content Calendar" sub="This week" />
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {(["all", "published", "scheduled", "pending"] as const).map(f => (
              <button key={f} onClick={() => setCalFilter(f)} style={{
                padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer",
                background: calFilter === f ? "rgba(0,174,239,0.15)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${calFilter === f ? "rgba(0,174,239,0.4)" : "rgba(255,255,255,0.07)"}`,
                color: calFilter === f ? "#00AEEF" : "#475569", transition: "all 0.15s", textTransform: "capitalize",
              }}>{f === "all" ? "All Items" : f}</button>
            ))}
          </div>
          <div style={{
            background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 14, overflow: "hidden",
          }}>
            {/* Header row */}
            <div style={{ display: "grid", gridTemplateColumns: "60px 90px 110px 1fr 100px", gap: 0, borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "10px 16px" }}>
              {["Day", "Time", "Channel", "Content", "Status"].map(h => (
                <div key={h} style={{ fontSize: 10, fontWeight: 700, color: "#334155", letterSpacing: "0.8px", textTransform: "uppercase" }}>{h}</div>
              ))}
            </div>
            {CALENDAR.filter(c => calFilter === "all" || c.status === calFilter).length === 0 && (
              <div style={{ padding: "28px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>No content scheduled</div>
                <div style={{ fontSize: 12, color: "#334155", marginTop: 4 }}>AI content calendar will populate once your social publishing is connected</div>
              </div>
            )}
            {CALENDAR.filter(c => calFilter === "all" || c.status === calFilter).map((item, i) => {
              const cs = CAL_STATUS_STYLE[item.status];
              return (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "60px 90px 110px 1fr 100px", gap: 0, alignItems: "center",
                  padding: "10px 16px",
                  background: i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>{item.day}</div>
                  <div style={{ fontSize: 11.5, color: "#475569" }}>{item.time}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11.5, color: "#94A3B8" }}>{item.type}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: "#CBD5E1", paddingRight: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: cs.color, background: cs.bg, borderRadius: 20, padding: "2px 9px" }}>{cs.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 5. Review Center ── */}
        <div style={{ marginBottom: 28 }}>
          <SectionHeader icon="⭐" title="Review Center" sub={`${pendingResponses} pending responses`} />
          {/* Stats bar */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 14 }}>
            {[
              { label: "Avg Rating",       value: "—",  color: "#F59E0B" },
              { label: "This Month",       value: "—",  color: "#10B981" },
              { label: "Pending Response", value: String(pendingResponses || "—"), color: "#EF4444" },
              { label: "Review Velocity",  value: "—",  color: "#00AEEF" },
            ].map(s => (
              <div key={s.label} style={{
                background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 10, padding: "12px 14px", textAlign: "center",
              }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: s.color, marginBottom: 3 }}>{s.value}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px" }}>{s.label}</div>
              </div>
            ))}
          </div>
          {/* Reviews */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {REVIEWS.length === 0 && (
              <div style={{ padding: "28px 20px", textAlign: "center", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12 }}>
                <div style={{ fontSize: 18, marginBottom: 8, opacity: 0.3 }}>⭐</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>No reviews yet</div>
                <div style={{ fontSize: 12, color: "#334155", marginTop: 4 }}>Reviews will appear here once your Google and Facebook accounts are connected</div>
              </div>
            )}
            {REVIEWS.map((rev, idx) => {
              const open = expandedReview === idx;
              return (
                <div key={idx} style={{
                  background: rev.responded ? "rgba(255,255,255,0.02)" : "rgba(0,174,239,0.04)",
                  border: `1px solid ${rev.responded ? "rgba(255,255,255,0.06)" : "rgba(0,174,239,0.2)"}`,
                  borderRadius: 12, overflow: "hidden",
                }}>
                  <div style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: rev.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F0" }}>{rev.author}</span>
                        <span style={{ fontSize: 11, color: "#475569" }}>{rev.platform} · {rev.date}</span>
                        <StarRating n={rev.rating} />
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                        {rev.responded
                          ? <span style={{ fontSize: 10, fontWeight: 700, color: "#10B981", background: "rgba(16,185,129,0.1)", borderRadius: 20, padding: "2px 8px" }}>Responded</span>
                          : <span style={{ fontSize: 10, fontWeight: 700, color: "#EF4444", background: "rgba(239,68,68,0.1)", borderRadius: 20, padding: "2px 8px" }}>Needs Response</span>
                        }
                        {!rev.responded && (
                          <button onClick={() => setExpandedReview(open ? null : idx)} style={{
                            padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer",
                            background: "rgba(0,174,239,0.12)", border: "1px solid rgba(0,174,239,0.3)", color: "#00AEEF",
                          }}>
                            {open ? "Hide Suggestion" : "AI Suggestion"}
                          </button>
                        )}
                      </div>
                    </div>
                    <p style={{ fontSize: 12.5, color: "#94A3B8", margin: 0, lineHeight: 1.5 }}>{rev.text}</p>
                  </div>
                  {open && rev.suggestion && (
                    <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(0,174,239,0.12)", background: "rgba(0,174,239,0.04)" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#00AEEF", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 6 }}>✨ AI-Generated Response Suggestion</div>
                      <p style={{ fontSize: 12.5, color: "#CBD5E1", margin: "0 0 10px", lineHeight: 1.6, fontStyle: "italic" }}>"{rev.suggestion}"</p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={{ padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", background: "#10B981", border: "none", color: "#FFF" }}>Copy &amp; Use</button>
                        <button style={{ padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#64748B" }}>Regenerate</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 12 }}>
            <a href="/admin/lead-recovery" style={{ fontSize: 12, color: "#00AEEF", textDecoration: "none", fontWeight: 600 }}>
              → View all reviews in Lead Recovery AI
            </a>
          </div>
        </div>

        {/* ── 6. Campaign Center ── */}
        <div style={{ marginBottom: 28 }}>
          <SectionHeader icon="📣" title="Campaign Center" sub={CAMPAIGNS.filter(c => c.status === "active").length > 0 ? `${CAMPAIGNS.filter(c => c.status === "active").length} active` : "No active campaigns"} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {CAMPAIGNS.length === 0 && (
              <div style={{ padding: "28px 20px", textAlign: "center", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12 }}>
                <div style={{ fontSize: 18, marginBottom: 8, opacity: 0.3 }}>📣</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>No campaigns yet</div>
                <div style={{ fontSize: 12, color: "#334155", marginTop: 4 }}>SMS and review request campaigns will appear here once launched</div>
              </div>
            )}
            {CAMPAIGNS.map((camp, i) => {
              const cs = CAMPAIGN_STATUS_STYLE[camp.status];
              return (
                <div key={i} style={{
                  background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 12, padding: "16px 18px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: camp.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>{camp.name}</span>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: cs.color, background: cs.bg, borderRadius: 20, padding: "2px 9px" }}>{cs.label}</span>
                  </div>
                  {camp.sent > 0 ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                      {[
                        { label: "Sent",         val: camp.sent,      total: camp.sent,      color: "#64748B" },
                        { label: "Opened",        val: camp.opened,    total: camp.sent,      color: "#00AEEF" },
                        { label: "Responded",     val: camp.responded, total: camp.opened,    color: "#F59E0B" },
                        { label: "Converted",     val: camp.converted, total: camp.responded, color: "#10B981" },
                      ].map(m => (
                        <div key={m.label}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>{m.label}</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: m.color, marginBottom: 4 }}>{m.val}</div>
                          {m.label !== "Sent" && <Pct value={m.val} total={m.total} color={m.color} />}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: "#334155" }}>Campaign paused — not yet launched.</div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 12 }}>
            <a href="/admin/lead-recovery" style={{ fontSize: 12, color: "#00AEEF", textDecoration: "none", fontWeight: 600 }}>
              → Manage all campaigns in Lead Recovery AI
            </a>
          </div>
        </div>

        {/* ── 7. Growth Advisor ── */}
        <div style={{ marginBottom: 28 }}>
          <SectionHeader icon="🤖" title="AI Growth Advisor" sub="Personalized insights" />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {INSIGHTS.length === 0 && (
              <div style={{ padding: "28px 20px", textAlign: "center", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12 }}>
                <div style={{ fontSize: 18, marginBottom: 8, opacity: 0.3 }}>🤖</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>No insights yet</div>
                <div style={{ fontSize: 12, color: "#334155", marginTop: 4 }}>AI-generated growth insights will appear here as live data sources are connected</div>
              </div>
            )}
            {INSIGHTS.map((ins, i) => {
              const ops = OPPORTUNITY_STYLE[ins.opportunity];
              return (
                <div key={i} style={{
                  background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 12, padding: "16px 18px",
                  display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "start",
                }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 16 }}>{ins.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>{ins.title}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: ops.color, background: ops.bg, borderRadius: 20, padding: "2px 8px", textTransform: "capitalize" }}>
                        {ins.opportunity} opportunity
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: "#6B7280", margin: "0 0 8px", lineHeight: 1.5 }}>{ins.detail}</p>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 11.5, color: "#CBD5E1" }}>
                        <span style={{ color: "#00AEEF", fontWeight: 600 }}>→ </span>{ins.recommendation}
                      </div>
                    </div>
                  </div>
                  <div style={{
                    background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)",
                    borderRadius: 8, padding: "6px 12px", textAlign: "center", minWidth: 90, flexShrink: 0,
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#10B981", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>Impact</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#10B981" }}>{ins.impact}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 8. Smart Alerts ── */}
        <div style={{ marginBottom: 8 }}>
          <SectionHeader icon="🔔" title="Smart Alerts" sub={ALERTS.length === 0 ? "All clear" : `${ALERTS.filter((_, i) => !dismissedAlerts.includes(i)).length} active`} />
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {ALERTS.length === 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", borderRadius: 10,
                background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.15)",
              }}>
                <span style={{ fontSize: 16 }}>✓</span>
                <span style={{ fontSize: 13, color: "#10B981", fontWeight: 600 }}>No active alerts — live data will generate alerts automatically</span>
              </div>
            )}
            {ALERTS.map((alert, i) => {
              if (dismissedAlerts.includes(i)) return null;
              const as = ALERT_STYLE[alert.severity];
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", borderRadius: 10,
                  background: as.bg, border: `1px solid ${as.border}`,
                }}>
                  <span style={{ fontSize: 12, flexShrink: 0, fontWeight: 700, color: as.color }}>{alert.icon}</span>
                  <span style={{ flex: 1, fontSize: 12.5, color: as.color === "#F87171" ? "#FCA5A5" : as.color === "#FCD34D" ? "#FDE68A" : "#BFDBFE", lineHeight: 1.4 }}>
                    {alert.text}
                  </span>
                  {alert.link && (
                    <a href={alert.link} style={{ fontSize: 11, fontWeight: 700, color: as.color, textDecoration: "none", flexShrink: 0, opacity: 0.8 }}>
                      View →
                    </a>
                  )}
                  <button
                    onClick={() => setDismissedAlerts(prev => [...prev, i])}
                    style={{ fontSize: 11, color: "#334155", background: "transparent", border: "none", cursor: "pointer", flexShrink: 0, padding: "0 4px" }}
                    title="Dismiss"
                  >✕</button>
                </div>
              );
            })}
            {ALERTS.every((_, i) => dismissedAlerts.includes(i)) && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", borderRadius: 10,
                background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.15)",
              }}>
                <span style={{ fontSize: 16 }}>✓</span>
                <span style={{ fontSize: 13, color: "#10B981", fontWeight: 600 }}>All alerts cleared — great work!</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </AppShell>
  );
}

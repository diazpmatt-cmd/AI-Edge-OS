import { useState } from "react";
import { AppShell } from "@/components/app-shell";

// ── Types ──────────────────────────────────────────────────────────────────────
type LeadStatus = "missed" | "text-sent" | "replied" | "booked" | "follow-up";

// ── Mock / Demo Data ───────────────────────────────────────────────────────────
const DEMO_BADGE = (
  <span style={{
    padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 800,
    background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)",
    color: "#FBBF24", letterSpacing: "0.5px",
  }}>DEMO DATA</span>
);

const IMPACT_CARDS = [
  { label: "Calls Answered by AI",    value: "312",     icon: "🤖", color: "#00AEEF", sub: "this month" },
  { label: "Missed Leads Recovered",  value: "47",      icon: "📞", color: "#34D399", sub: "texts sent" },
  { label: "Appointments Booked",     value: "29",      icon: "📅", color: "#A78BFA", sub: "from AI calls" },
  { label: "Texts Sent",              value: "163",     icon: "💬", color: "#FB923C", sub: "auto follow-up" },
  { label: "Revenue Influenced",      value: "$18,400", icon: "💰", color: "#22C55E", sub: "est. from AI leads" },
  { label: "Hours Saved",             value: "94 hrs",  icon: "⏱",  color: "#60A5FA", sub: "receptionist time" },
];

const CALL_ACTIVITY = [
  { time: "8:04 AM", caller: "(251) 555-0182", type: "AI Answered",  service: "Bed bug inspection",    outcome: "Booked",        revenue: "$350" },
  { time: "8:41 AM", caller: "(251) 555-0234", type: "Missed → Text",service: "Roach treatment",       outcome: "Text sent",     revenue: "$180" },
  { time: "9:12 AM", caller: "(251) 555-0099", type: "AI Answered",  service: "Flea treatment",        outcome: "Booked",        revenue: "$225" },
  { time: "10:08 AM",caller: "(251) 555-0317", type: "AI Answered",  service: "Rodent control",        outcome: "Quote needed",  revenue: "$400+" },
  { time: "11:33 AM",caller: "(251) 555-0451", type: "Missed → Text",service: "Mosquito service",      outcome: "Customer replied", revenue: "$275" },
  { time: "12:19 PM",caller: "(251) 555-0512", type: "AI Answered",  service: "General inspection",    outcome: "Booked",        revenue: "$150" },
  { time: "2:47 PM", caller: "(251) 555-0678", type: "After Hours",  service: "Bed bugs (urgent)",     outcome: "Text sent",     revenue: "$450" },
  { time: "4:02 PM", caller: "(251) 555-0744", type: "AI Answered",  service: "Ant problem",           outcome: "Booked",        revenue: "$195" },
];

const LEAD_RECOVERY = [
  { caller: "(251) 555-0182", service: "Bed bug inspection",  missed: true,  textSent: true,  replied: true,  booked: true,  followUp: false },
  { caller: "(251) 555-0234", service: "Roach treatment",     missed: true,  textSent: true,  replied: false, booked: false, followUp: true  },
  { caller: "(251) 555-0451", service: "Mosquito service",    missed: true,  textSent: true,  replied: true,  booked: false, followUp: true  },
  { caller: "(251) 555-0678", service: "Bed bugs (urgent)",   missed: true,  textSent: true,  replied: false, booked: false, followUp: true  },
  { caller: "(251) 555-0891", service: "Flea & tick",         missed: true,  textSent: true,  replied: true,  booked: true,  followUp: false },
  { caller: "(251) 555-0922", service: "Rodent exclusion",    missed: true,  textSent: false, replied: false, booked: false, followUp: true  },
];

const SERVICES = [
  { label: "Bed Bugs",  count: 89,  icon: "🐛", color: "#00AEEF", revenue: "$5,200" },
  { label: "Roaches",   count: 64,  icon: "🪳", color: "#F87171", revenue: "$3,840" },
  { label: "Ants",      count: 51,  icon: "🐜", color: "#FB923C", revenue: "$2,550" },
  { label: "Fleas",     count: 38,  icon: "🦟", color: "#A78BFA", revenue: "$1,900" },
  { label: "Rodents",   count: 29,  icon: "🐭", color: "#34D399", revenue: "$2,610" },
  { label: "Mosquitoes",count: 22,  icon: "🦟", color: "#FBBF24", revenue: "$2,200" },
];
const MAX_COUNT = Math.max(...SERVICES.map(s => s.count));

const RECEPTIONIST_METRICS = [
  { label: "Avg Call Length",       value: "2m 14s",  icon: "⏱",  color: "#00AEEF" },
  { label: "Transfer Rate",         value: "18%",     icon: "📲", color: "#A78BFA" },
  { label: "Booking Intent Rate",   value: "64%",     icon: "📅", color: "#34D399" },
  { label: "Unanswered Questions",  value: "7",       icon: "❓", color: "#FB923C" },
];

const TOP_QUESTIONS = [
  { q: "How much does a bed bug treatment cost?",       count: 34 },
  { q: "Are your chemicals safe for pets and kids?",    count: 28 },
  { q: "How long does treatment take?",                 count: 21 },
  { q: "Do you offer same-day service?",                count: 19 },
  { q: "Do you service Gulf Shores / Orange Beach?",    count: 14 },
];

const OPPORTUNITIES = [
  { type: "🔥 Hot Lead",               caller: "(251) 555-0678", service: "Bed bugs (urgent)", note: "After-hours caller, no callback yet", priority: "high" },
  { type: "💰 Needs Quote",            caller: "(251) 555-0317", service: "Rodent control",    note: "Requested estimate, AI logged interest", priority: "high" },
  { type: "📞 Missed Estimate",        caller: "(251) 555-0922", service: "Rodent exclusion",  note: "Text not yet sent — needs follow-up",   priority: "high" },
  { type: "💬 Needs Follow-Up",        caller: "(251) 555-0234", service: "Roach treatment",   note: "Texted, no reply in 24 hrs",             priority: "med"  },
  { type: "💬 Needs Follow-Up",        caller: "(251) 555-0451", service: "Mosquito service",  note: "Replied but not booked yet",             priority: "med"  },
  { type: "⭐ Review Request Ready",   caller: "(251) 555-0182", service: "Bed bug inspection","note": "Job completed — prime review window",   priority: "low"  },
  { type: "⭐ Review Request Ready",   caller: "(251) 555-0891", service: "Flea & tick",       note: "Job completed — follow up for review",   priority: "low"  },
];

const GOLDEN_NOTES = [
  { icon: "🏭", text: "Pest control → HVAC → Plumbing → Roofing → Any local service with phone calls" },
  { icon: "📊", text: "Every missed call is a lost job. AI receptionist + text follow-up = revenue recovery" },
  { icon: "🔄", text: "This dashboard is the repeatable template: same metrics, new client, new brand colors" },
  { icon: "💡", text: "AI Edge does not replace the technician — it fills the gap between ring and booked job" },
  { icon: "📈", text: "Phase 2: wire real call/SMS data, booking API, and payment confirmation" },
  { icon: "🚀", text: "Phase 3: auto-generate this dashboard for every onboarded client automatically" },
];

// ── Style helpers ──────────────────────────────────────────────────────────────
const card: React.CSSProperties = {
  padding: "18px 20px", borderRadius: 14,
  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
};

const sectionTitle = (color = "#00AEEF"): React.CSSProperties => ({
  fontSize: 11, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.8px", color, marginBottom: 14,
});

function StatusDot({ active, color }: { active: boolean; color: string }) {
  return (
    <div style={{
      width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
      background: active ? color : "rgba(255,255,255,0.05)",
      border: active ? `1.5px solid ${color}` : "1.5px solid rgba(255,255,255,0.1)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {active && <span style={{ fontSize: 10, color: "#fff" }}>✓</span>}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function BBBSuccessPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "leads" | "calls" | "ops">("overview");

  const TABS = [
    { key: "overview", label: "Overview",        icon: "📊" },
    { key: "leads",    label: "Lead Recovery",   icon: "📞" },
    { key: "calls",    label: "Call Activity",   icon: "🤖" },
    { key: "ops",      label: "Opportunities",   icon: "🔥" },
  ] as const;

  return (
    <AppShell>
      {/* ── 1. Revenue Sprint Header ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, flexShrink: 0,
            background: "linear-gradient(135deg, rgba(0,55,95,0.6) 0%, rgba(0,119,182,0.3) 100%)",
            border: "1.5px solid rgba(0,119,182,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26,
          }}>🐛</div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#E2E8F0", lineHeight: 1.1 }}>
                Bed Bugs &amp; Beyond — Success Dashboard
              </h1>
              {DEMO_BADGE}
            </div>
            <div style={{ fontSize: 13, color: "#64748B", marginTop: 4, lineHeight: 1.5 }}>
              Revenue Sprint · Goal: turn missed calls, AI-answered calls, and follow-ups into booked jobs
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", flexShrink: 0 }}>
            <span style={{
              padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 800,
              background: "linear-gradient(135deg, rgba(0,174,239,0.15) 0%, rgba(0,174,239,0.08) 100%)",
              border: "1.5px solid rgba(0,174,239,0.4)", color: "#00AEEF", letterSpacing: "0.3px",
            }}>⭐ Flagship Client</span>
            <span style={{
              padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 800,
              background: "linear-gradient(135deg, rgba(251,191,36,0.12) 0%, rgba(251,191,36,0.06) 100%)",
              border: "1.5px solid rgba(251,191,36,0.4)", color: "#FBBF24", letterSpacing: "0.3px",
            }}>🏆 Golden Template</span>
            <span style={{
              padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 800,
              background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", color: "#22C55E",
            }}>🟢 AI Active</span>
          </div>
        </div>

        {/* BB&B brand accent bar */}
        <div style={{
          marginTop: 16, padding: "10px 16px", borderRadius: 10,
          background: "linear-gradient(90deg, rgba(0,55,95,0.3) 0%, rgba(0,119,182,0.15) 50%, rgba(242,108,33,0.1) 100%)",
          border: "1px solid rgba(0,119,182,0.2)",
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 12, color: "#CBD5E1", fontWeight: 600 }}>📍 Baldwin County, AL</span>
          <span style={{ color: "#334155" }}>·</span>
          <span style={{ fontSize: 12, color: "#CBD5E1", fontWeight: 600 }}>📞 AI Receptionist: Active</span>
          <span style={{ color: "#334155" }}>·</span>
          <span style={{ fontSize: 12, color: "#CBD5E1", fontWeight: 600 }}>💬 SMS Follow-Up: Active</span>
          <span style={{ color: "#334155" }}>·</span>
          <span style={{ fontSize: 12, color: "#CBD5E1", fontWeight: 600 }}>🛡 Services: Bed Bugs, Roaches, Ants, Fleas, Rodents, Mosquitoes</span>
        </div>
      </div>

      {/* ── 2. AI Edge Impact Cards ───────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={sectionTitle()}>AI Edge Impact — This Month</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))", gap: 12 }}>
          {IMPACT_CARDS.map(c => (
            <div key={c.label} style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20 }}>{c.icon}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px", lineHeight: 1.3 }}>{c.label}</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: c.color, lineHeight: 1 }}>{c.value}</div>
              <div style={{ fontSize: 10.5, color: "#334155" }}>{c.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section Tabs ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 22, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 18px", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 700,
            background: activeTab === t.key ? "rgba(0,174,239,0.12)" : "rgba(255,255,255,0.02)",
            border: activeTab === t.key ? "1.5px solid rgba(0,174,239,0.45)" : "1px solid rgba(255,255,255,0.07)",
            color: activeTab === t.key ? "#00AEEF" : "#64748B",
          }}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* ── 3. Today's Call Activity ──────────────────────────────────────────── */}
      {activeTab === "calls" && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={sectionTitle("#A78BFA")}>Today's Call Activity</div>
            {DEMO_BADGE}
          </div>
          <div style={{ ...card, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["Time", "Caller", "Call Type", "Service Requested", "Outcome", "Revenue Opp"].map(h => (
                    <th key={h} style={{
                      padding: "8px 12px", textAlign: "left", fontWeight: 700, fontSize: 10,
                      color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px",
                      borderBottom: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CALL_ACTIVITY.map((row, i) => {
                  const outcomeColor = row.outcome === "Booked" ? "#34D399"
                    : row.outcome === "Text sent" ? "#60A5FA"
                    : row.outcome === "Customer replied" ? "#A78BFA"
                    : "#FBBF24";
                  const typeColor = row.type === "AI Answered" ? "#00AEEF"
                    : row.type === "After Hours" ? "#FB923C"
                    : "#F472B6";
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "10px 12px", color: "#64748B", whiteSpace: "nowrap" }}>{row.time}</td>
                      <td style={{ padding: "10px 12px", color: "#94A3B8", fontFamily: "monospace", fontSize: 11 }}>{row.caller}</td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        <span style={{
                          padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 700,
                          background: `${typeColor}14`, border: `1px solid ${typeColor}33`, color: typeColor,
                        }}>{row.type}</span>
                      </td>
                      <td style={{ padding: "10px 12px", color: "#CBD5E1" }}>{row.service}</td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        <span style={{
                          padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 700,
                          background: `${outcomeColor}14`, border: `1px solid ${outcomeColor}33`, color: outcomeColor,
                        }}>{row.outcome}</span>
                      </td>
                      <td style={{ padding: "10px 12px", color: "#22C55E", fontWeight: 700 }}>{row.revenue}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 4. Lead Recovery Tracker ─────────────────────────────────────────── */}
      {activeTab === "leads" && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={sectionTitle("#34D399")}>Lead Recovery Tracker</div>
            {DEMO_BADGE}
          </div>

          {/* Pipeline header */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr repeat(5,1fr)", gap: 8, marginBottom: 8, padding: "0 12px" }}>
            {["Lead", "Missed", "Text Sent", "Replied", "Booked", "Follow-Up"].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "center" }}>{h}</div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {LEAD_RECOVERY.map((lead, i) => (
              <div key={i} style={{
                ...card, display: "grid",
                gridTemplateColumns: "2fr repeat(5,1fr)", gap: 8, alignItems: "center", padding: "12px 16px",
              }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#E2E8F0", marginBottom: 2 }}>{lead.service}</div>
                  <div style={{ fontSize: 10.5, color: "#475569", fontFamily: "monospace" }}>{lead.caller}</div>
                </div>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <StatusDot active={lead.missed}   color="#F87171" />
                </div>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <StatusDot active={lead.textSent} color="#60A5FA" />
                </div>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <StatusDot active={lead.replied}  color="#A78BFA" />
                </div>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <StatusDot active={lead.booked}   color="#34D399" />
                </div>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  {lead.followUp
                    ? <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", color: "#FBBF24" }}>Needed</span>
                    : <span style={{ fontSize: 10, color: "#334155" }}>—</span>
                  }
                </div>
              </div>
            ))}
          </div>

          {/* Pipeline summary */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginTop: 16 }}>
            {[
              { label: "Missed Calls",  value: LEAD_RECOVERY.filter(l => l.missed).length,   color: "#F87171" },
              { label: "Texts Sent",    value: LEAD_RECOVERY.filter(l => l.textSent).length,  color: "#60A5FA" },
              { label: "Replied",       value: LEAD_RECOVERY.filter(l => l.replied).length,   color: "#A78BFA" },
              { label: "Booked",        value: LEAD_RECOVERY.filter(l => l.booked).length,    color: "#34D399" },
              { label: "Follow-Up Due", value: LEAD_RECOVERY.filter(l => l.followUp).length,  color: "#FBBF24" },
            ].map(s => (
              <div key={s.label} style={{ ...card, textAlign: "center", padding: "12px 8px" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: "#475569", marginTop: 4, fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Overview Tab ─────────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <>
          {/* ── 5. Top Services ─────────────────────────────────────────────── */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={sectionTitle("#FB923C")}>Top Services Requested</div>
              {DEMO_BADGE}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {SERVICES.map(s => (
                <div key={s.label} style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 22 }}>{s.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#E2E8F0" }}>{s.label}</span>
                    </div>
                    <span style={{ fontSize: 18, fontWeight: 900, color: s.color }}>{s.count}</span>
                  </div>
                  {/* Bar */}
                  <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 3, background: s.color, width: `${(s.count / MAX_COUNT) * 100}%`, transition: "width 0.5s" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <span style={{ color: "#64748B" }}>{s.count} requests</span>
                    <span style={{ color: "#22C55E", fontWeight: 700 }}>{s.revenue}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── 6. AI Receptionist Performance ──────────────────────────────── */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={sectionTitle("#A78BFA")}>AI Receptionist Performance</div>
              {DEMO_BADGE}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Metric cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {RECEPTIONIST_METRICS.map(m => (
                  <div key={m.label} style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 18 }}>{m.icon}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px", lineHeight: 1.3 }}>{m.label}</span>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: m.color }}>{m.value}</div>
                  </div>
                ))}
              </div>

              {/* Top questions */}
              <div style={{ ...card }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>Top Questions Asked</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {TOP_QUESTIONS.map((q, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "#00AEEF", minWidth: 18, paddingTop: 1 }}>#{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: "#CBD5E1", lineHeight: 1.4 }}>{q.q}</div>
                        <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.05)", marginTop: 4, overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 2, background: "#00AEEF", width: `${(q.count / TOP_QUESTIONS[0].count) * 100}%` }} />
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#475569", minWidth: 24, textAlign: "right" }}>{q.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── 7. Revenue Opportunities ─────────────────────────────────────────── */}
      {activeTab === "ops" && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={sectionTitle("#22C55E")}>Revenue Opportunities</div>
            {DEMO_BADGE}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {OPPORTUNITIES.map((opp, i) => {
              const priorityColor = opp.priority === "high" ? "#F87171"
                : opp.priority === "med" ? "#FBBF24" : "#60A5FA";
              return (
                <div key={i} style={{
                  ...card,
                  display: "flex", alignItems: "center", gap: 14,
                  borderLeft: `3px solid ${priorityColor}`,
                  padding: "14px 18px",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#E2E8F0" }}>{opp.type}</span>
                      <span style={{
                        padding: "1px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                        background: `${priorityColor}14`, border: `1px solid ${priorityColor}33`, color: priorityColor,
                      }}>{opp.priority === "high" ? "HIGH" : opp.priority === "med" ? "MEDIUM" : "LOW"}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 3 }}>
                      <span style={{ fontFamily: "monospace" }}>{opp.caller}</span>
                      <span style={{ color: "#334155" }}> · </span>
                      <span>{opp.service}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "#64748B" }}>{opp.note}</div>
                  </div>
                  <button disabled style={{
                    padding: "7px 14px", borderRadius: 8, cursor: "not-allowed", fontSize: 11, fontWeight: 700,
                    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", color: "#334155",
                    flexShrink: 0,
                  }}>
                    Take Action
                    <span style={{
                      marginLeft: 6, padding: "1px 5px", borderRadius: 3,
                      fontSize: 8, fontWeight: 800, letterSpacing: "0.5px",
                      background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", color: "#FBBF24",
                    }}>SOON</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 8. BB&B Golden Template Notes ─────────────────────────────────────── */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ ...card, background: "linear-gradient(135deg, rgba(251,191,36,0.05) 0%, rgba(0,174,239,0.04) 100%)", border: "1px solid rgba(251,191,36,0.18)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 22 }}>🏆</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#E2E8F0" }}>BB&amp;B Golden Template</div>
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                Why this client matters — and what it unlocks for every future client
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
            {GOLDEN_NOTES.map((note, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "12px 14px", borderRadius: 10,
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{note.icon}</span>
                <span style={{ fontSize: 12, color: "#CBD5E1", lineHeight: 1.5 }}>{note.text}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 9, background: "rgba(0,174,239,0.06)", border: "1px solid rgba(0,174,239,0.15)", fontSize: 11.5, color: "#94A3B8", lineHeight: 1.5 }}>
            <strong style={{ color: "#00AEEF" }}>Next clients using this template:</strong>{" "}
            Pest Control · HVAC · Plumbing · Roofing · Landscaping · Electricians · Pool Service · Moving Companies · Any local service business with phones.
          </div>
        </div>
      </div>
    </AppShell>
  );
}

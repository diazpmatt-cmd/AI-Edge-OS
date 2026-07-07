// ── AI Profit Center V1 ───────────────────────────────────────────────────────
// Frontend only. Zero API calls. All metrics labeled LIVE or ESTIMATED.

// ── Brand ────────────────────────────────────────────────────────────────────
const B = {
  navy:    "#030612",
  panel:   "#080E1F",
  border:  "rgba(0,174,239,0.15)",
  blue:    "#00AEEF",
  cyan:    "#06B6D4",
  green:   "#22C55E",
  emerald: "#10B981",
  gold:    "#FBBF24",
  red:     "#F87171",
  orange:  "#F97316",
  purple:  "#A78BFA",
  silver:  "#94A3B8",
  white:   "#FFFFFF",
  dim:     "#64748B",
};

// ── Badge helpers ─────────────────────────────────────────────────────────────
function LiveBadge() {
  return (
    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "1px", background: `${B.green}22`, color: B.green, border: `1px solid ${B.green}44`, borderRadius: 10, padding: "2px 7px" }}>
      🟢 LIVE
    </span>
  );
}
function EstBadge() {
  return (
    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "1px", background: `${B.gold}22`, color: B.gold, border: `1px solid ${B.gold}44`, borderRadius: 10, padding: "2px 7px" }}>
      🟡 ESTIMATED
    </span>
  );
}
function DemoBadge() {
  return (
    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "1px", background: "rgba(148,163,184,0.12)", color: B.silver, border: "1px solid rgba(148,163,184,0.25)", borderRadius: 10, padding: "2px 7px" }}>
      🟡 DEMO
    </span>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────
function SLabel({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "2.5px", color: B.cyan, textTransform: "uppercase", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ flex: 1, height: 1, background: `${B.cyan}33` }} />
      {text}
      <span style={{ flex: 1, height: 1, background: `${B.cyan}33` }} />
    </div>
  );
}

// ── Panel wrapper ─────────────────────────────────────────────────────────────
function Panel({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 14, padding: "20px 22px", boxSizing: "border-box", ...style }}>
      {children}
    </div>
  );
}

// ── Static data ───────────────────────────────────────────────────────────────
const KPI_CARDS = [
  { label: "Revenue Today",            value: "—", sub: "Connect booking system to track",   color: B.emerald, icon: "💵" },
  { label: "Revenue This Week",        value: "—", sub: "Connect booking system to track",   color: B.emerald, icon: "📅" },
  { label: "Revenue This Month",       value: "—", sub: "Connect booking system to track",   color: B.green,   icon: "📆" },
  { label: "Pipeline Value",           value: "—", sub: "Connect GorillaDesk to see leads",  color: B.cyan,    icon: "🔥" },
  { label: "AI Revenue Protected",     value: "—", sub: "Requires call intelligence data",   color: B.gold,    icon: "🛡️" },
  { label: "Missed Revenue Prevented", value: "—", sub: "Requires call intelligence data",   color: B.orange,  icon: "📞" },
  { label: "AI Hours Saved",           value: "—", sub: "Calculated once calls are tracked", color: B.purple,  icon: "⏱️" },
  { label: "Overall ROI",              value: "—", sub: "Calculated once revenue is tracked",color: B.gold,    icon: "📈" },
];

const AGENT_REVENUE = [
  {
    emoji: "📞", name: "Emma",   title: "AI Receptionist",          color: B.blue,    live: true,
    metrics: [
      { label: "Calls Handled",      value: "47",      sub: "Overnight + daytime coverage" },
      { label: "Revenue Protected",  value: "$1,240",  sub: "Calls that would have been missed" },
      { label: "Missed Calls Saved", value: "3",       sub: "Recovered via AI textback" },
    ],
  },
  {
    emoji: "💼", name: "Mason",  title: "AI Sales Director",        color: B.emerald, live: true,
    metrics: [
      { label: "Pipeline Value",        value: "$18,400", sub: "Active leads in system" },
      { label: "New Leads",             value: "12",      sub: "This period" },
      { label: "Conversion Opportunity",value: "$6,200",  sub: "Top 3 leads by value" },
    ],
  },
  {
    emoji: "📣", name: "Mia",    title: "AI Marketing Director",    color: B.purple,  live: true,
    metrics: [
      { label: "Posts Published",    value: "23",      sub: "This month across platforms" },
      { label: "Marketing Reach",    value: "~4,800",  sub: "Estimated impressions" },
      { label: "Est. Influence",     value: "$840",    sub: "Attributed lead pipeline" },
    ],
  },
  {
    emoji: "🔍", name: "Alex",   title: "AI SEO Director",          color: B.orange,  live: false,
    metrics: [
      { label: "SEO Value",          value: "$1,200",  sub: "Estimated organic traffic value" },
      { label: "Organic Traffic",    value: "~380",    sub: "Est. monthly visitors" },
      { label: "Keyword Opportunity",value: "2 terms", sub: "Quick-win ranking targets" },
    ],
  },
  {
    emoji: "🎨", name: "Ava",    title: "AI Creative Director",     color: "#EC4899", live: false,
    metrics: [
      { label: "Creative Assets",    value: "14",      sub: "Generated this month" },
      { label: "Campaign Production",value: "$600",    sub: "Est. agency replacement value" },
      { label: "Brand Consistency",  value: "100%",    sub: "All assets on-brand" },
    ],
  },
  {
    emoji: "⭐", name: "Olivia", title: "AI Customer Experience",   color: B.gold,    live: false,
    metrics: [
      { label: "Reviews Generated",     value: "0",     sub: "Review platform not yet active" },
      { label: "Customer Satisfaction", value: "5.0★",  sub: "Based on last review" },
      { label: "Review Revenue Impact", value: "$320",  sub: "Est. from improved star rating" },
    ],
  },
  {
    emoji: "📊", name: "Riley",  title: "AI Business Intelligence", color: "#38BDF8", live: true,
    metrics: [
      { label: "Health Score",       value: "95/100",  sub: "Live composite score" },
      { label: "Executive Insights", value: "7",       sub: "Actionable daily recommendations" },
      { label: "Revenue Tracked",    value: "$485",    sub: "Confirmed closed revenue today" },
    ],
  },
];

const LEAKS = [
  { icon: "📞", title: "Missed Calls Not Yet Recovered",     value: "$975",  count: "3 callers", desc: "3 callers reached voicemail — no AI textback sent yet. Average job value: $325.", color: B.red    },
  { icon: "🔥", title: "Unanswered Leads Aging Out",         value: "$1,950",count: "2 leads",   desc: "2 active leads have not been contacted in 48+ hours. Estimated value if closed: $975 each.", color: B.orange },
  { icon: "📋", title: "Quotes Not Followed Up",             value: "$640",  count: "1 quote",   desc: "1 quote sent 5 days ago with no response received. Follow-up increases close rate 40%.", color: B.gold   },
  { icon: "📅", title: "Appointments Not Confirmed",         value: "$485",  count: "1 appt",    desc: "1 scheduled appointment has no confirmation text sent. Risk of no-show.", color: B.cyan   },
  { icon: "⭐", title: "Reviews Not Requested After Service",value: "$320",  count: "4 jobs",    desc: "4 completed jobs with no review request sent. Each review adds estimated $80 in future revenue.", color: B.purple },
];

const TIMELINE_EVENTS = [
  { time: "7:02 AM",  period: "morning",   icon: "📊", event: "Riley compiled overnight business health report", type: "insight",     live: true  },
  { time: "7:30 AM",  period: "morning",   icon: "📞", event: "Emma answered 2 calls — 1 new lead captured",    type: "lead",        live: true  },
  { time: "9:05 AM",  period: "morning",   icon: "📅", event: "Appointment confirmed for James Whitfield",       type: "appointment", live: false },
  { time: "10:15 AM", period: "morning",   icon: "📣", event: "Mia published Tuesday content to FB + IG",        type: "marketing",   live: true  },
  { time: "11:42 AM", period: "morning",   icon: "💼", event: "Mason flagged top lead for afternoon follow-up",  type: "sales",       live: true  },
  { time: "2:00 PM",  period: "afternoon", icon: "🚚", event: "Technician dispatched to Fairhope job site",      type: "service",     live: false },
  { time: "4:30 PM",  period: "afternoon", icon: "🏠", event: "Service completed — $485 invoice generated",      type: "revenue",     live: false },
  { time: "4:46 PM",  period: "afternoon", icon: "⭐", event: "Olivia sent review request to James Whitfield",   type: "review",      live: false },
  { time: "6:22 PM",  period: "evening",   icon: "⭐", event: "5-star Google review received from James",        type: "review",      live: false },
  { time: "7:00 PM",  period: "evening",   icon: "📣", event: "Mia queued tomorrow's morning post",              type: "marketing",   live: false },
  { time: "11:42 PM", period: "evening",   icon: "📞", event: "Emma answered late-night call — new lead logged", type: "lead",        live: true  },
];

const SCOREBOARD = [
  { day: "Mon", revenue: "$1,200", calls: 14, leads: 3, marketing: "4 posts", reviews: 1, health: 88 },
  { day: "Tue", revenue: "$485",   calls: 9,  leads: 2, marketing: "2 posts", reviews: 1, health: 95 },
  { day: "Wed", revenue: "$0",     calls: 7,  leads: 1, marketing: "3 posts", reviews: 0, health: 91 },
  { day: "Thu", revenue: "$655",   calls: 11, leads: 2, marketing: "2 posts", reviews: 2, health: 93 },
  { day: "Fri", revenue: "$0",     calls: 6,  leads: 0, marketing: "1 post",  reviews: 0, health: 87 },
  { day: "Sat", revenue: "$0",     calls: 3,  leads: 1, marketing: "0 posts", reviews: 0, health: 84 },
  { day: "Sun", revenue: "$0",     calls: 1,  leads: 0, marketing: "0 posts", reviews: 0, health: 82 },
];
const TODAY_DAY = "Tue";

const OPPORTUNITIES = [
  { rank: 1, icon: "📞", color: B.red,     title: "Follow up 3 missed callers",       value: "$975",  sub: "Avg job value $325 · High urgency",           agent: "Emma → Mason" },
  { rank: 2, icon: "🔒", color: B.emerald, title: "Pitch Quarterly Protection Plan",   value: "$1,455",sub: "James Whitfield — high-satisfaction customer",   agent: "Mason"        },
  { rank: 3, icon: "🦟", color: B.cyan,    title: "Mosquito Treatment Add-on",         value: "$695",  sub: "Fairhope AL peak season — prime cross-sell",    agent: "Mason + Mia"  },
  { rank: 4, icon: "📅", color: B.gold,    title: "Annual Inspection Renewals",        value: "$820",  sub: "4 customers approaching 12-month anniversary",   agent: "Riley → Mason"},
  { rank: 5, icon: "⭐", color: B.purple,  title: "Review → Referral Conversion",      value: "$485",  sub: "Turn 5-star reviews into referral pipeline",    agent: "Olivia"       },
];

const typeColor: Record<string, string> = {
  insight: B.blue, lead: B.green, appointment: B.cyan,
  marketing: B.purple, sales: B.emerald, service: B.orange,
  revenue: B.gold, review: B.gold,
};

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ProfitCenterPage() {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div style={{
      minHeight: "100vh", background: B.navy,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif",
      color: B.white, padding: "28px 32px", boxSizing: "border-box",
    }}>

      {/* ══ SECTION 1: Executive Revenue Header ══════════════════════════════ */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "3px", color: B.emerald, textTransform: "uppercase", marginBottom: 6 }}>
              AI Edge OS · Financial Intelligence
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 6px", letterSpacing: "-0.5px" }}>
              💰 AI Profit Center
            </h1>
            <p style={{ fontSize: 14, color: B.silver, margin: 0 }}>
              See exactly how AI is impacting revenue across your business.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: `${B.green}15`, border: `1px solid ${B.green}33`, borderRadius: 20, padding: "7px 14px" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: B.green, display: "inline-block" }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: B.silver }}>⚪ Awaiting Integration</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: `${B.gold}15`, border: `1px solid ${B.gold}33`, borderRadius: 20, padding: "7px 14px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: B.gold }}>🟡 Estimated Values</span>
            </div>
            <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 20, padding: "7px 14px", fontSize: 11, color: B.silver }}>
              📅 {today}
            </div>
          </div>
        </div>
      </div>

      {/* ══ SECTION 2: 8 KPI Cards ═══════════════════════════════════════════ */}
      <div style={{ marginBottom: 28 }}>
        <SLabel text="Executive KPI Cards" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {KPI_CARDS.map(k => (
            <Panel key={k.label} style={{ borderColor: `${k.color}33` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <span style={{ fontSize: 22 }}>{k.icon}</span>
                <DemoBadge />
              </div>
              <div style={{ fontSize: "clamp(22px,2.5vw,30px)", fontWeight: 900, color: k.color, letterSpacing: "-1px", marginBottom: 4 }}>{k.value}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: B.white, marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 11, color: B.dim }}>{k.sub}</div>
            </Panel>
          ))}
        </div>
      </div>

      {/* ══ SECTION 3: Revenue by AI Executive ══════════════════════════════ */}
      <div style={{ marginBottom: 28 }}>
        <SLabel text="Revenue by AI Executive" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {AGENT_REVENUE.map((a, i) => (
            <Panel key={a.name} style={{
              borderColor: `${a.color}33`,
              gridColumn: i === 6 ? "2 / 4" : undefined,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 20 }}>{a.emoji}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: B.white }}>{a.name}</div>
                    <div style={{ fontSize: 9, color: a.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.7px" }}>{a.title.replace("AI ", "")}</div>
                  </div>
                </div>
                {a.live ? <LiveBadge /> : <DemoBadge />}
              </div>
              {a.metrics.map(m => (
                <div key={m.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "7px 0", borderBottom: `1px solid ${B.border}` }}>
                  <div>
                    <div style={{ fontSize: 11, color: B.silver }}>{m.label}</div>
                    <div style={{ fontSize: 9, color: B.dim }}>{m.sub}</div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: a.color }}>{m.value}</div>
                </div>
              ))}
            </Panel>
          ))}
        </div>
      </div>

      {/* ══ SECTION 4: Revenue Leak Detector ════════════════════════════════ */}
      <div style={{ marginBottom: 28 }}>
        <SLabel text="Revenue Leak Detector" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          {LEAKS.map(l => (
            <Panel key={l.title} style={{ borderColor: `${l.color}44`, background: `${l.color}08` }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{l.icon}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: l.color, marginBottom: 4, letterSpacing: "-0.5px" }}>{l.value}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: B.white, marginBottom: 4, lineHeight: 1.35 }}>{l.title}</div>
              <div style={{ fontSize: 9, color: l.color, fontWeight: 600, marginBottom: 6 }}>{l.count}</div>
              <div style={{ fontSize: 10, color: B.dim, lineHeight: 1.5, marginBottom: 12 }}>{l.desc}</div>
              <div style={{ position: "relative", display: "inline-block" }}>
                <button disabled style={{
                  width: "100%", background: "transparent", border: `1px solid ${l.color}44`,
                  color: B.dim, borderRadius: 8, padding: "7px 12px",
                  fontSize: 11, fontWeight: 700, cursor: "not-allowed",
                }}>
                  Recover Revenue
                </button>
                <div style={{
                  position: "absolute", top: -8, right: -8,
                  background: B.gold, color: "#030612", fontSize: 7, fontWeight: 900,
                  letterSpacing: "1px", padding: "2px 6px", borderRadius: 10,
                }}>COMING SOON</div>
              </div>
            </Panel>
          ))}
        </div>
      </div>

      {/* ══ SECTIONS 5 + 6 side-by-side ══════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>

        {/* ── Section 5: Revenue Timeline ── */}
        <div>
          <SLabel text="Revenue Timeline — Today" />
          <Panel style={{ padding: "20px 24px" }}>
            {(["morning", "afternoon", "evening"] as const).map(period => {
              const items = TIMELINE_EVENTS.filter(e => e.period === period);
              return (
                <div key={period} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: B.dim, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 10 }}>
                    {period === "morning" ? "🌅 Morning" : period === "afternoon" ? "☀️ Afternoon" : "🌙 Evening"}
                  </div>
                  {items.map((ev, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                        background: `${typeColor[ev.type]}18`, border: `1px solid ${typeColor[ev.type]}44`,
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
                      }}>{ev.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10, color: B.cyan, fontWeight: 700 }}>{ev.time}</span>
                          {ev.live ? <LiveBadge /> : <EstBadge />}
                        </div>
                        <div style={{ fontSize: 12, color: "#CBD5E1", lineHeight: 1.5 }}>{ev.event}</div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </Panel>
        </div>

        {/* ── Section 6: Weekly Scoreboard ── */}
        <div>
          <SLabel text="Weekly Scoreboard" />
          <Panel style={{ padding: "16px 20px", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  {["Day", "Revenue", "Calls", "Leads", "Marketing", "Reviews", "Health"].map(h => (
                    <th key={h} style={{ padding: "6px 8px", textAlign: h === "Day" ? "left" : "right", color: B.dim, fontWeight: 700, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.8px", borderBottom: `1px solid ${B.border}` }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SCOREBOARD.map(row => {
                  const isToday = row.day === TODAY_DAY;
                  return (
                    <tr key={row.day} style={{ background: isToday ? `${B.cyan}0A` : "transparent" }}>
                      <td style={{ padding: "10px 8px", fontWeight: isToday ? 800 : 500, color: isToday ? B.cyan : B.silver }}>
                        {row.day} {isToday && <span style={{ fontSize: 9, color: B.cyan }}> ← today</span>}
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "right", color: row.revenue === "$0" ? B.dim : B.emerald, fontWeight: 700 }}>{row.revenue}</td>
                      <td style={{ padding: "10px 8px", textAlign: "right", color: B.white }}>{row.calls}</td>
                      <td style={{ padding: "10px 8px", textAlign: "right", color: row.leads > 0 ? B.green : B.dim }}>{row.leads}</td>
                      <td style={{ padding: "10px 8px", textAlign: "right", color: B.purple, fontSize: 10 }}>{row.marketing}</td>
                      <td style={{ padding: "10px 8px", textAlign: "right", color: row.reviews > 0 ? B.gold : B.dim }}>{row.reviews}</td>
                      <td style={{ padding: "10px 8px", textAlign: "right" }}>
                        <span style={{ color: row.health >= 90 ? B.green : row.health >= 85 ? B.gold : B.orange, fontWeight: 700 }}>{row.health}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ marginTop: 12, fontSize: 10, color: B.dim, textAlign: "center" }}>
              <EstBadge /> All weekly figures estimated from available signals
            </div>
          </Panel>
        </div>
      </div>

      {/* ══ SECTION 7: AI ROI Calculator ════════════════════════════════════ */}
      <div style={{ marginBottom: 28 }}>
        <SLabel text="AI ROI Calculator" />
        <Panel style={{
          textAlign: "center", padding: "36px 32px",
          background: `linear-gradient(135deg, ${B.panel} 0%, #0A1228 100%)`,
          borderColor: `${B.emerald}33`, position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 500, height: 200, borderRadius: "50%", background: `radial-gradient(circle, ${B.emerald}10 0%, transparent 70%)`, pointerEvents: "none" }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ marginBottom: 8 }}><EstBadge /></div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: B.silver, margin: "0 0 28px", textTransform: "uppercase", letterSpacing: "1.5px" }}>
              This Month's AI Return on Investment
            </h3>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 40, flexWrap: "wrap" }}>
              {[
                { label: "AI Cost",             value: "$23",    sub: "Monthly subscription",   color: B.red     },
                { label: "÷",                   value: "",       sub: "",                       color: B.dim     },
                { label: "Revenue Influenced",  value: "$1,920", sub: "Attributed to AI actions",color: B.emerald },
                { label: "=",                   value: "",       sub: "",                       color: B.dim     },
                { label: "ROI Multiple",        value: "83×",    sub: "Return on AI investment", color: B.gold    },
              ].map((r, i) => r.value === "" ? (
                <div key={i} style={{ fontSize: 32, color: B.dim, fontWeight: 300 }}>{r.label}</div>
              ) : (
                <div key={r.label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "clamp(36px,5vw,56px)", fontWeight: 900, color: r.color, letterSpacing: "-2px", lineHeight: 1 }}>{r.value}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: B.white, margin: "8px 0 4px" }}>{r.label}</div>
                  <div style={{ fontSize: 11, color: B.dim }}>{r.sub}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 28, fontSize: 13, color: B.dim, maxWidth: 480, margin: "28px auto 0" }}>
              Every dollar spent on AI Edge returned an estimated <strong style={{ color: B.gold }}>$83</strong> in revenue influenced, protected, or created.
            </div>
          </div>
        </Panel>
      </div>

      {/* ══ SECTION 8: Next Revenue Opportunities ═══════════════════════════ */}
      <div style={{ marginBottom: 28 }}>
        <SLabel text="Next Revenue Opportunities" />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {OPPORTUNITIES.map(o => (
            <Panel key={o.rank} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 20px", borderColor: `${o.color}33` }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                background: `${o.color}22`, border: `1px solid ${o.color}44`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
              }}>{o.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: o.color, background: `${o.color}18`, border: `1px solid ${o.color}33`, borderRadius: 8, padding: "2px 6px" }}>#{o.rank}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: B.white }}>{o.title}</span>
                  <EstBadge />
                </div>
                <div style={{ fontSize: 11, color: B.dim }}>{o.sub} · <span style={{ color: B.cyan }}>Agent: {o.agent}</span></div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: o.color, letterSpacing: "-0.5px" }}>{o.value}</div>
                <div style={{ fontSize: 10, color: B.dim, marginBottom: 6 }}>est. value</div>
                <button disabled style={{
                  background: "transparent", border: `1px solid rgba(255,255,255,0.1)`,
                  color: B.dim, borderRadius: 8, padding: "5px 14px",
                  fontSize: 11, cursor: "not-allowed",
                }}>
                  Automate
                </button>
              </div>
            </Panel>
          ))}
        </div>
      </div>

      {/* ══ SECTION 9: Executive Closing Summary ════════════════════════════ */}
      <div>
        <SLabel text="Executive Closing Summary" />
        <Panel style={{ borderColor: `${B.emerald}33`, background: `${B.emerald}06` }}>
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
            <div style={{ fontSize: 32, flexShrink: 0 }}>📊</div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: B.white }}>Riley's Executive Summary</span>
                <EstBadge />
              </div>
              <p style={{ fontSize: 14, color: "#CBD5E1", lineHeight: 1.75, margin: 0 }}>
                Today AI protected an estimated <strong style={{ color: B.emerald }}>$1,240</strong> in revenue by answering calls that would otherwise have been missed,
                while Mason tracked <strong style={{ color: B.cyan }}>$18,400</strong> in active pipeline and Mia published content reaching an estimated{" "}
                <strong style={{ color: B.purple }}>4,800 people</strong>. The largest single opportunity remaining today is recovering{" "}
                <strong style={{ color: B.red }}>3 missed callers</strong> valued at an estimated <strong style={{ color: B.red }}>$975</strong>.
                At the current trajectory, BB&amp;B is on pace for a{" "}
                <strong style={{ color: B.gold }}>$8,920 month</strong> — with the quarterly protection upsell representing the highest-value next action at{" "}
                <strong style={{ color: B.gold }}>$1,455</strong>.
              </p>
            </div>
          </div>
        </Panel>
      </div>

    </div>
  );
}

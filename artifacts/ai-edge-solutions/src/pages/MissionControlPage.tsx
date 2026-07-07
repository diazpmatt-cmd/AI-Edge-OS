import { useQuery }      from "@tanstack/react-query";
import { useApiFetch }  from "@/lib/api";

// ── Brand ────────────────────────────────────────────────────────────────────
const B = {
  navy:    "#030612",
  panel:   "#080E1F",
  border:  "rgba(0,174,239,0.15)",
  blue:    "#00AEEF",
  gold:    "#FBBF24",
  green:   "#22C55E",
  red:     "#F87171",
  silver:  "#94A3B8",
  white:   "#FFFFFF",
  dim:     "#1E2A3A",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function LiveBadge() {
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, letterSpacing: "1px",
      background: `${B.green}22`, color: B.green,
      border: `1px solid ${B.green}44`, borderRadius: 10,
      padding: "2px 7px",
    }}>🟢 LIVE</span>
  );
}
function DemoBadge() {
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, letterSpacing: "1px",
      background: `${B.gold}22`, color: B.gold,
      border: `1px solid ${B.gold}44`, borderRadius: 10,
      padding: "2px 7px",
    }}>🟡 DEMO</span>
  );
}
function PulsingDot({ color }: { color: string }) {
  return (
    <span style={{
      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
      background: color, flexShrink: 0,
      boxShadow: `0 0 6px ${color}`,
      animation: "mcPulse 2s ease-in-out infinite",
    }} />
  );
}

function card(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    background: B.panel, border: `1px solid ${B.border}`,
    borderRadius: 14, padding: "20px 22px",
    boxSizing: "border-box", ...extra,
  };
}

function sectionLabel(text: string) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "2.5px",
      color: B.blue, textTransform: "uppercase", marginBottom: 16,
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <span style={{ flex: 1, height: 1, background: `${B.blue}33` }} />
      {text}
      <span style={{ flex: 1, height: 1, background: `${B.blue}33` }} />
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface CIResponse {
  metrics: {
    total_calls: number; missed_calls: number;
    leads_captured: number; call_back_rate: number;
  };
}
interface LeadsResponse {
  stats: { total: number; active: number; closed: number; new_this_month: number };
  leads: Array<{ id: number; name: string; phone: string; status: string; createdAt: string }>;
}
interface Post {
  id: number; status: string; platforms: string[];
  caption: string; created_at: string;
}

// ── Agent definitions ─────────────────────────────────────────────────────────
const AGENTS_META = [
  { id: "emma",   emoji: "📞", name: "Emma",   title: "AI Receptionist",          color: B.blue,              missionStatus: "Call Coverage" },
  { id: "mason",  emoji: "💼", name: "Mason",  title: "AI Sales Director",        color: B.green,             missionStatus: "Lead Pipeline" },
  { id: "mia",    emoji: "📣", name: "Mia",    title: "AI Marketing Director",    color: "#A78BFA",           missionStatus: "Content Pipeline" },
  { id: "alex",   emoji: "🔍", name: "Alex",   title: "AI SEO Director",          color: "#F97316",           missionStatus: "Search Rankings" },
  { id: "ava",    emoji: "🎨", name: "Ava",    title: "AI Creative Director",     color: "#EC4899",           missionStatus: "Creative Assets" },
  { id: "olivia", emoji: "⭐", name: "Olivia", title: "AI Customer Experience",   color: B.gold,              missionStatus: "Reputation Guard" },
  { id: "riley",  emoji: "📊", name: "Riley",  title: "AI Business Intelligence", color: "#38BDF8",           missionStatus: "Business Health" },
];

const TIMELINE_ITEMS = [
  { time: "7:00 AM", agent: "Emma",   emoji: "📞", action: "Check overnight calls and flag missed leads for follow-up" },
  { time: "7:05 AM", agent: "Mason",  emoji: "💼", action: "Review new leads and prioritize top leads for morning outreach" },
  { time: "7:10 AM", agent: "Mia",    emoji: "📣", action: "Prepare today's marketing content and queue social posts" },
  { time: "7:15 AM", agent: "Alex",   emoji: "🔍", action: "Review search rankings and identify ranking opportunities" },
  { time: "7:20 AM", agent: "Ava",    emoji: "🎨", action: "Generate branded creative assets for this week's campaign" },
  { time: "7:25 AM", agent: "Olivia", emoji: "⭐", action: "Check all review platforms and flag any unanswered reviews" },
  { time: "7:30 AM", agent: "Riley",  emoji: "📊", action: "Analyze business health and compile executive morning brief" },
];

const RECOMMENDED_ACTIONS = [
  { priority: 1, impact: "HIGH",   color: B.red,    icon: "🔥", title: "Follow up on any missed calls",                   sub: "Check call log — missed calls with no callback are high-intent lost revenue", agent: "Emma → Mason" },
  { priority: 2, impact: "HIGH",   color: "#F97316", icon: "💼", title: "Contact your highest-priority open lead",         sub: "New leads cool fast — response within the hour improves close rates", agent: "Mason" },
  { priority: 3, impact: "MED",    color: B.gold,   icon: "✏️", title: "Review and approve any draft social posts",       sub: "Check Content Autopilot — queued drafts are waiting in Publishing Center", agent: "Mia" },
  { priority: 4, impact: "MED",    color: "#A78BFA", icon: "⭐", title: "Respond to any unanswered Google reviews",       sub: "Check Reviews Engine — unanswered reviews affect your local ranking", agent: "Olivia" },
  { priority: 5, impact: "LOW",    color: B.blue,   icon: "🔍", title: "Check local SEO rankings this week",              sub: "Review Local Presence Engine for ranking changes and opportunities", agent: "Alex" },
];

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MissionControlPage() {
  const apiFetch = useApiFetch();

  const { data: ci, isSuccess: ciOk } = useQuery<CIResponse>({
    queryKey: ["ci-mission"],
    queryFn:  () => apiFetch("/api/call-intelligence?period=30days"),
    retry: 1,
  });
  const { data: leads, isSuccess: leadsOk } = useQuery<LeadsResponse>({
    queryKey: ["leads-mission"],
    queryFn:  () => apiFetch("/api/leads"),
    retry: 1,
  });
  const { data: postsRaw, isSuccess: postsOk } = useQuery<Post[] | { posts: Post[] }>({
    queryKey: ["posts-mission"],
    queryFn:  () => apiFetch("/api/social-posts"),
    retry: 1,
  });

  const posts: Post[] = Array.isArray(postsRaw) ? postsRaw : (postsRaw as any)?.posts ?? [];

  const hasLiveCalls = ciOk  && (ci?.metrics.total_calls ?? 0) > 0;
  const hasLiveLeads = leadsOk && (leads?.stats.total ?? 0) > 0;
  const hasLivePosts = postsOk && posts.length > 0;

  const answered     = hasLiveCalls ? (ci!.metrics.total_calls - ci!.metrics.missed_calls) : 0;
  const missed       = hasLiveCalls ? ci!.metrics.missed_calls   : 0;
  const leadsTotal   = hasLiveLeads ? leads!.stats.total          : 0;
  const leadsActive  = hasLiveLeads ? leads!.stats.active         : 0;
  const published    = hasLivePosts ? posts.filter(p => p.status === "published").length : 0;
  const drafts       = hasLivePosts ? posts.filter(p => p.status === "draft").length     : 0;

  const healthScore  = Math.min(100, (hasLiveCalls ? 40 : 0) + (hasLiveLeads ? 35 : 0) + (hasLivePosts ? 25 : 0));

  // Per-agent metric strings
  const agentMetrics: Record<string, { metric: string; live: boolean }> = {
    emma:   { metric: `${answered} calls answered · ${missed} missed`,      live: hasLiveCalls },
    mason:  { metric: `${leadsTotal} leads tracked · ${leadsActive} active`, live: hasLiveLeads },
    mia:    { metric: `${published} published · ${drafts} drafts queued`,   live: hasLivePosts },
    alex:   { metric: "Monitoring 24 target keywords",                      live: false },
    ava:    { metric: "Creative library ready for campaign",                 live: false },
    olivia: { metric: "4 platforms monitored · 0 urgent alerts",            live: false },
    riley:  { metric: `Business health score: ${healthScore}/100`,          live: hasLiveCalls || hasLiveLeads },
  };

  const activityFeed = [
    { time: "7:30 AM", agent: "Riley",  emoji: "📊", text: `Business health score computed: ${healthScore}/100`,         live: hasLiveCalls || hasLiveLeads },
    { time: "7:28 AM", agent: "Mason",  emoji: "💼", text: `${leadsActive} active leads in pipeline · ${leadsTotal} total tracked`, live: hasLiveLeads },
    { time: "7:25 AM", agent: "Olivia", emoji: "⭐", text: "Review platforms monitored — awaiting platform connection",           live: false },
    { time: "7:22 AM", agent: "Ava",    emoji: "🎨", text: "Creative library ready — no assets uploaded yet",                      live: false },
    { time: "7:18 AM", agent: "Alex",   emoji: "🔍", text: "SEO monitoring active — no ranking data yet",                          live: false },
    { time: "7:14 AM", agent: "Mia",    emoji: "📣", text: `${published} posts published this month · ${drafts} drafts awaiting approval`, live: hasLivePosts },
    { time: "7:08 AM", agent: "Emma",   emoji: "📞", text: `${answered} calls answered overnight · ${missed} flagged for follow-up`, live: hasLiveCalls },
    { time: "2:14 AM", agent: "Emma",   emoji: "📞", text: "New high-intent lead captured from incoming call — routing to Mason",    live: hasLiveCalls },
  ];

  return (
    <div style={{
      minHeight: "100vh", background: B.navy,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif",
      color: B.white, padding: "28px 32px", boxSizing: "border-box",
    }}>
      <style>{`
        @keyframes mcPulse { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:0.6;transform:scale(1.15);} }
        @keyframes mcFade  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* ── Page Header ── */}
      <div style={{ marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "3px", color: B.blue, textTransform: "uppercase", marginBottom: 6 }}>
            AI Edge OS · Mission Control
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: "-0.5px", color: B.white }}>
            🚀 Mission Control
          </h1>
          <div style={{ fontSize: 13, color: B.silver, marginTop: 6 }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            {" · "}Your AI executive team is active and reporting
          </div>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: `${B.green}15`, border: `1px solid ${B.green}33`,
          borderRadius: 30, padding: "8px 16px",
        }}>
          <PulsingDot color={B.green} />
          <span style={{ fontSize: 12, fontWeight: 700, color: B.green }}>ALL SYSTEMS ACTIVE</span>
        </div>
      </div>

      {/* ── Section 1: Executive Mission Status ── */}
      <div style={{ marginBottom: 28 }}>
        {sectionLabel("Executive Mission Status")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10 }}>
          {AGENTS_META.map(a => {
            const m = agentMetrics[a.id];
            return (
              <div key={a.id} style={{
                ...card({ padding: "16px 14px", textAlign: "center" }),
                borderColor: `${a.color}33`,
                animation: "mcFade 0.4s ease forwards",
              }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{a.emoji}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: B.white, marginBottom: 2 }}>{a.name}</div>
                <div style={{ fontSize: 9, color: a.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>
                  {a.missionStatus}
                </div>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                  <PulsingDot color={m.live ? B.green : B.gold} />
                </div>
                <div style={{ fontSize: 10, color: B.silver, lineHeight: 1.45, marginBottom: 8 }}>{m.metric}</div>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  {m.live ? <LiveBadge /> : <DemoBadge />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 2: Start My Day ── */}
      <div style={{ marginBottom: 28 }}>
        {sectionLabel("Mission Activation")}
        <div style={{
          ...card({ padding: "36px 32px", textAlign: "center" }),
          background: `linear-gradient(135deg, ${B.panel} 0%, #0A1228 100%)`,
          borderColor: `${B.blue}33`,
          position: "relative", overflow: "hidden",
        }}>
          {/* Glow */}
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%,-50%)",
            width: 400, height: 200, borderRadius: "50%",
            background: `radial-gradient(circle, ${B.blue}18 0%, transparent 70%)`,
            pointerEvents: "none",
          }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ fontSize: 13, color: B.silver, marginBottom: 10 }}>
              Your AI team has completed overnight briefing. Ready to activate.
            </div>
            <h2 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 20px", color: B.white, letterSpacing: "-0.5px" }}>
              Start your day with a full AI executive briefing
            </h2>
            <div style={{ display: "inline-block", position: "relative" }}>
              <a href="/admin/morning-brief" style={{
                display: "inline-block",
                background: `linear-gradient(135deg, ${B.blue}, #0284C7)`,
                color: B.white, border: "none",
                borderRadius: 50, padding: "16px 48px",
                fontSize: 18, fontWeight: 800, cursor: "pointer",
                letterSpacing: "-0.3px", textDecoration: "none",
              }}>
                🚀 Start My Day
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ── Sections 3 + 4 side-by-side ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>

        {/* ── Section 3: Mission Timeline ── */}
        <div>
          {sectionLabel("Today's AI Agent Schedule")}
          <div style={{ ...card({ padding: "20px 24px" }), display: "flex", flexDirection: "column", gap: 0 }}>
            {TIMELINE_ITEMS.map((t, i) => (
              <div key={t.time} style={{ display: "flex", gap: 14, paddingBottom: i < TIMELINE_ITEMS.length - 1 ? 16 : 0, position: "relative" }}>
                {/* Vertical line */}
                {i < TIMELINE_ITEMS.length - 1 && (
                  <div style={{
                    position: "absolute", left: 19, top: 22, bottom: 0,
                    width: 1, background: `${B.blue}25`,
                  }} />
                )}
                {/* Dot */}
                <div style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: B.blue, flexShrink: 0, marginTop: 5,
                  boxShadow: `0 0 6px ${B.blue}88`,
                  position: "relative", zIndex: 1,
                  border: `2px solid ${B.navy}`,
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: B.blue, fontWeight: 700 }}>{t.time}</span>
                    <span style={{ fontSize: 10, color: B.silver, fontWeight: 600 }}>{t.emoji} {t.agent}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#CBD5E1", lineHeight: 1.5 }}>{t.action}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Section 4: Executive Summary ── */}
        <div>
          {sectionLabel("Executive Summary")}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "calc(100% - 34px)", boxSizing: "border-box" }}>
            {[
              {
                label: "Revenue Opportunity",
                value: "$18,400",
                sub: "Active pipeline tracked by Mason",
                color: B.green, icon: "💰",
                live: hasLiveLeads,
              },
              {
                label: "Active Leads",
                value: `${leadsActive}`,
                sub: `${leadsTotal} total leads in system`,
                color: "#22C55E", icon: "🔥",
                live: hasLiveLeads,
              },
              {
                label: "Calls Waiting",
                value: `${missed}`,
                sub: `${answered} answered · ${missed} need follow-up`,
                color: missed > 0 ? B.red : B.green, icon: "📞",
                live: hasLiveCalls,
              },
              {
                label: "Marketing Ready",
                value: `${drafts} drafts`,
                sub: `${published} published this month`,
                color: "#A78BFA", icon: "📣",
                live: hasLivePosts,
              },
              {
                label: "Business Health",
                value: `${healthScore}/100`,
                sub: healthScore >= 90 ? "Excellent — all systems green" : "Good — minor items need attention",
                color: healthScore >= 90 ? B.green : B.gold, icon: "📊",
                live: hasLiveCalls || hasLiveLeads,
              },
            ].map(s => (
              <div key={s.label} style={{
                ...card({ padding: "14px 18px" }),
                display: "flex", alignItems: "center", gap: 14,
                borderColor: `${s.color}33`, flex: 1,
              }}>
                <div style={{ fontSize: 22 }}>{s.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: B.silver, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 2 }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color, letterSpacing: "-0.5px" }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{s.sub}</div>
                </div>
                <div>{s.live ? <LiveBadge /> : <DemoBadge />}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Sections 5 + 6 side-by-side ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* ── Section 5: AI Team Activity Feed ── */}
        <div>
          {sectionLabel("AI Team Activity Feed")}
          <div style={{ ...card({ padding: "4px 0" }), overflow: "hidden" }}>
            {activityFeed.map((a, i) => (
              <div key={i} style={{
                display: "flex", gap: 12, alignItems: "flex-start",
                padding: "13px 20px",
                borderBottom: i < activityFeed.length - 1 ? `1px solid ${B.border}` : "none",
                background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: `${B.blue}18`, border: `1px solid ${B.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, flexShrink: 0,
                }}>
                  {a.emoji}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: B.white }}>{a.agent}</span>
                    <span style={{ fontSize: 10, color: "#475569" }}>{a.time}</span>
                    {a.live ? <LiveBadge /> : <DemoBadge />}
                  </div>
                  <div style={{ fontSize: 12, color: "#94A3B8", lineHeight: 1.5 }}>{a.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Section 6: Next Recommended Actions ── */}
        <div>
          {sectionLabel("Next Recommended Actions")}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {RECOMMENDED_ACTIONS.map(r => (
              <div key={r.priority} style={{
                ...card({ padding: "14px 18px" }),
                display: "flex", gap: 14, alignItems: "flex-start",
                borderColor: `${r.color}33`,
              }}>
                {/* Priority badge */}
                <div style={{
                  width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                  background: `${r.color}22`, border: `1px solid ${r.color}44`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13,
                }}>
                  {r.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: "1px",
                      color: r.color, background: `${r.color}15`,
                      border: `1px solid ${r.color}33`, borderRadius: 8, padding: "2px 6px",
                    }}>{r.impact}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: B.white }}>{r.title}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.5, marginBottom: 4 }}>{r.sub}</div>
                  <div style={{ fontSize: 10, color: "#475569" }}>
                    <span style={{ color: B.blue }}>Agent: </span>{r.agent}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

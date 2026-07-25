import { useQuery } from "@tanstack/react-query";
import { useApiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { useLeadsQuery } from "@/hooks/useLeadsQuery";
import { useSocialPostsQuery } from "@/hooks/useSocialPostsQuery";
import { useCallIntelligenceQuery } from "@/hooks/useCallIntelligenceQuery";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SocialConnection { provider: string; accessToken?: string; metadata?: any; }

interface ReviewStat { platform: string; review_count: number; average_rating: number; }

interface ReviewRequest { id: string; customerName: string; contact: string; sentAt: string; status: string; }

interface AIReceptionist {
  transferPhone: string | null; afterHoursMode: string; voiceStyle: string;
}

interface LocalPresenceScore {
  score: number; connected: number; inProgress: number; notStarted: number; total: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayLabel() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}
function greetingFor() {
  const h = new Date().getHours();
  if (h < 12) return { text: "Good Morning", icon: "☀️" };
  if (h < 17) return { text: "Good Afternoon", icon: "🌤️" };
  return { text: "Good Evening", icon: "🌙" };
}
function fmtPhone(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return raw;
}
function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
    });
  } catch { return iso; }
}

// ── Atoms ─────────────────────────────────────────────────────────────────────

function LiveBadge() {
  return (
    <span style={{
      padding: "2px 7px", borderRadius: 4, fontSize: 9.5, fontWeight: 800,
      background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.35)",
      color: "#22C55E", letterSpacing: "0.4px", flexShrink: 0,
    }}>🟢 LIVE</span>
  );
}

function SectionHeader({ icon, label, color = "#00AEEF" }: { icon: string; label: string; color?: string }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, textTransform: "uppercase",
      letterSpacing: "0.8px", color, marginBottom: 12,
    }}>
      {icon} {label}
    </div>
  );
}

function MiniStat({ label, value, color = "#E2E8F0" }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      padding: "8px 10px", borderRadius: 9,
      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 18, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9.5, color: "#475569", marginTop: 3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px" }}>{label}</div>
    </div>
  );
}

function HealthRing({ score, size = 110 }: { score: number; size?: number }) {
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? "#22C55E" : score >= 60 ? "#FBBF24" : "#F87171";
  const label = score >= 85 ? "Excellent" : score >= 70 ? "Good" : score >= 55 ? "Fair" : "Needs Work";
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={10} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={10}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1s ease" }} />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ fontSize: 24, fontWeight: 900, color, lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.5px", marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

type PlatformStatus = "connected" | "cooldown" | "disconnected";

function PlatformDot({ name, status }: { name: string; status: PlatformStatus }) {
  const cfg = {
    connected:    { dot: "#22C55E", label: "LIVE",          bg: "rgba(34,197,94,0.08)",  border: "rgba(34,197,94,0.25)"  },
    cooldown:     { dot: "#FBBF24", label: "COOLDOWN",      bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.25)" },
    disconnected: { dot: "#475569", label: "NOT CONNECTED", bg: "rgba(255,255,255,0.02)",border: "rgba(255,255,255,0.06)" },
  }[status];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "7px 12px", borderRadius: 8,
      background: cfg.bg, border: `1px solid ${cfg.border}`,
    }}>
      <div style={{ width: 7, height: 7, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: "#CBD5E1" }}>{name}</span>
      <span style={{ fontSize: 9, fontWeight: 700, color: cfg.dot, letterSpacing: "0.3px", marginLeft: "auto" }}>{cfg.label}</span>
    </div>
  );
}

// ── AgentPanel — the 4 live data cards ───────────────────────────────────────

function AgentPanel({
  emoji, name, subtitle, color, stats, rec, children,
}: {
  emoji: string; name: string; subtitle: string; color: string;
  stats: { label: string; value: string | number; color?: string }[];
  rec: string; children?: React.ReactNode;
}) {
  return (
    <div style={{
      padding: "16px 18px", borderRadius: 14,
      background: "rgba(255,255,255,0.02)", border: `1px solid ${color}22`,
      borderTop: `2px solid ${color}55`,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
            background: `${color}15`, border: `1.5px solid ${color}33`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
          }}>{emoji}</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#E2E8F0", lineHeight: 1 }}>{name}</div>
            <div style={{ fontSize: 10.5, color, fontWeight: 600, marginTop: 2 }}>{subtitle}</div>
          </div>
        </div>
        <LiveBadge />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(stats.length, 3)}, 1fr)`, gap: 8 }}>
        {stats.map((s, i) => (
          <MiniStat key={i} label={s.label} value={s.value} color={s.color ?? color} />
        ))}
      </div>
      {children}
      <div style={{
        padding: "9px 12px", borderRadius: 9,
        background: `${color}08`, border: `1px solid ${color}1A`,
        fontSize: 11.5, color: "#94A3B8", lineHeight: 1.5,
      }}>
        <span style={{ color, fontWeight: 700 }}>💡 </span>{rec}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MorningBriefPage() {
  const apiFetch = useApiFetch();

  const ciQuery    = useCallIntelligenceQuery("30days", { retry: 1 });
  const leadsQuery = useLeadsQuery({ retry: 1 });
  const postsQuery = useSocialPostsQuery({ retry: 1 });
  const connectionsQuery = useQuery<SocialConnection[]>({
    queryKey: ["mb-connections"],
    queryFn: () => apiFetch("/social-connections"),
    staleTime: 60_000, retry: 1,
  });
  const reviewStatsQuery = useQuery<{ stats: ReviewStat[] }>({
    queryKey: ["mb-review-stats"],
    queryFn: () => apiFetch("/reviews/stats"),
    staleTime: 60_000, retry: 1,
  });
  const reviewReqQuery = useQuery<{ requests: ReviewRequest[] }>({
    queryKey: ["mb-review-requests"],
    queryFn: () => apiFetch("/reviews/requests"),
    staleTime: 60_000, retry: 1,
  });
  const receptionistQuery = useQuery<AIReceptionist>({
    queryKey: ["mb-receptionist"],
    queryFn: () => apiFetch("/ai-receptionist/settings"),
    staleTime: 60_000, retry: 1,
  });
  const presenceQuery = useQuery<LocalPresenceScore>({
    queryKey: ["mb-presence"],
    queryFn: () => apiFetch("/local-presence/score"),
    staleTime: 60_000, retry: 1,
  });

  // ── Derived ──────────────────────────────────────────────────────────────────

  const ci      = ciQuery.data;
  const leads   = leadsQuery.data;
  const posts   = postsQuery.data ?? [];
  const connections: SocialConnection[] = Array.isArray(connectionsQuery.data) ? connectionsQuery.data : [];
  const reviewStats: ReviewStat[]       = reviewStatsQuery.data?.stats ?? [];
  const reviewReqs: ReviewRequest[]     = reviewReqQuery.data?.requests ?? [];
  const receptionist                    = receptionistQuery.data;
  const presence                        = presenceQuery.data;

  const loading = ciQuery.isLoading || leadsQuery.isLoading || postsQuery.isLoading;

  // Platforms
  const getConn = (p: string) => connections.find(c => c.provider === p);
  const fbConn  = getConn("facebook");
  const igConn  = getConn("instagram");
  const gbpConn = getConn("google_business");
  const gbpMeta = gbpConn?.metadata ?? {};
  const gbpCooldown = gbpMeta.cooldownUntil && new Date(gbpMeta.cooldownUntil) > new Date();
  const gbpStatus: PlatformStatus = gbpConn ? (gbpCooldown ? "cooldown" : "connected") : "disconnected";
  const fbStatus:  PlatformStatus = fbConn  ? "connected" : "disconnected";
  const igStatus:  PlatformStatus = igConn  ? "connected" : "disconnected";

  // Calls
  const totalCalls    = ci?.metrics.total_calls  ?? 0;
  const missedCalls   = ci?.metrics.missed_calls ?? 0;
  const answeredCalls = totalCalls - missedCalls;
  const missedRate    = totalCalls > 0 ? missedCalls / totalCalls : 0;

  // Leads
  const totalLeads    = leads?.stats.total     ?? 0;
  const thisMonthLeads = leads?.stats.thisMonth ?? 0;
  const newLeads      = leads?.leads.filter(l => l.status === "new") ?? [];
  const hotLead       = newLeads[0] ?? null;

  // Posts
  const publishedPosts = posts.filter(p => p.status === "published").length;
  const draftPosts     = posts.filter(p => p.status === "draft").length;
  const scheduledPosts = posts.filter(p => p.status === "scheduled").length;

  // Reviews
  const googleStat       = reviewStats.find(r => r.platform === "google");
  const totalReviewCount = reviewStats.reduce((s, r) => s + r.review_count, 0);
  const requestsSent     = reviewReqs.length;
  const requestsPending  = reviewReqs.filter(r => r.status === "pending").length;

  // Receptionist
  const receptionistActive = !!receptionist?.transferPhone;

  // Local presence
  const presenceConnected = presence?.connected ?? 0;
  const presenceTotal     = presence?.total     ?? 0;

  // ── Business Health — real deduction rules ────────────────────────────────────

  type Deduction = { label: string; detail: string; points: number; page: string };
  const deductions: Deduction[] = [];

  if (!connectionsQuery.isLoading) {
    if (!gbpConn) {
      deductions.push({ label: "Google Business Profile not connected", detail: "Connect GBP to enable local presence and GBP publishing", points: 8, page: "/admin/system-diagnostics" });
    } else if (gbpCooldown) {
      deductions.push({ label: "GBP API cooldown active", detail: "Quota exceeded — GBP features paused until cooldown clears", points: 3, page: "/admin/system-diagnostics" });
    }
    if (!fbConn)  deductions.push({ label: "Facebook not connected", detail: "Reconnect Facebook to re-enable social publishing", points: 5, page: "/admin/publishing-center" });
    if (!igConn)  deductions.push({ label: "Instagram not connected", detail: "Reconnect Instagram to publish Reels and story content", points: 5, page: "/admin/publishing-center" });
  }
  if (!receptionistQuery.isLoading && !receptionistActive) {
    deductions.push({ label: "AI Receptionist transfer number not set", detail: "Set a transfer phone so Emma can route live callers", points: 5, page: "/admin/ai-receptionist" });
  }
  if (!reviewReqQuery.isLoading && requestsSent === 0) {
    deductions.push({ label: "No review requests sent yet", detail: "445 GorillaDesk customers eligible — start requesting Google reviews", points: 5, page: "/admin/reviews-engine" });
  }
  if (!ciQuery.isLoading && missedRate > 0.3) {
    deductions.push({ label: `${Math.round(missedRate * 100)}% missed call rate`, detail: "Enable textback to automatically recover missed callers", points: 4, page: "/admin/ai-receptionist" });
  }
  if (!leadsQuery.isLoading && newLeads.length > 0) {
    const pts = Math.min(6, newLeads.length * 2);
    deductions.push({ label: `${newLeads.length} new lead${newLeads.length > 1 ? "s" : ""} need follow-up`, detail: "New leads go cold fast — contact within the hour for best close rate", points: pts, page: "/admin/profit-center" });
  }
  if (!presenceQuery.isLoading && presenceTotal > 0 && presenceConnected / presenceTotal < 0.3) {
    deductions.push({ label: `Local presence: ${presenceConnected}/${presenceTotal} channels active`, detail: "More active channels = higher local search visibility", points: 4, page: "/admin/mission-control" });
  }

  const totalDeduction = deductions.reduce((s, d) => s + d.points, 0);
  const healthScore    = Math.max(0, Math.min(100, 100 - totalDeduction));

  // ── Today's Mission — live operational actions ────────────────────────────────

  type MissionItem = { icon: string; text: string; est: string; color: string; page: string };
  const mission: MissionItem[] = [];

  if (missedCalls > 0) {
    mission.push({ icon: "📞", color: "#F87171", est: "5 min", page: "/admin/ai-receptionist",
      text: `${missedCalls} missed call${missedCalls > 1 ? "s" : ""} — log callbacks before leads go cold` });
  }
  if (newLeads.length > 0) {
    mission.push({ icon: "🔥", color: "#FBBF24", est: "10 min", page: "/admin/profit-center",
      text: `${newLeads.length} new lead${newLeads.length > 1 ? "s" : ""} — follow up with ${hotLead ? fmtPhone(hotLead.phone) : "lead queue"}` });
  }
  if (draftPosts > 0) {
    mission.push({ icon: "📣", color: "#F472B6", est: "5 min", page: "/admin/publishing-center",
      text: `${draftPosts} draft post${draftPosts > 1 ? "s" : ""} ready — publish before peak engagement window` });
  }
  if (requestsSent === 0 && mission.length < 3) {
    mission.push({ icon: "⭐", color: "#FBBF24", est: "10 min", page: "/admin/reviews-engine",
      text: "Send review requests — 445 customers eligible, 0 requests sent yet" });
  }
  if (gbpCooldown && mission.length < 3) {
    mission.push({ icon: "🗺️", color: "#34D399", est: "2 min", page: "/admin/system-diagnostics",
      text: "GBP cooldown active — check diagnostics for retry window" });
  }
  if (mission.length === 0) {
    mission.push({ icon: "✅", color: "#22C55E", est: "—", page: "/admin/apollos",
      text: "No urgent actions — ask Apollos for growth recommendations" });
  }
  const todaysMission = mission.slice(0, 3);

  // ── Top 3 Targets — biggest health score improvements ─────────────────────────

  const sortedDeductions = [...deductions].sort((a, b) => b.points - a.points);
  const top3Targets      = sortedDeductions.slice(0, 3);

  // ── Recent Activity — calls + leads, newest first ─────────────────────────────

  type ActivityItem = { id: string; icon: string; text: string; color: string; ts: number };
  const rawActivity: ActivityItem[] = [];

  (ci?.recent_activity ?? []).forEach(a => {
    const isMissed = a.outcome === "missed" || a.call_type === "missed";
    rawActivity.push({
      id: a.id, icon: isMissed ? "📵" : "📞", color: isMissed ? "#F87171" : "#22C55E",
      text: `${isMissed ? "Missed call" : "Call"} — ${fmtPhone(a.caller_number)}`,
      ts: new Date(a.timestamp).getTime(),
    });
  });
  (leads?.leads ?? []).forEach(l => {
    rawActivity.push({
      id: `lead-${l.id}`, icon: "🔥", color: "#FBBF24",
      text: `Lead — ${l.customerName ?? fmtPhone(l.phone)} · ${l.status}`,
      ts: new Date(l.createdAt).getTime(),
    });
  });
  rawActivity.sort((a, b) => b.ts - a.ts);

  const { text: greetText, icon: greetIcon } = greetingFor();

  return (
    <AppShell>

      {/* ── 1. GOOD MORNING, MATT ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, color: "#E2E8F0", lineHeight: 1.1 }}>
                {greetIcon} {greetText}, Matt
              </h1>
              {loading && <span style={{ fontSize: 12, color: "#60A5FA" }}>⟳ Loading…</span>}
            </div>
            <div style={{ fontSize: 13, color: "#475569", marginTop: 6 }}>{todayLabel()}</div>
            <div style={{
              marginTop: 12, padding: "9px 14px", borderRadius: 10, display: "inline-flex",
              alignItems: "center", gap: 10,
              background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)",
            }}>
              <span style={{ fontSize: 14 }}>🟢</span>
              <span style={{ fontSize: 12.5, color: "#86EFAC", fontWeight: 600 }}>
                AI team active — calls handled, leads tracked, content scheduled
              </span>
            </div>
          </div>

          {/* ── 2. BUSINESS HEALTH ──────────────────────────────────────────────── */}
          <div style={{
            padding: "16px 20px", borderRadius: 16,
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 10, flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px" }}>
                Business Health
              </span>
              <LiveBadge />
            </div>
            <HealthRing score={healthScore} />
            {deductions.length > 0 ? (
              <div style={{ fontSize: 10, color: "#475569", textAlign: "center", maxWidth: 130, lineHeight: 1.6 }}>
                {deductions.slice(0, 2).map((d, i) => (
                  <div key={i} style={{ color: d.points >= 6 ? "#F87171" : d.points >= 4 ? "#FB923C" : "#FBBF24" }}>
                    −{d.points} {d.label.split(" ").slice(0, 4).join(" ")}
                    {d.label.split(" ").length > 4 ? "…" : ""}
                  </div>
                ))}
                {deductions.length > 2 && (
                  <div style={{ color: "#334155" }}>+{deductions.length - 2} more</div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 10, color: "#22C55E", textAlign: "center", maxWidth: 120 }}>
                No active deductions
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 3. TODAY'S MISSION ────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <SectionHeader icon="🎯" label="Today's Mission" color="#F87171" />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {todaysMission.map((t, i) => (
            <a key={i} href={t.page} style={{ textDecoration: "none" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                borderRadius: 12, background: "rgba(255,255,255,0.02)",
                border: `1px solid ${t.color}22`, borderLeft: `3px solid ${t.color}`,
                cursor: "pointer",
              }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{t.icon}</span>
                <span style={{ fontSize: 13, color: "#CBD5E1", flex: 1, lineHeight: 1.5 }}>{t.text}</span>
                <span style={{
                  fontSize: 9.5, fontWeight: 700, color: t.color,
                  background: `${t.color}11`, border: `1px solid ${t.color}22`,
                  borderRadius: 6, padding: "2px 7px", flexShrink: 0,
                }}>~{t.est}</span>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* ── 4–7. LIVE DATA GRID ───────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, marginBottom: 24 }}>

        {/* ── 4. PUBLISHING SUMMARY ─────────────────────────────────────────── */}
        <AgentPanel
          emoji="📣" name="Publishing" subtitle="Social Content · Mia" color="#F472B6"
          stats={[
            { label: "Published", value: posts.length === 0 ? "—" : publishedPosts, color: "#F472B6" },
            { label: "Drafts",    value: posts.length === 0 ? "—" : draftPosts,     color: draftPosts > 0 ? "#FBBF24" : "#475569" },
            { label: "Scheduled", value: posts.length === 0 ? "—" : scheduledPosts, color: "#60A5FA" },
          ]}
          rec={
            draftPosts > 0
              ? `${draftPosts} draft${draftPosts > 1 ? "s" : ""} waiting — publish before noon for peak reach`
              : posts.length > 0
              ? "All posts published — good content cadence maintained"
              : "Generate this week's content from Publishing Center"
          }
        />

        {/* ── 5. REVIEW SUMMARY ─────────────────────────────────────────────── */}
        <AgentPanel
          emoji="⭐" name="Reviews" subtitle="Reputation · Olivia" color="#FBBF24"
          stats={[
            { label: "Google Reviews", value: googleStat?.review_count ?? 0, color: "#FBBF24" },
            { label: "Avg Rating",     value: googleStat && googleStat.average_rating > 0 ? `${googleStat.average_rating.toFixed(1)}★` : "—", color: "#FBBF24" },
            { label: "Requests Sent",  value: requestsSent, color: requestsSent > 0 ? "#60A5FA" : "#475569" },
          ]}
          rec={
            requestsSent === 0
              ? "No review requests sent — 445 GorillaDesk customers eligible, start here"
              : requestsPending > 0
              ? `${requestsPending} request${requestsPending > 1 ? "s" : ""} pending — follow up to drive ratings`
              : totalReviewCount > 0
              ? "Reviews tracked — keep requesting after every completed job"
              : "Requests sent — wait for responses and keep the pipeline warm"
          }
        />

        {/* ── 6. MISSED CALLS ───────────────────────────────────────────────── */}
        <AgentPanel
          emoji="👋" name="Missed Calls" subtitle="AI Receptionist · Emma · 30 days" color="#00AEEF"
          stats={[
            { label: "Total",    value: totalCalls    || "—", color: "#00AEEF" },
            { label: "Missed",   value: missedCalls   || "—", color: missedCalls > 0 ? "#F87171" : "#22C55E" },
            { label: "Answered", value: answeredCalls || "—", color: "#22C55E" },
          ]}
          rec={
            missedCalls > 0
              ? `${missedCalls} caller${missedCalls > 1 ? "s" : ""} reached voicemail — send a follow-up text today`
              : totalCalls > 0
              ? "All recent calls handled — no missed calls to recover"
              : "AI Receptionist active — call data appears here automatically"
          }
        />

        {/* ── 7. LEADS ──────────────────────────────────────────────────────── */}
        <AgentPanel
          emoji="💰" name="Leads" subtitle="Sales Pipeline · Mason" color="#22C55E"
          stats={[
            { label: "Total",      value: totalLeads     || "—", color: "#22C55E" },
            { label: "New",        value: newLeads.length || "—", color: newLeads.length > 0 ? "#F87171" : "#22C55E" },
            { label: "This Month", value: thisMonthLeads  || "—", color: "#60A5FA" },
          ]}
          rec={
            hotLead
              ? `Follow up with ${fmtPhone(hotLead.phone)} — new since ${new Date(hotLead.createdAt).toLocaleDateString()}`
              : totalLeads > 0
              ? "All active leads contacted — focus on closing pipeline"
              : "Lead capture active — new leads appear here automatically"
          }
        >
          {hotLead && (
            <div style={{
              padding: "7px 10px", borderRadius: 8,
              background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)",
              fontSize: 11, color: "#FCA5A5", lineHeight: 1.5,
            }}>
              🔥 {hotLead.customerName ?? fmtPhone(hotLead.phone)} · {hotLead.eventType.replace(/_/g, " ")} · {new Date(hotLead.createdAt).toLocaleDateString()}
            </div>
          )}
        </AgentPanel>

      </div>

      {/* ── 8. REVENUE ────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <SectionHeader icon="💵" label="Revenue" color="#22C55E" />
        <div style={{
          padding: "20px 24px", borderRadius: 16,
          background: "rgba(34,197,94,0.04)", border: "1.5px solid rgba(34,197,94,0.18)",
          display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap",
        }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <LiveBadge />
              <span style={{ fontSize: 11, color: "#475569" }}>GorillaDesk customer base</span>
            </div>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#22C55E", lineHeight: 1, marginBottom: 6 }}>
              445
            </div>
            <div style={{ fontSize: 12.5, color: "#64748B", lineHeight: 1.6 }}>
              customers in GorillaDesk. Job history and revenue totals require job-level API access —
              GorillaDesk's public API does not expose job endpoints.
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, minWidth: 190 }}>
            {[
              { label: "Tracked jobs",        value: "0",        note: "GorillaDesk API limit", dim: true },
              { label: "Revenue attributed",   value: "$0",       note: "No job data available", dim: true },
              { label: "Bed bug treatment",    value: "$350–450", note: "Pricing reference",     dim: false },
              { label: "General pest service", value: "$95–250",  note: "Pricing reference",     dim: false },
            ].map((s, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
                padding: "6px 12px", borderRadius: 8,
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <div>
                  <div style={{ fontSize: 12, color: s.dim ? "#475569" : "#94A3B8" }}>{s.label}</div>
                  <div style={{ fontSize: 9, color: "#334155" }}>{s.note}</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: s.dim ? "#334155" : "#22C55E" }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 9. PLATFORM STATUS ────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <SectionHeader icon="🔌" label="Platform Status" color="#60A5FA" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
          <PlatformDot name="Facebook"        status={fbStatus}  />
          <PlatformDot name="Instagram"       status={igStatus}  />
          <PlatformDot name="Google Business" status={gbpStatus} />
          <PlatformDot name="TikTok"          status="disconnected" />
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 8,
            background: receptionistActive ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.02)",
            border: `1px solid ${receptionistActive ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.06)"}`,
          }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: receptionistActive ? "#22C55E" : "#FBBF24", flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#CBD5E1" }}>AI Receptionist</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: receptionistActive ? "#22C55E" : "#FBBF24", letterSpacing: "0.3px", marginLeft: "auto" }}>
              {receptionistActive ? "CONFIGURED" : "SETUP NEEDED"}
            </span>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 8,
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: presenceConnected > 0 ? "#60A5FA" : "#475569", flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#CBD5E1" }}>Local Edge Presence</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#60A5FA", letterSpacing: "0.3px", marginLeft: "auto" }}>
              {presenceConnected}/{presenceTotal} CHANNELS
            </span>
          </div>
        </div>
        {gbpCooldown && (
          <div style={{
            marginTop: 10, padding: "8px 12px", borderRadius: 9,
            background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)",
            fontSize: 11, color: "#FDE68A", lineHeight: 1.5,
          }}>
            ⚠️ GBP API cooldown — quota exceeded. GBP publishing and local presence features are paused until{" "}
            {new Date(gbpMeta.cooldownUntil).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}.
          </div>
        )}
      </div>

      {/* ── 10. APOLLOS RECOMMENDATION ────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <SectionHeader icon="🎙️" label="Apollos Recommendation" color="#00AEEF" />
        <div style={{
          padding: "20px 24px", borderRadius: 16,
          background: "linear-gradient(135deg, #080E1F 0%, #0A1228 50%, #080E1F 100%)",
          border: "1px solid rgba(0,174,239,0.25)", position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", top: -40, left: -40, width: 200, height: 200, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(0,174,239,0.07) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%", flexShrink: 0,
              background: "linear-gradient(135deg, #00AEEF22 0%, #06B6D408 100%)",
              border: "2px solid rgba(0,174,239,0.45)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26,
            }}>🎙️</div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#E2E8F0", marginBottom: 6 }}>Talk to Apollos</div>
              <div style={{ fontSize: 12.5, color: "#64748B", lineHeight: 1.6 }}>
                Business Health:{" "}
                <span style={{
                  color: healthScore >= 80 ? "#22C55E" : healthScore >= 60 ? "#FBBF24" : "#F87171",
                  fontWeight: 700,
                }}>{healthScore}/100</span>
                {deductions.length > 0 && (
                  <span style={{ color: "#475569" }}> · {deductions.length} active deduction{deductions.length > 1 ? "s" : ""}</span>
                )}
                <br />
                Ask for your morning brief, top priorities, or end-of-day recap.
              </div>
            </div>
            <a href="/admin/apollos" style={{ textDecoration: "none" }}>
              <button style={{
                background: "linear-gradient(135deg, #00AEEF 0%, #06B6D4 100%)",
                border: "none", borderRadius: 10, padding: "11px 22px",
                fontSize: 13, fontWeight: 700, color: "#030612", cursor: "pointer",
                boxShadow: "0 4px 14px rgba(0,174,239,0.3)", flexShrink: 0,
              }}>
                Open Apollos →
              </button>
            </a>
          </div>
        </div>
      </div>

      {/* ── 11. TOP 3 TARGETS — biggest health score improvements ──────────────── */}
      <div style={{ marginBottom: 24 }}>
        <SectionHeader icon="🏆" label="Top 3 Targets" color="#FBBF24" />
        {top3Targets.length === 0 ? (
          <div style={{
            padding: "18px 20px", borderRadius: 12,
            background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.2)",
            fontSize: 13, color: "#86EFAC", textAlign: "center",
          }}>
            ✅ No health deductions active — business is fully optimised
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {top3Targets.map((d, i) => {
              const rankColor = d.points >= 6 ? "#F87171" : d.points >= 4 ? "#FB923C" : "#FBBF24";
              return (
                <a key={i} href={d.page} style={{ textDecoration: "none" }}>
                  <div style={{
                    display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 18px",
                    borderRadius: 12, background: "rgba(255,255,255,0.02)",
                    border: `1px solid ${rankColor}22`, cursor: "pointer",
                  }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                      background: `${rankColor}15`, border: `1.5px solid ${rankColor}33`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 900, color: rankColor,
                    }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0", marginBottom: 4, lineHeight: 1.4 }}>{d.label}</div>
                      <div style={{ fontSize: 11.5, color: "#64748B", lineHeight: 1.5 }}>{d.detail}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 800, color: rankColor,
                        background: `${rankColor}11`, border: `1px solid ${rankColor}22`,
                        borderRadius: 6, padding: "2px 7px",
                      }}>−{d.points} pts</span>
                      <span style={{ fontSize: 10, color: "#334155" }}>→ fix</span>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 12. RECENT ACTIVITY ───────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <SectionHeader icon="⚡" label="Recent Activity" color="#94A3B8" />
        {rawActivity.length === 0 ? (
          <div style={{
            padding: "20px", borderRadius: 12,
            background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.06)",
            fontSize: 13, color: "#475569", textAlign: "center", lineHeight: 1.6,
          }}>
            No recent activity — calls and leads will appear here as they come in
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {rawActivity.slice(0, 8).map(a => (
              <div key={a.id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                borderRadius: 10, background: "rgba(255,255,255,0.015)",
                border: "1px solid rgba(255,255,255,0.05)",
                borderLeft: `3px solid ${a.color}`,
              }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{a.icon}</span>
                <span style={{ fontSize: 12.5, color: "#CBD5E1", flex: 1, lineHeight: 1.4 }}>{a.text}</span>
                <span style={{ fontSize: 10.5, color: "#334155", flexShrink: 0 }}>{fmtTime(new Date(a.ts).toISOString())}</span>
              </div>
            ))}
          </div>
        )}
      </div>

    </AppShell>
  );
}

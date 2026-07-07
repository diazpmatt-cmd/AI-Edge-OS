import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";

// ── API response types ─────────────────────────────────────────────────────────
interface CIMetrics {
  total_calls: number;
  missed_calls: number;
  transferred_calls: number;
  callback_requests: number;
  voicemails: number;
  sms_conversations: number;
  leads_captured: number;
  recovery_rate: number | null;
}
interface CIActivity {
  id: string;
  timestamp: string;
  caller_number: string;
  call_type: string;
  outcome: string;
  duration_secs: number | null;
  lead_status: string | null;
}
interface CIResponse {
  period: string;
  since: string;
  metrics: CIMetrics;
  recent_activity: CIActivity[];
}
interface Lead {
  id: string;
  clientName: string;
  source: string;
  phone: string;
  customerName: string | null;
  message: string | null;
  eventType: string;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
interface LeadsResponse {
  leads: Lead[];
  stats: { total: number; active: number; thisMonth: number; withMessages: number };
}

// ── Demo / mock fallback data ──────────────────────────────────────────────────
const MOCK_CALL_ACTIVITY = [
  { time: "8:04 AM", caller: "(251) 555-0182", type: "AI Answered",   service: "Bed bug inspection",  outcome: "Booked",           revenue: "$350" },
  { time: "8:41 AM", caller: "(251) 555-0234", type: "Missed → Text", service: "Roach treatment",      outcome: "Text sent",        revenue: "$180" },
  { time: "9:12 AM", caller: "(251) 555-0099", type: "AI Answered",   service: "Flea treatment",       outcome: "Booked",           revenue: "$225" },
  { time: "10:08 AM",caller: "(251) 555-0317", type: "AI Answered",   service: "Rodent control",       outcome: "Quote needed",     revenue: "$400+" },
  { time: "11:33 AM",caller: "(251) 555-0451", type: "Missed → Text", service: "Mosquito service",     outcome: "Customer replied", revenue: "$275" },
  { time: "12:19 PM",caller: "(251) 555-0512", type: "AI Answered",   service: "General inspection",   outcome: "Booked",           revenue: "$150" },
  { time: "2:47 PM", caller: "(251) 555-0678", type: "After Hours",   service: "Bed bugs (urgent)",    outcome: "Text sent",        revenue: "$450" },
  { time: "4:02 PM", caller: "(251) 555-0744", type: "AI Answered",   service: "Ant problem",          outcome: "Booked",           revenue: "$195" },
];

const MOCK_LEAD_RECOVERY = [
  { caller: "(251) 555-0182", service: "Bed bug inspection",  missed: true, textSent: true,  replied: true,  booked: true,  followUp: false },
  { caller: "(251) 555-0234", service: "Roach treatment",     missed: true, textSent: true,  replied: false, booked: false, followUp: true  },
  { caller: "(251) 555-0451", service: "Mosquito service",    missed: true, textSent: true,  replied: true,  booked: false, followUp: true  },
  { caller: "(251) 555-0678", service: "Bed bugs (urgent)",   missed: true, textSent: true,  replied: false, booked: false, followUp: true  },
  { caller: "(251) 555-0891", service: "Flea & tick",         missed: true, textSent: true,  replied: true,  booked: true,  followUp: false },
  { caller: "(251) 555-0922", service: "Rodent exclusion",    missed: true, textSent: false, replied: false, booked: false, followUp: true  },
];

const MOCK_OPPORTUNITIES = [
  { type: "🔥 Hot Lead",             caller: "(251) 555-0678", service: "Bed bugs (urgent)",  note: "After-hours caller, no callback yet",  priority: "high" },
  { type: "💰 Needs Quote",          caller: "(251) 555-0317", service: "Rodent control",     note: "Requested estimate, AI logged interest",priority: "high" },
  { type: "📞 Missed Estimate",      caller: "(251) 555-0922", service: "Rodent exclusion",   note: "Text not yet sent — needs follow-up",   priority: "high" },
  { type: "💬 Needs Follow-Up",      caller: "(251) 555-0234", service: "Roach treatment",    note: "Texted, no reply in 24 hrs",            priority: "med"  },
  { type: "⭐ Review Request Ready", caller: "(251) 555-0182", service: "Bed bug inspection", note: "Job completed — prime review window",   priority: "low"  },
];

const SERVICES = [
  { label: "Bed Bugs",   count: 89, icon: "🐛", color: "#00AEEF", revenue: "$5,200" },
  { label: "Roaches",    count: 64, icon: "🪳", color: "#F87171", revenue: "$3,840" },
  { label: "Ants",       count: 51, icon: "🐜", color: "#FB923C", revenue: "$2,550" },
  { label: "Fleas",      count: 38, icon: "🦟", color: "#A78BFA", revenue: "$1,900" },
  { label: "Rodents",    count: 29, icon: "🐭", color: "#34D399", revenue: "$2,610" },
  { label: "Mosquitoes", count: 22, icon: "🦟", color: "#FBBF24", revenue: "$2,200" },
];
const MAX_COUNT = Math.max(...SERVICES.map(s => s.count));

const RECEPTIONIST_METRICS = [
  { label: "Avg Call Length",      value: "2m 14s", icon: "⏱",  color: "#00AEEF" },
  { label: "Transfer Rate",        value: "18%",    icon: "📲", color: "#A78BFA" },
  { label: "Booking Intent Rate",  value: "64%",    icon: "📅", color: "#34D399" },
  { label: "Unanswered Questions", value: "7",      icon: "❓", color: "#FB923C" },
];

const TOP_QUESTIONS = [
  { q: "How much does a bed bug treatment cost?",     count: 34 },
  { q: "Are your chemicals safe for pets and kids?",  count: 28 },
  { q: "How long does treatment take?",               count: 21 },
  { q: "Do you offer same-day service?",              count: 19 },
  { q: "Do you service Gulf Shores / Orange Beach?",  count: 14 },
];

const GOLDEN_NOTES = [
  { icon: "🏭", text: "Pest control → HVAC → Plumbing → Roofing → Any local service with phone calls" },
  { icon: "📊", text: "Every missed call is a lost job. AI receptionist + text follow-up = revenue recovery" },
  { icon: "🔄", text: "This dashboard is the repeatable template: same metrics, new client, new brand colors" },
  { icon: "💡", text: "AI Edge does not replace the technician — it fills the gap between ring and booked job" },
  { icon: "📈", text: "Phase 2: wire real call/SMS data, booking API, and payment confirmation" },
  { icon: "🚀", text: "Phase 3: auto-generate this dashboard for every onboarded client automatically" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt12h(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}
function fmtDuration(secs: number | null): string {
  if (!secs) return "—";
  const m = Math.floor(secs / 60), s = secs % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}
function fmtPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}

// ── Badge components ───────────────────────────────────────────────────────────
function LiveBadge() {
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 800,
      background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.35)",
      color: "#22C55E", letterSpacing: "0.4px", flexShrink: 0,
    }}>🟢 LIVE</span>
  );
}
function DemoBadge() {
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 800,
      background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)",
      color: "#FBBF24", letterSpacing: "0.4px", flexShrink: 0,
    }}>🟡 DEMO</span>
  );
}
function SectionHeader({ title, color, live }: { title: string; color?: string; live: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.8px", color: color ?? "#00AEEF",
      }}>{title}</div>
      {live ? <LiveBadge /> : <DemoBadge />}
    </div>
  );
}
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

const card: React.CSSProperties = {
  padding: "18px 20px", borderRadius: 14,
  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
};

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function BBBSuccessPage() {
  const apiFetch = useApiFetch();
  const [activeTab, setActiveTab] = useState<"overview" | "leads" | "calls" | "ops">("overview");

  // ── Fetch live data ──────────────────────────────────────────────────────────
  const ciQuery = useQuery<CIResponse>({
    queryKey: ["bbb-call-intelligence"],
    queryFn:  () => apiFetch("/api/call-intelligence?period=30days"),
    staleTime: 60_000,
    retry: 1,
  });
  const leadsQuery = useQuery<LeadsResponse>({
    queryKey: ["bbb-leads"],
    queryFn:  () => apiFetch("/api/leads"),
    staleTime: 60_000,
    retry: 1,
  });

  const ci     = ciQuery.data;
  const leads  = leadsQuery.data;
  const loading = ciQuery.isLoading || leadsQuery.isLoading;

  // ── Live/demo flags per widget ───────────────────────────────────────────────
  const hasLiveCalls    = (ci?.metrics.total_calls ?? 0) > 0;
  const hasLiveLeads    = (leads?.stats.total ?? 0) > 0;
  const hasLiveSms      = (ci?.metrics.sms_conversations ?? 0) > 0;
  const hasLiveActivity = (ci?.recent_activity?.length ?? 0) > 0;
  const hasLiveDuration = ci?.recent_activity?.some(r => r.duration_secs != null) ?? false;

  // ── Derived live impact card values ─────────────────────────────────────────
  const liveCallsAnswered = hasLiveCalls ? String(ci!.metrics.total_calls - ci!.metrics.missed_calls) : null;
  const liveMissedCalls   = hasLiveCalls ? String(ci!.metrics.missed_calls) : null;
  const liveSmsCount      = hasLiveSms   ? String(ci!.metrics.sms_conversations) : null;
  const liveLeadsCount    = hasLiveLeads ? String(leads!.stats.total) : null;

  const avgDurationSecs = hasLiveDuration
    ? Math.round(
        ci!.recent_activity.filter(r => r.duration_secs != null)
          .reduce((s, r) => s + (r.duration_secs ?? 0), 0) /
        ci!.recent_activity.filter(r => r.duration_secs != null).length
      )
    : null;

  const liveTransferRate = hasLiveCalls && ci!.metrics.total_calls > 0
    ? `${Math.round((ci!.metrics.transferred_calls / ci!.metrics.total_calls) * 100)}%`
    : null;

  // ── Impact cards data ────────────────────────────────────────────────────────
  const IMPACT_CARDS = [
    {
      label: "Calls Answered by AI",   icon: "🤖", color: "#00AEEF", sub: "this month",
      value: liveCallsAnswered ?? "—",   live: hasLiveCalls,
    },
    {
      label: "Missed Leads Recovered", icon: "📞", color: "#34D399", sub: "missed calls",
      value: liveMissedCalls ?? "—",    live: hasLiveCalls,
    },
    {
      label: "Appointments Booked",    icon: "📅", color: "#A78BFA", sub: "from AI calls",
      value: "—",                       live: false,
    },
    {
      label: "Texts Sent",             icon: "💬", color: "#FB923C", sub: "auto follow-up",
      value: liveSmsCount ?? "—",       live: hasLiveSms,
    },
    {
      label: "Revenue Influenced",     icon: "💰", color: "#22C55E", sub: "est. from AI leads",
      value: "—",                       live: false,
    },
    {
      label: "Hours Saved",            icon: "⏱",  color: "#60A5FA", sub: "receptionist time",
      value: "—",                       live: false,
    },
  ];

  // ── Live call activity rows ──────────────────────────────────────────────────
  const liveActivityRows = (ci?.recent_activity ?? []).map(r => {
    const typeLabel = r.call_type === "missed" ? "Missed → Text"
      : r.call_type === "sms" ? "SMS"
      : r.call_type === "transferred" ? "Transferred"
      : "AI Answered";
    const outcomeLabel = r.outcome === "missed" ? "Missed"
      : r.outcome === "replied" ? "Customer replied"
      : r.outcome === "pending" ? "In progress"
      : r.outcome;
    return {
      time:    fmt12h(r.timestamp),
      caller:  fmtPhone(r.caller_number),
      type:    typeLabel,
      service: "—",
      outcome: outcomeLabel,
      revenue: "—",
      duration: fmtDuration(r.duration_secs),
    };
  });

  // ── Live lead recovery rows ──────────────────────────────────────────────────
  const liveLeadRows = (leads?.leads ?? []).map(l => ({
    caller:    fmtPhone(l.phone),
    service:   l.message ? l.message.slice(0, 48) : "Voice call",
    missed:    l.eventType === "missed_call" || l.eventType === "telnyx_voice_call",
    textSent:  l.eventType === "telnyx_textback_sent",
    replied:   l.status === "contacted" || l.eventType === "telnyx_sms_reply",
    booked:    l.status === "won",
    followUp:  l.status === "new",
  }));

  // ── Live revenue opportunities ───────────────────────────────────────────────
  const liveOpps: { type: string; caller: string; service: string; note: string; priority: string }[] = [];
  if (hasLiveCalls || hasLiveLeads) {
    // Missed calls → hot leads
    (ci?.recent_activity ?? []).filter(r => r.call_type === "missed" || r.outcome === "missed").forEach(r => {
      liveOpps.push({
        type: "🔥 Missed Call",
        caller: fmtPhone(r.caller_number),
        service: "Inbound call",
        note: `Missed at ${fmt12h(r.timestamp)} — no callback recorded`,
        priority: "high",
      });
    });
    // New leads → needs follow-up
    (leads?.leads ?? []).filter(l => l.status === "new").forEach(l => {
      liveOpps.push({
        type: "💬 Needs Follow-Up",
        caller: fmtPhone(l.phone),
        service: l.message ? l.message.slice(0, 48) : "Voice call",
        note: `Lead captured ${new Date(l.createdAt).toLocaleDateString()} — status: new`,
        priority: "med",
      });
    });
    // Contacted leads → review opportunity
    (leads?.leads ?? []).filter(l => l.status === "contacted").forEach(l => {
      liveOpps.push({
        type: "⭐ Review Opportunity",
        caller: fmtPhone(l.phone),
        service: l.message ? l.message.slice(0, 48) : "Voice call",
        note: "Customer contacted — ask for a review",
        priority: "low",
      });
    });
  }
  const useLiveOpps = liveOpps.length > 0;
  const opportunityRows = liveOpps;

  // ── Receptionist metrics — live where possible ───────────────────────────────
  const recepMetrics = [
    {
      label: "Avg Call Length",
      value: avgDurationSecs != null ? fmtDuration(avgDurationSecs) : "—",
      icon: "⏱", color: "#00AEEF", live: hasLiveDuration,
    },
    {
      label: "Transfer Rate",
      value: liveTransferRate ?? "—",
      icon: "📲", color: "#A78BFA", live: hasLiveCalls,
    },
    { label: "Booking Intent Rate", value: "—", icon: "📅", color: "#34D399", live: false },
    { label: "Unanswered Questions",value: "—", icon: "❓", color: "#FB923C", live: false },
  ];

  const TABS = [
    { key: "overview", label: "Overview",       icon: "📊" },
    { key: "leads",    label: "Lead Recovery",  icon: "📞" },
    { key: "calls",    label: "Call Activity",  icon: "🤖" },
    { key: "ops",      label: "Opportunities",  icon: "🔥" },
  ] as const;

  return (
    <AppShell>

      {/* ── 1. Revenue Sprint Header ──────────────────────────────────────────── */}
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
              {loading && (
                <span style={{ fontSize: 11, color: "#60A5FA" }}>⟳ Loading live data…</span>
              )}
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

        {/* Dashboard health summary */}
        <div style={{
          marginTop: 12, padding: "10px 16px", borderRadius: 10,
          background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px" }}>Dashboard Health:</span>
          <span style={{ fontSize: 11, color: "#22C55E", fontWeight: 600 }}>🟢 Calls {hasLiveCalls ? "LIVE" : "—"}</span>
          <span style={{ fontSize: 11, color: hasLiveLeads ? "#22C55E" : "#FBBF24", fontWeight: 600 }}>
            {hasLiveLeads ? "🟢" : "🟡"} Leads {hasLiveLeads ? "LIVE" : "DEMO"}
          </span>
          <span style={{ fontSize: 11, color: hasLiveSms ? "#22C55E" : "#FBBF24", fontWeight: 600 }}>
            {hasLiveSms ? "🟢" : "🟡"} SMS {hasLiveSms ? "LIVE" : "DEMO"}
          </span>
          <span style={{ fontSize: 11, color: useLiveOpps ? "#22C55E" : "#FBBF24", fontWeight: 600 }}>
            {useLiveOpps ? "🟢" : "🟡"} Opportunities {useLiveOpps ? "LIVE" : "DEMO"}
          </span>
        </div>
      </div>

      {/* ── 2. AI Edge Impact Cards ───────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.8px", color: "#00AEEF", marginBottom: 14,
        }}>AI Edge Impact — Last 30 Days</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))", gap: 12 }}>
          {IMPACT_CARDS.map(c => (
            <div key={c.label} style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{c.icon}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.4px", lineHeight: 1.3 }}>
                    {c.label}
                  </span>
                </div>
                {c.live ? <LiveBadge /> : <DemoBadge />}
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
          <SectionHeader title="Call Activity (Last 30 Days)" color="#A78BFA" live={hasLiveActivity} />
          <div style={{ ...card, overflowX: "auto" }}>
            {hasLiveActivity ? (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {["Time", "Caller", "Call Type", "Outcome", "Duration"].map(h => (
                      <th key={h} style={{
                        padding: "8px 12px", textAlign: "left", fontWeight: 700, fontSize: 10,
                        color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px",
                        borderBottom: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {liveActivityRows.map((row, i) => {
                    const outcomeColor = row.outcome === "Booked" ? "#34D399"
                      : row.outcome === "Customer replied" ? "#A78BFA"
                      : row.outcome === "In progress" ? "#60A5FA"
                      : row.outcome === "Missed" ? "#F87171"
                      : "#94A3B8";
                    const typeColor = row.type === "AI Answered" ? "#00AEEF"
                      : row.type === "Transferred" ? "#A78BFA"
                      : row.type === "SMS" ? "#34D399"
                      : "#FB923C";
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "10px 12px", color: "#64748B", whiteSpace: "nowrap" }}>{row.time}</td>
                        <td style={{ padding: "10px 12px", color: "#94A3B8", fontFamily: "monospace", fontSize: 11 }}>{row.caller}</td>
                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                          <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 700, background: `${typeColor}14`, border: `1px solid ${typeColor}33`, color: typeColor }}>{row.type}</span>
                        </td>
                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                          <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 700, background: `${outcomeColor}14`, border: `1px solid ${outcomeColor}33`, color: outcomeColor }}>{row.outcome}</span>
                        </td>
                        <td style={{ padding: "10px 12px", color: "#64748B" }}>{row.duration}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: "36px", textAlign: "center" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📵</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#94A3B8", marginBottom: 6 }}>No call records yet</div>
                <div style={{ fontSize: 12, color: "#475569" }}>Call activity will appear here once the AI receptionist handles its first call.</div>
              </div>
            )}
            {false && (
              <>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <tbody>
                    {MOCK_CALL_ACTIVITY.map((row, i) => {
                      const oc = row.outcome === "Booked" ? "#34D399" : row.outcome === "Text sent" ? "#60A5FA" : row.outcome === "Customer replied" ? "#A78BFA" : "#FBBF24";
                      const tc = row.type === "AI Answered" ? "#00AEEF" : row.type === "After Hours" ? "#FB923C" : "#F472B6";
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <td style={{ padding: "10px 12px", color: "#64748B", whiteSpace: "nowrap" }}>{row.time}</td>
                          <td style={{ padding: "10px 12px", color: "#94A3B8", fontFamily: "monospace", fontSize: 11 }}>{row.caller}</td>
                          <td style={{ padding: "10px 12px" }}><span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 700, background: `${tc}14`, border: `1px solid ${tc}33`, color: tc }}>{row.type}</span></td>
                          <td style={{ padding: "10px 12px", color: "#CBD5E1" }}>{row.service}</td>
                          <td style={{ padding: "10px 12px" }}><span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 700, background: `${oc}14`, border: `1px solid ${oc}33`, color: oc }}>{row.outcome}</span></td>
                          <td style={{ padding: "10px 12px", color: "#22C55E", fontWeight: 700 }}>{row.revenue}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 4. Lead Recovery Tracker ─────────────────────────────────────────── */}
      {activeTab === "leads" && (
        <div style={{ marginBottom: 28 }}>
          <SectionHeader title="Lead Recovery Tracker" color="#34D399" live={hasLiveLeads} />

          <div style={{ display: "grid", gridTemplateColumns: "2fr repeat(5,1fr)", gap: 8, marginBottom: 8, padding: "0 12px" }}>
            {["Lead", "Missed", "Text Sent", "Replied", "Booked", "Follow-Up"].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "center" }}>{h}</div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {liveLeadRows.length === 0 && (
              <div style={{ padding: "36px", textAlign: "center", color: "#475569" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#94A3B8", marginBottom: 6 }}>No lead recovery records yet</div>
                <div style={{ fontSize: 12 }}>Recovered leads will appear here as calls come in.</div>
              </div>
            )}
            {liveLeadRows.map((lead, i) => (
              <div key={i} style={{
                ...card, display: "grid",
                gridTemplateColumns: "2fr repeat(5,1fr)", gap: 8, alignItems: "center", padding: "12px 16px",
              }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#E2E8F0", marginBottom: 2 }}>{lead.service}</div>
                  <div style={{ fontSize: 10.5, color: "#475569", fontFamily: "monospace" }}>{lead.caller}</div>
                </div>
                <div style={{ display: "flex", justifyContent: "center" }}><StatusDot active={lead.missed}   color="#F87171" /></div>
                <div style={{ display: "flex", justifyContent: "center" }}><StatusDot active={lead.textSent} color="#60A5FA" /></div>
                <div style={{ display: "flex", justifyContent: "center" }}><StatusDot active={lead.replied}  color="#A78BFA" /></div>
                <div style={{ display: "flex", justifyContent: "center" }}><StatusDot active={lead.booked}   color="#34D399" /></div>
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
          {(() => {
            const rows = hasLiveLeads ? liveLeadRows : MOCK_LEAD_RECOVERY;
            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginTop: 16 }}>
                {[
                  { label: "Missed Calls",  value: rows.filter(l => l.missed).length,   color: "#F87171" },
                  { label: "Texts Sent",    value: rows.filter(l => l.textSent).length,  color: "#60A5FA" },
                  { label: "Replied",       value: rows.filter(l => l.replied).length,   color: "#A78BFA" },
                  { label: "Booked",        value: rows.filter(l => l.booked).length,    color: "#34D399" },
                  { label: "Follow-Up Due", value: rows.filter(l => l.followUp).length,  color: "#FBBF24" },
                ].map(s => (
                  <div key={s.label} style={{ ...card, textAlign: "center", padding: "12px 8px" }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: "#475569", marginTop: 4, fontWeight: 600 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Overview Tab ─────────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <>
          {/* ── 5. Top Services ──────────────────────────────────────────────── */}
          <div style={{ marginBottom: 28 }}>
            <SectionHeader title="Top Services Requested" color="#FB923C" live={false} />
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
                  <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 3, background: s.color, width: `${(s.count / MAX_COUNT) * 100}%` }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <span style={{ color: "#64748B" }}>{s.count} requests</span>
                    <span style={{ color: "#22C55E", fontWeight: 700 }}>{s.revenue}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── 6. AI Receptionist Performance ───────────────────────────────── */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: "#A78BFA", marginBottom: 14 }}>
              AI Receptionist Performance
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {recepMetrics.map(m => (
                  <div key={m.label} style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 16 }}>{m.icon}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.4px", lineHeight: 1.3 }}>{m.label}</span>
                      </div>
                      {m.live ? <LiveBadge /> : <DemoBadge />}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: m.color }}>{m.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ ...card }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.5px" }}>Top Questions Asked</div>
                  <DemoBadge />
                </div>
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
          <SectionHeader title="Revenue Opportunities" color="#22C55E" live={useLiveOpps} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {opportunityRows.map((opp, i) => {
              const priorityColor = opp.priority === "high" ? "#F87171"
                : opp.priority === "med" ? "#FBBF24" : "#60A5FA";
              return (
                <div key={i} style={{
                  ...card,
                  display: "flex", alignItems: "center", gap: 14,
                  borderLeft: `3px solid ${priorityColor}`, padding: "14px 18px",
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
                  <a href="/admin/lead-recovery" style={{
                    padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 700,
                    background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.3)", color: "#F97316",
                    flexShrink: 0, textDecoration: "none", display: "inline-block",
                  }}>
                    Take Action →
                  </a>
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

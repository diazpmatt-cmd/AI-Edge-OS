import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";
import { useTheme } from "@/contexts/theme-context";

// ── Types ──────────────────────────────────────────────────────────────────────

type Period = "today" | "7days" | "30days";

type Metrics = {
  total_calls: number;
  missed_calls: number;
  transferred_calls: number;
  callback_requests: number;
  voicemails: number;
  sms_conversations: number;
  leads_captured: number;
  recovery_rate: number | null;
};

type ActivityRow = {
  id: string;
  timestamp: string;
  caller_number: string;
  call_type: string;
  outcome: string;
  duration_secs: number | null;
  lead_status: string | null;
};

type CallIntelligenceData = {
  period: string;
  since: string;
  metrics: Metrics;
  recent_activity: ActivityRow[];
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const PERIOD_LABELS: Record<Period, string> = {
  today:  "Today",
  "7days":  "7 Days",
  "30days": "30 Days",
};

function formatPhone(p: string): string {
  const digits = p.replace(/\D/g, "");
  if (digits.length === 11 && digits[0] === "1") {
    const d = digits.slice(1);
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return p;
}

function formatDuration(secs: number | null): string {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

function callTypeLabel(ct: string): { label: string; color: string; bg: string } {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    incoming:    { label: "Incoming",    color: "#3B82F6", bg: "rgba(59,130,246,0.12)"  },
    missed:      { label: "Missed",      color: "#EF4444", bg: "rgba(239,68,68,0.12)"   },
    transferred: { label: "Transferred", color: "#22C55E", bg: "rgba(34,197,94,0.12)"  },
    callback:    { label: "Callback",    color: "#F59E0B", bg: "rgba(245,158,11,0.12)"  },
    voicemail:   { label: "Voicemail",   color: "#3B82F6", bg: "rgba(59,130,246,0.12)"  },
    sms:         { label: "SMS",         color: "#34D399", bg: "rgba(52,211,153,0.12)"  },
  };
  return map[ct] ?? { label: ct, color: "#94A3B8", bg: "rgba(148,163,184,0.08)" };
}

function outcomeLabel(o: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    pending:            { label: "In Progress",   color: "#3B82F6" },
    answered:           { label: "Answered",      color: "#22C55E" },
    transferred:        { label: "Transferred",   color: "#22C55E" },
    missed:             { label: "Missed",        color: "#EF4444" },
    voicemail_left:     { label: "Voicemail",     color: "#3B82F6" },
    callback_requested: { label: "Callback Req",  color: "#F59E0B" },
    replied:            { label: "Replied",       color: "#34D399" },
    no_answer:          { label: "No Answer",     color: "#EF4444" },
    error:              { label: "Error",         color: "#EF4444" },
  };
  return map[o] ?? { label: o, color: "#94A3B8" };
}

function leadStatusBadge(s: string | null) {
  if (!s) return null;
  const map: Record<string, { bg: string; color: string }> = {
    new:                  { bg: "rgba(59,130,246,0.12)",   color: "#3B82F6" },
    contacted:            { bg: "rgba(245,158,11,0.12)",   color: "#F59E0B" },
    quote_request:        { bg: "rgba(59,130,246,0.12)",   color: "#3B82F6" },
    appointment_request:  { bg: "rgba(34,197,94,0.12)",   color: "#22C55E" },
    emergency_request:    { bg: "rgba(239,68,68,0.12)",    color: "#EF4444" },
    qualified:            { bg: "rgba(59,130,246,0.12)",   color: "#3B82F6" },
    booked:               { bg: "rgba(34,197,94,0.12)",   color: "#22C55E" },
    closed:               { bg: "rgba(100,116,139,0.12)",  color: "#94A3B8" },
  };
  const style = map[s] ?? { bg: "rgba(148,163,184,0.08)", color: "#64748B" };
  const label = s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return { style, label };
}

// ── Metric Card ────────────────────────────────────────────────────────────────

function MetricCard({
  icon, label, value, sub, accent,
}: {
  icon: string; label: string; value: string | number; sub?: string; accent?: string;
}) {
  const { colors: t, isDark } = useTheme();
  const accentColor = accent ?? "#C0C0C0";
  return (
    <div style={{
      background: t.card,
      border: `1px solid ${t.border}`,
      borderRadius: 14,
      padding: "22px 24px",
      display: "flex", flexDirection: "column", gap: 6,
      position: "relative", overflow: "hidden",
      boxShadow: isDark ? "none" : t.shadow,
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, ${accentColor}55, transparent)`,
      }} />
      <div style={{ fontSize: 22, marginBottom: 2 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: accentColor, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontSize: 12.5, color: t.text2, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px" }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: 11, color: t.text3, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function CallIntelligencePage() {
  const [period, setPeriod] = useState<Period>("30days");
  const apiFetch = useApiFetch();
  const { colors: t, isDark } = useTheme();

  const { data, isLoading, isError } = useQuery<CallIntelligenceData>({
    queryKey: ["call-intelligence", period],
    queryFn: () => apiFetch(`/api/call-intelligence?period=${period}`),
    refetchInterval: 60_000,
  });

  const m = data?.metrics;
  const activity = data?.recent_activity ?? [];

  return (
    <AppShell>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 22 }}>📞</span>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: t.text, letterSpacing: "-0.3px" }}>
                Call Intelligence
              </h1>
              <div style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)",
                borderRadius: 20, padding: "2px 10px",
              }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E", animation: "pulse 2s infinite" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#22C55E", letterSpacing: "0.5px", textTransform: "uppercase" }}>Live</span>
              </div>
            </div>
            <p style={{ margin: 0, color: t.text2, fontSize: 13.5 }}>
              Bed Bugs &amp; Beyond · AI Reception Analytics · (251) 286-3200
            </p>
          </div>

          {/* Period Filter */}
          <div style={{ display: "flex", gap: 4, background: t.cardSubtle, borderRadius: 10, padding: 4, border: `1px solid ${t.border}` }}>
            {(["today", "7days", "30days"] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: "7px 16px", borderRadius: 7, border: "none", cursor: "pointer",
                  background: period === p ? "rgba(0,174,239,0.18)" : "transparent",
                  color: period === p ? "#00AEEF" : t.text3,
                  fontSize: 13, fontWeight: period === p ? 700 : 500,
                  outline: period === p ? "1px solid rgba(0,174,239,0.3)" : "none",
                  transition: "all 0.15s",
                }}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Metric Cards ───────────────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: t.text3 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📡</div>
          <div style={{ fontSize: 14 }}>Loading call intelligence data…</div>
        </div>
      ) : isError ? (
        <div style={{
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
          borderRadius: 12, padding: "24px", textAlign: "center", color: "#EF4444",
        }}>
          Failed to load data. Please refresh.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
            <MetricCard icon="📲" label="Total Calls Received" value={m?.total_calls ?? 0} sub={`${PERIOD_LABELS[period]} · all inbound`} accent="#00AEEF" />
            <MetricCard icon="📵" label="Missed Calls" value={m?.missed_calls ?? 0} sub="Unanswered · text-back sent" accent="#EF4444" />
            <MetricCard icon="🔀" label="Calls Transferred" value={m?.transferred_calls ?? 0} sub="Live agent handoff" accent="#22C55E" />
            <MetricCard icon="🔔" label="Callback Requests" value={m?.callback_requests ?? 0} sub="Pressed 2 in IVR" accent="#F59E0B" />
            <MetricCard icon="🎙️" label="Voicemails" value={m?.voicemails ?? 0} sub="Pressed 3 in IVR" accent="#3B82F6" />
            <MetricCard icon="💬" label="SMS Conversations" value={m?.sms_conversations ?? 0} sub="Inbound + outbound" accent="#34D399" />
            <MetricCard icon="🎯" label="Leads Captured" value={m?.leads_captured ?? 0} sub="Unique callers tracked" accent="#C0C0C0" />
            <MetricCard icon="📈" label="Recovery Rate" value={m?.recovery_rate != null ? `${m.recovery_rate}%` : "—"} sub="Missed → engaged" accent="#00AEEF" />
          </div>

          {/* ── Recent Call Activity ──────────────────────────────────────── */}
          <div style={{
            background: t.card,
            border: `1px solid ${t.border}`,
            borderRadius: 16, overflow: "hidden",
            boxShadow: isDark ? "none" : t.shadow,
          }}>
            <div style={{
              padding: "18px 24px", borderBottom: `1px solid ${t.border}`,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 16 }}>📋</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: t.text }}>Recent Call Activity</span>
                <span style={{
                  fontSize: 11, fontWeight: 600, color: "rgba(0,174,239,0.8)",
                  background: "rgba(0,174,239,0.1)", border: "1px solid rgba(0,174,239,0.2)",
                  borderRadius: 8, padding: "1px 8px",
                }}>
                  {activity.length} records
                </span>
              </div>
              <span style={{ fontSize: 11.5, color: t.text3 }}>
                {PERIOD_LABELS[period]} · auto-refreshes every minute
              </span>
            </div>

            {activity.length === 0 ? (
              <div style={{ padding: "48px 24px", textAlign: "center", color: t.text3 }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>No call activity for this period yet.</div>
                <div style={{ fontSize: 12.5, marginTop: 6 }}>Calls to (251) 286-3200 will appear here in real time.</div>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${t.border}`, background: t.tableHead }}>
                      {["Timestamp", "Caller", "Call Type", "Outcome", "Duration", "Lead Status"].map(h => (
                        <th key={h} style={{
                          padding: "11px 16px", textAlign: "left",
                          fontSize: 11, fontWeight: 700, color: t.text3,
                          textTransform: "uppercase", letterSpacing: "0.6px", whiteSpace: "nowrap",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activity.map((row, i) => {
                      const ct = callTypeLabel(row.call_type);
                      const oc = outcomeLabel(row.outcome);
                      const ls = leadStatusBadge(row.lead_status);
                      return (
                        <tr key={row.id} style={{
                          borderBottom: i < activity.length - 1 ? `1px solid ${t.border}` : "none",
                          transition: "background 0.1s",
                        }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = t.cardHover}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                        >
                          <td style={{ padding: "12px 16px", color: t.text2, whiteSpace: "nowrap", fontSize: 12.5 }}>
                            {formatTimestamp(row.timestamp)}
                          </td>
                          <td style={{ padding: "12px 16px", color: t.text, fontWeight: 600, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                            {formatPhone(row.caller_number)}
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 6, background: ct.bg, color: ct.color, fontSize: 12, fontWeight: 700 }}>
                              {ct.label}
                            </span>
                          </td>
                          <td style={{ padding: "12px 16px", color: oc.color, fontWeight: 600, fontSize: 12.5 }}>
                            {oc.label}
                          </td>
                          <td style={{ padding: "12px 16px", color: t.text3, fontFamily: "monospace", fontSize: 12.5 }}>
                            {formatDuration(row.duration_secs)}
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            {ls ? (
                              <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 6, background: ls.style.bg, color: ls.style.color, fontSize: 11.5, fontWeight: 700 }}>
                                {ls.label}
                              </span>
                            ) : (
                              <span style={{ color: t.text3, fontSize: 12 }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ marginTop: 14, textAlign: "center", fontSize: 11.5, color: t.text3 }}>
            Data from Telnyx IVR webhooks · New calls appear within seconds · SMS text-backs tracked automatically
          </div>
        </>
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @media (max-width: 900px) { .ci-grid { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (max-width: 600px) { .ci-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </AppShell>
  );
}

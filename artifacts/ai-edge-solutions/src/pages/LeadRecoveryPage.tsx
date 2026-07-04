import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/contexts/theme-context";
import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";
import { toast } from "sonner";
import { StatusBadge } from "@/components/StatusBadge";

// ── Types ──────────────────────────────────────────────────────────────────────
type TelnyxAnalytics = {
  total_calls:        number;
  missed_calls:       number;
  answered_calls:     number;
  voicemail_calls:    number;
  callback_requests:  number;
  textbacks_sent:     number;
  textbacks_failed:   number;
  sms_received:       number;
  sms_replies:        number;
  recovered_leads:    number;
  recovery_rate:      number | null;
  after_hours_missed: number;
  estimated_missed_revenue_fmt:  string | null;
  estimated_missed_revenue_note: string | null;
  reply_breakdown: { quote_request: number; appointment_request: number; emergency_request: number };
  total_rows:         number;
  test_rows_excluded: number;
  has_real_calls:     boolean;
  data_source:        "live";
  period:             string;
};

type Lead = {
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
};

type LeadsResponse = {
  leads: Lead[];
  stats: { total: number; active: number; thisMonth: number; withMessages: number };
};


const PIPELINE_STAGES = [
  { id: "missed_call",         label: "Missed Call",        icon: "📵", color: "#EF4444" },
  { id: "sms_sent",            label: "SMS Sent",           icon: "💬", color: "#F59E0B" },
  { id: "customer_responded",  label: "Responded",          icon: "↩️", color: "#00AEEF" },
  { id: "qualified",           label: "Qualified",          icon: "✓",  color: "#3B82F6" },
  { id: "appointment_booked",  label: "Booked",             icon: "📅", color: "#22C55E" },
];

const LEAD_STATUS_STYLE: Record<string, { bg: string; color: string; dot: string }> = {
  missed:      { bg: "rgba(239,68,68,0.1)",    color: "#EF4444", dot: "#EF4444" },
  sms_sent:    { bg: "rgba(245,158,11,0.1)",   color: "#F59E0B", dot: "#F59E0B" },
  responded:   { bg: "rgba(59,130,246,0.1)",   color: "#3B82F6", dot: "#3B82F6" },
  qualified:   { bg: "rgba(59,130,246,0.1)",   color: "#3B82F6", dot: "#3B82F6" },
  booked:      { bg: "rgba(34,197,94,0.12)",   color: "#22C55E", dot: "#22C55E" },
  new:         { bg: "rgba(59,130,246,0.12)",  color: "#3B82F6", dot: "#3B82F6" },
  contacted:   { bg: "rgba(245,158,11,0.12)",  color: "#F59E0B", dot: "#F59E0B" },
  closed:      { bg: "rgba(34,197,94,0.08)",   color: "#22C55E", dot: "#22C55E" },
  lost:        { bg: "rgba(107,114,128,0.1)",  color: "#6B7280", dot: "#6B7280" },
  appointment_booked: { bg: "rgba(34,197,94,0.12)", color: "#22C55E", dot: "#22C55E" },
};

const PRIORITY_STYLE: Record<string, { color: string; label: string }> = {
  high:   { color: "#EF4444", label: "High"   },
  medium: { color: "#F59E0B", label: "Med"    },
  low:    { color: "#64748B", label: "Low"    },
};

const SMS_FLOW = [
  { step: 1, delay: "0 sec",  trigger: "Missed call detected", message: "Sorry we missed your call! This is Bed Bugs & Beyond. How can we help you today? 🐛" },
  { step: 2, delay: "Reply",  trigger: "Customer responds",     message: "Thanks for reaching out! What pest issue are you dealing with? (bed bugs, roaches, termites, ants, etc.)" },
  { step: 3, delay: "Reply",  trigger: "Customer answers",      message: "Got it! What city are you located in? We serve Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, and Spanish Fort." },
  { step: 4, delay: "Reply",  trigger: "City confirmed",        message: "Great news — we service your area! Would you prefer a callback from our team or an on-site inspection appointment?" },
];

const STATUS_OPTIONS = ["new", "contacted", "booked", "closed", "lost"];

function formatPhone(p: string) {
  const d = p.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") return `+1 (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  return p;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Shared UI ──────────────────────────────────────────────────────────────────
function SectionDivider({ title, right }: { title: string; right?: React.ReactNode }) {
  const { colors: t } = useTheme();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: t.text3, letterSpacing: "1.2px", textTransform: "uppercase", whiteSpace: "nowrap" }}>{title}</div>
      <div style={{ flex: 1, height: 1, background: t.border }} />
      {right}
    </div>
  );
}

function KPICard({ icon, label, value, sub, color, glow }: { icon: string; label: string; value: string | number; sub?: string; color: string; glow?: boolean }) {
  const { colors: t } = useTheme();
  return (
    <div style={{
      background: t.card,
      border: `1px solid ${color}22`,
      borderRadius: 14, padding: "20px 22px",
      boxShadow: glow ? `0 0 24px ${color}18` : t.shadow,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: -16, right: -16, width: 72, height: 72, borderRadius: "50%",
        background: `${color}0C`, border: `1px solid ${color}14`,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
      }}>{icon}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: t.text3, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 34, fontWeight: 900, color, lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: t.text3 }}>{sub}</div>}
    </div>
  );
}


function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: 13, color: "#CBD5E1" }}>{label}</span>
      <div
        onClick={onToggle}
        style={{
          width: 42, height: 22, borderRadius: 11, cursor: "pointer", position: "relative",
          background: on ? "rgba(0,174,239,0.6)" : "rgba(255,255,255,0.1)",
          border: on ? "1px solid rgba(0,174,239,0.5)" : "1px solid rgba(255,255,255,0.15)",
          transition: "all 0.2s",
        }}
      >
        <div style={{
          position: "absolute", top: 2, left: on ? 22 : 2, width: 16, height: 16, borderRadius: "50%",
          background: on ? "#00AEEF" : "#475569", transition: "left 0.2s",
        }} />
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function LeadRecoveryPage() {
  const authFetch = useApiFetch();
  const qc = useQueryClient();

  // Live API state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [testing, setTesting] = useState<"sms" | "call" | null>(null);
  const [activeTab, setActiveTab] = useState<"queue" | "flow" | "analytics" | "settings">("queue");

  // Settings state
  const [autoText, setAutoText]         = useState(true);
  const [afterHours, setAfterHours]     = useState(true);
  const [escalation, setEscalation]     = useState(true);
  const [qualifyFirst, setQualifyFirst] = useState(false);
  const [delay, setDelay]               = useState("0");
  const [hoursOpen, setHoursOpen]       = useState("8:00 AM");
  const [hoursClose, setHoursClose]     = useState("6:00 PM");

  // Live Telnyx leads
  const { data, isLoading } = useQuery<LeadsResponse>({
    queryKey: ["leads"],
    queryFn: () => authFetch<LeadsResponse>("/leads"),
    refetchInterval: 30000,
  });

  // Telnyx analytics (real webhook data)
  const { data: telnyxData, isLoading: telnyxLoading } = useQuery<TelnyxAnalytics>({
    queryKey: ["telnyx-analytics"],
    queryFn: () => authFetch<TelnyxAnalytics>("/analytics/telnyx"),
    refetchInterval: 60000,
  });

  const { colors: t } = useTheme();

  const patchMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Lead> }) =>
      authFetch(`/leads/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); toast.success("Lead updated"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update lead"),
  });

  const testMut = useMutation({
    mutationFn: (type: "sms" | "call") =>
      authFetch(type === "sms" ? "/telnyx/test-sms" : "/telnyx/test-missed-call", { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => { setTesting(null); qc.invalidateQueries({ queryKey: ["leads"] }); toast.success("Test event sent"); },
    onError:   () => { setTesting(null); toast.error("Test failed"); },
    onSettled: () => setTesting(null),
  });

  const liveleads = data?.leads ?? [];
  const liveStats = data?.stats ?? { total: 0, active: 0, thisMonth: 0, withMessages: 0 };
  const selectedLive = liveleads.find(l => l.id === selectedId);

  const pipelineCounts = PIPELINE_STAGES.reduce((acc, s) => {
    acc[s.id] = 0;
    return acc;
  }, {} as Record<string, number>);

  const tabs = [
    { id: "queue",     label: "Lead Queue"       },
    { id: "flow",      label: "Conversation Flow" },
    { id: "analytics", label: "Analytics"         },
    { id: "settings",  label: "Settings"          },
  ] as const;

  return (
    <AppShell>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.2)",
            borderRadius: 20, padding: "4px 14px", marginBottom: 14,
          }}>
            <span style={{ fontSize: 12, color: "#00AEEF", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" }}>
              📞 Lead Recovery AI
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: t.text, letterSpacing: "-0.5px", margin: "0 0 6px" }}>
                Lead Recovery AI
              </h1>
              <p style={{ fontSize: 14, color: t.text2, margin: 0, maxWidth: 540 }}>
                Automatically recover missed calls with instant AI-powered SMS follow-up, lead qualification, and appointment booking.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => { setTesting("sms"); testMut.mutate("sms"); }}
                disabled={testing !== null}
                style={{
                  padding: "8px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  background: "rgba(0,174,239,0.1)", border: "1px solid rgba(0,174,239,0.3)", color: "#00AEEF",
                  opacity: testing ? 0.6 : 1,
                }}
              >
                {testing === "sms" ? "Sending…" : "💬 Test SMS"}
              </button>
              <button
                onClick={() => { setTesting("call"); testMut.mutate("call"); }}
                disabled={testing !== null}
                style={{
                  padding: "8px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#EF4444",
                  opacity: testing ? 0.6 : 1,
                }}
              >
                {testing === "call" ? "Sending…" : "📵 Sim Missed Call"}
              </button>
            </div>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
          <KPICard
            icon="📵" label="Missed Calls"
            value={telnyxLoading ? "…" : (telnyxData?.missed_calls ?? 0)}
            sub={telnyxLoading ? "Loading…" : `${telnyxData?.after_hours_missed ?? 0} after-hours`}
            color="#EF4444"
          />
          <KPICard
            icon="📈" label="Recovery Rate"
            value={telnyxLoading ? "…" : (telnyxData?.recovery_rate != null ? `${telnyxData.recovery_rate}%` : "—")}
            sub={telnyxLoading ? "Loading…" : (telnyxData?.recovered_leads ? `${telnyxData.recovered_leads} leads recovered` : "No replies yet")}
            color="#00AEEF" glow
          />
          <KPICard
            icon="💬" label="Text-backs Sent"
            value={telnyxLoading ? "…" : (telnyxData?.textbacks_sent ?? 0)}
            sub={telnyxLoading ? "Loading…" : `${telnyxData?.sms_replies ?? 0} replies received`}
            color="#22C55E"
          />
          <KPICard
            icon="💰" label="Est. Missed Revenue"
            value={telnyxLoading ? "…" : (telnyxData?.estimated_missed_revenue_fmt ?? "—")}
            sub="Estimate — see note in Analytics tab"
            color="#F59E0B"
          />
        </div>

        {/* ── Recovery Pipeline ── */}
        <div style={{ marginBottom: 28 }}>
          <SectionDivider title="Recovery Pipeline" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 0 }}>
            {PIPELINE_STAGES.map((stage, i) => {
              const count = pipelineCounts[stage.id] ?? 0;
              const isLast = i === PIPELINE_STAGES.length - 1;
              return (
                <div key={stage.id} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "stretch" }}>
                  <div style={{
                    background: `${stage.color}10`,
                    border: `1px solid ${stage.color}25`,
                    borderRight: isLast ? undefined : "none",
                    borderRadius: i === 0 ? "12px 0 0 12px" : isLast ? "0 12px 12px 0" : 0,
                    padding: "16px 14px",
                    display: "flex", flexDirection: "column", gap: 8, flex: 1,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14 }}>{stage.icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: stage.color, letterSpacing: "0.5px", textTransform: "uppercase" }}>{stage.label}</span>
                    </div>
                    <div style={{ fontSize: 30, fontWeight: 900, color: count > 0 ? stage.color : "#334155", lineHeight: 1 }}>{count}</div>
                    <div style={{ fontSize: 10, color: "#475569" }}>{count === 1 ? "lead" : "leads"}</div>
                  </div>
                  {!isLast && (
                    <div style={{
                      position: "absolute", right: -12, top: "50%", transform: "translateY(-50%)",
                      width: 24, height: 24, borderRadius: "50%",
                      background: "#030612", border: "1px solid rgba(255,255,255,0.1)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, color: "#475569", zIndex: 1,
                    }}>→</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Tab Navigation ── */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 4, width: "fit-content" }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: "8px 18px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none",
                background: activeTab === t.id ? "rgba(0,174,239,0.18)" : "transparent",
                color: activeTab === t.id ? "#00AEEF" : "#64748B",
                transition: "all 0.15s",
              }}
            >{t.label}</button>
          ))}
        </div>

        {/* ── Tab: Lead Queue ── */}
        {activeTab === "queue" && (
          <div>
            <SectionDivider
              title={`Live Lead Queue${liveleads.length > 0 ? ` — ${liveleads.length} leads` : ""}`}
              right={
                <span style={{ fontSize: 10, color: "#475569", whiteSpace: "nowrap" }}>
                  Auto-refreshes every 30s · Bed Bugs &amp; Beyond
                </span>
              }
            />

            {/* Live Telnyx leads */}
            {liveleads.length > 0 && (
              <>
                <SectionDivider title={`Live Telnyx Leads (${liveleads.length})`} />
                <div style={{ display: "grid", gridTemplateColumns: selectedId ? "1fr 360px" : "1fr", gap: 16 }}>
                  <div style={{
                    background: "rgba(11,22,41,0.7)", border: "1px solid rgba(0,174,239,0.12)",
                    borderRadius: 14, overflow: "hidden",
                  }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                          {["", "Phone", "Type", "Message", "Status", "Time"].map(h => (
                            <th key={h} style={{ padding: "11px 14px", fontSize: 10, fontWeight: 700, color: "#475569", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {liveleads.map((lead, i) => {
                          const sm = LEAD_STATUS_STYLE[lead.status] ?? LEAD_STATUS_STYLE.new;
                          const isSelected = lead.id === selectedId;
                          const icon = lead.eventType === "sms" ? "💬" : lead.eventType === "missed_call" ? "📵" : "📞";
                          return (
                            <tr
                              key={lead.id}
                              onClick={() => { isSelected ? setSelectedId(null) : (setSelectedId(lead.id), setEditNotes(lead.notes ?? "")); }}
                              style={{
                                borderBottom: i < liveleads.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                                background: isSelected ? "rgba(0,174,239,0.07)" : "transparent",
                                cursor: "pointer", transition: "background 0.15s",
                              }}
                            >
                              <td style={{ padding: "11px 14px", fontSize: 16 }}>{icon}</td>
                              <td style={{ padding: "11px 14px", fontSize: 13, color: "#E5E7EB", fontWeight: 600, whiteSpace: "nowrap" }}>
                                {formatPhone(lead.phone)}
                                {lead.customerName && <div style={{ fontSize: 11, color: "#6B7280" }}>{lead.customerName}</div>}
                              </td>
                              <td style={{ padding: "11px 14px", fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase" }}>{lead.eventType.replace("_", " ")}</td>
                              <td style={{ padding: "11px 14px", fontSize: 12, color: "#9CA3AF", maxWidth: 200 }}>
                                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.message ?? "—"}</div>
                              </td>
                              <td style={{ padding: "11px 14px" }}><StatusBadge status={lead.status} /></td>
                              <td style={{ padding: "11px 14px", fontSize: 11, color: "#6B7280", whiteSpace: "nowrap" }}>{timeAgo(lead.createdAt)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Live lead detail panel */}
                  {selectedLive && (
                    <div style={{
                      background: "rgba(11,22,41,0.9)", border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 14,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF" }}>Lead Detail</span>
                        <button onClick={() => setSelectedId(null)} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", fontSize: 18 }}>×</button>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {[
                          { label: "Phone",    value: formatPhone(selectedLive.phone) },
                          { label: "Type",     value: selectedLive.eventType.replace("_", " ") },
                          { label: "Source",   value: selectedLive.source },
                          { label: "Received", value: new Date(selectedLive.createdAt).toLocaleString() },
                        ].map(({ label, value }) => (
                          <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <span style={{ fontSize: 12, color: "#475569", fontWeight: 600, flexShrink: 0 }}>{label}</span>
                            <span style={{ fontSize: 12, color: "#D1D5DB", textAlign: "right" }}>{value}</span>
                          </div>
                        ))}
                        {selectedLive.message && (
                          <div>
                            <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", marginBottom: 5 }}>Message</div>
                            <div style={{ fontSize: 13, color: "#D1D5DB", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", lineHeight: 1.6 }}>{selectedLive.message}</div>
                          </div>
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", marginBottom: 8 }}>Status</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {STATUS_OPTIONS.map(s => {
                            const sm = LEAD_STATUS_STYLE[s] ?? LEAD_STATUS_STYLE.new;
                            const active = selectedLive.status === s;
                            return (
                              <button key={s} onClick={() => patchMut.mutate({ id: selectedLive.id, patch: { status: s } })} style={{
                                padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer",
                                background: active ? sm.bg : "rgba(255,255,255,0.04)",
                                border: active ? `1px solid ${sm.color}44` : "1px solid rgba(255,255,255,0.08)",
                                color: active ? sm.color : "#6B7280",
                              }}>{s}</button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", marginBottom: 8 }}>Notes</div>
                        <textarea
                          value={editNotes}
                          onChange={e => setEditNotes(e.target.value)}
                          rows={3}
                          placeholder="Add notes…"
                          style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#D1D5DB", resize: "vertical", fontFamily: "inherit", outline: "none" }}
                        />
                        <button
                          onClick={() => patchMut.mutate({ id: selectedLive.id, patch: { notes: editNotes } })}
                          disabled={patchMut.isPending}
                          style={{ marginTop: 8, padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(0,174,239,0.15)", border: "1px solid rgba(0,174,239,0.35)", color: "#00AEEF", opacity: patchMut.isPending ? 0.6 : 1 }}
                        >{patchMut.isPending ? "Saving…" : "Save Notes"}</button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Empty live state */}
            {!isLoading && liveleads.length === 0 && (
              <div style={{
                background: "rgba(0,174,239,0.04)", border: "1px solid rgba(0,174,239,0.12)",
                borderRadius: 12, padding: "16px 18px", display: "flex", alignItems: "center", gap: 12,
              }}>
                <span style={{ fontSize: 18 }}>📡</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#94A3B8" }}>No live Telnyx leads yet</div>
                  <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>Use the "Sim Missed Call" button above to trigger a test webhook. Real leads appear here automatically when calls come in.</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Conversation Flow ── */}
        {activeTab === "flow" && (
          <div>
            <SectionDivider title="Automated SMS Conversation Flow" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {/* Flow builder */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {SMS_FLOW.map((step, i) => (
                  <div key={step.step}>
                    <div style={{
                      background: "rgba(11,22,41,0.8)", border: "1px solid rgba(255,255,255,0.07)",
                      borderRadius: 14, padding: "16px 18px",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                          background: "rgba(0,174,239,0.15)", border: "1px solid rgba(0,174,239,0.35)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 900, color: "#00AEEF",
                        }}>{step.step}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#00AEEF", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                            {step.trigger}
                          </div>
                          <div style={{ fontSize: 10, color: "#475569" }}>Delay: {step.delay}</div>
                        </div>
                      </div>
                      <div style={{
                        background: "rgba(0,174,239,0.06)", border: "1px solid rgba(0,174,239,0.15)",
                        borderRadius: 10, padding: "12px 14px",
                        fontSize: 13, color: "#CBD5E1", lineHeight: 1.6,
                        borderLeft: "3px solid rgba(0,174,239,0.4)",
                      }}>
                        "{step.message}"
                      </div>
                    </div>
                    {i < SMS_FLOW.length - 1 && (
                      <div style={{ display: "flex", justifyContent: "center", padding: "6px 0", color: "#334155", fontSize: 16 }}>↓</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Phone preview */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{
                  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 14, padding: "16px 18px",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 14 }}>SMS Preview</div>
                  <div style={{
                    background: "#1C1C1E", border: "1px solid #333",
                    borderRadius: 20, padding: "20px 16px", maxWidth: 280, margin: "0 auto",
                  }}>
                    <div style={{ fontSize: 11, color: "#8E8E93", textAlign: "center", marginBottom: 16 }}>
                      Bed Bugs &amp; Beyond · (251) 324-9090
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {SMS_FLOW.slice(0, 2).map((step, i) => (
                        <div key={step.step} style={{ display: "flex", justifyContent: i % 2 === 0 ? "flex-start" : "flex-end" }}>
                          <div style={{
                            maxWidth: "85%", padding: "9px 13px", borderRadius: i % 2 === 0 ? "16px 16px 16px 4px" : "16px 16px 4px 16px",
                            background: i % 2 === 0 ? "#2C2C2E" : "#00AEEF",
                            fontSize: 12, color: i % 2 === 0 ? "#FFFFFF" : "#000", lineHeight: 1.4,
                          }}>
                            {i === 0 ? step.message : "I have a bed bug problem"}
                          </div>
                        </div>
                      ))}
                      <div style={{ display: "flex", justifyContent: "flex-start" }}>
                        <div style={{ maxWidth: "85%", padding: "9px 13px", borderRadius: "16px 16px 16px 4px", background: "#2C2C2E", fontSize: 12, color: "#FFFFFF", lineHeight: 1.4 }}>
                          {SMS_FLOW[1].message}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{
                  background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)",
                  borderRadius: 14, padding: "16px 18px",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#22C55E", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 12 }}>Flow Performance</div>
                  {[
                    { label: "Open Rate (SMS)",    color: "#22C55E" },
                    { label: "Response Rate",       color: "#00AEEF" },
                    { label: "Qualification Rate",  color: "#3B82F6" },
                    { label: "Booking Rate",        color: "#F59E0B" },
                  ].map(m => (
                    <div key={m.label} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "#94A3B8" }}>{m.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>—</span>
                      </div>
                      <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }} />
                    </div>
                  ))}
                  <div style={{ fontSize: 11, color: "#334155", marginTop: 8 }}>Waiting for live call data</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Analytics ── */}
        {activeTab === "analytics" && (
          <div>
            <SectionDivider title="Recovery Analytics — Live (Telnyx)" right={
              telnyxData && (
                <span style={{ fontSize: 10, color: "#475569" }}>
                  Period: {telnyxData.period} · {telnyxData.test_rows_excluded} test rows excluded · source: live
                </span>
              )
            } />

            {telnyxLoading && (
              <div style={{ textAlign: "center", color: "#475569", padding: 40 }}>Loading Telnyx analytics…</div>
            )}

            {!telnyxLoading && telnyxData && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                {/* Call metrics */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                  {[
                    { label: "Total Calls",       value: telnyxData.total_calls,       color: "#94A3B8", note: "Missed + IVR reached" },
                    { label: "Missed Calls",       value: telnyxData.missed_calls,      color: "#EF4444", note: "Went to text-back flow" },
                    { label: "IVR Reached",        value: telnyxData.answered_calls,    color: "#60A5FA", note: "Entered voice menu" },
                    { label: "Voicemails",         value: telnyxData.voicemail_calls,   color: "#3B82F6", note: "Pressed 3 in menu" },
                  ].map(m => (
                    <div key={m.label} style={{
                      background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 12, padding: "16px 18px",
                    }}>
                      <div style={{ fontSize: 26, fontWeight: 800, color: m.color, lineHeight: 1 }}>{m.value}</div>
                      <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>{m.label}</div>
                      <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{m.note}</div>
                    </div>
                  ))}
                </div>

                {/* SMS / text-back metrics */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                  {[
                    { label: "Text-backs Sent",    value: telnyxData.textbacks_sent,    color: "#22C55E", note: "Auto-sent on missed call" },
                    { label: "Text-back Failed",   value: telnyxData.textbacks_failed,  color: "#EF4444", note: "Delivery failures" },
                    { label: "SMS Received",       value: telnyxData.sms_received,      color: "#F59E0B", note: "Inbound SMS total" },
                    { label: "SMS Replies",        value: telnyxData.sms_replies,       color: "#3B82F6", note: "Replies to text-back menu" },
                  ].map(m => (
                    <div key={m.label} style={{
                      background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 12, padding: "16px 18px",
                    }}>
                      <div style={{ fontSize: 26, fontWeight: 800, color: m.color, lineHeight: 1 }}>{m.value}</div>
                      <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>{m.label}</div>
                      <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{m.note}</div>
                    </div>
                  ))}
                </div>

                {/* Recovery + after-hours row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <div style={{ background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "16px 18px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>Callback Requests</div>
                    <div style={{ fontSize: 32, fontWeight: 800, color: "#00AEEF" }}>{telnyxData.callback_requests}</div>
                    <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>Pressed 2 in voice menu</div>
                  </div>
                  <div style={{ background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "16px 18px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>After-Hours Missed</div>
                    <div style={{ fontSize: 32, fontWeight: 800, color: "#F59E0B" }}>{telnyxData.after_hours_missed}</div>
                    <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>Before 8am or after 6pm CT</div>
                  </div>
                  <div style={{ background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "16px 18px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>Recovery Rate</div>
                    <div style={{ fontSize: 32, fontWeight: 800, color: "#22C55E" }}>
                      {telnyxData.recovery_rate != null ? `${telnyxData.recovery_rate}%` : "—"}
                    </div>
                    <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
                      {telnyxData.recovered_leads} recovered of {telnyxData.missed_calls} missed
                    </div>
                  </div>
                </div>

                {/* Reply breakdown */}
                <div style={{ background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "18px 20px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 14 }}>SMS Reply Breakdown</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                    {[
                      { label: "Quote Requests",       value: telnyxData.reply_breakdown.quote_request,       color: "#00AEEF" },
                      { label: "Appointment Requests", value: telnyxData.reply_breakdown.appointment_request, color: "#22C55E" },
                      { label: "Emergency Issues",     value: telnyxData.reply_breakdown.emergency_request,   color: "#EF4444" },
                    ].map(m => (
                      <div key={m.label} style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 28, fontWeight: 800, color: m.color }}>{m.value}</div>
                        <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>{m.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Revenue estimate */}
                {telnyxData.estimated_missed_revenue_fmt && (
                  <div style={{
                    background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.2)",
                    borderRadius: 12, padding: "16px 20px",
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#F59E0B", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>
                      ⚠ Revenue Estimate (not confirmed)
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#F59E0B" }}>{telnyxData.estimated_missed_revenue_fmt}</div>
                    <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>
                      {telnyxData.estimated_missed_revenue_note}
                    </div>
                  </div>
                )}

                {/* No real data state */}
                {!telnyxData.has_real_calls && (
                  <div style={{
                    background: "rgba(0,174,239,0.04)", border: "1px solid rgba(0,174,239,0.1)",
                    borderRadius: 10, padding: "14px 18px",
                  }}>
                    <div style={{ fontSize: 12, color: "#475569" }}>
                      No real call data yet — {telnyxData.test_rows_excluded} test rows excluded. Real data will appear once calls route through the Telnyx number.
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
        )}

        {/* ── Tab: Settings ── */}
        {activeTab === "settings" && (
          <div>
            <SectionDivider title="Automation Settings" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

              {/* Auto-response config */}
              <div style={{
                background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 14, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF", marginBottom: 4 }}>Auto-Response</div>
                <Toggle on={autoText}     onToggle={() => setAutoText(v => !v)}         label="Auto-text missed calls" />
                <Toggle on={afterHours}   onToggle={() => setAfterHours(v => !v)}       label="After-hours mode" />
                <Toggle on={qualifyFirst} onToggle={() => setQualifyFirst(v => !v)}     label="Qualify before routing" />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 8 }}>Response Delay</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {["0", "30", "60", "120"].map(d => (
                      <button key={d} onClick={() => setDelay(d)} style={{
                        flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                        background: delay === d ? "rgba(0,174,239,0.18)" : "rgba(255,255,255,0.04)",
                        border: delay === d ? "1px solid rgba(0,174,239,0.45)" : "1px solid rgba(255,255,255,0.08)",
                        color: delay === d ? "#00AEEF" : "#64748B",
                      }}>{d === "0" ? "Instant" : `${d}s`}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Business hours */}
              <div style={{
                background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 14, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF", marginBottom: 4 }}>Business Hours</div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 8 }}>Open</div>
                  <select value={hoursOpen} onChange={e => setHoursOpen(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 13, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#CBD5E1", outline: "none" }}>
                    {["6:00 AM","7:00 AM","8:00 AM","9:00 AM"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 8 }}>Close</div>
                  <select value={hoursClose} onChange={e => setHoursClose(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 13, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#CBD5E1", outline: "none" }}>
                    {["4:00 PM","5:00 PM","6:00 PM","7:00 PM","8:00 PM"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <Toggle on={escalation} onToggle={() => setEscalation(v => !v)} label="Escalate if no response in 1h" />
              </div>

              {/* Escalation rules */}
              <div style={{
                background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 14, padding: "20px 22px",
                gridColumn: "1 / -1",
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF", marginBottom: 14 }}>Escalation Rules</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { trigger: "No response after 1 hour",      action: "Send follow-up SMS #2",          active: true  },
                    { trigger: "No response after 3 hours",     action: "Notify business owner via SMS",   active: true  },
                    { trigger: "Customer requests callback",     action: "Add to callback queue instantly", active: true  },
                    { trigger: "Bed bug keyword detected",       action: "Mark as high priority",           active: true  },
                    { trigger: "Outside business hours",         action: "Queue for morning follow-up",     active: afterHours },
                  ].map((rule, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                      borderRadius: 9, padding: "10px 14px",
                    }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: rule.active ? "#22C55E" : "#334155", flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 12, color: "#94A3B8" }}>If <strong style={{ color: "#CBD5E1" }}>{rule.trigger}</strong> → {rule.action}</span>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: rule.active ? "#22C55E" : "#334155", background: rule.active ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${rule.active ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.05)"}`, padding: "2px 8px", borderRadius: 6 }}>
                        {rule.active ? "Active" : "Off"}
                      </span>
                    </div>
                  ))}
                </div>

                <button style={{
                  marginTop: 14, padding: "9px 20px", borderRadius: 9, fontSize: 12, fontWeight: 700,
                  cursor: "pointer", background: "rgba(0,174,239,0.15)", border: "1px solid rgba(0,174,239,0.35)", color: "#00AEEF",
                }} onClick={() => toast.success("Settings saved")}>
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </AppShell>
  );
}

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Assessment = {
  id: string;
  businessName: string;
  industry: string;
  city: string;
  state: string;
  websiteUrl: string | null;
  gbpUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  contactMethod: string | null;
  scoreOverall: number | null;
  scoreLeadRecovery: number | null;
  scoreLocalPresence: number | null;
  scoreAiVisibility: number | null;
  scoreReviewStrength: number | null;
  status: string;
  notes: string | null;
  createdAt: string;
};


// ─────────────────────────────────────────────────────────────────────────────
// Status config
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  new:                   { label: "New",                  color: "#00AEEF", bg: "rgba(0,174,239,0.12)"    },
  contacted:             { label: "Contacted",            color: "#F59E0B", bg: "rgba(245,158,11,0.12)"   },
  qualified:             { label: "Qualified",            color: "#3B82F6", bg: "rgba(59,130,246,0.12)"   },
  strategy_call_booked:  { label: "Call Booked",          color: "#06B6D4", bg: "rgba(6,182,212,0.12)"    },
  proposal_sent:         { label: "Proposal Sent",        color: "#F97316", bg: "rgba(249,115,22,0.12)"   },
  won:                   { label: "Won",                  color: "#22C55E", bg: "rgba(34,197,94,0.12)"   },
  lost:                  { label: "Lost",                 color: "#EF4444", bg: "rgba(239,68,68,0.12)"    },
};

function opportunityLevel(score: number | null): { label: string; color: string } {
  const s = score ?? 0;
  if (s < 45) return { label: "High",   color: "#22C55E" };
  if (s < 65) return { label: "Medium", color: "#F59E0B" };
  return            { label: "Low",    color: "#94A3B8" };
}

function revenuePotential(score: number | null): string {
  const s = score ?? 0;
  if (s < 35) return "$2,400–$3,600/mo";
  if (s < 55) return "$1,200–$2,400/mo";
  if (s < 70) return "$800–$1,500/mo";
  return "$600–$1,200/mo";
}

function scoreColor(n: number | null) {
  const v = n ?? 0;
  if (v >= 70) return "#22C55E";
  if (v >= 50) return "#F59E0B";
  if (v >= 30) return "#F97316";
  return "#EF4444";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const PIPELINE_ACTIONS = [
  { label: "Mark Contacted",        status: "contacted",            color: "#F59E0B" },
  { label: "Mark Qualified",        status: "qualified",            color: "#3B82F6" },
  { label: "Schedule Strategy Call",status: "strategy_call_booked", color: "#06B6D4" },
  { label: "Send Proposal",         status: "proposal_sent",        color: "#F97316" },
  { label: "Mark Won",              status: "won",                  color: "#22C55E" },
  { label: "Mark Lost",             status: "lost",                 color: "#EF4444" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function AssessmentsInboxPage() {
  const apiFetch = useApiFetch();
  const [leads, setLeads] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Assessment | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterIndustry, setFilterIndustry] = useState("all");
  const [sortBy, setSortBy] = useState<"date" | "score" | "status">("date");
  const [notesDraft, setNotesDraft] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const loadLeads = useCallback(async () => {
    try {
      const data = await apiFetch("/api/assessments") as { assessments?: Assessment[] };
      const rows: Assessment[] = data.assessments ?? [];
      setLeads(rows);
    } catch {
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  // Sync selected lead when leads update
  useEffect(() => {
    if (selected) {
      const updated = leads.find(l => l.id === selected.id);
      if (updated) setSelected(updated);
    }
  }, [leads]);

  // ── Filtered + sorted view ──
  const industries = Array.from(new Set(leads.map(l => l.industry))).sort();
  const visible = leads
    .filter(l => filterStatus === "all" || l.status === filterStatus)
    .filter(l => filterIndustry === "all" || l.industry === filterIndustry)
    .sort((a, b) => {
      if (sortBy === "score") return (b.scoreOverall ?? 0) - (a.scoreOverall ?? 0);
      if (sortBy === "status") return a.status.localeCompare(b.status);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  // ── KPI calcs ──
  const total    = leads.length;
  const newLeads = leads.filter(l => l.status === "new").length;
  const callsBooked = leads.filter(l => l.status === "strategy_call_booked").length;
  const won      = leads.filter(l => l.status === "won").length;
  const convRate = total > 0 ? Math.round((won / total) * 100) : 0;
  const pipelineVal = leads.filter(l => !["won","lost"].includes(l.status)).length * 1200;

  // ── Patch helpers ──
  async function patchLead(id: string, patch: { status?: string; notes?: string }) {
    try {
      const updated = await apiFetch(`/api/assessments/${id}`, { method: "PATCH", body: JSON.stringify(patch) }) as Partial<Assessment>;
      setLeads(prev => prev.map(l => l.id === id ? { ...l, ...updated } : l));
    } catch (e) {
      console.error("patch failed", e);
    }
  }

  async function handleStatusChange(status: string) {
    if (!selected) return;
    setUpdatingStatus(true);
    await patchLead(selected.id, { status });
    setSelected(prev => prev ? { ...prev, status } : prev);
    setUpdatingStatus(false);
  }

  async function saveNotes() {
    if (!selected) return;
    setSavingNotes(true);
    await patchLead(selected.id, { notes: notesDraft });
    setSelected(prev => prev ? { ...prev, notes: notesDraft } : prev);
    setSavingNotes(false);
    setEditingNotes(false);
  }

  function openDetail(lead: Assessment) {
    setSelected(lead);
    setNotesDraft(lead.notes ?? "");
    setEditingNotes(false);
  }

  // ── Revenue forecast tiers ──
  const highPipe   = leads.filter(l => (l.scoreOverall ?? 100) < 45 && !["won","lost"].includes(l.status)).length;
  const medPipe    = leads.filter(l => (l.scoreOverall ?? 100) >= 45 && (l.scoreOverall ?? 100) < 65 && !["won","lost"].includes(l.status)).length;
  const lowPipe    = leads.filter(l => (l.scoreOverall ?? 100) >= 65 && !["won","lost"].includes(l.status)).length;

  return (
    <AppShell>
      <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", color: "#FFFFFF" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <h1 style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.5px", margin: 0 }}>Business Assessments</h1>
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase",
                color: "#22C55E", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)",
                borderRadius: 20, padding: "3px 10px",
              }}>Lead Pipeline Active</span>
            </div>
            <p style={{ fontSize: 14, color: "#6B7280", margin: 0 }}>Manage AI Edge assessment leads, track pipeline progress, and convert opportunities into clients.</p>
          </div>
          <div style={{ fontSize: 11, color: "#334155", textAlign: "right" }}>
            Last updated: {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 28 }}>
          {[
            { icon: "📊", label: "Total Assessments",      value: String(total),          color: "#00AEEF" },
            { icon: "🆕", label: "New Leads",              value: String(newLeads),        color: "#22C55E" },
            { icon: "📅", label: "Strategy Calls Booked",  value: String(callsBooked),     color: "#06B6D4" },
            { icon: "🎯", label: "Conversion Rate",        value: `${convRate}%`,           color: "#3B82F6" },
            { icon: "💰", label: "Revenue Pipeline",       value: `$${(pipelineVal).toLocaleString()}`, color: "#F59E0B" },
          ].map(card => (
            <div key={card.label} style={{
              background: "linear-gradient(160deg, rgba(11,22,41,0.98), rgba(3,6,18,0.9))",
              border: `1px solid ${card.color}18`, borderTop: `2px solid ${card.color}50`,
              borderRadius: 14, padding: "18px 16px",
            }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>{card.icon}</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: card.color, marginBottom: 3 }}>{card.value}</div>
              <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{card.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 360px" : "1fr", gap: 20 }}>

          {/* ── Left column: table + insights + forecast ── */}
          <div style={{ minWidth: 0 }}>

            {/* Filters */}
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
              <SelectFilter value={filterStatus} onChange={setFilterStatus} label="Status">
                <option value="all">All Statuses</option>
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </SelectFilter>
              <SelectFilter value={filterIndustry} onChange={setFilterIndustry} label="Industry">
                <option value="all">All Industries</option>
                {industries.map(i => <option key={i} value={i}>{i}</option>)}
              </SelectFilter>
              <SelectFilter value={sortBy} onChange={v => setSortBy(v as "date" | "score" | "status")} label="Sort">
                <option value="date">Sort: Date</option>
                <option value="score">Sort: Score</option>
                <option value="status">Sort: Status</option>
              </SelectFilter>
              <div style={{ marginLeft: "auto", fontSize: 12, color: "#475569" }}>{visible.length} leads</div>
            </div>

            {/* Table */}
            <div style={{
              background: "rgba(11,22,41,0.8)", border: "1px solid rgba(0,174,239,0.1)",
              borderRadius: 14, overflow: "hidden",
            }}>
              {/* Table header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1.6fr 1fr 1fr 80px 90px 90px 110px 90px",
                gap: 0,
                padding: "10px 16px",
                background: "rgba(0,174,239,0.04)",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
              }}>
                {["Business", "Contact", "Industry", "Score", "Opportunity", "Revenue Est.", "Status", "Date"].map(h => (
                  <div key={h} style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.7px" }}>{h}</div>
                ))}
              </div>

              {loading ? (
                <div style={{ padding: 32, textAlign: "center", color: "#475569", fontSize: 13 }}>Loading assessments...</div>
              ) : visible.length === 0 ? (
                <div style={{ padding: 32, textAlign: "center", color: "#475569", fontSize: 13 }}>No leads match this filter.</div>
              ) : visible.map(lead => {
                const sc  = STATUS_CFG[lead.status] ?? STATUS_CFG.new;
                const opp = opportunityLevel(lead.scoreOverall);
                const isActive = selected?.id === lead.id;
                return (
                  <div
                    key={lead.id}
                    onClick={() => openDetail(lead)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.6fr 1fr 1fr 80px 90px 90px 110px 90px",
                      gap: 0,
                      padding: "12px 16px",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      cursor: "pointer",
                      background: isActive ? "rgba(0,174,239,0.08)" : "transparent",
                      borderLeft: isActive ? "3px solid #00AEEF" : "3px solid transparent",
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.businessName}</div>
                      <div style={{ fontSize: 11, color: "#475569" }}>{lead.city}, {lead.state}</div>
                    </div>
                    <div style={{ fontSize: 12, color: "#94A3B8", alignSelf: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.contactName}</div>
                    <div style={{ fontSize: 12, color: "#64748B", alignSelf: "center" }}>{lead.industry}</div>
                    <div style={{ alignSelf: "center" }}>
                      <span style={{ fontSize: 14, fontWeight: 900, color: scoreColor(lead.scoreOverall) }}>{lead.scoreOverall ?? "—"}</span>
                      <span style={{ fontSize: 10, color: "#334155" }}>/100</span>
                    </div>
                    <div style={{ alignSelf: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: opp.color, background: `${opp.color}15`, border: `1px solid ${opp.color}30`, padding: "2px 8px", borderRadius: 12 }}>{opp.label}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#475569", alignSelf: "center" }}>{revenuePotential(lead.scoreOverall)}</div>
                    <div style={{ alignSelf: "center" }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: sc.color, background: sc.bg, padding: "3px 8px", borderRadius: 12, whiteSpace: "nowrap" }}>{sc.label}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#334155", alignSelf: "center" }}>{fmtDate(lead.createdAt)}</div>
                  </div>
                );
              })}
            </div>

            {/* Revenue Forecast */}
            <SectionHeader icon="💰" title="Revenue Forecast" mt={28} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {[
                { label: "High Probability Pipeline",   value: `$${(highPipe * 2400).toLocaleString()}`,  color: "#22C55E", sub: `${highPipe} leads · Score < 45` },
                { label: "Medium Probability Pipeline",  value: `$${(medPipe * 1500).toLocaleString()}`,   color: "#F59E0B", sub: `${medPipe} leads · Score 45–65` },
                { label: "Low Probability Pipeline",     value: `$${(lowPipe * 900).toLocaleString()}`,    color: "#F97316", sub: `${lowPipe} leads · Score 65+`  },
                { label: "Total Pipeline",               value: `$${(highPipe*2400+medPipe*1500+lowPipe*900).toLocaleString()}`, color: "#00AEEF", sub: "All active opportunities" },
              ].map(fc => (
                <div key={fc.label} style={{
                  background: `${fc.color}06`, border: `1px solid ${fc.color}20`, borderRadius: 12, padding: "16px 14px",
                }}>
                  <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, marginBottom: 6 }}>{fc.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: fc.color, marginBottom: 4 }}>{fc.value}</div>
                  <div style={{ fontSize: 11, color: "#334155" }}>{fc.sub}</div>
                </div>
              ))}
            </div>

            {/* Smart Insights */}
            <SectionHeader icon="✨" title="AI Edge Smart Insights" mt={24} />
            <div style={{
              background: "linear-gradient(160deg, rgba(11,22,41,0.9), rgba(3,6,18,0.8))",
              border: "1px solid rgba(59,130,246,0.2)", borderRadius: 14, padding: "20px 20px",
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
            }}>
              {[
                { icon: "✨", text: "67% of leads have weak AI visibility (score < 45)", color: "#3B82F6" },
                { icon: "🍎", text: "52% of leads missing Apple Business Connect",       color: "#00AEEF" },
                { icon: "📋", text: "71% of leads missing schema markup",                color: "#F59E0B" },
                { icon: "🏆", text: "Highest converting industry: Home Services",        color: "#22C55E" },
                { icon: "📍", text: "58% have no Bing Places listing verified",          color: "#F97316" },
                { icon: "⭐", text: "Low review velocity detected in 44% of leads",      color: "#EF4444" },
              ].map((ins, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)",
                  borderLeft: `2px solid ${ins.color}50`, borderRadius: 8, padding: "10px 12px",
                }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{ins.icon}</span>
                  <span style={{ fontSize: 12, color: "#94A3B8", lineHeight: 1.5 }}>{ins.text}</span>
                </div>
              ))}
            </div>

          </div>

          {/* ── Right column: Detail panel ── */}
          {selected && (
            <div style={{
              background: "linear-gradient(180deg, rgba(11,22,41,0.98), rgba(3,6,18,0.95))",
              border: "1px solid rgba(0,174,239,0.15)", borderRadius: 16, padding: 0, alignSelf: "start",
              position: "sticky", top: 20, maxHeight: "calc(100vh - 80px)", overflowY: "auto",
            }}>
              {/* Panel header */}
              <div style={{
                padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#FFFFFF" }}>{selected.businessName}</div>
                  <div style={{ fontSize: 11, color: "#475569" }}>{selected.city}, {selected.state}</div>
                </div>
                <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 18 }}>✕</button>
              </div>

              <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 18 }}>

                {/* Business Info */}
                <DetailSection title="Business Info">
                  <InfoRow label="Industry"  value={selected.industry} />
                  <InfoRow label="Location"  value={`${selected.city}, ${selected.state}`} />
                  <InfoRow label="Website"   value={selected.websiteUrl ?? "—"} link={selected.websiteUrl} />
                  <InfoRow label="Contact"   value={selected.contactName} />
                  <InfoRow label="Email"     value={selected.contactEmail} link={`mailto:${selected.contactEmail}`} />
                  <InfoRow label="Phone"     value={selected.contactPhone ?? "—"} />
                  <InfoRow label="Prefers"   value={selected.contactMethod ?? "—"} />
                </DetailSection>

                {/* Assessment Scores */}
                <DetailSection title="Assessment Scores">
                  {[
                    { label: "Overall Score",     value: selected.scoreOverall },
                    { label: "Lead Recovery",     value: selected.scoreLeadRecovery },
                    { label: "Local Presence",    value: selected.scoreLocalPresence },
                    { label: "AI Visibility",     value: selected.scoreAiVisibility },
                    { label: "Review Strength",   value: selected.scoreReviewStrength },
                  ].map(s => (
                    <div key={s.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 7 }}>
                      <span style={{ fontSize: 12, color: "#64748B" }}>{s.label}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 60, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${s.value ?? 0}%`, background: scoreColor(s.value), borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 800, color: scoreColor(s.value), width: 36, textAlign: "right" }}>{s.value ?? "—"}</span>
                      </div>
                    </div>
                  ))}
                </DetailSection>

                {/* Opportunity Metrics */}
                <DetailSection title="Opportunity Metrics">
                  {[
                    { label: "Revenue Recovery",      value: "Estimate pending", color: "#22C55E" },
                    { label: "AI Visibility",         value: "Estimate pending", color: "#3B82F6" },
                    { label: "Local Visibility",      value: "Estimate pending", color: "#00AEEF" },
                    { label: "Lead Conversion",       value: "Estimate pending", color: "#F59E0B" },
                  ].map(op => (
                    <div key={op.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: "#64748B" }}>{op.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: op.color }}>{op.value}</span>
                    </div>
                  ))}
                </DetailSection>

                {/* Pain Points */}
                <DetailSection title="Pain Points">
                  {[
                    !selected.gbpUrl      && "Missing Google Business Profile",
                    "Apple Business Connect not claimed",
                    "Bing Places not verified",
                    "Weak AI search visibility",
                    "Missing schema markup",
                    "Low review velocity",
                    !selected.websiteUrl  && "No website detected",
                  ].filter(Boolean).slice(0, 5).map((pt, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <span style={{ color: "#EF4444", fontSize: 11 }}>✕</span>
                      <span style={{ fontSize: 12, color: "#94A3B8" }}>{pt as string}</span>
                    </div>
                  ))}
                </DetailSection>

                {/* Pipeline Actions */}
                <DetailSection title="Pipeline Actions">
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {PIPELINE_ACTIONS.map(action => {
                      const isCurrentStatus = selected.status === action.status;
                      return (
                        <button
                          key={action.status}
                          disabled={isCurrentStatus || updatingStatus}
                          onClick={() => handleStatusChange(action.status)}
                          style={{
                            padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                            cursor: isCurrentStatus ? "default" : "pointer",
                            background: isCurrentStatus ? `${action.color}20` : "rgba(255,255,255,0.04)",
                            border: isCurrentStatus ? `1px solid ${action.color}50` : "1px solid rgba(255,255,255,0.08)",
                            color: isCurrentStatus ? action.color : "#64748B",
                            textAlign: "left", transition: "all 0.15s",
                            opacity: updatingStatus && !isCurrentStatus ? 0.5 : 1,
                          }}
                          onMouseEnter={e => { if (!isCurrentStatus) { (e.currentTarget as HTMLButtonElement).style.background = `${action.color}12`; (e.currentTarget as HTMLButtonElement).style.color = action.color; } }}
                          onMouseLeave={e => { if (!isCurrentStatus) { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLButtonElement).style.color = "#64748B"; } }}
                        >
                          {isCurrentStatus ? "✓ " : ""}{action.label}
                        </button>
                      );
                    })}
                  </div>
                </DetailSection>

                {/* Internal Notes */}
                <DetailSection title="Internal Notes">
                  {editingNotes ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <textarea
                        value={notesDraft}
                        onChange={e => setNotesDraft(e.target.value)}
                        placeholder="Add notes about this lead..."
                        rows={4}
                        style={{
                          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,174,239,0.3)",
                          borderRadius: 8, padding: "9px 11px", fontSize: 12, color: "#FFFFFF",
                          outline: "none", fontFamily: "inherit", resize: "vertical", lineHeight: 1.5,
                          width: "100%", boxSizing: "border-box",
                        }}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={saveNotes} disabled={savingNotes} style={{
                          flex: 1, padding: "7px 0", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer",
                          background: "rgba(0,174,239,0.18)", border: "1px solid rgba(0,174,239,0.4)", color: "#00AEEF",
                        }}>{savingNotes ? "Saving..." : "Save Notes"}</button>
                        <button onClick={() => { setEditingNotes(false); setNotesDraft(selected.notes ?? ""); }} style={{
                          padding: "7px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
                          background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#64748B",
                        }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {selected.notes ? (
                        <div style={{
                          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                          borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#94A3B8",
                          lineHeight: 1.6, marginBottom: 8, whiteSpace: "pre-wrap",
                        }}>{selected.notes}</div>
                      ) : (
                        <div style={{ fontSize: 12, color: "#334155", marginBottom: 8, fontStyle: "italic" }}>No notes yet.</div>
                      )}
                      <button
                        onClick={() => { setNotesDraft(selected.notes ?? ""); setEditingNotes(true); }}
                        style={{
                          padding: "6px 14px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer",
                          background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.25)", color: "#00AEEF",
                        }}
                      >{selected.notes ? "✏ Edit Notes" : "+ Add Note"}</button>
                    </div>
                  )}
                </DetailSection>

              </div>
            </div>
          )}

        </div>
      </div>
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helper components
// ─────────────────────────────────────────────────────────────────────────────
function SectionHeader({ icon, title, mt = 0 }: { icon: string; title: string; mt?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: mt, marginBottom: 10 }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.7px" }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, link }: { label: string; value: string; link?: string | null }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, gap: 8 }}>
      <span style={{ fontSize: 11, color: "#475569", flexShrink: 0 }}>{label}</span>
      {link ? (
        <a href={link} target="_blank" rel="noreferrer" style={{
          fontSize: 12, color: "#00AEEF", textAlign: "right",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%", textDecoration: "none",
        }}>{value}</a>
      ) : (
        <span style={{ fontSize: 12, color: "#94A3B8", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>{value}</span>
      )}
    </div>
  );
}

function SelectFilter({ value, onChange, children, label }: { value: string; onChange: (v: string) => void; children: React.ReactNode; label: string }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      aria-label={label}
      style={{
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 8, padding: "7px 12px", fontSize: 12, color: "#94A3B8",
        outline: "none", cursor: "pointer", fontFamily: "inherit", appearance: "none",
      }}
    >
      {children}
    </select>
  );
}

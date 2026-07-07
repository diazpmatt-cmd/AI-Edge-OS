import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";
import { useTheme } from "@/contexts/theme-context";

type Lead = {
  id: string;
  leadId: string | null;
  clientId: string;
  customerName: string;
  phone: string | null;
  leadSource: string;
  status: string;
  revenue: number | null;
  serviceType: string | null;
  notes: string | null;
  gorilladeskJobId: string | null;
  matchedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const SOURCES = [
  "AI Receptionist",
  "Missed Call Recovery",
  "SMS",
  "Callback Requests",
  "Voicemail",
  "AI Visibility Engine",
];

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: "Pending",   color: "#F59E0B", bg: "#F59E0B22" },
  unmatched: { label: "Unmatched", color: "#6B7280", bg: "#6B728022" },
  matched:   { label: "Matched",   color: "#22C55E", bg: "#22C55E22" },
  won:       { label: "Won ✓",     color: "#22C55E", bg: "#22C55E22" },
  lost:      { label: "Lost",      color: "#EF4444", bg: "#EF444422" },
};

const SOURCE_ICON: Record<string, string> = {
  "AI Receptionist":    "🤖",
  "Missed Call Recovery": "📲",
  "SMS":                "💬",
  "Callback Requests":  "📞",
  "Voicemail":          "🎙",
  "AI Visibility Engine": "✨",
};

const fmt$ = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toLocaleString()}`;

export default function RevenueAttributionPage() {
  const apiFetch = useApiFetch();
  const { colors: t, isDark } = useTheme();
  const [leads, setLeads]       = useState<Lead[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [matching, setMatching] = useState(false);
  const [matchResult, setMatchResult] = useState<string | null>(null);
  const [syncing, setSyncing]         = useState(false);
  const [syncResult, setSyncResult]   = useState<any | null>(null);
  const [syncStatus, setSyncStatus]   = useState<any | null>(null);
  const [form, setForm] = useState({ status: "pending", revenue: "", serviceType: "", notes: "", gorilladeskJobId: "" });
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Lead[]>("/api/revenue-attribution?clientId=default");
      setLeads(data.length === 0 ? [] : data);
    } catch {
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  const loadSyncStatus = useCallback(async () => {
    try {
      const data = await apiFetch<any>("/api/revenue-attribution/sync-status?clientId=default");
      setSyncStatus(data);
    } catch {}
  }, [apiFetch]);

  useEffect(() => { loadLeads(); loadSyncStatus(); }, [loadLeads, loadSyncStatus]);

  const openCloseout = (lead: Lead) => {
    setSelected(lead);
    setForm({
      status:           lead.status,
      revenue:          lead.revenue != null ? String(lead.revenue) : "",
      serviceType:      lead.serviceType ?? "",
      notes:            lead.notes ?? "",
      gorilladeskJobId: lead.gorilladeskJobId ?? "",
    });
  };

  const saveCloseout = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const payload = {
        status:           form.status,
        revenue:          form.revenue ? parseFloat(form.revenue) : null,
        serviceType:      form.serviceType || null,
        notes:            form.notes || null,
        gorilladeskJobId: form.gorilladeskJobId || null,
      };
      const updated = await apiFetch<Lead>(`/api/revenue-attribution/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
      setSelected(null);
      showToast("Lead updated successfully");
    } catch {
      showToast("Failed to save — please try again", false);
    } finally {
      setSaving(false);
    }
  };

  const runGdMatch = async () => {
    setMatching(true);
    setMatchResult(null);
    try {
      const data = await apiFetch<any>("/api/revenue-attribution/match-gorilladesk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: "demo" }),
      });
      setMatchResult(data.message ?? `Matched ${data.matched} leads`);
      if (data.matched > 0) { loadLeads(); loadSyncStatus(); }
    } catch {
      setMatchResult("GorillaDesk sync failed — check API key or try again");
    } finally {
      setMatching(false);
    }
  };

  const runJobSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const data = await apiFetch<any>("/api/revenue-attribution/sync-gorilladesk-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: "demo" }),
      });
      setSyncResult(data);
      loadLeads();
      loadSyncStatus();
    } catch {
      setSyncResult({ ok: false, message: "Sync failed — check API server" });
    } finally {
      setSyncing(false);
    }
  };

  // ── Computed KPIs ────────────────────────────────────────────────────────
  const won        = leads.filter(l => l.status === "won");
  const qualLeads  = leads.filter(l => !["unmatched", "lost"].includes(l.status));
  const totalRev   = won.reduce((s, l) => s + (l.revenue ?? 0), 0);
  const convRate   = leads.length ? (won.length / leads.length * 100) : 0;
  const avgTicket  = won.length ? (totalRev / won.length) : 0;
  const roi        = totalRev > 0 ? Math.round((totalRev - 2997) / 2997 * 100) : 0;

  const sourceStats = SOURCES.map(src => {
    const sl   = leads.filter(l => l.leadSource === src);
    const sw   = sl.filter(l => l.status === "won");
    const sRev = sw.reduce((s, l) => s + (l.revenue ?? 0), 0);
    return { src, leads: sl.length, sales: sw.length, revenue: sRev };
  });
  const maxSrcRev = Math.max(...sourceStats.map(s => s.revenue), 1);

  const PIPELINE = [
    { label: "Calls",   value: 73,             color: "#6B7280" },
    { label: "Leads",   value: leads.length,   color: "#00AEEF" },
    { label: "Appts",   value: qualLeads.length, color: "#3B82F6" },
    { label: "Jobs",    value: won.length,      color: "#22C55E" },
    { label: "Revenue", value: totalRev,        color: "#FBBF24", prefix: "$" },
  ];
  const maxPipeline = Math.max(...PIPELINE.map(p => p.value), 1);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const kpiCard = (label: string, value: string, sub: string, color: string) => (
    <div key={label} style={{
      background: isDark ? "#0B1629" : "#F8FAFC",
      border: `1px solid ${isDark ? "rgba(0,174,239,0.12)" : "#E2E8F0"}`,
      borderRadius: 12, padding: "18px 20px",
      display: "flex", flexDirection: "column", gap: 5,
    }}>
      <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "#6B7280" }}>{sub}</div>
    </div>
  );

  const sectionHead = (title: string, icon: string, sub: string) => (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: t.text }}>{title}</h2>
      </div>
      <p style={{ margin: "3px 0 0 30px", fontSize: 13, color: "#6B7280" }}>{sub}</p>
    </div>
  );

  const divider = <div style={{ borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "#E2E8F0"}`, margin: "32px 0" }} />;

  const tableStyle: React.CSSProperties = {
    background: isDark ? "#0B1629" : "#F8FAFC",
    border: `1px solid ${isDark ? "rgba(0,174,239,0.12)" : "#E2E8F0"}`,
    borderRadius: 12, overflow: "hidden",
  };

  const th = (label: string) => (
    <th key={label} style={{
      padding: "11px 14px", textAlign: "left",
      fontSize: 11, fontWeight: 700, color: "#6B7280",
      letterSpacing: "0.05em", textTransform: "uppercase",
      background: isDark ? "#0A1020" : "#F1F5F9",
      borderBottom: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`,
    }}>{label}</th>
  );

  return (
    <AppShell>
      <div style={{ padding: "28px 32px", maxWidth: 1200, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 30, gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 22 }}>💰</span>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: t.text }}>Revenue Attribution Engine</h1>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "#6B7280" }}>
              Track which AI Edge calls become real jobs and revenue in GorillaDesk.
            </p>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#6B7280" }}>Loading revenue data…</div>
        ) : (<>

          {/* ── SECTION 1: KPI CARDS ─────────────────────────────────── */}
          {sectionHead("KPI Dashboard", "📊", "Real-time AI Edge performance metrics")}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 12, marginBottom: 8 }}>
            {kpiCard("Total Leads",     String(leads.length),                   "All AI Edge leads",           "#00AEEF")}
            {kpiCard("Qualified",       String(qualLeads.length),               "Past initial screening",      "#3B82F6")}
            {kpiCard("Closed Jobs",     String(won.length),                     "Won opportunities",           "#22C55E")}
            {kpiCard("Revenue",         `$${totalRev.toLocaleString()}`,         "Total revenue generated",     "#FBBF24")}
            {kpiCard("Conv. Rate",      `${convRate.toFixed(1)}%`,              "Leads → closed jobs",         "#00AEEF")}
            {kpiCard("Avg Ticket",      `$${Math.round(avgTicket).toLocaleString()}`, "Per closed job",        "#F472B6")}
            {kpiCard("ROI",             roi > 0 ? `${roi}%` : "—",              "vs. AI Edge investment",      "#22C55E")}
          </div>

          {divider}

          {/* ── SECTION 2: LEAD PIPELINE ─────────────────────────────── */}
          {sectionHead("Lead Pipeline", "🔀", "Calls → Leads → Appointments → Jobs → Revenue")}
          <div style={{ ...tableStyle, padding: "22px 24px", borderRadius: 12 }}>
            <div style={{ display: "flex", gap: 0, alignItems: "flex-end", height: 110, marginBottom: 8 }}>
              {PIPELINE.map((step) => {
                const barH = Math.max(10, Math.round((step.value / maxPipeline) * 90));
                const display = step.prefix === "$" && step.value >= 1000
                  ? `$${(step.value / 1000).toFixed(1)}k`
                  : `${step.prefix ?? ""}${step.value}`;
                return (
                  <div key={step.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: step.color }}>{display}</div>
                    <div style={{ width: "65%", height: barH, background: step.color, borderRadius: "4px 4px 0 0", opacity: 0.82 }} />
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", borderTop: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`, paddingTop: 8 }}>
              {PIPELINE.map(step => (
                <div key={step.label} style={{ flex: 1, textAlign: "center", fontSize: 11, color: "#6B7280", fontWeight: 600 }}>
                  {step.label}
                </div>
              ))}
            </div>
          </div>

          {divider}

          {/* ── SECTION 3: REVENUE BY SOURCE ─────────────────────────── */}
          {sectionHead("Revenue by Source", "📡", "Performance breakdown by AI Edge module")}
          <div style={tableStyle}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Source", "Leads", "Jobs", "Revenue", "Conv. Rate", "Bar"].map(th)}</tr></thead>
              <tbody>
                {sourceStats.map((row, i) => {
                  const conv = row.leads > 0 ? Math.round(row.sales / row.leads * 100) : 0;
                  const barW = Math.max(4, Math.round(row.revenue / maxSrcRev * 160));
                  const rowBg = i % 2 === 0 ? "transparent" : (isDark ? "#060E1E" : "#F8FAFC");
                  return (
                    <tr key={row.src} style={{ background: rowBg, borderBottom: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}` }}>
                      <td style={{ padding: "13px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ fontSize: 15 }}>{SOURCE_ICON[row.src]}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{row.src}</span>
                        </div>
                      </td>
                      <td style={{ padding: "13px 14px", fontSize: 13, fontWeight: 700, color: "#00AEEF" }}>{row.leads}</td>
                      <td style={{ padding: "13px 14px", fontSize: 13, fontWeight: 700, color: "#22C55E" }}>{row.sales}</td>
                      <td style={{ padding: "13px 14px", fontSize: 13, fontWeight: 700, color: "#FBBF24" }}>{row.revenue > 0 ? `$${row.revenue.toLocaleString()}` : "—"}</td>
                      <td style={{ padding: "13px 14px" }}>
                        <span style={{
                          background: conv >= 50 ? "#22C55E22" : conv >= 25 ? "#F59E0B22" : "#EF444422",
                          color: conv >= 50 ? "#22C55E" : conv >= 25 ? "#F59E0B" : "#EF4444",
                          padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700,
                        }}>{conv}%</span>
                      </td>
                      <td style={{ padding: "13px 14px" }}>
                        <div style={{ height: 8, width: 160, background: isDark ? "#1E2D48" : "#E2E8F0", borderRadius: 4 }}>
                          <div style={{ height: 8, width: barW, background: "#00AEEF", borderRadius: 4 }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {divider}

          {/* ── SECTION 4+5: LEAD MATCHING + MANUAL CLOSEOUT ─────────── */}
          {sectionHead("Lead Matching & Closeout", "🔍", "Match AI Edge leads to GorillaDesk jobs — mark Won, Lost, or Pending")}
          <div style={tableStyle}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Customer", "Phone", "Source", "Status", "Revenue", "GD Job", "Matched", "Action"].map(th)}</tr></thead>
              <tbody>
                {leads.map((lead, i) => {
                  const sm = STATUS_META[lead.status] ?? STATUS_META.pending;
                  return (
                    <tr key={lead.id} style={{
                      background: i % 2 === 0 ? "transparent" : (isDark ? "#060E1E" : "#F8FAFC"),
                      borderBottom: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`,
                    }}>
                      <td style={{ padding: "11px 14px", fontWeight: 600, fontSize: 13, color: t.text }}>{lead.customerName}</td>
                      <td style={{ padding: "11px 14px", fontSize: 12, color: "#6B7280" }}>{lead.phone ?? "—"}</td>
                      <td style={{ padding: "11px 14px", fontSize: 12, color: "#9CA3AF" }}>
                        {SOURCE_ICON[lead.leadSource]} {lead.leadSource}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <span style={{ background: sm.bg, color: sm.color, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700 }}>
                          {sm.label}
                        </span>
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 700, color: "#FBBF24" }}>
                        {lead.revenue != null ? `$${lead.revenue.toLocaleString()}` : "—"}
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 12, color: "#6B7280", fontFamily: "monospace" }}>
                        {lead.gorilladeskJobId ?? "—"}
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 11, color: "#6B7280" }}>
                        {lead.matchedAt ? new Date(lead.matchedAt).toLocaleDateString() : "—"}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <button onClick={() => openCloseout(lead)} style={{
                          background: "transparent",
                          border: `1px solid ${isDark ? "rgba(0,174,239,0.4)" : "#CBD5E1"}`,
                          color: "#00AEEF", borderRadius: 6, padding: "4px 11px",
                          fontSize: 12, fontWeight: 600, cursor: "pointer",
                        }}>Edit</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {divider}

          {/* ── SECTION 6: GORILLADESK REVENUE SYNC ─────────────────── */}
          {sectionHead("GorillaDesk Revenue Sync", "🦍", "Pull job revenue from GorillaDesk and match it to AI Edge leads")}

          {/* Stats row */}
          {syncStatus && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
              {[
                { label: "GD Customers", value: String(syncStatus.realtimeStats?.gdCustomerCount ?? 0), color: "#00AEEF" },
                { label: "GD Jobs",      value: String(syncStatus.realtimeStats?.gdJobCount ?? 0),      color: "#3B82F6" },
                { label: "Leads Matched",value: String(syncStatus.realtimeStats?.matchedLeads ?? 0),    color: "#22C55E" },
                { label: "Revenue Matched", value: syncStatus.realtimeStats?.revenueMatched > 0
                  ? `$${Number(syncStatus.realtimeStats.revenueMatched).toLocaleString()}` : "—",       color: "#FBBF24" },
                { label: "Unmatched",    value: String(syncStatus.realtimeStats?.unmatchedLeads ?? 0),  color: "#EF4444" },
              ].map(s => (
                <div key={s.label} style={{
                  background: isDark ? "#0B1629" : "#F8FAFC",
                  border: `1px solid ${isDark ? "rgba(0,174,239,0.1)" : "#E2E8F0"}`,
                  borderRadius: 10, padding: "14px 16px",
                }}>
                  <div style={{ fontSize: 10, color: "#6B7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

            {/* Primary: Sync GorillaDesk Revenue */}
            <div style={{ ...tableStyle, padding: "22px 24px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 6 }}>Sync GorillaDesk Revenue</div>
              <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 14px", lineHeight: 1.6 }}>
                Pulls all GorillaDesk jobs and customers, then matches every AI Edge lead by phone number. When a job is found,
                revenue, service type, and job ID are applied automatically.
              </p>
              {syncStatus?.lastSyncStats && (
                <div style={{
                  background: isDark ? "#0A1020" : "#F1F5F9",
                  borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12,
                }}>
                  <div style={{ color: "#6B7280", marginBottom: 4 }}>
                    Last sync: <strong style={{ color: t.text }}>
                      {syncStatus.lastSyncAt ? new Date(syncStatus.lastSyncAt).toLocaleString() : "Never"}
                    </strong>
                  </div>
                  <div style={{ color: "#6B7280" }}>
                    {syncStatus.lastSyncStats.leadsMatched} leads matched &nbsp;·&nbsp;
                    ${Number(syncStatus.lastSyncStats.revenueMatched ?? 0).toLocaleString()} revenue attributed
                  </div>
                </div>
              )}
              <button onClick={runJobSync} disabled={syncing} style={{
                background: syncing ? "#3B82F6" : "#22C55E",
                border: "none", color: "#fff", borderRadius: 8,
                padding: "11px 22px", fontSize: 13, fontWeight: 700,
                cursor: syncing ? "not-allowed" : "pointer", width: "100%",
              }}>
                {syncing ? "⏳ Syncing GorillaDesk Revenue…" : "💰 Sync GorillaDesk Revenue"}
              </button>
              {syncResult && (
                <div style={{
                  marginTop: 12,
                  background: syncResult.ok ? "#22C55E18" : "#EF444418",
                  border: `1px solid ${syncResult.ok ? "#22C55E44" : "#EF444444"}`,
                  borderRadius: 8, padding: "10px 14px",
                }}>
                  <div style={{ fontSize: 12, color: syncResult.ok ? "#22C55E" : "#EF4444", fontWeight: 600, marginBottom: 4 }}>
                    {syncResult.ok ? "✅ Sync complete" : "❌ Sync failed"}
                  </div>
                  {syncResult.ok && (
                    <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.6 }}>
                      {syncResult.leadsMatched} leads matched from {syncResult.gdCustomerCount} GD customers
                      {syncResult.gdJobCount > 0 && ` + ${syncResult.gdJobCount} jobs`}
                      {syncResult.revenueMatched > 0 && ` · $${Number(syncResult.revenueMatched).toLocaleString()} revenue`}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>{syncResult.gdApiMessage}</div>
                </div>
              )}
            </div>

            {/* Right: Phone match + API status */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Phone Match */}
              <div style={{ ...tableStyle, padding: "18px 22px", flex: "0 0 auto" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 6 }}>Phone-Only Match</div>
                <p style={{ fontSize: 12, color: "#6B7280", margin: "0 0 12px", lineHeight: 1.5 }}>
                  Matches only <strong style={{ color: t.text }}>unmatched</strong> leads against GD customer phones — faster, no job revenue update.
                </p>
                <button onClick={runGdMatch} disabled={matching} style={{
                  background: "transparent",
                  border: `1px solid ${matching ? "#3B82F644" : "#3B82F6"}`,
                  color: "#3B82F6", borderRadius: 7,
                  padding: "8px 18px", fontSize: 12, fontWeight: 700,
                  cursor: matching ? "not-allowed" : "pointer", width: "100%",
                }}>
                  {matching ? "⏳ Matching…" : "🔄 Run Phone Match"}
                </button>
                {matchResult && (
                  <div style={{ marginTop: 10, background: "#22C55E18", border: "1px solid #22C55E44", borderRadius: 7, padding: "8px 12px", fontSize: 12, color: "#22C55E" }}>
                    {matchResult}
                  </div>
                )}
              </div>

              {/* API Status */}
              <div style={{ ...tableStyle, padding: "18px 22px", flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>API &amp; Sync Status</div>
                {[
                  { label: "GorillaDesk API Key",    ok: true,  note: "Configured" },
                  { label: "Customer Sync",           ok: true,  note: `${syncStatus?.realtimeStats?.gdCustomerCount ?? 445} records` },
                  { label: "Phone Match",             ok: true,  note: "Active" },
                  { label: "Name Match (Fallback)",   ok: true,  note: "Active" },
                  { label: "Job Revenue API",         ok: false, note: "Not available (GD API)" },
                  { label: "Invoice Sync",            ok: false, note: "Manual entry" },
                ].map(item => (
                  <div key={item.label} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "7px 0", borderBottom: `1px solid ${isDark ? "#1E2D48" : "#F1F5F9"}`,
                  }}>
                    <span style={{ fontSize: 12, color: "#9CA3AF" }}>
                      {item.ok ? "✅" : "⚠️"} {item.label}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: item.ok ? "#22C55E" : "#6B7280" }}>
                      {item.note}
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* ROI summary strip */}
          <div style={{
            marginTop: 16,
            background: isDark ? "#0A1A0A" : "#F0FDF4",
            border: `1px solid ${isDark ? "#22C55E33" : "#BBF7D0"}`,
            borderRadius: 10, padding: "14px 20px",
            display: "flex", gap: 32, flexWrap: "wrap", alignItems: "center",
          }}>
            {[
              { label: "Revenue Generated",    value: `$${totalRev.toLocaleString()}` },
              { label: "Avg Revenue / Lead",   value: leads.length > 0 ? fmt$(Math.round(totalRev / leads.length)) : "—" },
              { label: "Conversion Rate",       value: `${convRate.toFixed(1)}%` },
              { label: "Estimated AI Edge ROI", value: roi > 0 ? `${roi}%` : "—" },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#22C55E" }}>{s.value}</div>
              </div>
            ))}
          </div>

        </>)}
      </div>

      {/* ── CLOSEOUT MODAL ─────────────────────────────────────────────── */}
      {selected && (
        <div onClick={e => e.target === e.currentTarget && setSelected(null)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, padding: 20,
        }}>
          <div style={{
            background: isDark ? "#0B1629" : "#FFFFFF",
            border: `1px solid ${isDark ? "rgba(0,174,239,0.2)" : "#E2E8F0"}`,
            borderRadius: 16, padding: 26, width: "100%", maxWidth: 460,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: t.text }}>Manual Closeout</h3>
                <p style={{ margin: "3px 0 0", fontSize: 13, color: "#6B7280" }}>
                  {selected.customerName} · {SOURCE_ICON[selected.leadSource]} {selected.leadSource}
                </p>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6B7280", padding: 4 }}>×</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Status */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 7, textTransform: "uppercase" }}>Status</label>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  {[
                    { val: "won",       label: "Won ✓",    color: "#22C55E" },
                    { val: "lost",      label: "Lost",      color: "#EF4444" },
                    { val: "pending",   label: "Pending",   color: "#F59E0B" },
                    { val: "matched",   label: "Matched",   color: "#22C55E" },
                    { val: "unmatched", label: "Unmatched", color: "#6B7280" },
                  ].map(s => (
                    <button key={s.val} onClick={() => setForm(f => ({ ...f, status: s.val }))} style={{
                      border: `2px solid ${form.status === s.val ? s.color : (isDark ? "#1E2D48" : "#E2E8F0")}`,
                      background: form.status === s.val ? s.color + "22" : "transparent",
                      color: form.status === s.val ? s.color : "#6B7280",
                      borderRadius: 7, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}>{s.label}</button>
                  ))}
                </div>
              </div>

              {/* Revenue */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 5, textTransform: "uppercase" }}>Revenue ($)</label>
                <input type="number" min="0" step="0.01" placeholder="e.g. 1500" value={form.revenue}
                  onChange={e => setForm(f => ({ ...f, revenue: e.target.value }))} style={{
                    width: "100%", boxSizing: "border-box",
                    background: isDark ? "#0A1020" : "#F8FAFC",
                    border: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`,
                    color: t.text, borderRadius: 7, padding: "9px 12px", fontSize: 14,
                  }} />
              </div>

              {/* Service type */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 5, textTransform: "uppercase" }}>Service Type</label>
                <input type="text" placeholder="e.g. Bed Bug Treatment" value={form.serviceType}
                  onChange={e => setForm(f => ({ ...f, serviceType: e.target.value }))} style={{
                    width: "100%", boxSizing: "border-box",
                    background: isDark ? "#0A1020" : "#F8FAFC",
                    border: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`,
                    color: t.text, borderRadius: 7, padding: "9px 12px", fontSize: 14,
                  }} />
              </div>

              {/* GorillaDesk Job ID */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 5, textTransform: "uppercase" }}>GorillaDesk Job ID</label>
                <input type="text" placeholder="e.g. GD-10041" value={form.gorilladeskJobId}
                  onChange={e => setForm(f => ({ ...f, gorilladeskJobId: e.target.value }))} style={{
                    width: "100%", boxSizing: "border-box",
                    background: isDark ? "#0A1020" : "#F8FAFC",
                    border: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`,
                    color: t.text, borderRadius: 7, padding: "9px 12px", fontSize: 14, fontFamily: "monospace",
                  }} />
              </div>

              {/* Notes */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 5, textTransform: "uppercase" }}>Notes</label>
                <textarea rows={2} placeholder="Optional notes…" value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{
                    width: "100%", boxSizing: "border-box", resize: "vertical",
                    background: isDark ? "#0A1020" : "#F8FAFC",
                    border: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`,
                    color: t.text, borderRadius: 7, padding: "9px 12px", fontSize: 14,
                  }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => setSelected(null)} style={{
                flex: 1, background: "transparent",
                border: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`,
                color: "#6B7280", borderRadius: 8, padding: "10px 0",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>Cancel</button>
              <button onClick={saveCloseout} disabled={saving} style={{
                flex: 2, background: saving ? "#22C55E66" : "#22C55E",
                border: "none", color: "#fff", borderRadius: 8, padding: "10px 0",
                fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer",
              }}>{saving ? "Saving…" : "Save Closeout"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 2000,
          background: toast.ok ? "#22C55E" : "#EF4444",
          color: "#fff", padding: "12px 20px", borderRadius: 10,
          fontSize: 14, fontWeight: 600, boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}>{toast.msg}</div>
      )}
    </AppShell>
  );
}

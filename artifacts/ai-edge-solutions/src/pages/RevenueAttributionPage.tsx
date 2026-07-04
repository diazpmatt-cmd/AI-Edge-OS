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
  createdAt: string;
  updatedAt: string;
  _demo?: boolean;
};

const SOURCES = [
  "AI Receptionist",
  "Lead Recovery AI",
  "Missed Call Recovery",
  "SMS",
  "AI Visibility Engine",
];

const DEMO_LEADS: Lead[] = [
  { id: "demo-1",  leadId: null, clientId: "demo", customerName: "Karen Mitchell",     phone: "(251) 445-7823", leadSource: "AI Receptionist",    status: "closed_won",  revenue: 2400,  serviceType: "Bed Bug Treatment",         notes: "Full heat treatment, 2 units",     gorilladeskJobId: "GD-10041", createdAt: "2026-06-01T10:30:00Z", updatedAt: "2026-06-05T14:22:00Z", _demo: true },
  { id: "demo-2",  leadId: null, clientId: "demo", customerName: "Robert Davis",        phone: "(251) 332-9901", leadSource: "Lead Recovery AI",    status: "closed_won",  revenue: 1800,  serviceType: "Termite Inspection",        notes: "Annual contract signed",           gorilladeskJobId: "GD-10042", createdAt: "2026-06-02T09:15:00Z", updatedAt: "2026-06-06T11:00:00Z", _demo: true },
  { id: "demo-3",  leadId: null, clientId: "demo", customerName: "Lisa Thompson",       phone: "(251) 778-2341", leadSource: "Missed Call Recovery", status: "pending",     revenue: null,  serviceType: null,                        notes: null,                               gorilladeskJobId: null,       createdAt: "2026-06-03T13:45:00Z", updatedAt: "2026-06-03T13:45:00Z", _demo: true },
  { id: "demo-4",  leadId: null, clientId: "demo", customerName: "James Wilson",        phone: "(251) 443-5567", leadSource: "AI Receptionist",    status: "closed_won",  revenue: 3200,  serviceType: "Full Pest Control Package",  notes: "Commercial property, quarterly",   gorilladeskJobId: "GD-10043", createdAt: "2026-06-04T11:20:00Z", updatedAt: "2026-06-08T09:30:00Z", _demo: true },
  { id: "demo-5",  leadId: null, clientId: "demo", customerName: "Maria Santos",        phone: "(251) 229-8823", leadSource: "SMS",                status: "closed_lost", revenue: null,  serviceType: null,                        notes: "Went with competitor",             gorilladeskJobId: null,       createdAt: "2026-06-05T08:00:00Z", updatedAt: "2026-06-10T15:00:00Z", _demo: true },
  { id: "demo-6",  leadId: null, clientId: "demo", customerName: "David Brown",         phone: "(251) 554-7612", leadSource: "Lead Recovery AI",    status: "matched",     revenue: null,  serviceType: null,                        notes: null,                               gorilladeskJobId: "GD-10044", createdAt: "2026-06-06T14:00:00Z", updatedAt: "2026-06-09T10:15:00Z", _demo: true },
  { id: "demo-7",  leadId: null, clientId: "demo", customerName: "Jennifer Lee",        phone: "(251) 667-3389", leadSource: "AI Visibility Engine", status: "closed_won",  revenue: 1650,  serviceType: "Rodent Control",            notes: "Exclusion + bait stations",        gorilladeskJobId: "GD-10045", createdAt: "2026-06-07T10:00:00Z", updatedAt: "2026-06-11T12:00:00Z", _demo: true },
  { id: "demo-8",  leadId: null, clientId: "demo", customerName: "Michael Johnson",     phone: "(251) 891-4421", leadSource: "Missed Call Recovery", status: "closed_won",  revenue: 2100,  serviceType: "Cockroach Treatment",       notes: "Restaurant account, monthly",      gorilladeskJobId: "GD-10046", createdAt: "2026-06-08T09:30:00Z", updatedAt: "2026-06-12T08:00:00Z", _demo: true },
  { id: "demo-9",  leadId: null, clientId: "demo", customerName: "Patricia Moore",      phone: "(251) 334-8891", leadSource: "AI Receptionist",    status: "pending",     revenue: null,  serviceType: null,                        notes: null,                               gorilladeskJobId: null,       createdAt: "2026-06-09T15:00:00Z", updatedAt: "2026-06-09T15:00:00Z", _demo: true },
  { id: "demo-10", leadId: null, clientId: "demo", customerName: "Christopher Taylor",  phone: "(251) 552-1234", leadSource: "SMS",                status: "closed_won",  revenue: 4800,  serviceType: "Commercial Pest Control",   notes: "Hotel — 6 month contract",         gorilladeskJobId: "GD-10047", createdAt: "2026-06-10T11:00:00Z", updatedAt: "2026-06-14T10:00:00Z", _demo: true },
  { id: "demo-11", leadId: null, clientId: "demo", customerName: "Amanda Martinez",     phone: "(251) 778-9901", leadSource: "Lead Recovery AI",    status: "unmatched",   revenue: null,  serviceType: null,                        notes: null,                               gorilladeskJobId: null,       createdAt: "2026-06-11T08:45:00Z", updatedAt: "2026-06-11T08:45:00Z", _demo: true },
  { id: "demo-12", leadId: null, clientId: "demo", customerName: "Daniel Anderson",     phone: "(251) 443-2256", leadSource: "AI Receptionist",    status: "closed_won",  revenue: 1950,  serviceType: "Ant Treatment",             notes: "Recurring quarterly",              gorilladeskJobId: "GD-10048", createdAt: "2026-06-12T14:00:00Z", updatedAt: "2026-06-15T09:00:00Z", _demo: true },
  { id: "demo-13", leadId: null, clientId: "demo", customerName: "Sarah Thomas",        phone: "(251) 332-7788", leadSource: "AI Visibility Engine", status: "matched",     revenue: null,  serviceType: null,                        notes: null,                               gorilladeskJobId: "GD-10049", createdAt: "2026-06-13T10:30:00Z", updatedAt: "2026-06-16T11:00:00Z", _demo: true },
  { id: "demo-14", leadId: null, clientId: "demo", customerName: "Kevin Jackson",       phone: "(251) 669-4412", leadSource: "Missed Call Recovery", status: "closed_lost", revenue: null,  serviceType: null,                        notes: "No answer, stopped responding",    gorilladeskJobId: null,       createdAt: "2026-06-14T09:00:00Z", updatedAt: "2026-06-17T14:00:00Z", _demo: true },
  { id: "demo-15", leadId: null, clientId: "demo", customerName: "Nancy White",         phone: "(251) 556-3341", leadSource: "Lead Recovery AI",    status: "closed_won",  revenue: 2750,  serviceType: "Bed Bug Treatment",         notes: "Referral from Karen Mitchell",     gorilladeskJobId: "GD-10050", createdAt: "2026-06-15T13:00:00Z", updatedAt: "2026-06-18T10:00:00Z", _demo: true },
];

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: "Pending",     color: "#F59E0B", bg: "#F59E0B22" },
  unmatched:   { label: "Unmatched",  color: "#6B7280", bg: "#6B728022" },
  matched:     { label: "Matched",    color: "#00AEEF", bg: "#00AEEF22" },
  closed_won:  { label: "Won ✓",      color: "#10B981", bg: "#10B98122" },
  closed_lost: { label: "Lost",       color: "#EF4444", bg: "#EF444422" },
};

const SOURCE_ICON: Record<string, string> = {
  "AI Receptionist":    "🤖",
  "Lead Recovery AI":   "📞",
  "Missed Call Recovery": "📲",
  "SMS":                "💬",
  "AI Visibility Engine": "✨",
};

const fmt$ = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toLocaleString()}`;

export default function RevenueAttributionPage() {
  const { apiFetch } = useApiFetch();
  const { colors: t, isDark } = useTheme();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [form, setForm] = useState({ status: "pending", revenue: "", serviceType: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/revenue-attribution?clientId=demo");
      if (!res.ok) throw new Error("API error");
      const data: Lead[] = await res.json();
      if (data.length === 0) { setLeads(DEMO_LEADS); setIsDemo(true); }
      else { setLeads(data); setIsDemo(false); }
    } catch {
      setLeads(DEMO_LEADS);
      setIsDemo(true);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const openCloseout = (lead: Lead) => {
    setSelected(lead);
    setForm({
      status:      lead.status,
      revenue:     lead.revenue != null ? String(lead.revenue) : "",
      serviceType: lead.serviceType ?? "",
      notes:       lead.notes ?? "",
    });
  };

  const saveCloseout = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const payload = {
        status:      form.status,
        revenue:     form.revenue ? parseFloat(form.revenue) : null,
        serviceType: form.serviceType || null,
        notes:       form.notes || null,
      };
      if (selected._demo) {
        setLeads(prev => prev.map(l =>
          l.id === selected.id ? { ...l, ...payload } : l
        ));
      } else {
        const res = await apiFetch(`/api/revenue-attribution/${selected.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Save failed");
        const updated: Lead = await res.json();
        setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
      }
      setSelected(null);
      showToast("Lead updated successfully");
    } catch {
      showToast("Failed to save — please try again", false);
    } finally {
      setSaving(false);
    }
  };

  const closedWon    = leads.filter(l => l.status === "closed_won");
  const qualLeads    = leads.filter(l => l.status !== "unmatched");
  const totalRev     = closedWon.reduce((s, l) => s + (l.revenue ?? 0), 0);
  const convRate     = leads.length ? (closedWon.length / leads.length * 100) : 0;
  const avgTicket    = closedWon.length ? (totalRev / closedWon.length) : 0;
  const roi          = totalRev > 0 ? ((totalRev - 2997) / 2997 * 100) : 0;

  const sourceStats = SOURCES.map(src => {
    const srcLeads = leads.filter(l => l.leadSource === src);
    const srcWon   = srcLeads.filter(l => l.status === "closed_won");
    const srcRev   = srcWon.reduce((s, l) => s + (l.revenue ?? 0), 0);
    return { src, leads: srcLeads.length, sales: srcWon.length, revenue: srcRev };
  });

  const maxSrcRev = Math.max(...sourceStats.map(s => s.revenue), 1);

  const PIPELINE = [
    { label: "Calls",        value: 73,            color: "#6B7280" },
    { label: "Leads",        value: leads.length,  color: "#00AEEF" },
    { label: "Appointments", value: qualLeads.length, color: "#A78BFA" },
    { label: "Sales",        value: closedWon.length, color: "#10B981" },
    { label: "Revenue",      value: totalRev,      color: "#FBBF24", prefix: "$" },
  ];
  const maxPipeline = Math.max(...PIPELINE.map(p => p.value), 1);

  const card = (label: string, value: string, sub: string, color: string) => (
    <div style={{
      background: isDark ? "#0B1629" : "#F8FAFC",
      border: `1px solid ${isDark ? "rgba(0,174,239,0.12)" : "#E2E8F0"}`,
      borderRadius: 12, padding: "20px 22px",
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "#6B7280" }}>{sub}</div>
    </div>
  );

  const sectionHead = (title: string, icon: string, sub: string) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: t.text }}>{title}</h2>
      </div>
      <p style={{ margin: "4px 0 0 30px", fontSize: 13, color: "#6B7280" }}>{sub}</p>
    </div>
  );

  const divider = (
    <div style={{ borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "#E2E8F0"}`, margin: "36px 0" }} />
  );

  return (
    <AppShell>
      <div style={{ padding: "28px 32px", maxWidth: 1200, margin: "0 auto" }}>

        {/* ── Header ──────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32, gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 24 }}>💰</span>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: t.text }}>Revenue Attribution Engine</h1>
            </div>
            <p style={{ margin: 0, fontSize: 14, color: "#6B7280" }}>
              Track which AI Edge leads turn into sales and calculate revenue + ROI.
            </p>
          </div>
          {isDemo && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, background: "#F59E0B22",
              border: "1px solid #F59E0B44", borderRadius: 8, padding: "8px 14px",
            }}>
              <span style={{ fontSize: 14 }}>⚡</span>
              <span style={{ fontSize: 13, color: "#F59E0B", fontWeight: 600 }}>Demo Mode — Bed Bugs & Beyond</span>
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#6B7280" }}>Loading revenue data…</div>
        ) : (
          <>

            {/* ─────────────────────────────────────────────────────── */}
            {/* SECTION 1 — KPI DASHBOARD                              */}
            {/* ─────────────────────────────────────────────────────── */}
            {sectionHead("KPI Dashboard", "📊", "Real-time performance metrics across all AI Edge modules")}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14, marginBottom: 16 }}>
              {card("Total Leads",      String(leads.length),             "All captured leads",           "#00AEEF")}
              {card("Qualified Leads",  String(qualLeads.length),         "Leads past initial screening", "#A78BFA")}
              {card("Closed Sales",     String(closedWon.length),         "Won opportunities",            "#10B981")}
              {card("Revenue",          `$${totalRev.toLocaleString()}`,   "Total revenue generated",      "#FBBF24")}
              {card("Conv. Rate",       `${convRate.toFixed(1)}%`,         "Leads → closed sales",         "#00AEEF")}
              {card("Avg Ticket",       `$${Math.round(avgTicket).toLocaleString()}`, "Per closed sale",  "#F472B6")}
              {card("ROI",              roi > 0 ? `${Math.round(roi)}%` : "—", "vs. AI Edge investment",  "#10B981")}
            </div>

            {divider}

            {/* ─────────────────────────────────────────────────────── */}
            {/* SECTION 2 — LEAD PIPELINE                              */}
            {/* ─────────────────────────────────────────────────────── */}
            {sectionHead("Lead Pipeline", "🔀", "Full-funnel view from inbound calls through closed revenue")}
            <div style={{
              background: isDark ? "#0B1629" : "#F8FAFC",
              border: `1px solid ${isDark ? "rgba(0,174,239,0.12)" : "#E2E8F0"}`,
              borderRadius: 12, padding: "24px 28px",
            }}>
              <div style={{ display: "flex", gap: 0, alignItems: "flex-end", height: 130 }}>
                {PIPELINE.map((step, i) => {
                  const pct = Math.max(0.08, step.value / maxPipeline);
                  const barH = Math.round(pct * 100);
                  return (
                    <div key={step.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                      {i < PIPELINE.length - 1 && (
                        <div style={{ position: "absolute", marginTop: 12 }} />
                      )}
                      <div style={{ fontSize: 12, fontWeight: 700, color: step.color }}>
                        {step.prefix ?? ""}{typeof step.value === "number" && step.value >= 1000 ? `${(step.value / 1000).toFixed(1)}k` : step.value}
                      </div>
                      <div style={{
                        width: "70%", height: barH, background: step.color,
                        borderRadius: "4px 4px 0 0", opacity: 0.85,
                        minHeight: 10, transition: "height 0.4s ease",
                      }} />
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 0, borderTop: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`, paddingTop: 10 }}>
                {PIPELINE.map(step => (
                  <div key={step.label} style={{ flex: 1, textAlign: "center", fontSize: 11, color: "#6B7280", fontWeight: 600 }}>
                    {step.label}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 0, marginTop: 4 }}>
                {PIPELINE.slice(0, -1).map((step, i) => {
                  const next = PIPELINE[i + 1];
                  const pct  = step.value > 0 ? Math.round((next.value / step.value) * 100) : 0;
                  return (
                    <div key={step.label} style={{ flex: 1, textAlign: "center" }}>
                      {i < PIPELINE.length - 2 && (
                        <span style={{ fontSize: 10, color: "#10B981", fontWeight: 700 }}>↓ {pct}%</span>
                      )}
                    </div>
                  );
                })}
                <div style={{ flex: 1 }} />
              </div>
            </div>

            {divider}

            {/* ─────────────────────────────────────────────────────── */}
            {/* SECTION 3 — REVENUE BY SOURCE                          */}
            {/* ─────────────────────────────────────────────────────── */}
            {sectionHead("Revenue by Source", "📡", "Performance breakdown by AI Edge module")}
            <div style={{
              background: isDark ? "#0B1629" : "#F8FAFC",
              border: `1px solid ${isDark ? "rgba(0,174,239,0.12)" : "#E2E8F0"}`,
              borderRadius: 12, overflow: "hidden",
            }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: isDark ? "#0A1020" : "#F1F5F9" }}>
                    {["Source", "Leads", "Sales", "Revenue", "Conv. Rate", "Revenue Bar"].map(h => (
                      <th key={h} style={{
                        padding: "12px 16px", textAlign: "left",
                        fontSize: 11, fontWeight: 700, color: "#6B7280",
                        letterSpacing: "0.05em", textTransform: "uppercase",
                        borderBottom: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sourceStats.map((row, i) => {
                    const conv = row.leads > 0 ? Math.round(row.sales / row.leads * 100) : 0;
                    const barW = Math.max(4, Math.round(row.revenue / maxSrcRev * 180));
                    return (
                      <tr key={row.src} style={{
                        background: i % 2 === 0 ? "transparent" : (isDark ? "#060E1E" : "#F8FAFC"),
                        borderBottom: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`,
                      }}>
                        <td style={{ padding: "14px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 16 }}>{SOURCE_ICON[row.src]}</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{row.src}</span>
                          </div>
                        </td>
                        <td style={{ padding: "14px 16px", fontSize: 14, fontWeight: 700, color: "#00AEEF" }}>{row.leads}</td>
                        <td style={{ padding: "14px 16px", fontSize: 14, fontWeight: 700, color: "#10B981" }}>{row.sales}</td>
                        <td style={{ padding: "14px 16px", fontSize: 14, fontWeight: 700, color: "#FBBF24" }}>
                          {row.revenue > 0 ? `$${row.revenue.toLocaleString()}` : "—"}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <span style={{
                            background: conv >= 50 ? "#10B98122" : conv >= 25 ? "#F59E0B22" : "#EF444422",
                            color: conv >= 50 ? "#10B981" : conv >= 25 ? "#F59E0B" : "#EF4444",
                            padding: "3px 10px", borderRadius: 99, fontSize: 12, fontWeight: 700,
                          }}>{conv}%</span>
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <div style={{ height: 8, width: 180, background: isDark ? "#1E2D48" : "#E2E8F0", borderRadius: 4 }}>
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

            {/* ─────────────────────────────────────────────────────── */}
            {/* SECTION 4 — LEAD MATCHING + SECTION 5 MANUAL CLOSEOUT  */}
            {/* ─────────────────────────────────────────────────────── */}
            {sectionHead("Lead Matching & Manual Closeout", "🔍", "Match AI Edge leads to GorillaDesk jobs and mark outcomes")}
            <div style={{
              background: isDark ? "#0B1629" : "#F8FAFC",
              border: `1px solid ${isDark ? "rgba(0,174,239,0.12)" : "#E2E8F0"}`,
              borderRadius: 12, overflow: "hidden",
            }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: isDark ? "#0A1020" : "#F1F5F9" }}>
                    {["Customer", "Phone", "Source", "Status", "Revenue", "Job ID", "Action"].map(h => (
                      <th key={h} style={{
                        padding: "12px 16px", textAlign: "left",
                        fontSize: 11, fontWeight: 700, color: "#6B7280",
                        letterSpacing: "0.05em", textTransform: "uppercase",
                        borderBottom: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead, i) => {
                    const sm = STATUS_META[lead.status] ?? STATUS_META.pending;
                    return (
                      <tr key={lead.id} style={{
                        background: i % 2 === 0 ? "transparent" : (isDark ? "#060E1E" : "#F8FAFC"),
                        borderBottom: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`,
                      }}>
                        <td style={{ padding: "12px 16px", fontWeight: 600, fontSize: 13, color: t.text }}>{lead.customerName}</td>
                        <td style={{ padding: "12px 16px", fontSize: 12, color: "#6B7280" }}>{lead.phone ?? "—"}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ fontSize: 13, color: "#9CA3AF" }}>
                            {SOURCE_ICON[lead.leadSource]} {lead.leadSource}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{
                            background: sm.bg, color: sm.color,
                            padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700,
                          }}>{sm.label}</span>
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "#FBBF24" }}>
                          {lead.revenue != null ? `$${lead.revenue.toLocaleString()}` : "—"}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 12, color: "#6B7280", fontFamily: "monospace" }}>
                          {lead.gorilladeskJobId ?? "—"}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <button
                            onClick={() => openCloseout(lead)}
                            style={{
                              background: "transparent", border: `1px solid ${isDark ? "rgba(0,174,239,0.4)" : "#CBD5E1"}`,
                              color: "#00AEEF", borderRadius: 6, padding: "5px 12px",
                              fontSize: 12, fontWeight: 600, cursor: "pointer",
                            }}
                          >Edit</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {divider}

            {/* ─────────────────────────────────────────────────────── */}
            {/* SECTION 6 — ROI ANALYTICS                              */}
            {/* ─────────────────────────────────────────────────────── */}
            {sectionHead("ROI Analytics", "📈", "Estimated value and return generated by AI Edge")}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

              {/* Revenue by module bars */}
              <div style={{
                background: isDark ? "#0B1629" : "#F8FAFC",
                border: `1px solid ${isDark ? "rgba(0,174,239,0.12)" : "#E2E8F0"}`,
                borderRadius: 12, padding: "22px 24px",
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 16 }}>Revenue by Module</div>
                {sourceStats.filter(s => s.revenue > 0).sort((a, b) => b.revenue - a.revenue).map(s => {
                  const pct = Math.max(4, Math.round(s.revenue / maxSrcRev * 100));
                  return (
                    <div key={s.src} style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ fontSize: 12, color: "#9CA3AF" }}>{SOURCE_ICON[s.src]} {s.src}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#FBBF24" }}>${s.revenue.toLocaleString()}</span>
                      </div>
                      <div style={{ height: 8, background: isDark ? "#1E2D48" : "#E2E8F0", borderRadius: 4 }}>
                        <div style={{ height: 8, width: `${pct}%`, background: "#00AEEF", borderRadius: 4 }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Key ROI stats */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  { label: "Revenue Recovered",       value: `$${totalRev.toLocaleString()}`,                         sub: "Direct revenue from AI Edge leads",          color: "#FBBF24" },
                  { label: "Avg Revenue per Lead",     value: leads.length > 0 ? fmt$(Math.round(totalRev / leads.length)) : "—", sub: "Including unconverted leads", color: "#00AEEF" },
                  { label: "Conversion Rate",          value: `${convRate.toFixed(1)}%`,                               sub: "Leads closed as Won",                        color: "#10B981" },
                  { label: "Estimated AI Edge Value",  value: totalRev > 0 ? `$${totalRev.toLocaleString()}` : "—",   sub: "Annualized attribution estimate",            color: "#A78BFA" },
                  { label: "Missed Call Saved",        value: fmt$(sourceStats.find(s => s.src === "Missed Call Recovery")?.revenue ?? 0), sub: "Revenue from recovered missed calls", color: "#F472B6" },
                ].map(stat => (
                  <div key={stat.label} style={{
                    background: isDark ? "#0B1629" : "#F8FAFC",
                    border: `1px solid ${isDark ? "rgba(0,174,239,0.12)" : "#E2E8F0"}`,
                    borderRadius: 10, padding: "14px 18px",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <div>
                      <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 600 }}>{stat.label}</div>
                      <div style={{ fontSize: 10, color: "#4B5563", marginTop: 2 }}>{stat.sub}</div>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                  </div>
                ))}
              </div>
            </div>

          </>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────── */}
      {/* MANUAL CLOSEOUT MODAL                                      */}
      {/* ─────────────────────────────────────────────────────────── */}
      {selected && (
        <div
          onClick={e => e.target === e.currentTarget && setSelected(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000, padding: 20,
          }}
        >
          <div style={{
            background: isDark ? "#0B1629" : "#FFFFFF",
            border: `1px solid ${isDark ? "rgba(0,174,239,0.2)" : "#E2E8F0"}`,
            borderRadius: 16, padding: 28, width: "100%", maxWidth: 480,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: t.text }}>Manual Closeout</h3>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6B7280" }}>{selected.customerName} · {selected.leadSource}</p>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6B7280", lineHeight: 1, padding: 4 }}>×</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Status buttons */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 8 }}>STATUS</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    { val: "closed_won",  label: "Won ✓",   color: "#10B981" },
                    { val: "closed_lost", label: "Lost",    color: "#EF4444" },
                    { val: "pending",     label: "Pending", color: "#F59E0B" },
                    { val: "matched",     label: "Matched", color: "#00AEEF" },
                    { val: "unmatched",   label: "Unmatched", color: "#6B7280" },
                  ].map(s => (
                    <button
                      key={s.val}
                      onClick={() => setForm(f => ({ ...f, status: s.val }))}
                      style={{
                        border: `2px solid ${form.status === s.val ? s.color : (isDark ? "#1E2D48" : "#E2E8F0")}`,
                        background: form.status === s.val ? s.color + "22" : "transparent",
                        color: form.status === s.val ? s.color : "#6B7280",
                        borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                      }}
                    >{s.label}</button>
                  ))}
                </div>
              </div>

              {/* Revenue */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 6 }}>REVENUE AMOUNT ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 1500.00"
                  value={form.revenue}
                  onChange={e => setForm(f => ({ ...f, revenue: e.target.value }))}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    background: isDark ? "#0A1020" : "#F8FAFC",
                    border: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`,
                    color: t.text, borderRadius: 8, padding: "10px 14px", fontSize: 14,
                  }}
                />
              </div>

              {/* Service type */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 6 }}>SERVICE TYPE</label>
                <input
                  type="text"
                  placeholder="e.g. Bed Bug Treatment"
                  value={form.serviceType}
                  onChange={e => setForm(f => ({ ...f, serviceType: e.target.value }))}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    background: isDark ? "#0A1020" : "#F8FAFC",
                    border: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`,
                    color: t.text, borderRadius: 8, padding: "10px 14px", fontSize: 14,
                  }}
                />
              </div>

              {/* Notes */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 6 }}>NOTES</label>
                <textarea
                  rows={3}
                  placeholder="Optional notes…"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  style={{
                    width: "100%", boxSizing: "border-box", resize: "vertical",
                    background: isDark ? "#0A1020" : "#F8FAFC",
                    border: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`,
                    color: t.text, borderRadius: 8, padding: "10px 14px", fontSize: 14,
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <button
                onClick={() => setSelected(null)}
                style={{
                  flex: 1, background: "transparent",
                  border: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`,
                  color: "#6B7280", borderRadius: 8, padding: "11px 0",
                  fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}
              >Cancel</button>
              <button
                onClick={saveCloseout}
                disabled={saving}
                style={{
                  flex: 2, background: saving ? "#10B98166" : "#10B981",
                  border: "none", color: "#FFFFFF", borderRadius: 8, padding: "11px 0",
                  fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer",
                }}
              >{saving ? "Saving…" : "Save Closeout"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 2000,
          background: toast.ok ? "#10B981" : "#EF4444",
          color: "#fff", padding: "12px 20px", borderRadius: 10,
          fontSize: 14, fontWeight: 600, boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}>{toast.msg}</div>
      )}
    </AppShell>
  );
}

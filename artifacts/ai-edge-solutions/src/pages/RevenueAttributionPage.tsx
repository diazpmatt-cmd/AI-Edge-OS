import { useCallback, useEffect, useMemo, useState } from "react";
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

type SyncStatus = {
  lastSyncAt: string | null;
  lastSyncStats: {
    gdJobsAvailable: boolean;
    gdJobCount: number;
    gdCustomerCount: number;
    leadsChecked: number;
    leadsMatched: number;
    revenueMatched: number;
    apiMessage: string;
  } | null;
  realtimeStats: {
    totalLeads: number;
    matchedLeads: number;
    wonLeads: number;
    unmatchedLeads: number;
    revenueMatched: number;
    gdCustomerCount: number;
    gdJobCount: number;
  };
  gdApiStatus: {
    jobsEndpoint: string;
    customersEndpoint: string;
    note: string;
  };
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "#F59E0B" },
  unmatched: { label: "Unmatched", color: "#6B7280" },
  matched: { label: "Matched", color: "#3B82F6" },
  won: { label: "Won", color: "#22C55E" },
  lost: { label: "Lost", color: "#EF4444" },
};

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

export default function RevenueAttributionPage() {
  const apiFetch = useApiFetch();
  const { colors: t, isDark } = useTheme();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [form, setForm] = useState({
    status: "pending",
    revenue: "",
    serviceType: "",
    notes: "",
    gorilladeskJobId: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [leadRows, status] = await Promise.all([
        apiFetch<Lead[]>("/api/revenue-attribution"),
        apiFetch<SyncStatus>("/api/revenue-attribution/sync-status"),
      ]);
      setLeads(leadRows);
      setSyncStatus(status);
    } catch {
      setLeads([]);
      setSyncStatus(null);
      setMessage("Revenue attribution data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const won = useMemo(() => leads.filter((lead) => lead.status === "won"), [leads]);
  const matched = useMemo(
    () => leads.filter((lead) => lead.status === "matched" || lead.status === "won"),
    [leads],
  );
  const attributedRevenue = useMemo(
    () => won.reduce((sum, lead) => sum + (lead.revenue ?? 0), 0),
    [won],
  );
  const conversionRate = leads.length ? (won.length / leads.length) * 100 : 0;
  const avgTicket = won.length ? attributedRevenue / won.length : 0;

  const sourceStats = useMemo(() => {
    const bySource = new Map<string, { leads: number; won: number; revenue: number }>();
    for (const lead of leads) {
      const source = lead.leadSource || "Unknown";
      const current = bySource.get(source) ?? { leads: 0, won: 0, revenue: 0 };
      current.leads += 1;
      if (lead.status === "won") {
        current.won += 1;
        current.revenue += lead.revenue ?? 0;
      }
      bySource.set(source, current);
    }
    return [...bySource.entries()]
      .map(([source, stats]) => ({ source, ...stats }))
      .sort((a, b) => b.revenue - a.revenue || b.leads - a.leads);
  }, [leads]);

  const card = (label: string, value: string, detail: string) => (
    <div
      style={{
        border: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`,
        background: isDark ? "#0B1629" : "#FFFFFF",
        borderRadius: 12,
        padding: 18,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: t.text, marginTop: 6 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>{detail}</div>
    </div>
  );

  const runMatch = async () => {
    setWorking(true);
    setMessage(null);
    try {
      const result = await apiFetch<{ message: string }>("/api/revenue-attribution/match-gorilladesk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setMessage(result.message);
      await load();
    } catch {
      setMessage("Tenant-scoped GorillaDesk matching failed.");
    } finally {
      setWorking(false);
    }
  };

  const runLocalJobMatch = async () => {
    setWorking(true);
    setMessage(null);
    try {
      const result = await apiFetch<{ message: string }>("/api/revenue-attribution/sync-gorilladesk-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setMessage(result.message);
      await load();
    } catch {
      setMessage("Tenant-scoped job matching failed.");
    } finally {
      setWorking(false);
    }
  };

  const openCloseout = (lead: Lead) => {
    setSelected(lead);
    setForm({
      status: lead.status,
      revenue: lead.revenue == null ? "" : String(lead.revenue),
      serviceType: lead.serviceType ?? "",
      notes: lead.notes ?? "",
      gorilladeskJobId: lead.gorilladeskJobId ?? "",
    });
  };

  const saveCloseout = async () => {
    if (!selected) return;
    setWorking(true);
    try {
      await apiFetch(`/api/revenue-attribution/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: form.status,
          revenue: form.revenue ? Number(form.revenue) : null,
          serviceType: form.serviceType || null,
          notes: form.notes || null,
          gorilladeskJobId: form.gorilladeskJobId || null,
        }),
      });
      setSelected(null);
      setMessage("Lead closeout saved.");
      await load();
    } catch {
      setMessage("Lead closeout could not be saved.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <AppShell>
      <div style={{ padding: "28px 32px", maxWidth: 1200, margin: "0 auto", color: t.text }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 24 }}>💰 Revenue Attribution</h1>
          <p style={{ margin: "8px 0 0", color: "#6B7280", fontSize: 13 }}>
            Evidence-backed AI Edge leads, matched jobs, and attributed revenue. No estimated ROI or fabricated funnel counts.
          </p>
        </div>

        {message && (
          <div style={{ padding: 12, marginBottom: 18, borderRadius: 10, background: isDark ? "#0D2034" : "#EFF6FF", fontSize: 13 }}>
            {message}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 60, textAlign: "center", color: "#6B7280" }}>Loading verified revenue data…</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
              {card("Captured leads", String(leads.length), "Attribution records for this client")}
              {card("Matched", String(matched.length), "Matched to known customer/job evidence")}
              {card("Won jobs", String(won.length), "Records explicitly marked won")}
              {card("Attributed revenue", money(attributedRevenue), "Revenue stored on won jobs only")}
              {card("Lead → won", `${conversionRate.toFixed(1)}%`, "Observed conversion, not projected")}
              {card("Average won job", won.length ? money(avgTicket) : "—", "Observed won-job average")}
            </div>

            <div
              style={{
                marginTop: 18,
                border: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`,
                borderRadius: 12,
                padding: 18,
                background: isDark ? "#0B1629" : "#FFFFFF",
              }}
            >
              <div style={{ fontWeight: 750, marginBottom: 6 }}>ROI status</div>
              <div style={{ color: "#6B7280", fontSize: 13 }}>
                ROI is intentionally not calculated until the client’s actual AI Edge cost/investment is stored as authoritative data. Revenue above is attributed revenue, not a projection.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 24 }}>
              <button disabled={working} onClick={() => void runMatch()} style={{ padding: "10px 14px", borderRadius: 8, cursor: "pointer" }}>
                Match Customers
              </button>
              <button disabled={working} onClick={() => void runLocalJobMatch()} style={{ padding: "10px 14px", borderRadius: 8, cursor: "pointer" }}>
                Match Stored Jobs
              </button>
              <div style={{ alignSelf: "center", fontSize: 12, color: "#6B7280" }}>
                {syncStatus
                  ? `${syncStatus.realtimeStats.gdCustomerCount} tenant customers · ${syncStatus.realtimeStats.gdJobCount} stored jobs`
                  : "GorillaDesk snapshot status unavailable"}
              </div>
            </div>

            <h2 style={{ marginTop: 34, fontSize: 18 }}>Revenue by source</h2>
            <div style={{ overflowX: "auto", border: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`, borderRadius: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", background: isDark ? "#081220" : "#F8FAFC" }}>
                    <th style={{ padding: 12 }}>Source</th><th>Leads</th><th>Won</th><th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceStats.length === 0 ? (
                    <tr><td colSpan={4} style={{ padding: 18, color: "#6B7280" }}>No attributed leads yet.</td></tr>
                  ) : sourceStats.map((row) => (
                    <tr key={row.source} style={{ borderTop: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}` }}>
                      <td style={{ padding: 12, fontWeight: 650 }}>{row.source}</td>
                      <td>{row.leads}</td><td>{row.won}</td><td>{money(row.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 style={{ marginTop: 34, fontSize: 18 }}>Lead evidence</h2>
            <div style={{ overflowX: "auto", border: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`, borderRadius: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", background: isDark ? "#081220" : "#F8FAFC" }}>
                    <th style={{ padding: 12 }}>Customer</th><th>Source</th><th>Status</th><th>Revenue</th><th>Evidence</th><th />
                  </tr>
                </thead>
                <tbody>
                  {leads.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: 18, color: "#6B7280" }}>No revenue-attribution records yet.</td></tr>
                  ) : leads.map((lead) => {
                    const meta = STATUS_META[lead.status] ?? { label: lead.status, color: "#6B7280" };
                    return (
                      <tr key={lead.id} style={{ borderTop: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}` }}>
                        <td style={{ padding: 12, fontWeight: 650 }}>{lead.customerName}</td>
                        <td>{lead.leadSource}</td>
                        <td style={{ color: meta.color, fontWeight: 700 }}>{meta.label}</td>
                        <td>{lead.revenue == null ? "—" : money(lead.revenue)}</td>
                        <td>{lead.gorilladeskJobId ? `Job ${lead.gorilladeskJobId}` : lead.matchedAt ? "Customer matched" : "Pending"}</td>
                        <td><button onClick={() => openCloseout(lead)}>Close out</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {selected && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", display: "grid", placeItems: "center", padding: 20, zIndex: 100 }}>
            <div style={{ width: "min(520px, 100%)", background: isDark ? "#0B1629" : "#FFFFFF", padding: 22, borderRadius: 14 }}>
              <h3 style={{ marginTop: 0 }}>Close out {selected.customerName}</h3>
              <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={{ display: "block", width: "100%", margin: "6px 0 12px" }}>
                {Object.keys(STATUS_META).map((status) => <option key={status} value={status}>{STATUS_META[status].label}</option>)}
              </select></label>
              <label>Revenue<input type="number" min="0" step="0.01" value={form.revenue} onChange={(e) => setForm({ ...form, revenue: e.target.value })} style={{ display: "block", width: "100%", margin: "6px 0 12px" }} /></label>
              <label>Service type<input value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })} style={{ display: "block", width: "100%", margin: "6px 0 12px" }} /></label>
              <label>GorillaDesk job ID<input value={form.gorilladeskJobId} onChange={(e) => setForm({ ...form, gorilladeskJobId: e.target.value })} style={{ display: "block", width: "100%", margin: "6px 0 12px" }} /></label>
              <label>Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ display: "block", width: "100%", minHeight: 90, margin: "6px 0 12px" }} /></label>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button disabled={working} onClick={() => setSelected(null)}>Cancel</button>
                <button disabled={working} onClick={() => void saveCloseout()}>Save evidence</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

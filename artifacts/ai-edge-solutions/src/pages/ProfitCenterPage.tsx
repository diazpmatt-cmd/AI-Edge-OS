import { useQuery }      from "@tanstack/react-query";
import { useApiFetch }   from "@/lib/api";
import { AppShell }      from "@/components/app-shell";
import { Link }          from "wouter";

// ── Brand ─────────────────────────────────────────────────────────────────────
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

// ── Types ─────────────────────────────────────────────────────────────────────
interface GDRevenue {
  monthly_revenue:         number;
  collected_revenue:       number;
  outstanding_revenue:     number;
  avg_ticket:              number;
  monthly_revenue_fmt:     string;
  collected_revenue_fmt:   string;
  outstanding_revenue_fmt: string;
  avg_ticket_fmt:          string;
  period:                  string;
  data_source:             string;
}

interface GDJobs {
  total:           number;
  completed:       number;
  incomplete:      number;
  completion_rate: number;
  data_source:     string;
}

interface SyncStatus {
  realtimeStats: {
    totalLeads:      number;
    matchedLeads:    number;
    wonLeads:        number;
    unmatchedLeads:  number;
    revenueMatched:  number;
    gdCustomerCount: number;
    gdJobCount:      number;
  };
}

interface AttrLead {
  id:           string;
  customerName: string;
  leadSource:   string;
  status:       string;
  revenue:      number | null;
  serviceType:  string | null;
  createdAt:    string;
  matchedAt:    string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt$(v: number) {
  return v === 0 ? "$0" : `$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function sourceLabel(s: string | undefined) {
  if (!s) return null;
  if (s === "api_sync")       return { text: "🟢 GorillaDesk Sync",    color: B.green   };
  if (s === "manual_import")  return { text: "🟡 Manual Import",       color: B.gold    };
  if (s === "live")           return { text: "🟢 Live DB",             color: B.green   };
  return                               { text: `🟢 ${s}`,             color: B.green   };
}

function statusColor(s: string) {
  if (s === "won")      return B.green;
  if (s === "matched")  return B.cyan;
  if (s === "pending")  return B.gold;
  if (s === "lost")     return B.red;
  return B.dim;
}

function statusLabel(s: string) {
  if (s === "won")       return "✅ Won";
  if (s === "matched")   return "🔗 Matched";
  if (s === "pending")   return "⏳ Pending";
  if (s === "unmatched") return "❓ Unmatched";
  if (s === "lost")      return "❌ Lost";
  return s;
}

// ── UI primitives ─────────────────────────────────────────────────────────────
function Panel({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 14, padding: "20px 22px", boxSizing: "border-box", ...style }}>
      {children}
    </div>
  );
}

function SLabel({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "2.5px", color: B.cyan, textTransform: "uppercase", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ flex: 1, height: 1, background: `${B.cyan}33` }} />
      {text}
      <span style={{ flex: 1, height: 1, background: `${B.cyan}33` }} />
    </div>
  );
}

function LiveBadge({ label = "🟢 LIVE" }: { label?: string }) {
  return (
    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "1px", background: `${B.green}22`, color: B.green, border: `1px solid ${B.green}44`, borderRadius: 10, padding: "2px 7px" }}>
      {label}
    </span>
  );
}

function KpiCard({
  icon, label, value, sub, color, badge,
}: {
  icon: string; label: string; value: string; sub: string; color: string; badge?: React.ReactNode;
}) {
  return (
    <Panel style={{ borderColor: `${color}33` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        {badge}
      </div>
      <div style={{ fontSize: "clamp(20px,2.2vw,28px)", fontWeight: 900, color, letterSpacing: "-1px", marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: B.white, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: B.dim }}>{sub}</div>
    </Panel>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 0" }}>
      <div style={{ width: 28, height: 28, border: `3px solid ${B.border}`, borderTopColor: B.blue, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function EmptyState({ icon, title, sub, linkTo, linkLabel }: {
  icon: string; title: string; sub: string; linkTo?: string; linkLabel?: string;
}) {
  return (
    <div style={{ textAlign: "center", padding: "40px 24px", color: B.dim }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: B.silver, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: B.dim, marginBottom: linkTo ? 16 : 0 }}>{sub}</div>
      {linkTo && (
        <Link to={linkTo} style={{ fontSize: 12, color: B.blue, fontWeight: 600, textDecoration: "none" }}>
          {linkLabel ?? "Go →"}
        </Link>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ProfitCenterPage() {
  const apiFetch = useApiFetch();
  const today    = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const gdRevQ = useQuery<GDRevenue>({
    queryKey: ["gd-revenue"],
    queryFn:  () => apiFetch("/analytics/gorilladesk/revenue"),
    staleTime: 5 * 60_000,
  });

  const gdJobsQ = useQuery<GDJobs>({
    queryKey: ["gd-jobs"],
    queryFn:  () => apiFetch("/analytics/gorilladesk/jobs"),
    staleTime: 5 * 60_000,
  });

  const syncQ = useQuery<SyncStatus>({
    queryKey: ["revenue-sync-status"],
    queryFn:  () => apiFetch("/revenue-attribution/sync-status?clientId=default"),
    staleTime: 5 * 60_000,
  });

  const leadsQ = useQuery<AttrLead[]>({
    queryKey: ["revenue-attribution-leads"],
    queryFn:  () => apiFetch("/revenue-attribution?clientId=default"),
    staleTime: 5 * 60_000,
  });

  const isLoading = gdRevQ.isLoading || syncQ.isLoading;

  // ── Derived values ───────────────────────────────────────────────────────
  const rev      = gdRevQ.data;
  const jobs     = gdJobsQ.data;
  const sync     = syncQ.data?.realtimeStats;
  const leads    = leadsQ.data ?? [];

  const hasGDData     = (rev && (rev.monthly_revenue > 0 || rev.collected_revenue > 0));
  const hasAttrData   = sync && sync.totalLeads > 0;
  const hasGDCustomers = sync && sync.gdCustomerCount > 0;

  // Top matched/won leads with revenue — for the attribution table
  const revenueLeads = leads
    .filter(l => l.revenue && l.revenue > 0)
    .sort((a, b) => new Date(b.matchedAt ?? b.createdAt).getTime() - new Date(a.matchedAt ?? a.createdAt).getTime())
    .slice(0, 12);

  // Breakdown by lead source
  const bySource = leads.reduce<Record<string, { count: number; revenue: number }>>((acc, l) => {
    const key = l.leadSource ?? "Unknown";
    if (!acc[key]) acc[key] = { count: 0, revenue: 0 };
    acc[key].count++;
    acc[key].revenue += l.revenue ?? 0;
    return acc;
  }, {});

  const sourceBadge = sourceLabel(rev?.data_source);

  return (
    <AppShell>
      <div style={{
        minHeight: "100vh", background: B.navy,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif",
        color: B.white, padding: "28px 32px", boxSizing: "border-box",
      }}>

        {/* ══ Header ═══════════════════════════════════════════════════════════ */}
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
                Executive revenue summary — live data only.{" "}
                <Link to="/admin/revenue-attribution" style={{ color: B.blue, textDecoration: "none", fontWeight: 600 }}>
                  → Operational detail in Revenue Attribution
                </Link>
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {sourceBadge && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: `${sourceBadge.color}15`, border: `1px solid ${sourceBadge.color}33`, borderRadius: 20, padding: "7px 14px" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: sourceBadge.color }}>{sourceBadge.text}</span>
                </div>
              )}
              <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 20, padding: "7px 14px", fontSize: 11, color: B.silver }}>
                📅 {today}
              </div>
            </div>
          </div>
        </div>

        {isLoading ? <Spinner /> : (
          <>
            {/* ══ SECTION 1: GorillaDesk Revenue KPIs ══════════════════════════ */}
            <div style={{ marginBottom: 28 }}>
              <SLabel text="GorillaDesk Revenue" />
              {!hasGDData ? (
                <Panel>
                  <EmptyState
                    icon="📊"
                    title="No revenue data yet"
                    sub="Sync your GorillaDesk account to pull real revenue figures here."
                    linkTo="/admin/revenue-attribution"
                    linkLabel="Go to Revenue Attribution →"
                  />
                </Panel>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
                  <KpiCard
                    icon="📅" label="Revenue This Month" color={B.emerald}
                    value={rev?.monthly_revenue_fmt ?? "—"}
                    sub={`Period: ${rev?.period ?? "—"}`}
                    badge={<LiveBadge label={sourceBadge?.text ?? "🟢 LIVE"} />}
                  />
                  <KpiCard
                    icon="✅" label="Collected Revenue" color={B.green}
                    value={rev?.collected_revenue_fmt ?? "—"}
                    sub="Payments collected to date"
                    badge={<LiveBadge />}
                  />
                  <KpiCard
                    icon="⏳" label="Outstanding AR" color={B.gold}
                    value={rev?.outstanding_revenue_fmt ?? "—"}
                    sub="Invoiced but not yet collected"
                    badge={<LiveBadge />}
                  />
                  <KpiCard
                    icon="🎯" label="Avg Job Value" color={B.cyan}
                    value={rev?.avg_ticket_fmt ?? "—"}
                    sub="Average per completed job"
                    badge={<LiveBadge />}
                  />
                </div>
              )}
            </div>

            {/* ══ SECTION 2: AI Lead Attribution KPIs ══════════════════════════ */}
            <div style={{ marginBottom: 28 }}>
              <SLabel text="AI Lead Attribution" />
              {!hasGDCustomers && !hasAttrData ? (
                <Panel>
                  <EmptyState
                    icon="🔗"
                    title="Connect GorillaDesk to activate revenue tracking"
                    sub="Once connected, AI-captured leads are matched to GorillaDesk customers and closed jobs to track real revenue impact."
                    linkTo="/admin/connections"
                    linkLabel="Connect GorillaDesk →"
                  />
                </Panel>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
                  <KpiCard
                    icon="🤖" label="Total AI Leads" color={B.blue}
                    value={sync ? String(sync.totalLeads) : "—"}
                    sub="Captured by AI Receptionist"
                    badge={<LiveBadge />}
                  />
                  <KpiCard
                    icon="🔗" label="Matched to GorillaDesk" color={B.cyan}
                    value={sync ? String(sync.matchedLeads) : "—"}
                    sub={`of ${sync?.gdCustomerCount ?? 0} GD customers`}
                    badge={<LiveBadge />}
                  />
                  <KpiCard
                    icon="💵" label="Revenue Matched" color={B.emerald}
                    value={sync ? fmt$(sync.revenueMatched) : "—"}
                    sub="Confirmed via closed jobs"
                    badge={<LiveBadge />}
                  />
                  <KpiCard
                    icon="🏆" label="Deals Won / Closed" color={B.green}
                    value={sync ? String(sync.wonLeads) : "—"}
                    sub="Leads marked as won"
                    badge={<LiveBadge />}
                  />
                </div>
              )}
            </div>

            {/* ══ SECTION 3: Jobs Overview ══════════════════════════════════════ */}
            <div style={{ marginBottom: 28 }}>
              <SLabel text="Jobs Overview" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
                <KpiCard
                  icon="📋" label="Total Jobs" color={B.blue}
                  value={jobs ? String(jobs.total) : "—"}
                  sub="All jobs in GorillaDesk"
                  badge={jobs ? <LiveBadge label={`🟢 ${jobs.data_source}`} /> : undefined}
                />
                <KpiCard
                  icon="✅" label="Completed Jobs" color={B.green}
                  value={jobs ? String(jobs.completed) : "—"}
                  sub="Successfully completed"
                  badge={jobs ? <LiveBadge /> : undefined}
                />
                <KpiCard
                  icon="📈" label="Completion Rate" color={B.emerald}
                  value={jobs ? `${jobs.completion_rate}%` : "—"}
                  sub="Completed ÷ total"
                  badge={jobs ? <LiveBadge /> : undefined}
                />
                <KpiCard
                  icon="🔄" label="GorillaDesk Customers" color={B.cyan}
                  value={sync ? String(sync.gdCustomerCount) : "—"}
                  sub="In attribution system"
                  badge={<LiveBadge />}
                />
              </div>
            </div>

            {/* ══ SECTION 4: Lead Source Breakdown ════════════════════════════ */}
            {leads.length > 0 && Object.keys(bySource).length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <SLabel text="Revenue by Lead Source" />
                <Panel>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr>
                        {["Lead Source", "Leads", "Revenue Matched", "Share"].map(h => (
                          <th key={h} style={{ padding: "8px 12px", textAlign: h === "Lead Source" ? "left" : "right", color: B.dim, fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.8px", borderBottom: `1px solid ${B.border}` }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(bySource)
                        .sort((a, b) => b[1].revenue - a[1].revenue)
                        .map(([source, data]) => {
                          const totalRev = leads.reduce((s, l) => s + (l.revenue ?? 0), 0);
                          const share = totalRev > 0 ? Math.round((data.revenue / totalRev) * 100) : 0;
                          return (
                            <tr key={source}>
                              <td style={{ padding: "10px 12px", color: B.white, fontWeight: 600 }}>{source}</td>
                              <td style={{ padding: "10px 12px", textAlign: "right", color: B.silver }}>{data.count}</td>
                              <td style={{ padding: "10px 12px", textAlign: "right", color: data.revenue > 0 ? B.emerald : B.dim, fontWeight: 700 }}>
                                {data.revenue > 0 ? fmt$(data.revenue) : "—"}
                              </td>
                              <td style={{ padding: "10px 12px", textAlign: "right", color: B.cyan }}>
                                {data.revenue > 0 ? `${share}%` : "—"}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </Panel>
              </div>
            )}

            {/* ══ SECTION 5: Matched Revenue Leads ════════════════════════════ */}
            <div style={{ marginBottom: 28 }}>
              <SLabel text="Recent Matched Revenue" />
              {revenueLeads.length === 0 ? (
                <Panel>
                  <EmptyState
                    icon="⏳"
                    title={hasAttrData ? "Waiting for first matched lead" : "No revenue leads yet"}
                    sub={
                      hasAttrData
                        ? `${sync!.unmatchedLeads} lead(s) waiting to be matched. Run a GorillaDesk sync to match them.`
                        : "AI-captured leads will appear here once they are matched to closed GorillaDesk jobs."
                    }
                    linkTo="/admin/revenue-attribution"
                    linkLabel="Open Revenue Attribution →"
                  />
                </Panel>
              ) : (
                <Panel>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr>
                        {["Customer", "Lead Source", "Service", "Status", "Revenue", "Matched"].map(h => (
                          <th key={h} style={{ padding: "8px 12px", textAlign: h === "Customer" || h === "Lead Source" || h === "Service" ? "left" : "right", color: B.dim, fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.8px", borderBottom: `1px solid ${B.border}` }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {revenueLeads.map(l => (
                        <tr key={l.id}>
                          <td style={{ padding: "10px 12px", color: B.white, fontWeight: 600 }}>{l.customerName}</td>
                          <td style={{ padding: "10px 12px", color: B.silver }}>{l.leadSource ?? "—"}</td>
                          <td style={{ padding: "10px 12px", color: B.dim }}>{l.serviceType ?? "—"}</td>
                          <td style={{ padding: "10px 12px", textAlign: "right" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: statusColor(l.status) }}>{statusLabel(l.status)}</span>
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "right", color: B.emerald, fontWeight: 800 }}>
                            {l.revenue ? fmt$(l.revenue) : "—"}
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "right", color: B.dim, fontSize: 11 }}>
                            {l.matchedAt ? new Date(l.matchedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 12, fontSize: 11, color: B.dim, textAlign: "right" }}>
                    Showing {revenueLeads.length} matched lead{revenueLeads.length !== 1 ? "s" : ""} with revenue ·{" "}
                    <Link to="/admin/revenue-attribution" style={{ color: B.blue, textDecoration: "none" }}>View all leads →</Link>
                  </div>
                </Panel>
              )}
            </div>

            {/* ══ SECTION 6: Setup guide (shown when GD not connected) ════════ */}
            {!hasGDCustomers && (
              <div style={{ marginBottom: 28 }}>
                <SLabel text="Activate Revenue Tracking" />
                <Panel style={{ borderColor: `${B.gold}33`, background: `${B.gold}06` }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
                    {[
                      { step: "1", icon: "🔗", title: "Connect GorillaDesk", desc: "Link your GorillaDesk account via the Connections page to enable customer and job syncing.", linkTo: "/admin/connections", linkLabel: "Connect now →" },
                      { step: "2", icon: "🔄", title: "Run Attribution Sync", desc: "Match AI-captured leads to GorillaDesk customers by phone number. Runs automatically after connection.", linkTo: "/admin/revenue-attribution", linkLabel: "Open Attribution →" },
                      { step: "3", icon: "💵", title: "Revenue Appears Here", desc: "Once leads are matched to closed jobs, real revenue figures appear in this dashboard. No estimation.", linkTo: undefined, linkLabel: undefined },
                    ].map(s => (
                      <div key={s.step} style={{ textAlign: "center", padding: "16px 12px" }}>
                        <div style={{ fontSize: 28, marginBottom: 10 }}>{s.icon}</div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: B.gold, marginBottom: 4 }}>Step {s.step}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: B.white, marginBottom: 8 }}>{s.title}</div>
                        <div style={{ fontSize: 11, color: B.dim, lineHeight: 1.6, marginBottom: s.linkTo ? 12 : 0 }}>{s.desc}</div>
                        {s.linkTo && (
                          <Link to={s.linkTo} style={{ fontSize: 12, color: B.blue, fontWeight: 700, textDecoration: "none" }}>{s.linkLabel}</Link>
                        )}
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            )}

            {/* ══ Footer note ══════════════════════════════════════════════════ */}
            <div style={{ borderTop: `1px solid ${B.border}`, paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 11, color: B.dim }}>
                All figures sourced from GorillaDesk and AI lead attribution. No estimates.
              </span>
              <Link to="/admin/revenue-attribution" style={{ fontSize: 11, color: B.blue, textDecoration: "none", fontWeight: 600 }}>
                Operational detail → Revenue Attribution
              </Link>
            </div>

          </>
        )}
      </div>
    </AppShell>
  );
}

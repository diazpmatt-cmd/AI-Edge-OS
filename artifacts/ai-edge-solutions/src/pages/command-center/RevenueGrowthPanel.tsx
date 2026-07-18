import { useCallback, useState } from "react";
import { useGorilladeskAnalytics } from "@/lib/gorilladesk-analytics";
import { useLeadsQuery } from "@/hooks/useLeadsQuery";
import { toast } from "sonner";

function StatCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px",
      border: "1px solid rgba(255,255,255,0.05)",
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color }}>{value}</div>
    </div>
  );
}

function SkeletonBlock({ height = 100 }: { height?: number }) {
  return (
    <div style={{
      height,
      background: "linear-gradient(90deg, rgba(255,255,255,0.025) 25%, rgba(255,255,255,0.045) 50%, rgba(255,255,255,0.025) 75%)",
      border: "1px solid rgba(255,255,255,0.05)",
      borderRadius: 13,
    }} />
  );
}

export function RevenueGrowthPanel() {
  const { data: gd, loading: gdLoading, error: gdError, syncing: gdSyncing, lastSyncedAt, syncFromGorillaDesk } = useGorilladeskAnalytics();
  const { data: leadsData } = useLeadsQuery();
  const [syncError, setSyncError] = useState<string | null>(null);

  const handleSync = useCallback(async () => {
    setSyncError(null);
    try {
      await syncFromGorillaDesk();
      toast.success("GorillaDesk data synced");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      setSyncError(msg);
      toast.error(msg);
    }
  }, [syncFromGorillaDesk]);

  const stats = leadsData?.stats;

  return (
    <div role="region" aria-label="Revenue and Growth">
      {/* Sync header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        {syncError && <span style={{ fontSize: 10, color: "#EF4444", fontWeight: 600 }}>⚠ {syncError}</span>}
        {lastSyncedAt && !syncError && (
          <span style={{ fontSize: 10, color: "#475569" }}>
            Synced {new Date(lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        {!gdLoading && !gdError && !gdSyncing && !lastSyncedAt && (
          <span style={{ fontSize: 10, color: "#22C55E", fontWeight: 600 }}>● Live</span>
        )}
        {gdLoading && !gdSyncing && <span style={{ fontSize: 10, color: "#475569" }}>Loading…</span>}
        <button
          onClick={handleSync}
          disabled={gdSyncing || gdLoading}
          aria-label="Sync GorillaDesk data"
          style={{
            background: gdSyncing ? "rgba(0,174,239,0.06)" : "rgba(0,174,239,0.12)",
            border: "1px solid rgba(0,174,239,0.3)",
            borderRadius: 6, color: gdSyncing ? "#64748B" : "#00AEEF",
            fontSize: 10, fontWeight: 700, padding: "4px 10px",
            cursor: gdSyncing || gdLoading ? "not-allowed" : "pointer",
          }}
        >
          {gdSyncing ? "⟳ Syncing…" : "⟳ Sync Now"}
        </button>
      </div>

      {gdLoading && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <SkeletonBlock /><SkeletonBlock /><SkeletonBlock /><SkeletonBlock />
        </div>
      )}

      {!gdLoading && gdError && (
        <div style={{
          background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)",
          borderRadius: 13, padding: "28px", textAlign: "center", marginBottom: 12,
        }}>
          <div style={{ fontSize: 20, marginBottom: 8 }}>⚠</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#EF4444", marginBottom: 4 }}>Analytics unavailable</div>
          <div style={{ fontSize: 11, color: "#64748B" }}>Could not load GorillaDesk data. The API may be unreachable.</div>
        </div>
      )}

      {!gdLoading && !gdError && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Row 1: Revenue + Jobs */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{
              background: "linear-gradient(135deg, rgba(11,22,41,0.95), rgba(3,6,18,0.85))",
              border: "1px solid rgba(245,158,11,0.15)", borderRadius: 14, padding: "18px 20px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 15 }}>💰</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: "#E2E8F0" }}>Revenue</span>
                {gd.revenue && <span style={{ fontSize: 9, color: "#64748B", marginLeft: "auto" }}>{gd.revenue.period}</span>}
              </div>
              {!gd.revenue || gd.revenue.monthly_revenue === 0 ? (
                <div style={{ textAlign: "center", padding: "10px 0", color: "#475569", fontSize: 12 }}>No revenue data yet</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <StatCell label="Monthly Revenue" value={gd.revenue.monthly_revenue_fmt} color="#F59E0B" />
                  <StatCell label="Collected" value={gd.revenue.collected_revenue_fmt} color="#22C55E" />
                  <StatCell label="Outstanding" value={gd.revenue.outstanding_revenue_fmt} color="#EF4444" />
                  <StatCell label="Avg Ticket" value={gd.revenue.avg_ticket_fmt} color="#94A3B8" />
                </div>
              )}
            </div>

            <div style={{
              background: "linear-gradient(135deg, rgba(11,22,41,0.95), rgba(3,6,18,0.85))",
              border: "1px solid rgba(34,197,94,0.15)", borderRadius: 14, padding: "18px 20px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 15 }}>🔧</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: "#E2E8F0" }}>Jobs</span>
              </div>
              {!gd.jobs || gd.jobs.total === 0 ? (
                <div style={{ textAlign: "center", padding: "10px 0", color: "#475569", fontSize: 12 }}>No job data yet</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <StatCell label="Total Jobs" value={String(gd.jobs.total)} color="#94A3B8" />
                  <StatCell label="Completed" value={String(gd.jobs.completed)} color="#22C55E" />
                  <StatCell label="Incomplete" value={String(gd.jobs.incomplete)} color="#EF4444" />
                  <StatCell label="Completion Rate" value={`${gd.jobs.completion_rate}%`} color="#00AEEF" />
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Lead Funnel + Customers */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {/* Lead Funnel */}
            <div style={{
              background: "linear-gradient(135deg, rgba(11,22,41,0.95), rgba(3,6,18,0.85))",
              border: "1px solid rgba(0,174,239,0.15)", borderRadius: 14, padding: "18px 20px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 15 }}>🎯</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: "#E2E8F0" }}>Lead Funnel</span>
              </div>
              {!stats ? (
                <div style={{ textAlign: "center", padding: "10px 0", color: "#475569", fontSize: 12 }}>No lead data yet</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <StatCell label="Total Leads" value={String(stats.total)} color="#94A3B8" />
                  <StatCell label="Active" value={String(stats.active)} color="#00AEEF" />
                  <StatCell label="This Month" value={String(stats.thisMonth)} color="#22C55E" />
                  <StatCell label="With Messages" value={String(stats.withMessages)} color="#3B82F6" />
                </div>
              )}
            </div>

            {/* Customers */}
            <div style={{
              background: "linear-gradient(135deg, rgba(11,22,41,0.95), rgba(3,6,18,0.85))",
              border: "1px solid rgba(59,130,246,0.15)", borderRadius: 14, padding: "18px 20px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 15 }}>👥</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: "#E2E8F0" }}>Customers</span>
                {gd.customers && <span style={{ fontSize: 9, color: "#64748B", marginLeft: "auto" }}>{gd.customers.period}</span>}
              </div>
              {!gd.customers || (gd.customers.new_customers === 0 && gd.customers.returning_customers === 0) ? (
                <div style={{ textAlign: "center", padding: "10px 0", color: "#475569", fontSize: 12 }}>No customer data yet</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <StatCell label="New Customers" value={gd.customers.new_customers != null ? String(gd.customers.new_customers) : "—"} color="#00AEEF" />
                  <StatCell label="Returning" value={gd.customers.returning_customers != null ? String(gd.customers.returning_customers) : "—"} color="#3B82F6" />
                  <StatCell label="Active Services" value={gd.customers.active_services != null ? String(gd.customers.active_services) : "—"} color="#F59E0B" />
                  <StatCell label="Recurring" value={gd.customers.recurring_services != null ? String(gd.customers.recurring_services) : "—"} color="#22C55E" />
                </div>
              )}
            </div>
          </div>

          {/* Row 3: Payments */}
          {gd.payments && gd.payments.breakdown.length > 0 && (
            <div style={{
              background: "linear-gradient(135deg, rgba(11,22,41,0.95), rgba(3,6,18,0.85))",
              border: "1px solid rgba(59,130,246,0.12)", borderRadius: 14, padding: "18px 20px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 15 }}>💳</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: "#E2E8F0" }}>Payment Breakdown</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {gd.payments.breakdown.map(p => {
                  const total = gd.payments!.total || 1;
                  const pct = Math.round((p.amount / total) * 100);
                  const methodColors: Record<string, string> = { card: "#00AEEF", cash: "#22C55E", check: "#F59E0B", ach: "#3B82F6", other: "#64748B" };
                  const color = methodColors[p.method] ?? "#64748B";
                  return (
                    <div key={p.method}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "#CBD5E1", textTransform: "capitalize", fontWeight: 600 }}>{p.method}</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color }}>{p.amount_fmt}</span>
                      </div>
                      <div style={{ height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3 }} aria-valuenow={pct} role="progressbar" aria-label={`${p.method} ${pct}%`} />
                      </div>
                      <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>{p.count} payment{p.count !== 1 ? "s" : ""} · {pct}%</div>
                    </div>
                  );
                })}
                <div style={{ marginTop: 4, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: "#475569" }}>Total processed</span>
                  <span style={{ fontSize: 14, fontWeight: 900, color: "#E2E8F0" }}>{gd.payments.total_fmt}</span>
                </div>
              </div>
            </div>
          )}

          {/* Row 4: Lead sources */}
          {gd.marketing && gd.marketing.lead_sources.length > 0 && (
            <div style={{
              background: "linear-gradient(135deg, rgba(11,22,41,0.95), rgba(3,6,18,0.85))",
              border: "1px solid rgba(245,158,11,0.12)", borderRadius: 14, padding: "18px 20px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 15 }}>📣</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: "#E2E8F0" }}>Lead Sources</span>
                <span style={{ fontSize: 9, color: "#64748B", marginLeft: "auto" }}>{gd.marketing.period}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
                {gd.marketing.lead_sources.map((src, i) => {
                  const palette = ["#00AEEF", "#22C55E", "#F59E0B", "#3B82F6", "#EF4444", "#E1306C"];
                  const color = palette[i % palette.length];
                  return (
                    <div key={src.name} style={{
                      background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px",
                      border: `1px solid ${color}18`,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#CBD5E1", marginBottom: 6 }}>{src.name}</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color, marginBottom: 2 }}>{src.revenue_fmt}</div>
                      <div style={{ fontSize: 10, color: "#475569" }}>{src.job_count} job{src.job_count !== 1 ? "s" : ""}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

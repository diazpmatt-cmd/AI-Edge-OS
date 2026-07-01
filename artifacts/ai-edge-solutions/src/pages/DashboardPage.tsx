import { Link } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { loadProfile, type Keyword, type ArticleDraft } from "@/lib/business-data";
import { fetchKeywords, insertKeywords, clearKeywords } from "@/lib/keywords-store";
import { fetchArticles, insertArticles, clearArticles, buildContentPlan } from "@/lib/articles-store";
import { generateKeywordIdeas } from "@/lib/keywords.functions";
import { useGorilladeskAnalytics } from "@/lib/gorilladesk-analytics";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Static platform-state cards (not from GorillaDesk)
// ─────────────────────────────────────────────────────────────────────────────

const PLATFORM_KPI_CARDS = [
  { icon: "📍", label: "Local Visibility",    value: "Pending", sub: "Score not yet active",             color: "#EF4444", glow: false },
  { icon: "✨", label: "AI Visibility",       value: "Pending", sub: "Scan not yet run",                 color: "#8B5CF6", glow: false },
  { icon: "⚡", label: "Connected Platforms", value: "4 / 8",  sub: "Facebook, Instagram, GBP, YouTube", color: "#00AEEF", glow: false },
  { icon: "🛡", label: "Automation Health",   value: "Pending", sub: "Health score pending",             color: "#10B981", glow: false },
];

// Scoring breakdown — pending live data integration.
// These values will be computed from real platform signals once each module
// completes its initial setup and begins reporting live data.
const HEALTH_BREAKDOWN = [
  { label: "Lead Recovery",     pct: 0, color: "#10B981", pending: true },
  { label: "Local Presence",    pct: 0, color: "#EF4444", pending: true },
  { label: "AI Visibility",     pct: 0, color: "#8B5CF6", pending: true },
  { label: "Social Publishing", pct: 0, color: "#00AEEF", pending: true },
  { label: "Automation Health", pct: 0, color: "#F59E0B", pending: true },
];

const ALERTS = [
  { severity: "warning",  text: "Apple Business Connect setup in progress",    icon: "⚠" },
  { severity: "warning",  text: "Bing Places setup in progress",               icon: "⚠" },
  { severity: "critical", text: "AI Visibility competitor gap is high",        icon: "✕" },
  { severity: "warning",  text: "Google API quota throttled recently",         icon: "⚠" },
  { severity: "warning",  text: "Nextdoor Business setup in progress",         icon: "⚠" },
  { severity: "warning",  text: "Review velocity below competitor average",    icon: "⚠" },
  { severity: "healthy",  text: "Facebook connected and ready to publish",     icon: "✓" },
  { severity: "healthy",  text: "Instagram connected",                         icon: "✓" },
  { severity: "healthy",  text: "Google Business Profile connected",           icon: "✓" },
  { severity: "healthy",  text: "Lead Recovery AI active",                     icon: "✓" },
];

const ALERT_STYLE: Record<string, { color: string; bg: string; border: string; label: string }> = {
  critical: { color: "#F87171", bg: "rgba(239,68,68,0.07)",  border: "rgba(239,68,68,0.2)",  label: "Critical" },
  warning:  { color: "#FCD34D", bg: "rgba(245,158,11,0.07)", border: "rgba(245,158,11,0.2)", label: "Warning"  },
  healthy:  { color: "#10B981", bg: "rgba(16,185,129,0.07)", border: "rgba(16,185,129,0.2)", label: "Healthy"  },
};

// Opportunity estimates require baseline performance data before they can be
// quantified. Specific projections will appear once each module has run for
// a full reporting period and established its benchmark.
const OPPORTUNITIES = [
  { icon: "📞", title: "Missed Call Recovery",  potential: "Estimate pending",  color: "#10B981", action: "Improve response automation and appointment booking",  link: "/admin/lead-recovery"   },
  { icon: "✨", title: "AI Search Visibility",  potential: "Estimate pending",  color: "#8B5CF6", action: "Create AI-readable business summary and city pages",   link: "/admin/ai-visibility"   },
  { icon: "📍", title: "Local Listings",        potential: "Estimate pending",  color: "#00AEEF", action: "Claim Apple, Bing, and Nextdoor listings",             link: "/admin/local-presence"  },
  { icon: "⭐", title: "Review Growth",         potential: "Estimate pending",  color: "#F59E0B", action: "Launch automated review request campaign",             link: "/admin/lead-recovery"   },
];

const MODULES = [
  { icon: "📞", name: "Lead Recovery AI",    status: "Active",       statusColor: "#10B981", pct: null, summary: "Telnyx connected · Monitoring calls",  link: "/admin/lead-recovery"     },
  { icon: "📍", name: "Local Presence",      status: "Setup needed", statusColor: "#F59E0B", pct: null, summary: "3 platforms not yet claimed",          link: "/admin/local-presence"    },
  { icon: "✨", name: "AI Visibility",       status: "Pending scan", statusColor: "#EF4444", pct: null, summary: "No scan data yet",                     link: "/admin/ai-visibility"     },
  { icon: "⚡", name: "Connected Accounts",  status: "Partial",      statusColor: "#00AEEF", pct: null, summary: "4 of 8 platforms connected",           link: "/admin/connections"       },
  { icon: "📸", name: "Publishing Center",   status: "Ready",        statusColor: "#00AEEF", pct: null, summary: "Queue open · No score yet",            link: "/admin/social-publishing" },
  { icon: "🤖", name: "Auto Content Engine", status: "Ready",        statusColor: "#00AEEF", pct: null, summary: "Content pipeline active",              link: "/admin/auto-content"      },
  { icon: "🛰", name: "System Diagnostics",  status: "Monitoring",   statusColor: "#8B5CF6", pct: null, summary: "All core systems nominal",             link: "/admin/diagnostics"       },
];

const SNAPSHOTS = [
  {
    title: "Lead Recovery",
    icon: "📞",
    color: "#10B981",
    link: "/admin/lead-recovery",
    rows: [
      { label: "Status",  value: "Active",  valueColor: "#10B981" },
      { label: "Source",  value: "Telnyx",  valueColor: "#94A3B8" },
    ],
  },
  {
    title: "Local Presence",
    icon: "📍",
    color: "#00AEEF",
    link: "/admin/local-presence",
    rows: [
      { label: "Google Business",    value: "Connected",  valueColor: "#10B981" },
      { label: "Apple Business",     value: "Pending",    valueColor: "#F87171" },
      { label: "Bing Places",        value: "Pending",    valueColor: "#F87171" },
      { label: "Nextdoor Business",  value: "Pending",    valueColor: "#F87171" },
    ],
  },
  {
    title: "AI Visibility",
    icon: "✨",
    color: "#8B5CF6",
    link: "/admin/ai-visibility",
    rows: [
      { label: "Visibility score",   value: "Pending",    valueColor: "#475569" },
      { label: "Prompts detected",   value: "2 of 8",     valueColor: "#F59E0B" },
      { label: "Competitor gap",     value: "High",       valueColor: "#F87171" },
      { label: "Actions pending",    value: "7",          valueColor: "#94A3B8" },
    ],
  },
];

const QUICK_ACTIONS = [
  { label: "Open Lead Recovery",        icon: "📞", link: "/admin/lead-recovery",      color: "#10B981" },
  { label: "AI Visibility Scan",        icon: "✨", link: "/admin/ai-visibility",      color: "#8B5CF6" },
  { label: "Open Local Presence",       icon: "📍", link: "/admin/local-presence",     color: "#00AEEF" },
  { label: "Publishing Center",         icon: "📸", link: "/admin/social-publishing",  color: "#00AEEF" },
  { label: "View Diagnostics",          icon: "🛰", link: "/admin/diagnostics",        color: "#64748B" },
  { label: "Auto Content Engine",       icon: "🤖", link: "/admin/auto-content",       color: "#F59E0B" },
  { label: "Image Asset Manager",       icon: "🖼", link: "/admin/image-assets",       color: "#64748B" },
  { label: "Connected Accounts",        icon: "⚡", link: "/admin/connections",        color: "#00AEEF" },
];

// Activity feed — will populate with real timestamped events once modules
// begin generating live signals (calls received, scans run, posts published, etc.)
const ACTIVITY: { time: string; text: string; icon: string; color: string }[] = [];

const NEXT_ACTIONS = [
  { rank: 1, action: "Claim Apple Business Connect",                  impact: "High", time: "30 min" },
  { rank: 2, action: "Claim Bing Places for Business",               impact: "High", time: "30 min" },
  { rank: 3, action: "Create AI-readable business summary page",     impact: "High", time: "2 hrs"  },
  { rank: 4, action: "Launch review request campaign",               impact: "High", time: "1 day"  },
  { rank: 5, action: "Create Foley and Gulf Shores city pages",      impact: "High", time: "1 day"  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI atoms
// ─────────────────────────────────────────────────────────────────────────────

function SectionDivider({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "1.1px", textTransform: "uppercase", whiteSpace: "nowrap" }}>{title}</div>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
      {right}
    </div>
  );
}

function KPICard({ icon, label, value, sub, color, glow }: { icon: string; label: string; value: string; sub: string; color: string; glow?: boolean }) {
  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(11,22,41,0.95), rgba(3,6,18,0.85))",
      border: `1px solid ${color}22`,
      borderRadius: 14, padding: "18px 20px",
      boxShadow: glow ? `0 0 28px ${color}18` : "none",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: -16, right: -16, width: 68, height: 68, borderRadius: "50%",
        background: `${color}0C`, border: `1px solid ${color}14`,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
      }}>{icon}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 900, color, lineHeight: 1, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: "#64748B" }}>{sub}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const profile = useMemo(() => loadProfile(), []);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [articles, setArticles] = useState<ArticleDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "keywords" | "plan">(null);
  const [alertFilter, setAlertFilter] = useState<"all" | "critical" | "warning" | "healthy">("all");
  const { data: gd, loading: gdLoading, error: gdError, syncing: gdSyncing, lastSyncedAt, syncFromGorillaDesk } = useGorilladeskAnalytics();
  const [syncError, setSyncError] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncError(null);
    try {
      await syncFromGorillaDesk();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync failed");
    }
  };

  const reload = async () => {
    const [kw, ar] = await Promise.all([fetchKeywords(), fetchArticles()]);
    setKeywords(kw); setArticles(ar);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [kw, ar] = await Promise.all([fetchKeywords(), fetchArticles()]);
        if (cancelled) return;
        setKeywords(kw); setArticles(ar);
      } catch { } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleGenerateKeywords = async () => {
    setBusy("keywords");
    try {
      const { keywords: generated } = await generateKeywordIdeas({
        businessName: profile.businessName, industry: profile.industry,
        city: profile.city, state: profile.state,
        mainServices: profile.mainServices, targetCustomers: profile.targetCustomers,
      });
      await clearKeywords(); await clearArticles();
      const inserted = await insertKeywords(generated.map((k) => ({ ...k, city: profile.city, state: profile.state })));
      setKeywords(inserted); setArticles([]);
      toast.success(`Generated ${inserted.length} keywords`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate keywords");
    } finally { setBusy(null); }
  };

  const handleGenerateContentPlan = async () => {
    setBusy("plan");
    try {
      const plan = buildContentPlan(keywords, profile);
      await clearArticles();
      await insertArticles(plan);
      await reload();
      toast.success(`Created ${plan.length} scheduled articles`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create plan");
    } finally { setBusy(null); }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { draft: 0, scheduled: 0, ready_for_website: 0, published: 0, published_error: 0 };
    for (const a of articles) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [articles]);

  const totalArticles = articles.length;
  const publishedPct  = totalArticles ? Math.round(((counts.published ?? 0) / totalArticles) * 100) : 0;

  const filteredAlerts = alertFilter === "all" ? ALERTS : ALERTS.filter(a => a.severity === alertFilter);

  return (
    <AppShell>
      <div style={{ maxWidth: 1140, margin: "0 auto" }}>

        {/* ── Executive Header ── */}
        <div style={{ marginBottom: 30 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.22)",
              borderRadius: 20, padding: "4px 13px",
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10B981", animation: "pulse 2s infinite" }} />
              <span style={{ fontSize: 11, color: "#00AEEF", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" }}>AI Edge Ecosystem Active</span>
            </div>
            <span style={{ fontSize: 11, color: "#334155" }}>Last updated: Today</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 30, fontWeight: 900, color: "#FFFFFF", letterSpacing: "-0.6px", margin: "0 0 6px" }}>
                Command Center
              </h1>
              <p style={{ fontSize: 14, color: "#6B7280", margin: 0, maxWidth: 560 }}>
                AI-powered growth, visibility, and lead recovery control center for{" "}
                <strong style={{ color: "#CBD5E1" }}>Bed Bugs &amp; Beyond</strong> — Baldwin County, Alabama.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link to="/admin/lead-recovery">
                <button style={{
                  padding: "9px 18px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: "#10B981",
                }}>📞 Lead Recovery</button>
              </Link>
              <Link to="/admin/ai-visibility">
                <button style={{
                  padding: "9px 18px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)", color: "#A78BFA",
                }}>✨ AI Visibility</button>
              </Link>
            </div>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 28 }}>
          <KPICard
            icon="💰"
            label="Monthly Revenue"
            value={gdLoading ? "…" : (gd.revenue?.monthly_revenue_fmt ?? "—")}
            sub={gdLoading ? "Loading…" : (gd.revenue ? `Period: ${gd.revenue.period}` : "No data yet")}
            color="#F59E0B"
            glow={!!(gd.revenue?.monthly_revenue)}
          />
          <KPICard
            icon="🔧"
            label="Jobs Completed"
            value={gdLoading ? "…" : (gd.jobs ? String(gd.jobs.completed) : "—")}
            sub={gdLoading ? "Loading…" : (gd.jobs ? `${gd.jobs.completion_rate}% completion rate` : "No data yet")}
            color="#10B981"
            glow={!!(gd.jobs?.completed)}
          />
          {PLATFORM_KPI_CARDS.map(c => <KPICard key={c.label} {...c} />)}
        </div>

        {/* ── Business Health Score + Live Alerts ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>

          {/* Health Score */}
          <div>
            <SectionDivider title="Business Growth Score" />
            <div style={{
              background: "linear-gradient(135deg, rgba(11,22,41,0.95), rgba(3,6,18,0.85))",
              border: "1px solid rgba(0,174,239,0.12)", borderRadius: 16,
              padding: "24px 26px",
              boxShadow: "0 0 40px rgba(0,174,239,0.06)",
            }}>
              {/* Big score — pending live data */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 8 }}>
                <div style={{ fontSize: 72, fontWeight: 900, lineHeight: 1, color: "#475569", letterSpacing: "-2px" }}>—</div>
                <div style={{ paddingBottom: 10 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#334155" }}>/100</div>
                  <div style={{ fontSize: 11, color: "#475569", fontWeight: 600 }}>Business Growth Score</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 20, lineHeight: 1.5 }}>
                Pending live scoring — score will be calculated once platform modules complete setup and begin reporting data.
              </div>
              {/* Breakdown bars — pending */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {HEALTH_BREAKDOWN.map(row => (
                  <div key={row.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 500 }}>{row.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#334155" }}>Pending</span>
                    </div>
                    <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3 }} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Live Alerts */}
          <div>
            <SectionDivider title="Live Alerts" right={
              <div style={{ display: "flex", gap: 4 }}>
                {(["all","critical","warning","healthy"] as const).map(f => (
                  <button key={f} onClick={() => setAlertFilter(f)} style={{
                    padding: "3px 9px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer", border: "none",
                    background: alertFilter === f ? "rgba(0,174,239,0.15)" : "transparent",
                    color: alertFilter === f ? "#00AEEF" : "#475569",
                    textTransform: "capitalize",
                  }}>{f}</button>
                ))}
              </div>
            } />
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {filteredAlerts.map((a, i) => {
                const st = ALERT_STYLE[a.severity];
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    background: st.bg, border: `1px solid ${st.border}`,
                    borderRadius: 9, padding: "10px 14px",
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                      background: `${st.color}18`, border: `1px solid ${st.color}30`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, color: st.color, fontWeight: 900,
                    }}>{a.icon}</div>
                    <span style={{ fontSize: 12, color: "#CBD5E1", flex: 1 }}>{a.text}</span>
                    <span style={{ fontSize: 9, fontWeight: 800, color: st.color, whiteSpace: "nowrap" }}>{st.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── GorillaDesk Business Analytics ── */}
        <div style={{ marginBottom: 28 }}>
          <SectionDivider title="GorillaDesk Business Analytics" right={
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {syncError && (
                <span style={{ fontSize: 10, color: "#F87171", fontWeight: 600 }}>⚠ {syncError}</span>
              )}
              {lastSyncedAt && !syncError && (
                <span style={{ fontSize: 10, color: "#475569" }}>
                  Synced {new Date(lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              {gdError && !gdSyncing && (
                <span style={{ fontSize: 10, color: "#F87171", fontWeight: 600 }}>⚠ {gdError}</span>
              )}
              {gdLoading && !gdSyncing && (
                <span style={{ fontSize: 10, color: "#475569" }}>Loading…</span>
              )}
              {!gdLoading && !gdError && !gdSyncing && !lastSyncedAt && (
                <span style={{ fontSize: 10, color: "#10B981", fontWeight: 600 }}>● Live</span>
              )}
              <button
                onClick={handleSync}
                disabled={gdSyncing || gdLoading}
                style={{
                  background: gdSyncing ? "rgba(0,174,239,0.08)" : "rgba(0,174,239,0.12)",
                  border: "1px solid rgba(0,174,239,0.3)",
                  borderRadius: 6,
                  color: gdSyncing ? "#64748B" : "#00AEEF",
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "4px 10px",
                  cursor: gdSyncing || gdLoading ? "not-allowed" : "pointer",
                  letterSpacing: "0.03em",
                }}
              >
                {gdSyncing ? "⟳ Syncing…" : "⟳ Sync Now"}
              </button>
            </div>
          } />

          {gdLoading && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {[...Array(4)].map((_, i) => (
                <div key={i} style={{
                  background: "linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 13, padding: "20px 18px", height: 100,
                }} />
              ))}
            </div>
          )}

          {!gdLoading && gdError && (
            <div style={{
              background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)",
              borderRadius: 13, padding: "28px", textAlign: "center",
            }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>⚠</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#F87171", marginBottom: 4 }}>Analytics unavailable</div>
              <div style={{ fontSize: 11, color: "#64748B" }}>Could not load GorillaDesk data. The API may be unreachable.</div>
            </div>
          )}

          {!gdLoading && !gdError && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Row 1: Revenue + Jobs */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

                {/* Revenue */}
                <div style={{
                  background: "linear-gradient(135deg, rgba(11,22,41,0.95), rgba(3,6,18,0.85))",
                  border: "1px solid rgba(245,158,11,0.15)", borderRadius: 14, padding: "20px 22px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <span style={{ fontSize: 16 }}>💰</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#E2E8F0" }}>Revenue</span>
                    {gd.revenue && <span style={{ fontSize: 9, color: "#64748B", marginLeft: "auto" }}>{gd.revenue.period}</span>}
                  </div>
                  {!gd.revenue || gd.revenue.monthly_revenue === 0 ? (
                    <div style={{ textAlign: "center", padding: "12px 0", color: "#475569", fontSize: 12 }}>No revenue data yet</div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {[
                        { label: "Monthly Revenue",    value: gd.revenue.monthly_revenue_fmt,     color: "#F59E0B" },
                        { label: "Collected",          value: gd.revenue.collected_revenue_fmt,   color: "#10B981" },
                        { label: "Outstanding",        value: gd.revenue.outstanding_revenue_fmt, color: "#F87171" },
                        { label: "Avg Ticket",         value: gd.revenue.avg_ticket_fmt,          color: "#94A3B8" },
                      ].map(m => (
                        <div key={m.label} style={{
                          background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px",
                          border: "1px solid rgba(255,255,255,0.05)",
                        }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>{m.label}</div>
                          <div style={{ fontSize: 22, fontWeight: 900, color: m.color }}>{m.value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Jobs */}
                <div style={{
                  background: "linear-gradient(135deg, rgba(11,22,41,0.95), rgba(3,6,18,0.85))",
                  border: "1px solid rgba(16,185,129,0.15)", borderRadius: 14, padding: "20px 22px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <span style={{ fontSize: 16 }}>🔧</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#E2E8F0" }}>Jobs</span>
                  </div>
                  {!gd.jobs || gd.jobs.total === 0 ? (
                    <div style={{ textAlign: "center", padding: "12px 0", color: "#475569", fontSize: 12 }}>No job data yet</div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {[
                        { label: "Total Jobs",       value: String(gd.jobs.total),              color: "#94A3B8" },
                        { label: "Completed",        value: String(gd.jobs.completed),          color: "#10B981" },
                        { label: "Incomplete",       value: String(gd.jobs.incomplete),         color: "#F87171" },
                        { label: "Completion Rate",  value: `${gd.jobs.completion_rate}%`,      color: "#00AEEF" },
                      ].map(m => (
                        <div key={m.label} style={{
                          background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px",
                          border: "1px solid rgba(255,255,255,0.05)",
                        }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>{m.label}</div>
                          <div style={{ fontSize: 22, fontWeight: 900, color: m.color }}>{m.value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Row 2: Customers + Payments */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

                {/* Customers */}
                <div style={{
                  background: "linear-gradient(135deg, rgba(11,22,41,0.95), rgba(3,6,18,0.85))",
                  border: "1px solid rgba(0,174,239,0.15)", borderRadius: 14, padding: "20px 22px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <span style={{ fontSize: 16 }}>👥</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#E2E8F0" }}>Customers</span>
                    {gd.customers && <span style={{ fontSize: 9, color: "#64748B", marginLeft: "auto" }}>{gd.customers.period}</span>}
                  </div>
                  {!gd.customers || (gd.customers.new_customers === 0 && gd.customers.returning_customers === 0) ? (
                    <div style={{ textAlign: "center", padding: "12px 0", color: "#475569", fontSize: 12 }}>No customer data yet</div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {[
                        { label: "New Customers",      value: gd.customers.new_customers      != null ? String(gd.customers.new_customers)      : "—", color: "#00AEEF" },
                        { label: "Returning",          value: gd.customers.returning_customers != null ? String(gd.customers.returning_customers) : "—", color: "#8B5CF6" },
                        { label: "Active Services",    value: gd.customers.active_services    != null ? String(gd.customers.active_services)    : "—", color: "#F59E0B" },
                        { label: "Recurring Services", value: gd.customers.recurring_services != null ? String(gd.customers.recurring_services) : "—", color: "#10B981" },
                      ].map(m => (
                        <div key={m.label} style={{
                          background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px",
                          border: "1px solid rgba(255,255,255,0.05)",
                        }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>{m.label}</div>
                          <div style={{ fontSize: 22, fontWeight: 900, color: m.color }}>{m.value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Payments */}
                <div style={{
                  background: "linear-gradient(135deg, rgba(11,22,41,0.95), rgba(3,6,18,0.85))",
                  border: "1px solid rgba(139,92,246,0.15)", borderRadius: 14, padding: "20px 22px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <span style={{ fontSize: 16 }}>💳</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#E2E8F0" }}>Payment Breakdown</span>
                  </div>
                  {!gd.payments || gd.payments.breakdown.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "12px 0", color: "#475569", fontSize: 12 }}>No payment data yet</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {gd.payments.breakdown.map(p => {
                        const totalAmt = gd.payments!.total || 1;
                        const pct = Math.round((p.amount / totalAmt) * 100);
                        const methodColors: Record<string, string> = {
                          card: "#00AEEF", cash: "#10B981", check: "#F59E0B", ach: "#8B5CF6", other: "#64748B",
                        };
                        const color = methodColors[p.method] ?? "#64748B";
                        return (
                          <div key={p.method}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                              <span style={{ fontSize: 12, color: "#CBD5E1", textTransform: "capitalize", fontWeight: 600 }}>{p.method}</span>
                              <span style={{ fontSize: 12, fontWeight: 800, color }}>{p.amount_fmt}</span>
                            </div>
                            <div style={{ height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3 }} />
                            </div>
                            <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>{p.count} payment{p.count !== 1 ? "s" : ""} · {pct}%</div>
                          </div>
                        );
                      })}
                      <div style={{
                        marginTop: 4, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)",
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                      }}>
                        <span style={{ fontSize: 11, color: "#475569" }}>Total processed</span>
                        <span style={{ fontSize: 14, fontWeight: 900, color: "#E2E8F0" }}>{gd.payments.total_fmt}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Row 3: Marketing / Lead Sources */}
              <div style={{
                background: "linear-gradient(135deg, rgba(11,22,41,0.95), rgba(3,6,18,0.85))",
                border: "1px solid rgba(245,158,11,0.12)", borderRadius: 14, padding: "20px 22px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <span style={{ fontSize: 16 }}>📣</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#E2E8F0" }}>Marketing · Lead Sources</span>
                  {gd.marketing && <span style={{ fontSize: 9, color: "#64748B", marginLeft: "auto" }}>{gd.marketing.period}</span>}
                </div>
                {!gd.marketing || gd.marketing.lead_sources.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "16px 0", color: "#475569", fontSize: 12 }}>No lead source data yet</div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                    {gd.marketing.lead_sources.map((src, i) => {
                      const palette = ["#00AEEF", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#E1306C"];
                      const color = palette[i % palette.length];
                      return (
                        <div key={src.name} style={{
                          background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "14px 16px",
                          border: `1px solid ${color}18`,
                        }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#CBD5E1", marginBottom: 6 }}>{src.name}</div>
                          <div style={{ fontSize: 20, fontWeight: 900, color, marginBottom: 2 }}>{src.revenue_fmt}</div>
                          <div style={{ fontSize: 10, color: "#475569" }}>{src.job_count} job{src.job_count !== 1 ? "s" : ""}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>

        {/* ── Growth Opportunities ── */}
        <div style={{ marginBottom: 28 }}>
          <SectionDivider title="Growth Opportunities" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {OPPORTUNITIES.map(op => (
              <div key={op.title} style={{
                background: "linear-gradient(160deg, rgba(11,22,41,0.95), rgba(3,6,18,0.85))",
                border: `1px solid ${op.color}20`,
                borderTop: `2px solid ${op.color}50`,
                borderRadius: 14, padding: "18px 16px",
                display: "flex", flexDirection: "column", gap: 10,
              }}>
                <div style={{ fontSize: 22 }}>{op.icon}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#E2E8F0", marginBottom: 3 }}>{op.title}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: op.color }}>{op.potential}</div>
                </div>
                <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.5, flex: 1 }}>{op.action}</div>
                <Link to={op.link}>
                  <button style={{
                    width: "100%", padding: "7px 0", borderRadius: 8, fontSize: 11, fontWeight: 700,
                    cursor: "pointer", background: `${op.color}0E`, border: `1px solid ${op.color}30`, color: op.color,
                  }}>Open Module →</button>
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* ── Module Health Overview ── */}
        <div style={{ marginBottom: 28 }}>
          <SectionDivider title="Module Health Overview" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {MODULES.map(mod => (
              <div key={mod.name} style={{
                background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)",
                borderTop: `2px solid ${mod.statusColor}35`,
                borderRadius: 13, padding: "16px 16px",
                display: "flex", flexDirection: "column", gap: 10,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 18 }}>{mod.icon}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 800, color: mod.statusColor,
                    background: `${mod.statusColor}14`, border: `1px solid ${mod.statusColor}28`,
                    padding: "2px 8px", borderRadius: 20,
                  }}>{mod.status}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>{mod.name}</div>
                {mod.pct !== null && (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: "#475569" }}>Health</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: mod.statusColor }}>{mod.pct}%</span>
                    </div>
                    <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${mod.pct}%`, background: mod.statusColor, borderRadius: 2 }} />
                    </div>
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.4 }}>{mod.summary}</div>
                <Link to={mod.link}>
                  <button style={{
                    width: "100%", padding: "6px 0", borderRadius: 7, fontSize: 11, fontWeight: 700,
                    cursor: "pointer", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#64748B",
                  }}>Open →</button>
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* ── Performance Snapshots ── */}
        <div style={{ marginBottom: 28 }}>
          <SectionDivider title="Performance Snapshot" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {SNAPSHOTS.map(snap => (
              <div key={snap.title} style={{
                background: "rgba(11,22,41,0.7)", border: `1px solid ${snap.color}18`,
                borderRadius: 14, overflow: "hidden",
              }}>
                <div style={{
                  background: `${snap.color}0C`, borderBottom: `1px solid ${snap.color}18`,
                  padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16 }}>{snap.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#E2E8F0" }}>{snap.title}</span>
                  </div>
                  <Link to={snap.link}>
                    <span style={{ fontSize: 10, color: snap.color, fontWeight: 700, cursor: "pointer" }}>View →</span>
                  </Link>
                </div>
                <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {snap.rows.map(row => (
                    <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "#64748B" }}>{row.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: row.valueColor }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Quick Actions + Recent Activity ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>

          {/* Quick Actions */}
          <div>
            <SectionDivider title="Quick Actions" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {QUICK_ACTIONS.map(qa => (
                <Link key={qa.label} to={qa.link}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 10, padding: "12px 14px", cursor: "pointer",
                    transition: "border-color 0.15s",
                  }}>
                    <span style={{ fontSize: 16 }}>{qa.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#CBD5E1" }}>{qa.label}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div>
            <SectionDivider title="Recent Activity" />
            <div style={{
              background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 14, overflow: "hidden",
            }}>
              {ACTIVITY.length > 0 ? ACTIVITY.map((item, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  padding: "12px 16px",
                  borderBottom: i < ACTIVITY.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                    background: `${item.color}15`, border: `1px solid ${item.color}30`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12,
                  }}>{item.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: "#CBD5E1", lineHeight: 1.4 }}>{item.text}</div>
                    <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{item.time}</div>
                  </div>
                </div>
              )) : (
                <div style={{ padding: "32px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 20, marginBottom: 8 }}>📋</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 4 }}>No activity yet</div>
                  <div style={{ fontSize: 11, color: "#334155" }}>Events will appear here as platform modules generate real signals.</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Next Best Actions ── */}
        <div style={{ marginBottom: 28 }}>
          <SectionDivider title="Next Best Actions" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {NEXT_ACTIONS.map(a => (
              <div key={a.rank} style={{
                display: "flex", alignItems: "center", gap: 14,
                background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 11, padding: "13px 18px",
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                  background: a.rank <= 2 ? "rgba(0,174,239,0.15)" : "rgba(255,255,255,0.05)",
                  border: a.rank <= 2 ? "1px solid rgba(0,174,239,0.4)" : "1px solid rgba(255,255,255,0.08)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 900,
                  color: a.rank <= 2 ? "#00AEEF" : "#475569",
                }}>{a.rank}</div>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#E2E8F0" }}>{a.action}</div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: "#64748B", background: "rgba(255,255,255,0.04)", padding: "3px 10px", borderRadius: 6 }}>⏱ {a.time}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#10B981", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", padding: "3px 10px", borderRadius: 6 }}>{a.impact} Impact</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── SEO Content Engine (preserved from V1) ── */}
        <div style={{ marginBottom: 8 }}>
          <SectionDivider title="SEO Content Engine" right={
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleGenerateKeywords}
                disabled={busy === "keywords"}
                style={{
                  padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  background: "rgba(0,174,239,0.1)", border: "1px solid rgba(0,174,239,0.3)", color: "#00AEEF",
                  opacity: busy === "keywords" ? 0.6 : 1,
                }}
              >
                {busy === "keywords" ? "Generating…" : keywords.length ? "↻ Regenerate Keywords" : "⚡ Generate Keywords"}
              </button>
              {keywords.length > 0 && (
                <button
                  onClick={handleGenerateContentPlan}
                  disabled={busy === "plan"}
                  style={{
                    padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
                    background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#10B981",
                    opacity: busy === "plan" ? 0.6 : 1,
                  }}
                >
                  {busy === "plan" ? "Building…" : articles.length ? "↻ Rebuild Plan" : "📅 Build Content Plan"}
                </button>
              )}
            </div>
          } />

          {/* Keyword + article stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
            {[
              { label: "Keywords Targeted", value: keywords.length, color: "#00AEEF" },
              { label: "Articles Planned",  value: totalArticles,   color: "#8B5CF6" },
              { label: "Drafts",            value: counts.draft ?? 0, color: "#F59E0B" },
              { label: "Published",         value: counts.published ?? 0, color: "#10B981" },
            ].map(s => (
              <div key={s.label} style={{
                background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 11, padding: "14px 16px",
              }}>
                <div style={{ fontSize: 26, fontWeight: 900, color: s.color, marginBottom: 3 }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {loading && (
            <div style={{ padding: "32px", textAlign: "center", color: "#475569", fontSize: 13 }}>Loading content data…</div>
          )}

          {!loading && keywords.length === 0 && (
            <div style={{
              background: "rgba(0,174,239,0.04)", border: "1px dashed rgba(0,174,239,0.18)",
              borderRadius: 13, padding: "32px", textAlign: "center",
            }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>⚡</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#CBD5E1", marginBottom: 6 }}>No keywords yet</div>
              <div style={{ fontSize: 12, color: "#475569" }}>Click "Generate Keywords" above to create SEO targets for Bed Bugs &amp; Beyond.</div>
            </div>
          )}

          {!loading && keywords.length > 0 && (
            <div style={{
              background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 13, overflow: "hidden", marginBottom: 14,
            }}>
              <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "10px 16px" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#00AEEF" }}>Top Keywords</span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    {["Keyword", "Service", "Volume", "Difficulty", "Intent"].map(h => (
                      <th key={h} style={{ padding: "9px 14px", fontSize: 10, fontWeight: 700, color: "#475569", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.6px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {keywords.slice(0, 8).map((k, i) => {
                    const diffColor = k.difficulty === "Low" ? "#10B981" : k.difficulty === "Medium" ? "#F59E0B" : "#EF4444";
                    return (
                      <tr key={k.id} style={{ borderBottom: i < Math.min(keywords.length, 8) - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                        <td style={{ padding: "9px 14px", fontSize: 12, fontWeight: 600, color: "#E2E8F0" }}>{k.keyword}</td>
                        <td style={{ padding: "9px 14px", fontSize: 11, color: "#6B7280" }}>{k.service}</td>
                        <td style={{ padding: "9px 14px", fontSize: 12, color: "#94A3B8" }}>{k.volume.toLocaleString()}</td>
                        <td style={{ padding: "9px 14px" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: diffColor, background: `${diffColor}15`, padding: "2px 8px", borderRadius: 6 }}>{k.difficulty}</span>
                        </td>
                        <td style={{ padding: "9px 14px", fontSize: 11, color: "#64748B" }}>{k.intent}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {keywords.length > 8 && (
                <div style={{ padding: "10px 16px", borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: 11, color: "#475569" }}>
                  +{keywords.length - 8} more keywords
                </div>
              )}
            </div>
          )}

          {!loading && articles.length > 0 && (
            <div style={{
              background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 13, overflow: "hidden",
            }}>
              <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#10B981" }}>30-Day Article Calendar</span>
                <span style={{ fontSize: 11, color: "#475569" }}>{publishedPct}% published</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "rgba(255,255,255,0.03)" }}>
                {articles.map(a => {
                  const stMap: Record<string, { color: string; bg: string }> = {
                    published:         { color: "#10B981", bg: "rgba(16,185,129,0.1)"  },
                    published_error:   { color: "#EF4444", bg: "rgba(239,68,68,0.1)"   },
                    ready_for_website: { color: "#F59E0B", bg: "rgba(245,158,11,0.1)"  },
                    scheduled:         { color: "#00AEEF", bg: "rgba(0,174,239,0.08)"  },
                    draft:             { color: "#475569", bg: "rgba(255,255,255,0.03)" },
                  };
                  const st = stMap[a.status] ?? stMap.draft;
                  const label = a.status === "published_error" ? "Error" : a.status === "ready_for_website" ? "Ready" : a.status;
                  return (
                    <div key={a.id} style={{ background: "#0B1629", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 9, fontWeight: 800, color: st.color, background: st.bg, padding: "2px 7px", borderRadius: 6, textTransform: "capitalize" }}>{label}</span>
                        <span style={{ fontSize: 10, color: "#334155" }}>
                          {a.scheduledFor ? new Date(a.scheduledFor).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#CBD5E1", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any, overflow: "hidden" }}>
                        {a.title}
                      </div>
                      <Link to={`/admin/article/${a.id}`}>
                        <span style={{ fontSize: 10, color: "#00AEEF", fontWeight: 700, cursor: "pointer" }}>
                          {a.body ? "Edit →" : "Write →"}
                        </span>
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

      </div>
    </AppShell>
  );
}

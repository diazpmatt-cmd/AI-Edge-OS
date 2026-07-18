import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { useGorilladeskAnalytics } from "@/lib/gorilladesk-analytics";
import { useLeadsQuery } from "@/hooks/useLeadsQuery";
import { useCallIntelligenceQuery } from "@/hooks/useCallIntelligenceQuery";
import { useSocialPostsQuery } from "@/hooks/useSocialPostsQuery";
import { useInsights } from "@/lib/insights";
import { useApiFetch } from "@/lib/api";
import { type Keyword, type ArticleDraft } from "@/lib/business-data";
import { useActiveBusiness } from "@/contexts/business-context";
import { fetchKeywords, insertKeywords, clearKeywords } from "@/lib/keywords-store";
import { fetchArticles, insertArticles, clearArticles, buildContentPlan } from "@/lib/articles-store";
import { generateKeywordIdeas } from "@/lib/keywords.functions";
import { toast } from "sonner";

import { DashboardSection } from "./DashboardSection";
import { ExecutiveHeader } from "./ExecutiveHeader";
import { ExecutiveKpiGrid } from "./ExecutiveKpiGrid";
import { ModulePackageGrid } from "./ModulePackageGrid";
import { AiExecutiveBrief } from "./AiExecutiveBrief";
import { ActionCenter } from "./ActionCenter";
import { BusinessHealthPanel } from "./BusinessHealthPanel";
import { RevenueGrowthPanel } from "./RevenueGrowthPanel";
import { AiActivityFeed } from "./AiActivityFeed";
import { OpportunityCenter } from "./OpportunityCenter";
import { SystemStatusPanel } from "./SystemStatusPanel";
import type { KpiCardDef, HealthStatus } from "./types";

type TelnyxAnalytics = {
  missed_calls: number;
  recovery_rate: number | null;
  textbacks_sent: number;
  sms_replies: number;
  callback_requests: number;
  after_hours_missed: number;
  estimated_missed_revenue_fmt: string | null;
  estimated_missed_revenue_note: string | null;
  recovered_leads: number;
  has_real_calls: boolean;
};

function SectionHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "1.1px", textTransform: "uppercase", whiteSpace: "nowrap" }}>
        {title}
      </div>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
      {right}
    </div>
  );
}

export default function CommandCenter() {
  const { activeBusiness } = useActiveBusiness();
  const profile = activeBusiness.profile;
  const apiFetch = useApiFetch();

  const { data: gd, loading: gdLoading, error: gdError, syncing: gdSyncing, lastSyncedAt, syncFromGorillaDesk } = useGorilladeskAnalytics();
  const { data: leadsData, isLoading: leadsLoading } = useLeadsQuery();
  const { data: ciData, isLoading: ciLoading } = useCallIntelligenceQuery("30days");
  const { data: postsData, isLoading: postsLoading } = useSocialPostsQuery();
  const { insights, loading: insightsLoading } = useInsights();
  const { data: telnyxData, isLoading: telnyxLoading } = useQuery<TelnyxAnalytics>({
    queryKey: ["telnyx-analytics"],
    queryFn: () => apiFetch<TelnyxAnalytics>("/analytics/telnyx"),
    refetchInterval: 60_000,
  });

  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [articles, setArticles] = useState<ArticleDraft[]>([]);
  const [seoLoading, setSeoLoading] = useState(true);
  const [busy, setBusy] = useState<null | "keywords" | "plan">(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [kw, ar] = await Promise.all([fetchKeywords(), fetchArticles()]);
        if (cancelled) return;
        setKeywords(kw);
        setArticles(ar);
      } catch { /* non-critical — SEO engine degrades gracefully */ } finally {
        if (!cancelled) setSeoLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const reloadSeo = useCallback(async () => {
    const [kw, ar] = await Promise.all([fetchKeywords(), fetchArticles()]);
    setKeywords(kw);
    setArticles(ar);
  }, []);

  const handleGenerateKeywords = useCallback(async () => {
    setBusy("keywords");
    try {
      const { keywords: generated } = await generateKeywordIdeas({
        businessName: profile.businessName, industry: profile.industry,
        city: profile.city, state: profile.state,
        mainServices: profile.mainServices, targetCustomers: profile.targetCustomers,
      });
      await clearKeywords();
      await clearArticles();
      const inserted = await insertKeywords(generated.map(k => ({ ...k, city: profile.city, state: profile.state })));
      setKeywords(inserted);
      setArticles([]);
      toast.success(`Generated ${inserted.length} keywords`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate keywords");
    } finally { setBusy(null); }
  }, [profile]);

  const handleGenerateContentPlan = useCallback(async () => {
    setBusy("plan");
    try {
      const plan = buildContentPlan(keywords, profile);
      await clearArticles();
      await insertArticles(plan);
      await reloadSeo();
      toast.success(`Created ${plan.length} scheduled articles`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create plan");
    } finally { setBusy(null); }
  }, [keywords, profile, reloadSeo]);

  const seoCounts = useMemo(() => {
    const c: Record<string, number> = { draft: 0, scheduled: 0, ready_for_website: 0, published: 0, published_error: 0 };
    for (const a of articles) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [articles]);
  const seoTotal = articles.length;
  const seoPublishedPct = seoTotal ? Math.round(((seoCounts.published ?? 0) / seoTotal) * 100) : 0;

  const kpiCards = useMemo((): KpiCardDef[] => {
    const missedCalls = ciData?.metrics?.missed_calls ?? 0;
    const leadsRecovered = ciData?.metrics?.leads_captured ?? 0;
    const publishedPosts = (postsData ?? []).filter(p => p.status === "published").length;
    const aiProductivity = leadsRecovered + publishedPosts;
    const leadsStats = leadsData?.stats;

    return [
      {
        id: "revenue",
        label: "Revenue",
        value: gdLoading ? "…" : (gd.revenue?.monthly_revenue_fmt ?? "—"),
        sub: gdLoading ? "Loading…" : (gd.revenue ? gd.revenue.period : "No data yet"),
        status: gd.revenue?.monthly_revenue ? "healthy" : gdLoading ? "pending" : "pending",
        color: "#F59E0B",
        loading: gdLoading,
        link: "/admin/profit-center",
        packageId: "revenue-ops",
      },
      {
        id: "leads",
        label: "Leads",
        value: leadsLoading ? "…" : (leadsStats ? String(leadsStats.thisMonth) : "—"),
        sub: leadsLoading ? "Loading…" : (leadsStats ? `${leadsStats.active} active · ${leadsStats.total} total` : "No data yet"),
        status: leadsStats && leadsStats.thisMonth > 0 ? "healthy" : "pending",
        color: "#22C55E",
        loading: leadsLoading,
        link: "/admin/lead-recovery",
        packageId: "lead-pipeline",
      },
      {
        id: "reputation",
        label: "Reputation",
        value: "—",
        sub: "Setup required",
        status: "setup-required",
        color: "#F59E0B",
        setupRequired: true,
        packageId: "market-presence",
      },
      {
        id: "local-visibility",
        label: "Local Visibility",
        value: "Partial",
        sub: "4 platforms · 2 pending",
        status: "warning",
        color: "#00AEEF",
        link: "/admin/local-presence",
        packageId: "market-presence",
      },
      {
        id: "ai-productivity",
        label: "AI Productivity",
        value: ciLoading || postsLoading ? "…" : String(aiProductivity),
        sub: ciLoading ? "Loading…" : `${leadsRecovered} leads · ${publishedPosts} posts · ${missedCalls} missed calls`,
        status: aiProductivity > 0 ? "healthy" : "pending",
        color: "#8B5CF6",
        loading: ciLoading || postsLoading,
        link: "/admin/lead-recovery",
        packageId: "ai-performance",
      },
    ];
  }, [gd, gdLoading, leadsData, leadsLoading, ciData, ciLoading, postsData, postsLoading]);

  const { healthStatus, topPriorityAction, topPriorityLink } = useMemo(() => {
    if (insightsLoading) return { healthStatus: "pending" as HealthStatus, topPriorityAction: undefined, topPriorityLink: undefined };
    const dataInsights = insights.filter(i => i.data_available);
    const criticals = dataInsights.filter(i => i.severity === "critical");
    const warnings = dataInsights.filter(i => i.severity === "warning");
    const status: HealthStatus = criticals.length > 0 ? "critical" : warnings.length > 0 ? "warning" : dataInsights.length > 0 ? "healthy" : "pending";
    const top = criticals[0] ?? warnings[0] ?? dataInsights[0];
    return {
      healthStatus: status,
      topPriorityAction: top?.recommended_action,
      topPriorityLink: top ? "/admin/lead-recovery" : undefined,
    };
  }, [insights, insightsLoading]);

  const activeAutomations = 4;

  return (
    <AppShell>
      <div style={{ maxWidth: 1140, margin: "0 auto" }}>

        {/* ── S1: Executive Header ── */}
        <ExecutiveHeader
          businessName={activeBusiness.name}
          healthStatus={healthStatus}
          aiStatus="active"
          activeAutomations={activeAutomations}
          topPriorityAction={topPriorityAction}
          topPriorityLink={topPriorityLink}
          lastRefreshed={lastSyncedAt ?? undefined}
        />

        {/* ── S2: Executive KPI Row ── */}
        <ExecutiveKpiGrid cards={kpiCards} />

        {/* ── Module Package Grid ── */}
        <DashboardSection id="module-packages" title="AI Edge Module Navigation" defaultExpanded={true}>
          <ModulePackageGrid />
        </DashboardSection>

        {/* ── Plans & À La Carte Services ── */}
        <DashboardSection id="plans-services" title="Plans & À La Carte Services" defaultExpanded={true}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>

            {/* Pricing Packages card */}
            <div style={{
              background: "linear-gradient(135deg, rgba(11,22,41,0.95), rgba(3,6,18,0.85))",
              border: "1px solid rgba(245,158,11,0.22)",
              borderRadius: 16, overflow: "hidden",
            }}>
              <div style={{
                background: "rgba(245,158,11,0.07)",
                borderBottom: "1px solid rgba(245,158,11,0.18)",
                padding: "13px 18px", display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontSize: 20 }}>📦</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#F59E0B", letterSpacing: "0.6px", textTransform: "uppercase" }}>Pricing Packages</div>
                  <div style={{ fontSize: 10, color: "rgba(148,163,184,0.55)", marginTop: 1 }}>Monthly plans for every business size</div>
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#F59E0B", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 6, padding: "2px 8px" }}>3 TIERS</div>
              </div>
              <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { name: "Core Package",   color: "#00AEEF", badge: "POPULAR",  modules: ["GBP Audit Engine","Local Presence","Reviews Engine","Daily Command"], price: "Included" },
                  { name: "Growth Package", color: "#22C55E", badge: "GROWTH",   modules: ["Lead Recovery AI","Call Intelligence","Growth Execution","AI Receptionist"], price: "Add-on" },
                  { name: "Enterprise",     color: "#A78BFA", badge: "CUSTOM",   modules: ["Competitor Intelligence","Authority & Backlink","AI CMO","All Engines"], price: "Custom" },
                ].map(pkg => (
                  <div key={pkg.name} style={{
                    background: `${pkg.color}08`, border: `1px solid ${pkg.color}22`,
                    borderRadius: 10, padding: "10px 14px",
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: pkg.color, boxShadow: `0 0 6px ${pkg.color}88`, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(226,232,240,0.9)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {pkg.name}
                        <span style={{ fontSize: 8, fontWeight: 800, color: pkg.color, background: `${pkg.color}18`, border: `1px solid ${pkg.color}30`, borderRadius: 5, padding: "1px 5px" }}>{pkg.badge}</span>
                      </div>
                      <div style={{ fontSize: 9.5, color: "rgba(100,116,139,0.7)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {pkg.modules.slice(0, 2).join(" · ")} · +{pkg.modules.length - 2} more
                      </div>
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: pkg.color, flexShrink: 0 }}>{pkg.price}</div>
                  </div>
                ))}
                <Link to="/pricing">
                  <div style={{
                    marginTop: 2, padding: "9px 12px", textAlign: "center",
                    background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.22)",
                    borderRadius: 9, fontSize: 10, fontWeight: 700, color: "#F59E0B", cursor: "pointer",
                    transition: "background 0.15s",
                  }}>
                    View Plan Details →
                  </div>
                </Link>
              </div>
            </div>

            {/* À La Carte Services card */}
            <div style={{
              background: "linear-gradient(135deg, rgba(11,22,41,0.95), rgba(3,6,18,0.85))",
              border: "1px solid rgba(242,108,33,0.22)",
              borderRadius: 16, overflow: "hidden",
            }}>
              <div style={{
                background: "rgba(242,108,33,0.07)",
                borderBottom: "1px solid rgba(242,108,33,0.18)",
                padding: "13px 18px", display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontSize: 20 }}>🛒</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#F26C21", letterSpacing: "0.6px", textTransform: "uppercase" }}>À La Carte Services</div>
                  <div style={{ fontSize: 10, color: "rgba(148,163,184,0.55)", marginTop: 1 }}>Premium add-ons for accelerated growth</div>
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#F26C21", background: "rgba(242,108,33,0.1)", border: "1px solid rgba(242,108,33,0.25)", borderRadius: 6, padding: "2px 8px" }}>6 SERVICES</div>
              </div>
              <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 7 }}>
                {[
                  { icon: "📞", name: "Lead Recovery AI",          sub: "Missed call conversion",     color: "#22C55E", status: "available", to: "/admin/lead-recovery"     },
                  { icon: "🤖", name: "AI Receptionist",           sub: "24/7 automated call handling",color: "#38BDF8", status: "available", to: "/admin/ai-receptionist"   },
                  { icon: "📊", name: "Call Intelligence",         sub: "Call tracking & analytics",  color: "#60A5FA", status: "available", to: "/admin/call-intelligence"  },
                  { icon: "🕵️", name: "Competitor Intelligence",   sub: "Market positioning analysis", color: "#8B5CF6", status: "soon",      to: "#"                        },
                  { icon: "🔗", name: "Authority & Backlink Engine",sub: "Domain authority building",  color: "#38BDF8", status: "soon",      to: "#"                        },
                  { icon: "🧠", name: "AI CMO",                    sub: "Strategic AI marketing",     color: "#F472B6", status: "available", to: "/admin/apollos"           },
                ].map(svc => (
                  <div key={svc.name} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 10px", borderRadius: 8,
                    background: `${svc.color}06`,
                    border: `1px solid ${svc.color}18`,
                    opacity: svc.status === "soon" ? 0.65 : 1,
                  }}>
                    <span style={{ fontSize: 15, flexShrink: 0 }}>{svc.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(226,232,240,0.88)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{svc.name}</div>
                      <div style={{ fontSize: 9, color: "rgba(100,116,139,0.65)", marginTop: 1 }}>{svc.sub}</div>
                    </div>
                    <div style={{
                      fontSize: 8, fontWeight: 700, flexShrink: 0,
                      color: svc.status === "soon" ? "rgba(100,116,139,0.7)" : svc.color,
                      background: svc.status === "soon" ? "rgba(100,116,139,0.08)" : `${svc.color}14`,
                      border: `1px solid ${svc.status === "soon" ? "rgba(100,116,139,0.2)" : svc.color + "30"}`,
                      borderRadius: 5, padding: "1px 5px",
                    }}>
                      {svc.status === "soon" ? "SOON" : "LIVE"}
                    </div>
                  </div>
                ))}
                <Link to="/services">
                  <div style={{
                    marginTop: 2, padding: "9px 12px", textAlign: "center",
                    background: "rgba(242,108,33,0.06)", border: "1px solid rgba(242,108,33,0.22)",
                    borderRadius: 9, fontSize: 10, fontWeight: 700, color: "#F26C21", cursor: "pointer",
                    transition: "background 0.15s",
                  }}>
                    Browse All Services →
                  </div>
                </Link>
              </div>
            </div>

          </div>
        </DashboardSection>

        {/* ── S3: AI Executive Brief ── */}
        <DashboardSection id="ai-brief" title="Today's Executive Brief">
          <AiExecutiveBrief />
        </DashboardSection>

        {/* ── S4: Action Center ── */}
        <DashboardSection id="action-center" title="Action Center">
          <ActionCenter />
        </DashboardSection>

        {/* ── S5: Business Health ── */}
        <DashboardSection id="business-health" title="Business Health" defaultExpanded={true}>
          <BusinessHealthPanel />
        </DashboardSection>

        {/* ── S6: Revenue & Growth ── */}
        <DashboardSection id="revenue-growth" title="Revenue & Growth" defaultExpanded={true}>
          <RevenueGrowthPanel />
        </DashboardSection>

        {/* ── Lead Recovery Detail (Telnyx) ── */}
        <DashboardSection id="lead-recovery-detail" title="Lead Recovery Analytics"
          right={<span style={{ fontSize: 10, color: "#22C55E", fontWeight: 600 }}>● Live · Telnyx</span>}
          defaultExpanded={false}
        >
          {telnyxLoading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{ height: 88, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12 }} />
              ))}
            </div>
          ) : telnyxData ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                {[
                  { label: "Missed Calls",      value: String(telnyxData.missed_calls),    color: "#EF4444", sub: `${telnyxData.after_hours_missed} after-hours` },
                  { label: "Recovery Rate",      value: telnyxData.recovery_rate != null ? `${telnyxData.recovery_rate}%` : "—", color: "#22C55E", sub: `${telnyxData.recovered_leads} leads recovered` },
                  { label: "Text-backs Sent",    value: String(telnyxData.textbacks_sent), color: "#00AEEF", sub: `${telnyxData.sms_replies} replies` },
                  { label: "Callback Requests",  value: String(telnyxData.callback_requests), color: "#3B82F6", sub: "Via voice menu" },
                ].map(m => (
                  <div key={m.label} style={{
                    background: "linear-gradient(135deg, rgba(11,22,41,0.95), rgba(3,6,18,0.85))",
                    border: `1px solid ${m.color}20`, borderRadius: 12, padding: "16px 18px",
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>{m.label}</div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: m.color }}>{m.value}</div>
                    <div style={{ fontSize: 10, color: "#475569", marginTop: 4 }}>{m.sub}</div>
                  </div>
                ))}
              </div>
              {telnyxData.estimated_missed_revenue_fmt && (
                <div style={{
                  background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.15)",
                  borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                }}>
                  <span style={{ fontSize: 11, color: "#F59E0B", fontWeight: 700 }}>⚠ Est. Missed Revenue:</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: "#F59E0B" }}>{telnyxData.estimated_missed_revenue_fmt}</span>
                  <span style={{ fontSize: 10, color: "#6B7280" }}>{telnyxData.estimated_missed_revenue_note}</span>
                </div>
              )}
              {!telnyxData.has_real_calls && (
                <div style={{ fontSize: 11, color: "#475569", padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
                  No real call traffic yet — monitoring active. Data appears once calls route through the Telnyx number.
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#475569", textAlign: "center", padding: 24 }}>Unable to load Telnyx data</div>
          )}
        </DashboardSection>

        {/* ── S7: AI Activity ── */}
        <DashboardSection id="ai-activity" title="AI Activity" defaultExpanded={true}>
          <AiActivityFeed />
        </DashboardSection>

        {/* ── S8: Opportunity Center ── */}
        <DashboardSection id="opportunity-center" title="Opportunity Center" defaultExpanded={true}>
          <OpportunityCenter />
        </DashboardSection>

        {/* ── S9: System Status ── */}
        <DashboardSection id="system-status" title="System Status" defaultExpanded={false}>
          <SystemStatusPanel />
        </DashboardSection>

        {/* ── SEO Content Engine (preserved) ── */}
        <DashboardSection id="content-engine" title="SEO Content Engine"
          defaultExpanded={false}
          right={
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleGenerateKeywords}
                disabled={busy === "keywords"}
                style={{
                  padding: "5px 12px", borderRadius: 7, fontSize: 10, fontWeight: 700, cursor: "pointer",
                  background: "rgba(0,174,239,0.1)", border: "1px solid rgba(0,174,239,0.3)", color: "#00AEEF",
                  opacity: busy === "keywords" ? 0.6 : 1,
                }}
              >
                {busy === "keywords" ? "Generating…" : keywords.length ? "↻ Regenerate" : "⚡ Generate Keywords"}
              </button>
              {keywords.length > 0 && (
                <button
                  onClick={handleGenerateContentPlan}
                  disabled={busy === "plan"}
                  style={{
                    padding: "5px 12px", borderRadius: 7, fontSize: 10, fontWeight: 700, cursor: "pointer",
                    background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", color: "#22C55E",
                    opacity: busy === "plan" ? 0.6 : 1,
                  }}
                >
                  {busy === "plan" ? "Building…" : articles.length ? "↻ Rebuild Plan" : "📅 Build Content Plan"}
                </button>
              )}
            </div>
          }
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 16 }}>
            {[
              { label: "Keywords Targeted", value: keywords.length,       color: "#00AEEF" },
              { label: "Articles Planned",  value: seoTotal,              color: "#3B82F6" },
              { label: "Drafts",            value: seoCounts.draft ?? 0,  color: "#C4B5FD" },
              { label: "Published",         value: seoCounts.published ?? 0, color: "#22C55E" },
            ].map(s => (
              <div key={s.label} style={{
                background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 11, padding: "13px 14px",
              }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: s.color, marginBottom: 3 }}>{s.value}</div>
                <div style={{ fontSize: 10, color: "#64748B", fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {seoLoading && (
            <div style={{ padding: "24px", textAlign: "center", color: "#475569", fontSize: 12 }}>Loading content data…</div>
          )}

          {!seoLoading && keywords.length === 0 && (
            <div style={{
              background: "rgba(0,174,239,0.04)", border: "1px dashed rgba(0,174,239,0.18)",
              borderRadius: 13, padding: "28px", textAlign: "center",
            }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>⚡</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#CBD5E1", marginBottom: 5 }}>No keywords yet</div>
              <div style={{ fontSize: 11, color: "#475569" }}>Click "Generate Keywords" above to create SEO targets for Bed Bugs &amp; Beyond.</div>
            </div>
          )}

          {!seoLoading && keywords.length > 0 && (
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
                    const diffColor = k.difficulty === "Low" ? "#22C55E" : k.difficulty === "Medium" ? "#F59E0B" : "#EF4444";
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
                <div style={{ padding: "9px 16px", borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: 11, color: "#475569" }}>
                  +{keywords.length - 8} more keywords
                </div>
              )}
            </div>
          )}

          {!seoLoading && articles.length > 0 && (
            <div style={{
              background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 13, overflow: "hidden",
            }}>
              <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#22C55E" }}>30-Day Article Calendar</span>
                <span style={{ fontSize: 11, color: "#475569" }}>{seoPublishedPct}% published</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "rgba(255,255,255,0.03)" }}>
                {articles.map(a => {
                  const stMap: Record<string, { color: string; bg: string }> = {
                    published:         { color: "#22C55E", bg: "rgba(34,197,94,0.1)"  },
                    published_error:   { color: "#EF4444", bg: "rgba(239,68,68,0.1)"  },
                    ready_for_website: { color: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
                    scheduled:         { color: "#F59E0B", bg: "rgba(245,158,11,0.08)"},
                    draft:             { color: "#C4B5FD", bg: "rgba(196,181,253,0.08)"},
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
                      <div style={{
                        fontSize: 12, fontWeight: 600, color: "#CBD5E1", lineHeight: 1.3,
                        display: "-webkit-box", WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical" as React.CSSProperties["WebkitBoxOrient"],
                        overflow: "hidden",
                      }}>
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
        </DashboardSection>

      </div>
    </AppShell>
  );
}

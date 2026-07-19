import { useState, useEffect, useCallback, useRef } from "react";
import { useApiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import {
  OPP_PAGE_SIZE,
  BACKLINK_OPPORTUNITY_CATEGORIES,
  BACKLINK_WORKFLOW_STATUSES,
  wfStatusColor,
  oppCategoryLabel,
  attainabilityColor,
  computeBacklinkScore,
  formatRunSummary,
  isPageEnd,
  shortRunId,
  runStatusColor,
  formatRelativeTime,
  scheduleFrequencyLabel,
  scheduledRunStatusConfig,
  buildSparklinePoints,
  formatScoreDelta,
  providerHealthColor,
  type BacklinkOpportunityCategoryFE,
  type BacklinkWorkflowStatusFE,
} from "@/lib/backlink-ui-helpers";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditData {
  id: number; clientId: string; aiSearchScore: number;
  authorityScore: number; reviewScore: number; competitorGapScore: number;
  createdAt: string; actionPlan?: ActionItem[];
}
interface ActionItem { priority: string; task: string; reason: string; impact: string; status: string; }

interface LiveOpportunity {
  opportunity: {
    id: string; clientId: string; prospectId: string; category: string;
    serviceId: string | null; potentialValue: number; attainability: number;
    rationale: string; recommendedAction: string; evidenceIds: string[];
    createdAt: string; updatedAt: string;
  };
  workflow: {
    id: string; status: string; ownerId: string | null; nextAction: string | null;
    dueAt: string | null; outcomeSummary: string | null; version: number;
    createdAt: string; updatedAt: string; completedAt: string | null;
  };
}
interface LiveOpportunitiesResult { items: LiveOpportunity[]; limit: number; offset: number; }

interface IngestionRun {
  id: string; provider_id: string; mode: string; status: string;
  counts_observed?: number | null; counts_accepted?: number | null;
  counts_rejected?: number | null; counts_opportunity_count?: number | null;
  started_at: string; completed_at: string | null; failure_code: string | null;
}

interface OppDetailWorkflow {
  id: string; status: string; owner_id: string | null; next_action: string | null;
  due_at: string | null; outcome_summary: string | null; version: number;
  created_at: string; updated_at: string; completed_at: string | null;
}
interface OppDetailEvidence {
  id: string; prospectId: string; sourceDomain: string; sourceUrl: string;
  targetUrl: string | null; category: string; serviceId: string | null;
  providers: readonly string[]; authority: number; localRelevance: number;
  serviceRelevance: number; freshnessDays: number; discoveredAt: string;
}
interface OppDetailResponse {
  opportunity: LiveOpportunity["opportunity"];
  workflow: OppDetailWorkflow | null;
  evidence: OppDetailEvidence[];
}

// ── C8R-9 types ───────────────────────────────────────────────────────────────

interface DiscoverySchedule {
  id: string; client_id: string; enabled: boolean; frequency: string;
  next_run_at: string | null; last_run_at: string | null; last_success_at: string | null;
  last_run_status: string | null; consecutive_failures: number; max_retries: number;
  created_at: string; updated_at: string;
}

interface ScoreSnapshot {
  client_id: string; snapshot_date: string; authority_score: number;
  backlink_count: number; opportunity_count: number; won_count: number;
  run_id: string | null;
}

interface HistorySummary {
  totalRuns: number; successRuns: number; failedRuns: number;
  providerUnavailableRuns: number; lastSuccessAt: string | null;
  lastRunAt: string | null; lastRunStatus: string | null;
  nextScheduledAt: string | null; consecutiveFailures: number;
  enabled: boolean; frequency: string | null;
  providerHealth?: {
    overallStatus?: string;
    providers?: Array<{ id: string; status: string; label: string }>;
  };
}

interface CitationDir {
  name: string; icon: string; tier: 1 | 2 | 3;
  category: "general" | "home-services" | "pest-control" | "ai-search" | "local";
  status: "listed" | "missing" | "unverified" | "na"; da: number; url?: string;
}

// ── Static data (placeholder) ────────────────────────────────────────────────

const CITATION_DIRS: CitationDir[] = [
  { name: "Google Business Profile", icon: "🌐", tier: 1, category: "general",      status: "listed",     da: 100 },
  { name: "Yelp",                    icon: "⭐", tier: 1, category: "general",      status: "missing",    da: 93  },
  { name: "Better Business Bureau",  icon: "🏛️", tier: 1, category: "general",      status: "missing",    da: 91  },
  { name: "Angi",                    icon: "🔧", tier: 1, category: "home-services", status: "missing",    da: 90  },
  { name: "HomeAdvisor",             icon: "🏠", tier: 1, category: "home-services", status: "missing",    da: 88  },
  { name: "Facebook Business",       icon: "📘", tier: 1, category: "general",      status: "listed",     da: 96  },
  { name: "Bing Places",             icon: "🔍", tier: 2, category: "general",      status: "listed",     da: 94  },
  { name: "Apple Business Connect",  icon: "🍎", tier: 2, category: "general",      status: "unverified", da: 100 },
  { name: "Thumbtack",               icon: "📌", tier: 2, category: "home-services", status: "missing",    da: 75  },
  { name: "Nextdoor Business",       icon: "🏘️", tier: 2, category: "local",        status: "missing",    da: 74  },
  { name: "Houzz",                   icon: "🛋️", tier: 2, category: "home-services", status: "missing",    da: 79  },
  { name: "Porch",                   icon: "🪴", tier: 2, category: "home-services", status: "missing",    da: 68  },
  { name: "Foursquare",              icon: "📍", tier: 2, category: "local",        status: "missing",    da: 87  },
  { name: "MapQuest",                icon: "🗺️", tier: 2, category: "local",        status: "missing",    da: 71  },
  { name: "Alignable",               icon: "🤝", tier: 2, category: "local",        status: "missing",    da: 62  },
  { name: "ChatGPT / Bing",          icon: "🤖", tier: 1, category: "ai-search",    status: "missing",    da: 98  },
  { name: "Perplexity",              icon: "🧠", tier: 1, category: "ai-search",    status: "missing",    da: 85  },
  { name: "Google AI Mode",          icon: "✨", tier: 1, category: "ai-search",    status: "missing",    da: 100 },
  { name: "Siri / Apple Maps",       icon: "🍎", tier: 2, category: "ai-search",    status: "unverified", da: 100 },
  { name: "Alexa Business",          icon: "🔊", tier: 3, category: "ai-search",    status: "missing",    da: 84  },
  { name: "NPMA Directory",          icon: "🐛", tier: 2, category: "pest-control", status: "missing",    da: 55  },
  { name: "PestWorld.org",           icon: "🌿", tier: 2, category: "pest-control", status: "missing",    da: 52  },
  { name: "PCT Proquota",            icon: "📊", tier: 3, category: "pest-control", status: "missing",    da: 48  },
  { name: "Pest Control World",      icon: "🦟", tier: 3, category: "pest-control", status: "missing",    da: 44  },
];

const CITATION_STATUS_CFG = {
  listed:     { color: "#22C55E", label: "Listed",     dot: "●" },
  missing:    { color: "#EF4444", label: "Missing",    dot: "✕" },
  unverified: { color: "#F59E0B", label: "Unverified", dot: "⚠" },
  na:         { color: "#64748B", label: "N/A",        dot: "○" },
};

const TIER_LABELS = { 1: "Tier 1 — Critical", 2: "Tier 2 — High Value", 3: "Tier 3 — Supplemental" };
const TIER_COLORS = { 1: "#EF4444", 2: "#F59E0B", 3: "#64748B" };

const SCHEMA_ITEMS = [
  { type: "LocalBusiness",               status: "missing", impact: "Critical" },
  { type: "Service (Bed Bug Treatment)", status: "missing", impact: "High"     },
  { type: "FAQPage",                     status: "missing", impact: "High"     },
  { type: "Review / AggregateRating",    status: "missing", impact: "High"     },
  { type: "BreadcrumbList",              status: "missing", impact: "Medium"   },
  { type: "Organization",               status: "missing", impact: "Medium"   },
];

const NAP_CHECKS = [
  { platform: "Google Business Profile", name: "✓", address: "✓", phone: "✓", status: "consistent" as const },
  { platform: "Facebook Business",       name: "✓", address: "✓", phone: "✓", status: "consistent" as const },
  { platform: "Bing Places",             name: "✓", address: "?", phone: "✓", status: "partial"    as const },
  { platform: "Yelp (not claimed)",      name: "—", address: "—", phone: "—", status: "missing"    as const },
  { platform: "Apple Maps",              name: "✓", address: "?", phone: "?", status: "partial"    as const },
  { platform: "BBB.org",                 name: "—", address: "—", phone: "—", status: "missing"    as const },
  { platform: "Angi",                    name: "—", address: "—", phone: "—", status: "missing"    as const },
];

const NAP_STATUS_CFG = {
  consistent: { color: "#22C55E", label: "Consistent" },
  partial:    { color: "#F59E0B", label: "Partial"    },
  missing:    { color: "#EF4444", label: "Missing"    },
};

const CATS = [
  { id: "all",           label: "All"           },
  { id: "general",       label: "General"       },
  { id: "home-services", label: "Home Services"  },
  { id: "ai-search",     label: "AI Search"     },
  { id: "pest-control",  label: "Pest Control"  },
  { id: "local",         label: "Local"         },
];

type Tab = "citations" | "nap" | "backlinks" | "schema" | "actions";

const listed   = CITATION_DIRS.filter(d => d.status === "listed").length;
const missing  = CITATION_DIRS.filter(d => d.status === "missing").length;
const citScore = Math.round((listed / CITATION_DIRS.length) * 100);

// ── Sub-components ────────────────────────────────────────────────────────────

function PlaceholderBanner({ note }: { note: string }) {
  return (
    <div style={{
      background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.22)",
      borderRadius: 8, padding: "10px 14px", marginBottom: 16,
      display: "flex", alignItems: "flex-start", gap: 10,
    }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
      <div>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#F59E0B", letterSpacing: "0.3px" }}>
          PLACEHOLDER DATA —{" "}
        </span>
        <span style={{ fontSize: 11, color: "rgba(203,213,225,0.6)" }}>{note}</span>
      </div>
    </div>
  );
}

function ScoreGauge({ score, color, label, sub }: { score: number; color: string; label: string; sub: string }) {
  const r = 38; const circ = 2 * Math.PI * r; const fill = (score / 100) * circ;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <svg width={100} height={100} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={50} cy={50} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={8} />
        <circle cx={50} cy={50} r={r} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1s ease" }} />
      </svg>
      <div style={{ marginTop: -76, zIndex: 1, textAlign: "center" }}>
        <div style={{ fontSize: 26, fontWeight: 900, color }}>{score}</div>
        <div style={{ fontSize: 10, color: "rgba(148,163,184,0.7)", marginTop: -2 }}>/100</div>
      </div>
      <div style={{ height: 30, textAlign: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F0" }}>{label}</div>
        <div style={{ fontSize: 10, color: "rgba(148,163,184,0.55)", marginTop: 1 }}>{sub}</div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AuthorityEnginePage() {
  const apiFetch = useApiFetch();

  // Core state
  const [audit, setAudit]   = useState<AuditData | null>(null);
  const [tab, setTab]       = useState<Tab>("citations");
  const [catFilter, setCat] = useState<string>("all");
  const [loading, setLoading]       = useState(false);

  // Backlink state
  const [liveOpps, setLiveOpps]               = useState<LiveOpportunitiesResult | null>(null);
  const [liveRuns, setLiveRuns]               = useState<IngestionRun[]>([]);
  const [backlinksLoading, setBacklinksLoading] = useState(false);
  const [backlinksError, setBacklinksError]   = useState<string | null>(null);
  const [ingesting, setIngesting]             = useState(false);
  const [ingestError, setIngestError]         = useState<string | null>(null);
  const [ingestSuccess, setIngestSuccess]     = useState(false);

  // Pagination
  const [oppOffset, setOppOffset] = useState(0);

  // Filters
  const [oppCatFilter, setOppCatFilter]       = useState<BacklinkOpportunityCategoryFE>("all");
  const [oppStatusFilter, setOppStatusFilter] = useState<BacklinkWorkflowStatusFE>("all");

  // Detail drawer
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null);
  const [oppDetail, setOppDetail]         = useState<OppDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError]     = useState<string | null>(null);

  // Runs section
  const [showRuns, setShowRuns] = useState(false);

  // C8R-9: schedule + history state
  const [schedule, setSchedule]               = useState<DiscoverySchedule | null>(null);
  const [scoreSnapshots, setScoreSnapshots]   = useState<ScoreSnapshot[]>([]);
  const [historySummary, setHistorySummary]   = useState<HistorySummary | null>(null);
  const [historyLoading, setHistoryLoading]   = useState(false);

  const clientId = new URLSearchParams(window.location.search).get("clientId") ?? "bbb";

  // ── Callbacks ────────────────────────────────────────────────────────────────

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<AuditData>(`/ai-visibility/${clientId}`);
      setAudit(data);
    } catch {
      setAudit(null);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, clientId]);

  const fetchOpportunities = useCallback(async (
    offset: number,
    catF: BacklinkOpportunityCategoryFE,
    statusF: BacklinkWorkflowStatusFE,
  ) => {
    setBacklinksLoading(true);
    setBacklinksError(null);
    try {
      const params = new URLSearchParams({ limit: String(OPP_PAGE_SIZE), offset: String(offset) });
      if (catF !== "all")    params.set("category",       catF);
      if (statusF !== "all") params.set("workflowStatus", statusF);
      const opps = await apiFetch<LiveOpportunitiesResult>(`/backlinks/opportunities?${params}`);
      setLiveOpps(opps);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load opportunities";
      setBacklinksError(msg);
      setLiveOpps(null);
    } finally {
      setBacklinksLoading(false);
    }
  }, [apiFetch]);

  const fetchRuns = useCallback(async () => {
    try {
      const data = await apiFetch<{ runs: IngestionRun[] }>("/backlinks/runs?limit=20");
      setLiveRuns(data.runs ?? []);
    } catch { /* silent — runs section shows empty */ }
  }, [apiFetch]);

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailError(null);
    setOppDetail(null);
    try {
      const data = await apiFetch<OppDetailResponse>(`/backlinks/opportunities/${id}`);
      setOppDetail(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load opportunity details";
      setDetailError(msg);
    } finally {
      setDetailLoading(false);
    }
  }, [apiFetch]);

  const triggerIngest = useCallback(async () => {
    setIngesting(true);
    setIngestError(null);
    setIngestSuccess(false);
    try {
      await apiFetch<unknown>("/backlinks/ingest/fixture", { method: "POST" });
      setIngestSuccess(true);
      await Promise.all([
        fetchOpportunities(0, oppCatFilter, oppStatusFilter),
        fetchRuns(),
      ]);
      setOppOffset(0);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Ingest failed";
      setIngestError(msg);
    } finally {
      setIngesting(false);
    }
  }, [apiFetch, fetchOpportunities, fetchRuns, oppCatFilter, oppStatusFilter]);

  const fetchScheduleData = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const [schedRes, summaryRes, snapshotsRes] = await Promise.all([
        apiFetch<{ schedule: DiscoverySchedule | null }>("/backlinks/schedule"),
        apiFetch<HistorySummary>("/backlinks/history/summary"),
        apiFetch<{ snapshots: ScoreSnapshot[]; days: number }>("/backlinks/history/score?days=30"),
      ]);
      setSchedule(schedRes.schedule ?? null);
      setHistorySummary(summaryRes);
      setScoreSnapshots(snapshotsRes.snapshots ?? []);
    } catch { /* silent — history widgets show empty */ }
    finally { setHistoryLoading(false); }
  }, [apiFetch]);

  const handleCatFilter = useCallback((v: BacklinkOpportunityCategoryFE) => {
    setOppCatFilter(v); setOppOffset(0);
  }, []);

  const handleStatusFilter = useCallback((v: BacklinkWorkflowStatusFE) => {
    setOppStatusFilter(v); setOppOffset(0);
  }, []);

  const handlePrev = useCallback(() => setOppOffset(o => Math.max(0, o - OPP_PAGE_SIZE)), []);
  const handleNext = useCallback(() => setOppOffset(o => o + OPP_PAGE_SIZE), []);

  const closeDetail = useCallback(() => { setSelectedOppId(null); setOppDetail(null); setDetailError(null); }, []);

  // ── Effects ──────────────────────────────────────────────────────────────────

  const hasMounted = useRef(false);
  useEffect(() => { fetchAudit(); }, [fetchAudit]);
  useEffect(() => {
    fetchOpportunities(oppOffset, oppCatFilter, oppStatusFilter);
  }, [fetchOpportunities, oppOffset, oppCatFilter, oppStatusFilter]);
  useEffect(() => { fetchRuns(); }, [fetchRuns]);
  useEffect(() => { if (selectedOppId) fetchDetail(selectedOppId); }, [selectedOppId, fetchDetail]);
  useEffect(() => { hasMounted.current = true; }, []);
  // Load schedule + history whenever the backlinks tab becomes active
  useEffect(() => { if (tab === "backlinks") fetchScheduleData(); }, [tab, fetchScheduleData]);

  // ── Computed values ──────────────────────────────────────────────────────────

  const authorityScore = audit?.authorityScore ?? 29;
  const napScore       = 71;  // placeholder — no NAP backend yet
  const liveItems      = liveOpps?.items ?? [];
  const backlinkScore  = computeBacklinkScore(liveItems);
  const schemaScore    = 0;   // placeholder — no schema backend yet
  const overallAuth    = Math.round((authorityScore + napScore + backlinkScore + schemaScore) / 4);

  const statusColor = (s: number) => s >= 70 ? "#22C55E" : s >= 40 ? "#F59E0B" : "#EF4444";

  const filteredDirs = catFilter === "all" ? CITATION_DIRS : CITATION_DIRS.filter(d => d.category === catFilter);

  const isFirstPage  = oppOffset === 0;
  const isLastPage   = isPageEnd(liveItems.length, OPP_PAGE_SIZE);
  const currentPage  = Math.floor(oppOffset / OPP_PAGE_SIZE) + 1;
  const startItem    = liveItems.length === 0 ? 0 : oppOffset + 1;
  const endItem      = oppOffset + liveItems.length;

  const wonCount      = liveItems.filter(o => o.workflow.status === "won").length;
  const pursuingCount = liveItems.filter(o => o.workflow.status === "pursuing" || o.workflow.status === "approved").length;

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "citations", label: "Citation Network", icon: "📋" },
    { id: "nap",       label: "NAP Consistency",  icon: "📍" },
    { id: "backlinks", label: "Backlink Profile",  icon: "🔗" },
    { id: "schema",    label: "Structured Data",   icon: "🧩" },
    { id: "actions",   label: "Action Plan",       icon: "⚡" },
  ];

  // ── Chip helper ──────────────────────────────────────────────────────────────

  function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
      <button onClick={onClick} style={{
        padding: "4px 11px", borderRadius: 20, fontSize: 10, fontWeight: 600,
        cursor: "pointer",
        background: active ? "rgba(56,189,248,0.15)" : "rgba(255,255,255,0.04)",
        border: active ? "1px solid rgba(56,189,248,0.35)" : "1px solid rgba(255,255,255,0.08)",
        color: active ? "#38BDF8" : "rgba(148,163,184,0.65)",
      }}>{children}</button>
    );
  }

  // ── Detail Drawer ────────────────────────────────────────────────────────────

  const DetailDrawer = selectedOppId ? (
    <>
      <div
        onClick={closeDetail}
        style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.45)", zIndex: 999,
        }}
      />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: "min(520px, 100vw)",
        background: "#090E1B",
        borderLeft: "1px solid rgba(56,189,248,0.2)",
        zIndex: 1000, overflowY: "auto",
        boxShadow: "-12px 0 48px rgba(0,0,0,0.7)",
      }}>
        {/* Drawer header */}
        <div style={{
          position: "sticky", top: 0, background: "#090E1B",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
          zIndex: 1,
        }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.7px", color: "#38BDF8",
              background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.2)",
              borderRadius: 5, padding: "2px 8px", display: "inline-block", marginBottom: 4 }}>
              OPPORTUNITY DETAIL
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9" }}>
              {oppDetail ? oppCategoryLabel(oppDetail.opportunity.category) : "Loading…"}
            </div>
          </div>
          <button onClick={closeDetail} style={{
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 7, color: "#94A3B8", fontSize: 14, cursor: "pointer",
            width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>

        <div style={{ padding: "20px" }}>
          {detailLoading && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#475569", fontSize: 12 }}>
              Loading opportunity details…
            </div>
          )}
          {detailError && !detailLoading && (
            <div style={{
              background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 8, padding: "14px", color: "#FCA5A5", fontSize: 12,
            }}>⚠ {detailError}</div>
          )}
          {oppDetail && !detailLoading && (() => {
            const opp = oppDetail.opportunity;
            const wf  = oppDetail.workflow;
            return (
              <div>
                {/* Scores */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                  {[
                    { label: "Attainability", value: opp.attainability, color: attainabilityColor(opp.attainability) },
                    { label: "Potential Value", value: opp.potentialValue, color: opp.potentialValue >= 70 ? "#22C55E" : opp.potentialValue >= 40 ? "#F59E0B" : "#94A3B8" },
                  ].map(s => (
                    <div key={s.label} style={{
                      background: "rgba(11,22,41,0.9)", border: `1px solid ${s.color}25`,
                      borderRadius: 10, padding: "14px", textAlign: "center",
                    }}>
                      <div style={{ fontSize: 28, fontWeight: 900, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: "#64748B", marginTop: 3 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Workflow status */}
                {wf && (
                  <div style={{
                    background: "rgba(11,22,41,0.8)", border: `1px solid ${wfStatusColor(wf.status)}25`,
                    borderRadius: 10, padding: "12px 14px", marginBottom: 14,
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                      color: wfStatusColor(wf.status),
                      background: `${wfStatusColor(wf.status)}18`,
                      border: `1px solid ${wfStatusColor(wf.status)}30`,
                    }}>{wf.status.toUpperCase()}</span>
                    <div style={{ fontSize: 11, color: "#64748B" }}>v{wf.version}</div>
                    {wf.next_action && (
                      <div style={{ fontSize: 11, color: "#94A3B8", flex: 1 }}>
                        Next: {wf.next_action}
                      </div>
                    )}
                    {wf.due_at && (
                      <div style={{ fontSize: 10, color: "#F59E0B" }}>
                        Due {new Date(wf.due_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                )}
                {wf?.outcome_summary && (
                  <div style={{
                    background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.15)",
                    borderRadius: 8, padding: "10px 14px", marginBottom: 14,
                    fontSize: 11, color: "#86EFAC",
                  }}>
                    <span style={{ fontWeight: 700 }}>Outcome: </span>{wf.outcome_summary}
                  </div>
                )}

                {/* Rationale */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", letterSpacing: "0.5px",
                    textTransform: "uppercase", marginBottom: 6 }}>Rationale</div>
                  <div style={{ fontSize: 12, color: "#CBD5E1", lineHeight: 1.6,
                    background: "rgba(11,22,41,0.6)", borderRadius: 8, padding: "12px 14px",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}>{opp.rationale || "—"}</div>
                </div>

                {/* Recommended action */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", letterSpacing: "0.5px",
                    textTransform: "uppercase", marginBottom: 6 }}>Recommended Action</div>
                  <div style={{
                    fontSize: 12, color: "#93C5FD", lineHeight: 1.6,
                    background: "rgba(56,189,248,0.05)", borderRadius: 8, padding: "12px 14px",
                    border: "1px solid rgba(56,189,248,0.15)",
                  }}>{opp.recommendedAction || "—"}</div>
                </div>

                {/* Service ID */}
                {opp.serviceId && (
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16,
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 6, padding: "5px 10px",
                  }}>
                    <span style={{ fontSize: 10, color: "#64748B" }}>Service:</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#94A3B8" }}>
                      {opp.serviceId.replace(/_/g, " ")}
                    </span>
                  </div>
                )}

                {/* Evidence */}
                <div>
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: "#64748B", letterSpacing: "0.5px",
                    textTransform: "uppercase", marginBottom: 8,
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    Evidence
                    <span style={{
                      fontSize: 9, background: "rgba(56,189,248,0.1)", color: "#38BDF8",
                      borderRadius: 20, padding: "1px 8px", border: "1px solid rgba(56,189,248,0.2)",
                    }}>{oppDetail.evidence.length}</span>
                  </div>

                  {oppDetail.evidence.length === 0 ? (
                    <div style={{ fontSize: 11, color: "#475569", padding: "12px 0" }}>
                      No evidence records found for this opportunity.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {oppDetail.evidence.map((ev) => (
                        <div key={ev.id} style={{
                          background: "rgba(11,22,41,0.8)", border: "1px solid rgba(255,255,255,0.07)",
                          borderRadius: 9, padding: "12px 14px",
                        }}>
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#CBD5E1",
                                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {ev.sourceDomain}
                              </div>
                              {ev.sourceUrl && (
                                <div style={{ fontSize: 9.5, color: "#475569", marginTop: 1,
                                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {ev.sourceUrl}
                                </div>
                              )}
                            </div>
                            <span style={{
                              fontSize: 9, fontWeight: 700, flexShrink: 0,
                              background: "rgba(56,189,248,0.08)",
                              border: "1px solid rgba(56,189,248,0.2)",
                              borderRadius: 5, padding: "2px 7px", color: "#38BDF8",
                            }}>{ev.category.replace(/_/g, " ")}</span>
                          </div>
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                            {[
                              { label: "Authority",   value: ev.authority        },
                              { label: "Local Rel.",  value: ev.localRelevance   },
                              { label: "Svc Rel.",    value: ev.serviceRelevance },
                              { label: "Freshness",   value: ev.freshnessDays, suffix: "d" },
                            ].map(m => (
                              <div key={m.label} style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 13, fontWeight: 800,
                                  color: attainabilityColor(m.value) }}>
                                  {m.value}{m.suffix ?? ""}
                                </div>
                                <div style={{ fontSize: 9, color: "#475569" }}>{m.label}</div>
                              </div>
                            ))}
                          </div>
                          {ev.providers?.length > 0 && (
                            <div style={{ marginTop: 6, fontSize: 9, color: "#475569" }}>
                              via {ev.providers.join(", ")}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Metadata footer */}
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)",
                  fontSize: 9.5, color: "#475569" }}>
                  ID: {opp.id} · Created {new Date(opp.createdAt).toLocaleDateString()}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </>
  ) : null;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      {DetailDrawer}
      <div style={{ minHeight: "100vh", background: "#030612", padding: "28px 24px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: "0.8px",
                  color: "#38BDF8", background: "rgba(56,189,248,0.1)",
                  border: "1px solid rgba(56,189,248,0.25)", borderRadius: 5, padding: "2px 8px",
                }}>AUTHORITY ENGINE</span>
              </div>
              <h1 style={{ fontSize: 26, fontWeight: 900, color: "#F1F5F9", margin: 0, lineHeight: 1.15 }}>
                Edge Authority
              </h1>
              <p style={{ fontSize: 13, color: "#94A3B8", margin: "3px 0 0", fontWeight: 500 }}>
                Domain Authority &amp; Citation Builder
              </p>
              <p style={{ fontSize: 13, color: "#64748B", margin: "5px 0 0" }}>
                Bed Bugs &amp; Beyond · Las Vegas, NV · Pest Control
              </p>
            </div>
            <button onClick={fetchAudit} disabled={loading} style={{
              padding: "9px 18px", borderRadius: 9, fontSize: 12, fontWeight: 700,
              cursor: loading ? "default" : "pointer",
              background: loading ? "rgba(56,189,248,0.05)" : "rgba(56,189,248,0.1)",
              border: "1px solid rgba(56,189,248,0.3)", color: "#38BDF8", letterSpacing: "0.3px",
            }}>
              {loading ? "Refreshing…" : "↻ Refresh Scores"}
            </button>
          </div>

          {/* Score Overview */}
          <div style={{
            background: "linear-gradient(135deg, rgba(6,20,32,0.95), rgba(3,6,18,0.9))",
            border: "1px solid rgba(56,189,248,0.18)", borderRadius: 16, padding: "24px 28px",
            marginBottom: 24,
            boxShadow: "0 0 40px rgba(56,189,248,0.07), 0 4px 24px rgba(0,0,0,0.5)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              flexWrap: "wrap", gap: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <div style={{
                  width: 88, height: 88, borderRadius: "50%",
                  background: `conic-gradient(${statusColor(overallAuth)} ${overallAuth * 3.6}deg, rgba(255,255,255,0.04) 0deg)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: `0 0 24px ${statusColor(overallAuth)}30`,
                }}>
                  <div style={{
                    width: 68, height: 68, borderRadius: "50%", background: "#030612",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: 24, fontWeight: 900, color: statusColor(overallAuth), lineHeight: 1 }}>{overallAuth}</span>
                    <span style={{ fontSize: 9, color: "rgba(148,163,184,0.6)" }}>/100</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#F1F5F9" }}>Overall Authority Score</div>
                  <div style={{ fontSize: 12, color: "#64748B", marginTop: 3 }}>
                    Needs significant improvement · {missing} citation gaps identified
                  </div>
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    marginTop: 7, padding: "3px 10px", borderRadius: 20,
                    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#EF4444", display: "inline-block" }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#EF4444" }}>Below Competitor Average</span>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 28, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <ScoreGauge score={citScore}      color={statusColor(citScore)}      label="Citations"
                  sub={`${listed}/${CITATION_DIRS.length} listed`} />
                <ScoreGauge score={napScore}      color={statusColor(napScore)}      label="NAP Consistency"
                  sub="4 of 7 verified" />
                <ScoreGauge score={backlinkScore} color={statusColor(backlinkScore)} label="Backlinks"
                  sub={liveItems.length === 0 ? "No data yet" : `${wonCount + pursuingCount} active · ${liveItems.length} opps`} />
                <ScoreGauge score={schemaScore}   color="#EF4444"                    label="Schema.org"
                  sub="Not configured" />
              </div>
            </div>
          </div>

          {/* Alert banner */}
          <div style={{
            background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 10, padding: "11px 16px", marginBottom: 22,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <div style={{ fontSize: 12, color: "#FCA5A5" }}>
              <strong>Citation gap detected:</strong> Competitors average 30+ citations. Bed Bugs &amp; Beyond has{" "}
              <strong>{listed}</strong> active citations. Closing this gap is the single highest-impact action for
              ranking in Google Maps and AI search results.
            </div>
          </div>

          {/* Tab bar */}
          <div style={{
            display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap",
            background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 4,
            border: "1px solid rgba(255,255,255,0.06)",
          }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                flex: "1 1 auto", padding: "9px 14px", borderRadius: 7,
                fontSize: 11, fontWeight: tab === t.id ? 700 : 500, cursor: "pointer",
                background: tab === t.id ? "rgba(56,189,248,0.12)" : "transparent",
                border: tab === t.id ? "1px solid rgba(56,189,248,0.3)" : "1px solid transparent",
                color: tab === t.id ? "#38BDF8" : "rgba(148,163,184,0.7)",
                transition: "all 0.15s", whiteSpace: "nowrap",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                <span>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>

          {/* ── Tab: Citations ── */}
          {tab === "citations" && (
            <div>
              <PlaceholderBanner note="Citations are manually curated reference data. No live citation-scanning backend exists yet. This list will be replaced with real audit data when the citation-scan engine is built." />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 18 }}>
                {[
                  { label: "Listed",        value: listed,  color: "#22C55E" },
                  { label: "Missing",       value: missing, color: "#EF4444" },
                  { label: "Unverified",    value: CITATION_DIRS.filter(d => d.status === "unverified").length, color: "#F59E0B" },
                  { label: "Citation Score", value: `${citScore}%`, color: statusColor(citScore) },
                ].map(s => (
                  <div key={s.label} style={{
                    background: "rgba(11,22,41,0.8)", border: `1px solid ${s.color}20`,
                    borderLeft: `3px solid ${s.color}`, borderRadius: 10, padding: "12px 16px",
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: "rgba(148,163,184,0.6)", marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                {CATS.map(c => (
                  <Chip key={c.id} active={catFilter === c.id} onClick={() => setCat(c.id)}>{c.label}</Chip>
                ))}
              </div>
              {([1, 2, 3] as const).map(tier => {
                const dirs = filteredDirs.filter(d => d.tier === tier);
                if (!dirs.length) return null;
                return (
                  <div key={tier} style={{ marginBottom: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <div style={{ height: 1, flex: 1, background: `linear-gradient(90deg, ${TIER_COLORS[tier]}40, transparent)` }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: TIER_COLORS[tier], letterSpacing: "0.6px", textTransform: "uppercase" }}>
                        {TIER_LABELS[tier]}
                      </span>
                      <div style={{ height: 1, flex: 1, background: `linear-gradient(90deg, transparent, ${TIER_COLORS[tier]}40)` }} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
                      {dirs.map(d => {
                        const sc = CITATION_STATUS_CFG[d.status];
                        return (
                          <div key={d.name} style={{
                            background: "rgba(11,22,41,0.75)", border: `1px solid ${sc.color}20`,
                            borderLeft: `3px solid ${sc.color}`, borderRadius: 9, padding: "11px 14px",
                            display: "flex", alignItems: "center", gap: 10,
                          }}>
                            <span style={{ fontSize: 18, flexShrink: 0 }}>{d.icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 700,
                                color: d.status === "listed" ? "#E2E8F0" : "rgba(148,163,184,0.75)",
                                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</div>
                              <div style={{ fontSize: 9.5, color: "rgba(100,116,139,0.8)", marginTop: 1 }}>
                                DA {d.da} · {d.category}
                              </div>
                            </div>
                            <span style={{
                              fontSize: 9, fontWeight: 700, color: sc.color,
                              background: `${sc.color}14`, border: `1px solid ${sc.color}28`,
                              borderRadius: 20, padding: "2px 7px", flexShrink: 0,
                              display: "flex", alignItems: "center", gap: 3,
                            }}>{sc.dot} {sc.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Tab: NAP ── */}
          {tab === "nap" && (
            <div>
              <PlaceholderBanner note="NAP consistency data is hardcoded. No live NAP-scanning backend exists yet. Scores and statuses here are estimates, not live-verified data." />
              <div style={{
                background: "rgba(11,22,41,0.8)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 14, overflow: "hidden", marginBottom: 18,
              }}>
                <div style={{
                  padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)",
                  background: "rgba(255,255,255,0.02)",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>NAP Audit — Bed Bugs &amp; Beyond</div>
                  <div style={{ fontSize: 11, color: "#F59E0B", fontWeight: 600 }}>Score: 71/100</div>
                </div>
                <div style={{ padding: "8px 0" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 80px 110px",
                    gap: 0, padding: "6px 18px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    {["Platform", "Name", "Address", "Phone", "Status"].map(h => (
                      <div key={h} style={{ fontSize: 9, fontWeight: 700, color: "rgba(100,116,139,0.8)",
                        letterSpacing: "0.5px", textTransform: "uppercase" }}>{h}</div>
                    ))}
                  </div>
                  {NAP_CHECKS.map((row, i) => {
                    const sc = NAP_STATUS_CFG[row.status];
                    return (
                      <div key={row.platform} style={{
                        display: "grid", gridTemplateColumns: "1fr 80px 80px 80px 110px",
                        gap: 0, padding: "11px 18px",
                        background: i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
                        borderBottom: "1px solid rgba(255,255,255,0.03)", alignItems: "center",
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#CBD5E1" }}>{row.platform}</div>
                        {[row.name, row.address, row.phone].map((v, j) => (
                          <div key={j} style={{ fontSize: 14,
                            color: v === "✓" ? "#22C55E" : v === "?" ? "#F59E0B" : v === "—" ? "#475569" : "#E2E8F0" }}>{v}</div>
                        ))}
                        <div>
                          <span style={{ fontSize: 9, fontWeight: 700, color: sc.color,
                            background: `${sc.color}14`, border: `1px solid ${sc.color}28`,
                            borderRadius: 20, padding: "2px 8px" }}>{sc.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{
                background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.2)",
                borderRadius: 10, padding: "13px 16px",
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#F59E0B", marginBottom: 6 }}>Why NAP Consistency Matters</div>
                <div style={{ fontSize: 12, color: "rgba(203,213,225,0.7)", lineHeight: 1.6 }}>
                  Google cross-references your business name, address, and phone number across the web.
                  Inconsistencies reduce your Google Maps ranking and make it harder for AI search tools
                  like ChatGPT and Perplexity to surface your business.
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: Backlinks ── */}
          {tab === "backlinks" && (
            <div>
              {/* ── C8R-9: Discovery Status card ── */}
              {(() => {
                const sched   = schedule;
                const summary = historySummary;
                const ph      = summary?.providerHealth;
                const phColor = providerHealthColor(ph?.overallStatus);
                const lastRunCfg = scheduledRunStatusConfig(sched?.last_run_status ?? summary?.lastRunStatus);
                const nextAt  = sched?.next_run_at ?? summary?.nextScheduledAt;
                const lastOk  = sched?.last_success_at ?? summary?.lastSuccessAt;
                const failures = sched?.consecutive_failures ?? summary?.consecutiveFailures ?? 0;
                const freq    = sched?.frequency ?? summary?.frequency;
                const enabled = sched?.enabled ?? summary?.enabled ?? false;
                return (
                  <div style={{
                    background: "rgba(11,22,41,0.8)", border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12, padding: "14px 18px", marginBottom: 16,
                  }}>
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      marginBottom: 12, flexWrap: "wrap", gap: 8,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 14 }}>🗓️</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F0" }}>Scheduled Discovery</span>
                        <span style={{
                          fontSize: 9, fontWeight: 700,
                          color: enabled ? "#22C55E" : "#475569",
                          background: enabled ? "rgba(34,197,94,0.10)" : "rgba(71,85,105,0.15)",
                          border: `1px solid ${enabled ? "rgba(34,197,94,0.25)" : "rgba(71,85,105,0.25)"}`,
                          borderRadius: 20, padding: "2px 8px",
                        }}>{enabled ? "● Enabled" : "○ Disabled"}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {/* Provider health badge */}
                        {ph && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, color: phColor,
                            background: `${phColor}12`, border: `1px solid ${phColor}28`,
                            borderRadius: 20, padding: "2px 8px",
                          }}>
                            {ph.overallStatus === "ready" ? "✓" : ph.overallStatus === "degraded" ? "⚠" : "○"}{" "}
                            {ph.overallStatus ?? "checking"}
                          </span>
                        )}
                        {freq && (
                          <span style={{
                            fontSize: 9, fontWeight: 600, color: "#94A3B8",
                            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: 20, padding: "2px 8px",
                          }}>{scheduleFrequencyLabel(freq)}</span>
                        )}
                        {historyLoading && (
                          <span style={{ fontSize: 9, color: "#475569" }}>⟳ loading…</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                      {[
                        {
                          label: "Last Successful Run",
                          value: formatRelativeTime(lastOk),
                          sub:   lastOk ? new Date(lastOk).toLocaleDateString() : null,
                          color: lastOk ? "#22C55E" : "#475569",
                        },
                        {
                          label: "Next Scheduled",
                          value: nextAt && enabled ? formatRelativeTime(new Date(nextAt).getTime() - Date.now() < 0 ? nextAt : nextAt) : "Not scheduled",
                          sub:   nextAt && enabled ? new Date(nextAt).toLocaleDateString() : null,
                          color: nextAt && enabled ? "#38BDF8" : "#475569",
                        },
                        {
                          label: "Last Run Status",
                          value: lastRunCfg.label,
                          sub:   null,
                          color: lastRunCfg.color,
                          icon:  lastRunCfg.icon,
                        },
                        {
                          label: "Consecutive Failures",
                          value: String(failures),
                          sub:   failures > 0 ? `max: ${sched?.max_retries ?? summary?.consecutiveFailures ?? 3}` : null,
                          color: failures === 0 ? "#22C55E" : failures >= 2 ? "#EF4444" : "#F59E0B",
                        },
                      ].map(item => (
                        <div key={item.label} style={{
                          background: "rgba(255,255,255,0.02)", borderRadius: 8,
                          padding: "10px 12px", border: "1px solid rgba(255,255,255,0.05)",
                        }}>
                          <div style={{ fontSize: 9, color: "#475569", fontWeight: 700,
                            textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
                            {item.label}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: item.color }}>
                            {"icon" in item && item.icon ? `${item.icon} ` : ""}{item.value}
                          </div>
                          {item.sub && (
                            <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>{item.sub}</div>
                          )}
                        </div>
                      ))}
                    </div>
                    {/* Provider list */}
                    {ph?.providers && ph.providers.length > 0 && (
                      <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {ph.providers.map((p: { id: string; status: string; label: string }) => (
                          <span key={p.id} style={{
                            fontSize: 9, fontWeight: 600,
                            color:      p.status === "configured" ? "#22C55E" : p.status === "fixture" ? "#F59E0B" : "#475569",
                            background: p.status === "configured" ? "rgba(34,197,94,0.08)" : p.status === "fixture" ? "rgba(245,158,11,0.08)" : "rgba(71,85,105,0.08)",
                            border:     `1px solid ${p.status === "configured" ? "rgba(34,197,94,0.2)" : p.status === "fixture" ? "rgba(245,158,11,0.2)" : "rgba(71,85,105,0.2)"}`,
                            borderRadius: 20, padding: "2px 8px",
                          }}>
                            {p.label} · {p.status}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Stats row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 18 }}>
                {[
                  { label: "Opportunities",         value: liveItems.length,            color: "#22C55E" },
                  { label: "Won / Pursuing",         value: wonCount + pursuingCount,    color: "#38BDF8" },
                  { label: "Target (competitive)",   value: "20+",                       color: "#F59E0B" },
                  { label: "Opportunity Score",      value: `${backlinkScore}/100`,      color: statusColor(backlinkScore) },
                ].map(s => (
                  <div key={s.label} style={{
                    background: "rgba(11,22,41,0.8)", border: `1px solid ${s.color}20`,
                    borderLeft: `3px solid ${s.color}`, borderRadius: 10, padding: "12px 16px",
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: "rgba(148,163,184,0.6)", marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Category filter */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.5px",
                  textTransform: "uppercase", marginBottom: 6 }}>Category</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  <Chip active={oppCatFilter === "all"} onClick={() => handleCatFilter("all")}>All</Chip>
                  {BACKLINK_OPPORTUNITY_CATEGORIES.map(cat => (
                    <Chip key={cat} active={oppCatFilter === cat} onClick={() => handleCatFilter(cat)}>
                      {oppCategoryLabel(cat)}
                    </Chip>
                  ))}
                </div>
              </div>

              {/* Workflow status filter */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.5px",
                  textTransform: "uppercase", marginBottom: 6 }}>Status</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  <Chip active={oppStatusFilter === "all"} onClick={() => handleStatusFilter("all")}>All</Chip>
                  {BACKLINK_WORKFLOW_STATUSES.map(st => (
                    <Chip key={st} active={oppStatusFilter === st} onClick={() => handleStatusFilter(st)}>
                      <span style={{ color: wfStatusColor(st) }}>●</span>{" "}{st}
                    </Chip>
                  ))}
                </div>
              </div>

              {/* Ingest controls — dev / demo only */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: 14, flexWrap: "wrap", gap: 8,
                background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "10px 14px",
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <div>
                  <div style={{ fontSize: 11, color: "#64748B" }}>
                    {backlinksLoading ? "Loading…" : liveRuns.length > 0
                      ? `Last run: ${new Date(liveRuns[0].started_at).toLocaleString()} · ${formatRunSummary(liveRuns[0])}`
                      : "No ingestion runs yet"}
                  </div>
                  {ingestError && (
                    <div style={{ fontSize: 10, color: "#FCA5A5", marginTop: 3 }}>⚠ {ingestError}</div>
                  )}
                  {ingestSuccess && !ingesting && (
                    <div style={{ fontSize: 10, color: "#86EFAC", marginTop: 3 }}>✓ Ingest completed</div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, color: "#F59E0B",
                    background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)",
                    borderRadius: 5, padding: "2px 8px",
                  }}>DEV / DEMO ONLY</span>
                  <button onClick={triggerIngest} disabled={ingesting || backlinksLoading} style={{
                    padding: "7px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                    cursor: ingesting || backlinksLoading ? "default" : "pointer",
                    background: ingesting ? "rgba(56,189,248,0.04)" : "rgba(56,189,248,0.1)",
                    border: "1px solid rgba(56,189,248,0.3)", color: "#38BDF8",
                  }}>{ingesting ? "Running…" : "⟳ Run Fixture Ingest"}</button>
                </div>
              </div>

              {/* Error state */}
              {backlinksError && (
                <div style={{
                  background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)",
                  borderRadius: 10, padding: "14px 16px", marginBottom: 16,
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                }}>
                  <div style={{ fontSize: 12, color: "#FCA5A5" }}>
                    ⚠ Failed to load backlink opportunities: {backlinksError}
                  </div>
                  <button onClick={() => fetchOpportunities(oppOffset, oppCatFilter, oppStatusFilter)} style={{
                    padding: "5px 12px", borderRadius: 7, fontSize: 10, fontWeight: 700,
                    cursor: "pointer", background: "rgba(239,68,68,0.1)",
                    border: "1px solid rgba(239,68,68,0.3)", color: "#FCA5A5", flexShrink: 0,
                  }}>Retry</button>
                </div>
              )}

              {/* Opportunities table */}
              <div style={{
                background: "rgba(11,22,41,0.8)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 14, overflow: "hidden", marginBottom: 12,
              }}>
                <div style={{
                  padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)",
                  background: "rgba(255,255,255,0.02)",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>
                    Backlink Opportunities
                  </div>
                  <div style={{ fontSize: 10, color: "#475569" }}>
                    {liveItems.length > 0 && `Showing ${startItem}–${endItem}`}
                  </div>
                </div>

                {backlinksLoading && (
                  <div style={{ padding: "32px", textAlign: "center" }}>
                    <div style={{ fontSize: 22, marginBottom: 8 }}>⟳</div>
                    <div style={{ fontSize: 12, color: "#475569" }}>Loading opportunities…</div>
                  </div>
                )}

                {!backlinksLoading && !backlinksError && liveItems.length === 0 && (
                  <div style={{ padding: "36px 24px", textAlign: "center" }}>
                    <div style={{ fontSize: 28, marginBottom: 10 }}>🔗</div>
                    <div style={{ fontSize: 14, color: "#64748B", marginBottom: 6 }}>
                      {oppCatFilter !== "all" || oppStatusFilter !== "all"
                        ? "No opportunities match the current filters."
                        : "No backlink opportunities yet."}
                    </div>
                    <div style={{ fontSize: 11, color: "#475569" }}>
                      {oppCatFilter !== "all" || oppStatusFilter !== "all"
                        ? "Try clearing filters to see all opportunities."
                        : "Click \"Run Fixture Ingest\" above to populate demo data from the Baldwin County fixture provider."}
                    </div>
                  </div>
                )}

                {!backlinksLoading && liveItems.length > 0 && (
                  <div>
                    {/* Table header */}
                    <div style={{
                      display: "grid", gridTemplateColumns: "1fr 90px 70px 80px 110px 32px",
                      padding: "7px 18px", borderBottom: "1px solid rgba(255,255,255,0.05)",
                    }}>
                      {["Category / Service", "Domain", "Attain.", "Potential", "Status", ""].map(h => (
                        <div key={h} style={{ fontSize: 9, fontWeight: 700, color: "rgba(100,116,139,0.8)",
                          letterSpacing: "0.5px", textTransform: "uppercase" }}>{h}</div>
                      ))}
                    </div>

                    {liveItems.map((item, i) => {
                      const opp = item.opportunity;
                      const wf  = item.workflow;
                      const wfc = wfStatusColor(wf.status);
                      return (
                        <div
                          key={opp.id}
                          onClick={() => setSelectedOppId(opp.id)}
                          style={{
                            display: "grid", gridTemplateColumns: "1fr 90px 70px 80px 110px 32px",
                            padding: "11px 18px",
                            background: i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
                            borderBottom: "1px solid rgba(255,255,255,0.03)",
                            alignItems: "center", cursor: "pointer",
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = "rgba(56,189,248,0.05)")}
                          onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent")}
                        >
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#CBD5E1" }}>
                              {oppCategoryLabel(opp.category)}
                            </div>
                            {opp.serviceId && (
                              <div style={{ fontSize: 9.5, color: "#475569", marginTop: 1 }}>
                                {opp.serviceId.replace(/_/g, " ")}
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: 9.5, color: "#64748B",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {opp.prospectId.split("-")[0]}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: attainabilityColor(opp.attainability) }}>
                            {opp.attainability}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700,
                            color: opp.potentialValue >= 70 ? "#22C55E" : opp.potentialValue >= 40 ? "#F59E0B" : "#94A3B8" }}>
                            {opp.potentialValue}
                          </div>
                          <div>
                            <span style={{
                              fontSize: 9, fontWeight: 700, color: wfc,
                              background: `${wfc}18`, border: `1px solid ${wfc}30`,
                              borderRadius: 20, padding: "2px 8px",
                            }}>{wf.status}</span>
                          </div>
                          <div style={{ fontSize: 14, color: "#38BDF8", textAlign: "center" }}>›</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pagination */}
              {!backlinksLoading && (liveItems.length > 0 || !isFirstPage) && (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  marginBottom: 20, flexWrap: "wrap", gap: 8,
                }}>
                  <button onClick={handlePrev} disabled={isFirstPage} style={{
                    padding: "6px 14px", borderRadius: 7, fontSize: 11, fontWeight: 600,
                    cursor: isFirstPage ? "default" : "pointer",
                    background: isFirstPage ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: isFirstPage ? "#334155" : "#94A3B8",
                  }}>← Prev</button>
                  <div style={{ fontSize: 11, color: "#475569" }}>
                    Page {currentPage} · {startItem}–{endItem} items
                    {isLastPage && liveItems.length > 0 && " · end of results"}
                  </div>
                  <button onClick={handleNext} disabled={isLastPage} style={{
                    padding: "6px 14px", borderRadius: 7, fontSize: 11, fontWeight: 600,
                    cursor: isLastPage ? "default" : "pointer",
                    background: isLastPage ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: isLastPage ? "#334155" : "#94A3B8",
                  }}>Next →</button>
                </div>
              )}

              {/* ── C8R-9: Historical Authority Trend sparkline ── */}
              {scoreSnapshots.length >= 2 && (() => {
                const scores     = scoreSnapshots.map(s => s.authority_score);
                const counts     = scoreSnapshots.map(s => s.backlink_count);
                const scorePts   = buildSparklinePoints(scores,  220, 36);
                const countPts   = buildSparklinePoints(counts,  220, 36);
                const first      = scoreSnapshots[0]!;
                const last       = scoreSnapshots[scoreSnapshots.length - 1]!;
                const delta      = last.authority_score - first.authority_score;
                const avgScore   = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
                const peakScore  = Math.max(...scores);
                const trendColor = delta > 0 ? "#22C55E" : delta < 0 ? "#EF4444" : "#64748B";
                return (
                  <div style={{
                    background: "rgba(11,22,41,0.8)", border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 12, padding: "14px 18px", marginBottom: 16,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13 }}>📈</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F0" }}>Historical Authority Trend</span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: trendColor,
                          background: `${trendColor}12`, border: `1px solid ${trendColor}25`,
                          borderRadius: 20, padding: "2px 8px",
                        }}>{delta > 0 ? "↑" : delta < 0 ? "↓" : "→"} {formatScoreDelta(delta)}</span>
                      </div>
                      <span style={{ fontSize: 10, color: "#475569" }}>Last 30 days · {scoreSnapshots.length} snapshots</span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {/* Authority score sparkline */}
                      <div>
                        <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, letterSpacing: "0.5px",
                          textTransform: "uppercase", marginBottom: 6 }}>Authority Score</div>
                        <svg width="100%" viewBox={`0 0 220 36`} preserveAspectRatio="none"
                          style={{ display: "block", height: 36 }}>
                          <defs>
                            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%"   stopColor="#38BDF8" stopOpacity="0.3" />
                              <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.0" />
                            </linearGradient>
                          </defs>
                          <polygon
                            points={`0,36 ${scorePts} 220,36`}
                            fill="url(#sparkGrad)"
                          />
                          <polyline
                            points={scorePts}
                            fill="none"
                            stroke="#38BDF8"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                          <span style={{ fontSize: 9, color: "#475569" }}>{first.snapshot_date}</span>
                          <span style={{ fontSize: 9, color: "#475569" }}>{last.snapshot_date}</span>
                        </div>
                        <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
                          {[
                            { label: "Latest",  value: last.authority_score,  color: "#38BDF8" },
                            { label: "Average", value: avgScore,              color: "#94A3B8" },
                            { label: "Peak",    value: peakScore,             color: "#F59E0B" },
                          ].map(m => (
                            <div key={m.label}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: m.color }}>{m.value}</div>
                              <div style={{ fontSize: 9, color: "#475569" }}>{m.label}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Backlink count sparkline */}
                      <div>
                        <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, letterSpacing: "0.5px",
                          textTransform: "uppercase", marginBottom: 6 }}>Backlink Count</div>
                        <svg width="100%" viewBox={`0 0 220 36`} preserveAspectRatio="none"
                          style={{ display: "block", height: 36 }}>
                          <defs>
                            <linearGradient id="countGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%"   stopColor="#22C55E" stopOpacity="0.3" />
                              <stop offset="100%" stopColor="#22C55E" stopOpacity="0.0" />
                            </linearGradient>
                          </defs>
                          <polygon
                            points={`0,36 ${countPts} 220,36`}
                            fill="url(#countGrad)"
                          />
                          <polyline
                            points={countPts}
                            fill="none"
                            stroke="#22C55E"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                          <span style={{ fontSize: 9, color: "#475569" }}>{first.snapshot_date}</span>
                          <span style={{ fontSize: 9, color: "#475569" }}>{last.snapshot_date}</span>
                        </div>
                        <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
                          {[
                            { label: "Latest",   value: last.backlink_count,               color: "#22C55E" },
                            { label: "Δ",        value: `${last.backlink_count - first.backlink_count >= 0 ? "+" : ""}${last.backlink_count - first.backlink_count}`, color: "#94A3B8" },
                            { label: "Opps Won", value: last.won_count,                    color: "#F59E0B" },
                          ].map(m => (
                            <div key={m.label}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: m.color }}>{m.value}</div>
                              <div style={{ fontSize: 9, color: "#475569" }}>{m.label}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Ingestion History */}
              <div style={{ marginTop: 4 }}>
                <button onClick={() => setShowRuns(r => !r)} style={{
                  display: "flex", alignItems: "center", gap: 6, width: "100%",
                  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 9, padding: "10px 16px", cursor: "pointer",
                  fontSize: 12, fontWeight: 600, color: "#94A3B8",
                  justifyContent: "space-between",
                }}>
                  <span>📜 Ingestion History</span>
                  <span style={{ fontSize: 10, color: "#475569" }}>
                    {liveRuns.length} run{liveRuns.length !== 1 ? "s" : ""} · {showRuns ? "▲ Hide" : "▼ Show"}
                  </span>
                </button>

                {showRuns && (
                  <div style={{
                    background: "rgba(11,22,41,0.8)", border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: "0 0 10px 10px", marginTop: -1, overflow: "hidden",
                  }}>
                    {liveRuns.length === 0 ? (
                      <div style={{ padding: "20px", textAlign: "center", fontSize: 11, color: "#475569" }}>
                        No ingestion runs recorded yet.
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 80px 80px 1fr 100px",
                          padding: "7px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                          {["Run ID", "Provider", "Mode", "Status", "Counts", "Started"].map(h => (
                            <div key={h} style={{ fontSize: 9, fontWeight: 700, color: "rgba(100,116,139,0.7)",
                              letterSpacing: "0.4px", textTransform: "uppercase" }}>{h}</div>
                          ))}
                        </div>
                        {liveRuns.map((run, i) => {
                          const rsc = runStatusColor(run.status);
                          return (
                            <div key={run.id} style={{
                              display: "grid", gridTemplateColumns: "80px 1fr 80px 80px 1fr 100px",
                              padding: "10px 16px", alignItems: "center",
                              background: i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
                              borderBottom: "1px solid rgba(255,255,255,0.03)",
                            }}>
                              <div style={{ fontSize: 10, fontFamily: "monospace", color: "#64748B" }}>
                                {shortRunId(run.id)}
                              </div>
                              <div style={{ fontSize: 10, color: "#94A3B8",
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {run.provider_id}
                              </div>
                              <div style={{ fontSize: 9, color: "#64748B" }}>{run.mode}</div>
                              <div>
                                <span style={{
                                  fontSize: 9, fontWeight: 700, color: rsc,
                                  background: `${rsc}14`, border: `1px solid ${rsc}28`,
                                  borderRadius: 20, padding: "2px 7px",
                                }}>{run.status}</span>
                              </div>
                              <div style={{ fontSize: 10, color: "#64748B" }}>
                                {formatRunSummary(run)}
                              </div>
                              <div style={{ fontSize: 9.5, color: "#475569" }}>
                                {new Date(run.started_at).toLocaleString()}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Tab: Schema ── */}
          {tab === "schema" && (
            <div>
              <PlaceholderBanner note="Structured data status is hardcoded. No live schema-detection backend exists yet. These items reflect what should be implemented on the BBB website — not live scan results." />
              <div style={{
                background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: 10, padding: "13px 16px", marginBottom: 18,
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontSize: 20 }}>🧩</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#FCA5A5", marginBottom: 3 }}>
                    No Structured Data Detected — Score: 0/100
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(203,213,225,0.6)", lineHeight: 1.5 }}>
                    Schema.org markup helps Google, ChatGPT, and Perplexity understand your business and surface it in rich results.
                    Adding these schemas directly boosts Google Maps rankings and AI search visibility.
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
                {SCHEMA_ITEMS.map(s => (
                  <div key={s.type} style={{
                    background: "rgba(11,22,41,0.8)", border: "1px solid rgba(239,68,68,0.15)",
                    borderLeft: "3px solid rgba(239,68,68,0.5)", borderRadius: 10, padding: "14px 16px",
                    display: "flex", alignItems: "center", gap: 12,
                  }}>
                    <span style={{ fontSize: 20 }}>✕</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F0" }}>{s.type}</div>
                      <div style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>Not implemented</div>
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 700,
                      color: s.impact === "Critical" ? "#EF4444" : s.impact === "High" ? "#F59E0B" : "#64748B",
                      background: s.impact === "Critical" ? "rgba(239,68,68,0.1)" : s.impact === "High" ? "rgba(245,158,11,0.1)" : "rgba(100,116,139,0.1)",
                      border: `1px solid ${s.impact === "Critical" ? "rgba(239,68,68,0.2)" : s.impact === "High" ? "rgba(245,158,11,0.2)" : "rgba(100,116,139,0.2)"}`,
                      borderRadius: 20, padding: "2px 8px", flexShrink: 0,
                    }}>{s.impact}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 18, background: "rgba(56,189,248,0.05)",
                border: "1px solid rgba(56,189,248,0.15)", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#38BDF8", marginBottom: 6 }}>Quick Win: LocalBusiness Schema</div>
                <div style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(148,163,184,0.8)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
{`<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Bed Bugs & Beyond",
  "description": "Expert bed bug extermination in Las Vegas, NV.",
  "telephone": "+1-702-XXX-XXXX",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Las Vegas",
    "addressRegion": "NV",
    "addressCountry": "US"
  },
  "geo": { "@type": "GeoCoordinates", "latitude": 36.1699, "longitude": -115.1398 },
  "openingHours": "Mo-Su 07:00-21:00",
  "priceRange": "$$",
  "areaServed": "Las Vegas, Henderson, Summerlin, North Las Vegas"
}
</script>`}
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: Actions ── */}
          {tab === "actions" && (
            <div>
              <PlaceholderBanner note="Action plan items are manually curated recommendations. They are not dynamically generated from live audit data. Items will be replaced by AI-generated, priority-ranked actions once live citation, NAP, and schema scanning backends are built." />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
                {[
                  { priority: "critical", icon: "🔴", order: 1,
                    task: "Claim & verify Yelp listing",
                    reason: "Yelp DA 93 · Highest-impact missing citation. Powers AI search results.",
                    impact: "High", time: "30 min",
                    steps: ["Visit biz.yelp.com", "Search for existing listing", "Claim & verify with phone call", "Complete all business fields"] },
                  { priority: "critical", icon: "🔴", order: 2,
                    task: "Submit to Better Business Bureau",
                    reason: "BBB accreditation DA 91. Significantly improves trust signals for AI search.",
                    impact: "High", time: "1 hr",
                    steps: ["Visit bbb.org/apply", "Choose pest control category", "Complete business profile", "Pay accreditation fee"] },
                  { priority: "critical", icon: "🔴", order: 3,
                    task: "Add LocalBusiness Schema to website",
                    reason: "Schema.org structured data is required for ChatGPT and Google AI Mode to surface BBB.",
                    impact: "High", time: "2 hrs",
                    steps: ["Copy schema template (see Structured Data tab)", "Add to website <head>", "Test with Google Rich Results Test", "Submit updated sitemap"] },
                  { priority: "high", icon: "🟡", order: 4,
                    task: "Create Angi & HomeAdvisor profiles",
                    reason: "Home services platforms. DA 88-90 citations widely used by AI search tools.",
                    impact: "Medium", time: "1 hr",
                    steps: ["angi.com/professional → create pro account", "homeadvisor.com → list your business", "Add all services including Heat Treatment"] },
                  { priority: "high", icon: "🟡", order: 5,
                    task: "Verify Apple Business Connect",
                    reason: "Powers Siri and Apple Maps results. Currently unverified — quick win.",
                    impact: "Medium", time: "20 min",
                    steps: ["Visit businessconnect.apple.com", "Claim Bed Bugs & Beyond", "Verify via phone", "Add photos and services"] },
                  { priority: "high", icon: "🟡", order: 6,
                    task: "Join NPMA Directory",
                    reason: "Industry association listing signals expertise to AI platforms. Direct backlink from npmapestworld.org.",
                    impact: "Medium", time: "2 hrs",
                    steps: ["Join NPMA at npmapestworld.org/join", "Create member directory listing", "Add NPMA badge to website"] },
                  { priority: "medium", icon: "⚪", order: 7,
                    task: "List on Thumbtack & Porch",
                    reason: "Home services lead directories. DA 68-75. Increases citation breadth.",
                    impact: "Low", time: "1 hr",
                    steps: ["Create Thumbtack Pro account at thumbtack.com/pro", "Set service area to Las Vegas metro", "List on porch.com/pro"] },
                  { priority: "medium", icon: "⚪", order: 8,
                    task: "Set up Nextdoor Business",
                    reason: "Hyper-local platform. High trust signal for neighborhood-level Google Maps ranking.",
                    impact: "Medium", time: "30 min",
                    steps: ["Visit business.nextdoor.com", "Create Las Vegas service area profile", "Ask customers to recommend on Nextdoor"] },
                ].map(a => (
                  <div key={a.task} style={{
                    background: "rgba(11,22,41,0.8)",
                    border: `1px solid ${a.priority === "critical" ? "rgba(239,68,68,0.2)" : a.priority === "high" ? "rgba(245,158,11,0.2)" : "rgba(100,116,139,0.15)"}`,
                    borderTop: `3px solid ${a.priority === "critical" ? "#EF4444" : a.priority === "high" ? "#F59E0B" : "#475569"}`,
                    borderRadius: 11, padding: "16px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 800, color: "#030612",
                        background: a.priority === "critical" ? "#EF4444" : a.priority === "high" ? "#F59E0B" : "#475569",
                        borderRadius: 20, padding: "2px 8px", flexShrink: 0,
                      }}>#{a.order}</span>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F0", lineHeight: 1.3 }}>{a.task}</div>
                    </div>
                    <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.5, marginBottom: 10 }}>{a.reason}</div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                      <span style={{
                        fontSize: 9, fontWeight: 600, color: "#38BDF8",
                        background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.2)",
                        borderRadius: 5, padding: "2px 8px",
                      }}>⏱ {a.time}</span>
                      <span style={{
                        fontSize: 9, fontWeight: 600,
                        color: a.impact === "High" ? "#22C55E" : a.impact === "Medium" ? "#F59E0B" : "#64748B",
                        background: a.impact === "High" ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)",
                        border: `1px solid ${a.impact === "High" ? "rgba(34,197,94,0.2)" : "rgba(245,158,11,0.2)"}`,
                        borderRadius: 5, padding: "2px 8px",
                      }}>{a.impact} Impact</span>
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(100,116,139,0.9)", lineHeight: 1.7 }}>
                      {a.steps.map((s, i) => (
                        <div key={i} style={{ display: "flex", gap: 6 }}>
                          <span style={{ color: "#38BDF8", flexShrink: 0 }}>{i + 1}.</span>
                          <span>{s}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </AppShell>
  );
}

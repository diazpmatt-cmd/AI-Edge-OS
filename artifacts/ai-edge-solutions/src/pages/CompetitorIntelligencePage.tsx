import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SummaryData {
  hasData: boolean;
  clientId: string;
  reason?: string;
  latestRun?: {
    runId: string; weekLabel: string; status: string;
    signalsReceived: number; signalsAccepted: number;
    clusterCount: number; opportunityCount: number;
    highPriorityCount: number; topOpportunityScore: number;
    runDurationMs: number; createdAt: string; completedAt: string | null;
  };
  competitorGapCount: number;
  highVolumeGapCount: number;
  unresolvableGapCount?: number;
  totalRuns: number;
}

interface GapSignal {
  id: string; keyword: string; rawKeyword: string;
  signalType: string; source: string; intent: string;
  volumeEstimate: number | null; difficultyScore: number | null;
  competitorRank: number | null; competitorName: string | null;
  evidenceStrength: number;
  trendDirection: string; geographicScope: string;
  serviceId: string | null;
  status: "new" | "returning";
}

interface GapsData {
  hasData: boolean; runId?: string; weekLabel?: string;
  gaps: GapSignal[]; count: number;
}

interface Opportunity {
  id: string; title: string; description: string;
  opportunityType: string; targetEngine: string;
  compositeScore: number; priority: string;
  scoreCard: Record<string, unknown>;
  status: string; createdAt: string;
}

interface OpportunitiesData {
  hasData: boolean; runId?: string; weekLabel?: string;
  opportunities: Opportunity[]; count: number;
}

interface HistoryRun {
  runId: string; weekLabel: string; status: string;
  opportunityCount: number; highPriorityCount: number;
  topScore: number; signalsReceived: number;
  clusterCount: number; gapCount: number;
  createdAt: string; completedAt: string | null;
  opportunityCountDelta: number | null;
  topScoreDelta: number | null;
  gapCountDelta: number | null;
}

interface HistoryData {
  history: HistoryRun[]; count: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCENT        = "#8B5CF6";
const ACCENT_DIM    = "rgba(139,92,246,0.15)";
const ACCENT_BORDER = "rgba(139,92,246,0.25)";
const BG_CARD       = "rgba(13,10,42,0.7)";
const BG_PAGE       = "#030612";

const INTENT_COLOR: Record<string, string> = {
  commercial:    "#22C55E",
  transactional: "#34D399",
  informational: "#60A5FA",
  navigational:  "#F59E0B",
  local:         "#A78BFA",
};

const TREND_ICON: Record<string, string> = {
  up:      "↑",
  down:    "↓",
  stable:  "→",
  unknown: "–",
};

const ENGINE_COLOR: Record<string, string> = {
  content:      "#FB923C",
  optimization: "#00AEEF",
  backlink:     "#38BDF8",
  review:       "#EAB308",
  social:       "#F472B6",
};

// ── Small helpers ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent = ACCENT }: {
  label: string; value: string | number; sub?: string; accent?: string;
}) {
  return (
    <div style={{
      background: BG_CARD, border: `1px solid ${accent}25`,
      borderRadius: 12, padding: "16px 20px",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ fontSize: 11, color: "rgba(148,163,184,0.65)", fontWeight: 600, letterSpacing: "0.4px" }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: accent, lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: "rgba(148,163,184,0.45)", marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ emoji, title, sub }: { emoji: string; title: string; sub?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
      <span style={{ fontSize: 20 }}>{emoji}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: ACCENT, letterSpacing: "0.3px" }}>
          {title}
        </div>
        {sub && <div style={{ fontSize: 10, color: "rgba(148,163,184,0.5)", marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

function DeltaBadge({ delta, invert = false }: { delta: number | null | undefined; invert?: boolean }) {
  if (delta == null) return null;
  const isPositive = invert ? delta < 0 : delta > 0;
  const isNeutral  = delta === 0;
  const color  = isNeutral ? "rgba(148,163,184,0.55)" : isPositive ? "#22C55E" : "#EF4444";
  const bgColor = isNeutral ? "rgba(148,163,184,0.08)" : isPositive ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)";
  const border = isNeutral ? "rgba(148,163,184,0.15)" : isPositive ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)";
  const arrow  = isNeutral ? "→" : isPositive ? "↑" : "↓";
  const label  = isNeutral ? "±0" : `${arrow}${Math.abs(delta)}`;
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 8,
      background: bgColor, color, border: `1px solid ${border}`,
      letterSpacing: "0.2px", whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{
      textAlign: "center", padding: "48px 24px",
      background: BG_CARD, borderRadius: 14,
      border: `1px dashed ${ACCENT_BORDER}`,
    }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🕵️</div>
      <div style={{ fontSize: 13, color: "rgba(148,163,184,0.65)", maxWidth: 380, margin: "0 auto" }}>
        {message}
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div style={{ textAlign: "center", padding: "64px 24px" }}>
      <div style={{
        width: 32, height: 32, border: `3px solid ${ACCENT_BORDER}`,
        borderTopColor: ACCENT, borderRadius: "50%",
        animation: "spin 0.8s linear infinite", margin: "0 auto 12px",
      }} />
      <div style={{ fontSize: 11, color: "rgba(148,163,184,0.5)" }}>Loading intelligence data…</div>
    </div>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview",      label: "Overview",        icon: "📊" },
  { id: "gaps",          label: "Keyword Gaps",     icon: "🎯" },
  { id: "opportunities", label: "Opportunities",    icon: "⚡" },
  { id: "history",       label: "Run History",      icon: "📅" },
] as const;

type TabId = typeof TABS[number]["id"];

// ── Keyword Gap table ─────────────────────────────────────────────────────────

function GapsTab({ apiFetch }: { apiFetch: ReturnType<typeof useApiFetch> }) {
  const [filter, setFilter] = useState<"all" | "high_volume" | "local">("all");

  const { data, isLoading } = useQuery<GapsData>({
    queryKey: ["ci-gaps"],
    queryFn:  () => apiFetch("/api/competitor-intelligence/gaps?limit=100"),
  });

  if (isLoading) return <LoadingSpinner />;
  if (!data?.hasData || data.gaps.length === 0) {
    return <EmptyState message="No competitor keyword gaps found yet. Run a Discovery scan to identify keywords your competitors rank for that you're missing." />;
  }

  const displayed = data.gaps.filter(g => {
    if (filter === "high_volume") return (g.volumeEstimate ?? 0) > 100;
    if (filter === "local")       return g.geographicScope === "local";
    return true;
  });

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["all","high_volume","local"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.4px",
            padding: "5px 12px", borderRadius: 20, cursor: "pointer",
            background: filter === f ? ACCENT_DIM : "rgba(255,255,255,0.04)",
            border: `1px solid ${filter === f ? ACCENT_BORDER : "rgba(255,255,255,0.08)"}`,
            color: filter === f ? ACCENT : "rgba(148,163,184,0.65)",
            transition: "all 0.15s",
          }}>
            {f === "all" ? `All (${data.gaps.length})` :
             f === "high_volume" ? `High Volume (${data.gaps.filter(g => (g.volumeEstimate ?? 0) > 100).length})` :
             `Local (${data.gaps.filter(g => g.geographicScope === "local").length})`}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{
        background: BG_CARD, borderRadius: 14,
        border: `1px solid ${ACCENT_BORDER}`,
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "2fr 80px 70px 90px 60px 1fr 65px",
          padding: "10px 16px",
          background: `${ACCENT}0A`,
          borderBottom: `1px solid ${ACCENT_BORDER}`,
          fontSize: 9.5, fontWeight: 800, letterSpacing: "0.6px",
          color: "rgba(148,163,184,0.6)",
        }}>
          <span>KEYWORD</span>
          <span style={{ textAlign: "right" }}>VOLUME</span>
          <span style={{ textAlign: "right" }}>DIFFICULTY</span>
          <span style={{ textAlign: "center" }}>INTENT</span>
          <span style={{ textAlign: "center" }}>TREND</span>
          <span style={{ textAlign: "left", paddingLeft: 8 }}>RANKING COMPETITOR</span>
          <span style={{ textAlign: "center" }}>RANK</span>
        </div>

        {displayed.length === 0 ? (
          <div style={{ padding: "32px 16px", textAlign: "center", color: "rgba(148,163,184,0.4)", fontSize: 12 }}>
            No keywords match this filter.
          </div>
        ) : (
          displayed.map((g, i) => (
            <div key={g.id} style={{
              display: "grid",
              gridTemplateColumns: "2fr 80px 70px 90px 60px 1fr 65px",
              padding: "11px 16px",
              borderBottom: i < displayed.length - 1 ? `1px solid rgba(139,92,246,0.08)` : "none",
              alignItems: "center",
              background: i % 2 === 0 ? "transparent" : "rgba(139,92,246,0.02)",
              transition: "background 0.1s",
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.06)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? "transparent" : "rgba(139,92,246,0.02)"; }}
            >
              {/* Keyword */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: "#E2E8F0" }}>
                    {g.keyword}
                  </span>
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(g.keyword)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Search Google for "${g.keyword}"`}
                    style={{ color: "rgba(148,163,184,0.35)", lineHeight: 1, flexShrink: 0, textDecoration: "none" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = ACCENT; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(148,163,184,0.35)"; }}
                    onClick={e => e.stopPropagation()}
                  >
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M5 2H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M8 1h3v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M5 7L11 1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                  </a>
                  {g.status === "new" ? (
                    <span style={{
                      fontSize: 8, fontWeight: 800, padding: "1px 5px", borderRadius: 6,
                      background: "rgba(34,197,94,0.15)", color: "#22C55E",
                      border: "1px solid rgba(34,197,94,0.3)", letterSpacing: "0.4px",
                      flexShrink: 0,
                    }}>
                      NEW
                    </span>
                  ) : (
                    <span style={{
                      fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 6,
                      background: "rgba(148,163,184,0.08)", color: "rgba(148,163,184,0.5)",
                      border: "1px solid rgba(148,163,184,0.15)", letterSpacing: "0.4px",
                      flexShrink: 0,
                    }}>
                      RETURNING
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 9, color: "rgba(148,163,184,0.4)" }}>
                  {g.source}
                  {g.serviceId && <span style={{ marginLeft: 6, color: `${ACCENT}70` }}>{g.serviceId}</span>}
                </div>
              </div>

              {/* Volume */}
              <div style={{ textAlign: "right" }}>
                {g.volumeEstimate != null ? (
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: g.volumeEstimate > 500 ? "#22C55E" : g.volumeEstimate > 100 ? "#F59E0B" : "rgba(148,163,184,0.6)",
                  }}>
                    {g.volumeEstimate >= 1000 ? `${(g.volumeEstimate / 1000).toFixed(1)}k` : g.volumeEstimate}
                  </span>
                ) : (
                  <span style={{ fontSize: 10, color: "rgba(148,163,184,0.3)" }}>—</span>
                )}
              </div>

              {/* Difficulty */}
              <div style={{ textAlign: "right" }}>
                {g.difficultyScore != null ? (
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    color: g.difficultyScore < 30 ? "#22C55E" : g.difficultyScore < 60 ? "#F59E0B" : "#EF4444",
                  }}>
                    {g.difficultyScore}
                  </span>
                ) : (
                  <span style={{ fontSize: 10, color: "rgba(148,163,184,0.3)" }}>—</span>
                )}
              </div>

              {/* Intent */}
              <div style={{ textAlign: "center" }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 10,
                  background: `${INTENT_COLOR[g.intent] ?? "#64748B"}18`,
                  color: INTENT_COLOR[g.intent] ?? "#64748B",
                  border: `1px solid ${INTENT_COLOR[g.intent] ?? "#64748B"}30`,
                }}>
                  {g.intent}
                </span>
              </div>

              {/* Trend */}
              <div style={{
                textAlign: "center", fontSize: 13,
                color: g.trendDirection === "up" ? "#22C55E" : g.trendDirection === "down" ? "#EF4444" : "rgba(148,163,184,0.5)",
              }}>
                {TREND_ICON[g.trendDirection] ?? "–"}
              </div>

              {/* Ranking competitor name */}
              <div style={{ paddingLeft: 8 }}>
                {g.competitorName ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600,
                      color: "#CBD5E1",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                      title={g.competitorName}
                    >
                      {g.competitorName}
                    </span>
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(g.competitorName)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Search Google for "${g.competitorName}"`}
                      style={{ color: "rgba(148,163,184,0.35)", lineHeight: 1, flexShrink: 0, textDecoration: "none" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = ACCENT; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(148,163,184,0.35)"; }}
                      onClick={e => e.stopPropagation()}
                    >
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M5 2H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M8 1h3v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M5 7L11 1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                    </a>
                  </div>
                ) : (
                  <span style={{
                    fontSize: 9, fontWeight: 600,
                    color: "rgba(245,158,11,0.65)",
                    fontStyle: "italic",
                  }}
                    title="No organic result data was stored for this signal — competitor identity cannot be resolved"
                  >
                    Unknown competitor
                  </span>
                )}
              </div>

              {/* Competitor rank */}
              <div style={{ textAlign: "center" }}>
                {g.competitorRank != null ? (
                  <span style={{
                    fontSize: 11, fontWeight: 800,
                    color: g.competitorRank <= 3 ? "#EF4444" : g.competitorRank <= 10 ? "#F59E0B" : "rgba(148,163,184,0.6)",
                  }}>
                    #{g.competitorRank}
                  </span>
                ) : (
                  <span style={{ fontSize: 10, color: "rgba(148,163,184,0.3)" }}>—</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: 10, color: "rgba(148,163,184,0.35)", textAlign: "right" }}>
        Showing {displayed.length} of {data.gaps.length} keyword gaps · Week {data.weekLabel}
      </div>
    </div>
  );
}

// ── Opportunities tab ─────────────────────────────────────────────────────────

function OpportunitiesTab({ apiFetch }: { apiFetch: ReturnType<typeof useApiFetch> }) {
  const { data, isLoading } = useQuery<OpportunitiesData>({
    queryKey: ["ci-opportunities"],
    queryFn:  () => apiFetch("/api/competitor-intelligence/opportunities?limit=20"),
  });

  if (isLoading) return <LoadingSpinner />;
  if (!data?.hasData || data.opportunities.length === 0) {
    return <EmptyState message="No opportunities scored yet. Complete a Discovery run to surface your highest-impact keyword opportunities." />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {data.opportunities.map((opp, i) => {
        const sc = opp.scoreCard as Record<string, number | Record<string, unknown>>;
        const engineColor = ENGINE_COLOR[opp.targetEngine] ?? ACCENT;
        return (
          <div key={opp.id} style={{
            background: BG_CARD, border: `1px solid ${ACCENT_BORDER}`,
            borderRadius: 12, padding: "14px 16px",
            display: "flex", alignItems: "center", gap: 14,
          }}>
            {/* Rank badge */}
            <div style={{
              width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
              background: i === 0 ? "rgba(234,179,8,0.15)" : i === 1 ? "rgba(148,163,184,0.1)" : i === 2 ? "rgba(196,148,90,0.12)" : "rgba(139,92,246,0.1)",
              border: `2px solid ${i === 0 ? "#EAB308" : i === 1 ? "#94A3B8" : i === 2 ? "#C4945A" : ACCENT}50`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 800,
              color: i === 0 ? "#EAB308" : i === 1 ? "#94A3B8" : i === 2 ? "#C4945A" : ACCENT,
            }}>
              #{i + 1}
            </div>

            {/* Topic + engine */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0", marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {opp.title}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 10,
                  background: `${engineColor}18`, color: engineColor,
                  border: `1px solid ${engineColor}30`,
                }}>
                  {opp.targetEngine}
                </span>
                <span style={{
                  fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 10,
                  background: "rgba(255,255,255,0.04)", color: "rgba(148,163,184,0.55)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}>
                  {opp.status}
                </span>
              </div>
            </div>

            {/* Score */}
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{
                fontSize: 22, fontWeight: 900, lineHeight: 1,
                color: opp.compositeScore >= 70 ? "#22C55E" : opp.compositeScore >= 40 ? "#F59E0B" : ACCENT,
              }}>
                {opp.compositeScore}
              </div>
              <div style={{ fontSize: 9, color: "rgba(148,163,184,0.4)", marginTop: 2 }}>score</div>
            </div>

            {/* Score bar */}
            <div style={{ width: 80, flexShrink: 0 }}>
              <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 3,
                  width: `${opp.compositeScore}%`,
                  background: opp.compositeScore >= 70 ? "#22C55E" : opp.compositeScore >= 40 ? "#F59E0B" : ACCENT,
                  transition: "width 0.6s ease",
                }} />
              </div>
            </div>
          </div>
        );
      })}

      <div style={{ fontSize: 10, color: "rgba(148,163,184,0.35)", textAlign: "right", marginTop: 4 }}>
        {data.count} opportunities · Week {data.weekLabel}
      </div>
    </div>
  );
}

// ── Run History tab ───────────────────────────────────────────────────────────

function HistoryTab({ apiFetch }: { apiFetch: ReturnType<typeof useApiFetch> }) {
  const { data, isLoading } = useQuery<HistoryData>({
    queryKey: ["ci-history"],
    queryFn:  () => apiFetch("/api/competitor-intelligence/history?limit=10"),
  });

  if (isLoading) return <LoadingSpinner />;
  if (!data?.history?.length) {
    return <EmptyState message="No completed discovery runs found. Trigger a manual run from the Discovery settings to start building your intelligence history." />;
  }

  const maxOpps = Math.max(...data.history.map(r => r.opportunityCount), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {data.history.map(run => (
        <div key={run.runId} style={{
          background: BG_CARD, border: `1px solid ${ACCENT_BORDER}`,
          borderRadius: 12, padding: "14px 16px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            {/* Status dot */}
            <div style={{
              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
              background: run.status === "complete" ? "#22C55E" : "#F59E0B",
              boxShadow: `0 0 6px ${run.status === "complete" ? "#22C55E" : "#F59E0B"}`,
            }} />

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F0" }}>
                Week {run.weekLabel}
              </div>
              <div style={{ fontSize: 9.5, color: "rgba(148,163,184,0.45)", marginTop: 1 }}>
                {new Date(run.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                {run.completedAt && (
                  <span style={{ marginLeft: 8 }}>
                    · completed {new Date(run.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                )}
              </div>
            </div>

            {/* High-priority badge */}
            {run.highPriorityCount > 0 && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                background: "rgba(239,68,68,0.12)", color: "#EF4444",
                border: "1px solid rgba(239,68,68,0.25)",
              }}>
                {run.highPriorityCount} HIGH PRIORITY
              </span>
            )}
          </div>

          {/* Metrics row */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8,
            marginBottom: 10,
          }}>
            {[
              { label: "Signals",   value: run.signalsReceived,   delta: null,                    invert: false },
              { label: "Clusters",  value: run.clusterCount,      delta: null,                    invert: false },
              { label: "Gaps",      value: run.gapCount,          delta: run.gapCountDelta,        invert: true  },
              { label: "Opps",      value: run.opportunityCount,  delta: run.opportunityCountDelta, invert: false },
              { label: "Top Score", value: run.topScore,          delta: run.topScoreDelta,         invert: false },
            ].map(m => (
              <div key={m.label} style={{
                textAlign: "center", padding: "6px 8px",
                background: "rgba(139,92,246,0.06)", borderRadius: 8,
                border: "1px solid rgba(139,92,246,0.1)",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: ACCENT }}>{m.value}</span>
                  <DeltaBadge delta={m.delta} invert={m.invert} />
                </div>
                <div style={{ fontSize: 9, color: "rgba(148,163,184,0.45)", marginTop: 1 }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Opportunity bar */}
          <div>
            <div style={{ fontSize: 9, color: "rgba(148,163,184,0.4)", marginBottom: 4 }}>
              Opportunity volume
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 2,
                width: `${(run.opportunityCount / maxOpps) * 100}%`,
                background: `linear-gradient(90deg, ${ACCENT}, #A78BFA)`,
                transition: "width 0.6s ease",
              }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function StatCardWithTrend({ label, value, sub, accent = ACCENT, delta, invertDelta = false }: {
  label: string; value: string | number; sub?: string; accent?: string;
  delta?: number | null; invertDelta?: boolean;
}) {
  return (
    <div style={{
      background: BG_CARD, border: `1px solid ${accent}25`,
      borderRadius: 12, padding: "16px 20px",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ fontSize: 11, color: "rgba(148,163,184,0.65)", fontWeight: 600, letterSpacing: "0.4px" }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: accent, lineHeight: 1 }}>
          {value}
        </div>
        {delta != null && <DeltaBadge delta={delta} invert={invertDelta} />}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: "rgba(148,163,184,0.45)", marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function OverviewTab({
  summary, apiFetch,
}: {
  summary: SummaryData;
  apiFetch: ReturnType<typeof useApiFetch>;
}) {
  const { data: gaps }  = useQuery<GapsData>({
    queryKey: ["ci-gaps"],
    queryFn:  () => apiFetch("/api/competitor-intelligence/gaps?limit=5"),
  });
  const { data: opps } = useQuery<OpportunitiesData>({
    queryKey: ["ci-opportunities"],
    queryFn:  () => apiFetch("/api/competitor-intelligence/opportunities?limit=3"),
  });
  const { data: hist } = useQuery<HistoryData>({
    queryKey: ["ci-history", 2],
    queryFn:  () => apiFetch("/api/competitor-intelligence/history?limit=2"),
  });

  const run = summary.latestRun;

  // Latest run is hist.history[0], previous run is hist.history[1]
  const latestHist = hist?.history?.[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
        <StatCardWithTrend label="COMPETITOR GAPS" value={summary.competitorGapCount} sub="keywords competitors rank for" delta={latestHist?.gapCountDelta} invertDelta={true} />
        <StatCard label="HIGH VOLUME GAPS" value={summary.highVolumeGapCount} sub="volume > 100/mo" accent="#22C55E" />
        <StatCardWithTrend label="OPPORTUNITIES FOUND" value={run?.opportunityCount ?? 0} sub="scored & prioritized" accent="#F59E0B" delta={latestHist?.opportunityCountDelta} />
        <StatCardWithTrend label="TOP SCORE" value={run?.topOpportunityScore ?? 0} sub="highest composite score" accent="#EF4444" delta={latestHist?.topScoreDelta} />
        <StatCard label="SIGNALS RECEIVED" value={run?.signalsReceived ?? 0} sub="raw market signals" accent="#60A5FA" />
        <StatCard label="CLUSTERS BUILT" value={run?.clusterCount ?? 0} sub="topic groups" accent="#A78BFA" />
      </div>

      {/* Data-quality warning — shown when some gap signals have no resolvable competitor name */}
      {(summary.unresolvableGapCount ?? 0) > 0 && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          background: "rgba(245,158,11,0.07)",
          border: "1px solid rgba(245,158,11,0.22)",
          borderRadius: 10, padding: "12px 14px",
        }}>
          <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#F59E0B", marginBottom: 3 }}>
              {summary.unresolvableGapCount} gap{summary.unresolvableGapCount === 1 ? "" : "s"} with unknown competitor
            </div>
            <div style={{ fontSize: 10, color: "rgba(148,163,184,0.6)", lineHeight: 1.5 }}>
              {summary.unresolvableGapCount === 1 ? "This signal was" : "These signals were"} stored without organic result data, so the competitor
              identity cannot be resolved. They will appear as <em style={{ color: "rgba(245,158,11,0.65)" }}>Unknown competitor</em> in
              the Keyword Gaps tab. Run the backfill endpoint or trigger a new scan to populate missing data.
            </div>
          </div>
        </div>
      )}

      {/* Latest run status */}
      {run && (
        <div style={{
          background: BG_CARD, border: `1px solid ${ACCENT_BORDER}`,
          borderRadius: 14, padding: "16px 20px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "#22C55E", boxShadow: "0 0 8px #22C55E",
            }} />
            <div style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F0" }}>
              Latest Run — Week {run.weekLabel}
            </div>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
              background: run.status === "complete" ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.12)",
              color: run.status === "complete" ? "#22C55E" : "#F59E0B",
              border: `1px solid ${run.status === "complete" ? "rgba(34,197,94,0.25)" : "rgba(245,158,11,0.25)"}`,
            }}>
              {run.status.toUpperCase()}
            </span>
            <div style={{ marginLeft: "auto", fontSize: 10, color: "rgba(148,163,184,0.4)" }}>
              {run.completedAt
                ? new Date(run.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                : new Date(run.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </div>
          </div>
          <div style={{ fontSize: 11, color: "rgba(148,163,184,0.55)", lineHeight: 1.5 }}>
            Analyzed <strong style={{ color: ACCENT }}>{run.signalsReceived}</strong> market signals →
            accepted <strong style={{ color: "#22C55E" }}>{run.signalsAccepted}</strong> →
            built <strong style={{ color: "#A78BFA" }}>{run.clusterCount}</strong> topic clusters →
            scored <strong style={{ color: "#F59E0B" }}>{run.opportunityCount}</strong> opportunities
            (<strong style={{ color: "#EF4444" }}>{run.highPriorityCount} high priority</strong>).
          </div>
        </div>
      )}

      {/* Top 5 gaps preview */}
      <div>
        <SectionHeader emoji="🎯" title="Top Keyword Gaps" sub="Keywords your competitors rank for — you don't" />
        {!gaps?.hasData || !gaps.gaps.length ? (
          <div style={{ fontSize: 11, color: "rgba(148,163,184,0.45)", padding: "16px 0" }}>
            No gaps found yet. Run a discovery scan to detect competitor keyword gaps.
          </div>
        ) : (
          <div style={{
            background: BG_CARD, border: `1px solid ${ACCENT_BORDER}`,
            borderRadius: 12, overflow: "hidden",
          }}>
            {gaps.gaps.slice(0, 5).map((g, i) => (
              <div key={g.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px",
                borderBottom: i < 4 ? `1px solid rgba(139,92,246,0.07)` : "none",
              }}>
                <span style={{ fontSize: 11, color: "rgba(148,163,184,0.3)", width: 16, flexShrink: 0 }}>
                  {i + 1}
                </span>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "#E2E8F0", minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    {g.keyword}
                    {g.status === "new" && (
                      <span style={{
                        fontSize: 8, fontWeight: 800, padding: "1px 5px", borderRadius: 6,
                        background: "rgba(34,197,94,0.15)", color: "#22C55E",
                        border: "1px solid rgba(34,197,94,0.3)", letterSpacing: "0.4px",
                        flexShrink: 0,
                      }}>
                        NEW
                      </span>
                    )}
                  </span>
                  {g.competitorName && (
                    <span style={{
                      display: "block", fontSize: 10, fontWeight: 500,
                      color: "rgba(148,163,184,0.55)", marginTop: 1,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                      title={g.competitorName}
                    >
                      {g.competitorName}
                    </span>
                  )}
                </span>
                {g.volumeEstimate != null && (
                  <span style={{ fontSize: 10, color: "#F59E0B", fontWeight: 700, flexShrink: 0 }}>
                    {g.volumeEstimate >= 1000 ? `${(g.volumeEstimate / 1000).toFixed(1)}k` : g.volumeEstimate}/mo
                  </span>
                )}
                {g.competitorRank != null && (
                  <span style={{
                    fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 8,
                    background: `rgba(139,92,246,0.12)`, color: ACCENT,
                    border: `1px solid rgba(139,92,246,0.25)`, flexShrink: 0,
                  }}>
                    #{g.competitorRank}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top 3 opportunities preview */}
      <div>
        <SectionHeader emoji="⚡" title="Top Opportunities" sub="Highest scored actions from the latest run" />
        {!opps?.hasData || !opps.opportunities.length ? (
          <div style={{ fontSize: 11, color: "rgba(148,163,184,0.45)", padding: "16px 0" }}>
            No opportunities scored yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {opps.opportunities.slice(0, 3).map((opp, i) => {
              const engineColor = ENGINE_COLOR[opp.targetEngine] ?? ACCENT;
              return (
                <div key={opp.id} style={{
                  background: BG_CARD, border: `1px solid ${ACCENT_BORDER}`,
                  borderRadius: 10, padding: "12px 14px",
                  display: "flex", alignItems: "center", gap: 12,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    background: i === 0 ? "rgba(234,179,8,0.1)" : "rgba(139,92,246,0.08)",
                    border: `2px solid ${i === 0 ? "#EAB308" : ACCENT}40`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 800,
                    color: i === 0 ? "#EAB308" : ACCENT,
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#E2E8F0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {opp.title}
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 8,
                      background: `${engineColor}15`, color: engineColor,
                      border: `1px solid ${engineColor}28`,
                    }}>
                      {opp.targetEngine}
                    </span>
                  </div>
                  <div style={{
                    fontSize: 18, fontWeight: 900, flexShrink: 0,
                    color: opp.compositeScore >= 70 ? "#22C55E" : opp.compositeScore >= 40 ? "#F59E0B" : ACCENT,
                  }}>
                    {opp.compositeScore}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Setup-needed state ────────────────────────────────────────────────────────

function SetupNeededState() {
  return (
    <div style={{
      textAlign: "center", padding: "80px 32px",
      background: BG_CARD, borderRadius: 16,
      border: `1.5px dashed ${ACCENT_BORDER}`,
      maxWidth: 560, margin: "0 auto",
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⚙️</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: ACCENT, marginBottom: 8 }}>
        Discovery Tables Not Initialized
      </div>
      <div style={{ fontSize: 13, color: "rgba(148,163,184,0.65)", lineHeight: 1.6, marginBottom: 24 }}>
        The Competitor Intelligence data store hasn't been set up yet on this environment.
        This is a one-time initialization step — trigger a Discovery run to automatically
        create the required tables and populate your first dataset.
      </div>
      <div style={{
        fontSize: 11, color: "rgba(148,163,184,0.5)",
        background: "rgba(139,92,246,0.06)", borderRadius: 8, padding: "8px 14px",
        border: `1px solid ${ACCENT_BORDER}`, display: "inline-block",
      }}>
        Use the <strong style={{ color: ACCENT }}>▶ Run New Scan</strong> button above to initialize and run your first scan.
      </div>
    </div>
  );
}

// ── No-data state ─────────────────────────────────────────────────────────────

function NoDataState({ totalRuns }: { totalRuns: number }) {
  return (
    <div style={{
      textAlign: "center", padding: "80px 32px",
      background: BG_CARD, borderRadius: 16,
      border: `1.5px dashed ${ACCENT_BORDER}`,
      maxWidth: 560, margin: "0 auto",
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🕵️</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: ACCENT, marginBottom: 8 }}>
        No Discovery Data Yet
      </div>
      <div style={{ fontSize: 13, color: "rgba(148,163,184,0.65)", lineHeight: 1.6, marginBottom: 24 }}>
        Competitor Intelligence is powered by the Discovery Engine.
        Run your first Discovery scan to start mapping competitor keyword gaps and scoring opportunities.
      </div>
      {totalRuns > 0 && (
        <div style={{
          fontSize: 11, color: "rgba(148,163,184,0.45)",
          background: "rgba(139,92,246,0.06)", borderRadius: 8, padding: "8px 12px",
          border: `1px solid ${ACCENT_BORDER}`,
        }}>
          {totalRuns} run{totalRuns !== 1 ? "s" : ""} found but no complete/partial runs yet.
          Check back after your next scan completes.
        </div>
      )}
    </div>
  );
}

// ── Scan phase type ────────────────────────────────────────────────────────────

type ScanPhase = "idle" | "starting" | "running" | "done" | "error";

// ── Stage label helpers ────────────────────────────────────────────────────────

const SIGNAL_STAGES = new Set([
  "seed_extraction", "keyword_expansion", "paa_extraction",
  "trend_overlay", "competitor_gap", "ai_search_audit", "social_listening",
]);
const CLUSTER_STAGES = new Set(["registry_gate", "cluster_building"]);
const SCORE_STAGES   = new Set(["opportunity_scoring", "persistence"]);

function deriveStageLabel(currentStage: string | null): string {
  if (!currentStage) return "Preparing…";
  if (SIGNAL_STAGES.has(currentStage))  return "Collecting signals";
  if (CLUSTER_STAGES.has(currentStage)) return "Building clusters";
  if (SCORE_STAGES.has(currentStage))   return "Scoring opportunities";
  return "Scanning…";
}

/** Which of the 3 high-level milestones are we in? (1, 2, or 3) */
function deriveMilestone(currentStage: string | null): 1 | 2 | 3 {
  if (!currentStage) return 1;
  if (CLUSTER_STAGES.has(currentStage)) return 2;
  if (SCORE_STAGES.has(currentStage))   return 3;
  return 1;
}

// ── Scan progress state ────────────────────────────────────────────────────────

interface ScanProgress {
  pct:       number;
  stage:     string | null;
  signals:   number;
  clusters:  number;
  opps:      number;
}

// ── Discovery health types ─────────────────────────────────────────────────────

interface DiscoveryHealth {
  provider: string;
  health: {
    status: "unconfigured" | "disabled" | "configured";
    reason?: string;
    login?: string;
    baseUrl?: string;
  };
}

// ── Discovery not-configured callout ──────────────────────────────────────────

function DiscoverySetupCallout({ health }: { health: DiscoveryHealth["health"] }) {
  const isDisabled     = health.status === "disabled";
  const titleText      = isDisabled
    ? "Discovery provider is disabled"
    : "Discovery provider not configured";
  const bodyText       = isDisabled
    ? "Set DISCOVERY_DATAFORSEO_ENABLED=true in the server environment to enable live scans."
    : "Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to the server environment to enable live scans.";

  return (
    <div style={{
      background: "rgba(239,68,68,0.07)",
      border: "1px solid rgba(239,68,68,0.25)",
      borderRadius: 10,
      padding: "10px 14px",
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
      maxWidth: 380,
    }}>
      <span style={{ fontSize: 16, lineHeight: 1.3, flexShrink: 0 }}>⚠️</span>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#EF4444", marginBottom: 3 }}>
          {titleText}
        </div>
        <div style={{ fontSize: 10, color: "rgba(148,163,184,0.7)", lineHeight: 1.5 }}>
          {bodyText}
        </div>
      </div>
    </div>
  );
}

// ── Run New Scan button ────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 4_000;

function RunScanButton({
  onRunComplete,
}: {
  onRunComplete: () => void;
}) {
  const { getToken }                    = useAuth();
  const apiFetch                        = useApiFetch();
  const [phase, setPhase]               = useState<ScanPhase>("idle");
  const [errorMsg, setErrorMsg]         = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const pollRef                         = useRef<ReturnType<typeof setInterval> | null>(null);
  const runIdRef                        = useRef<string | null>(null);
  const pollFailsRef                    = useRef<number>(0);

  const { data: healthData, isLoading: healthLoading } = useQuery<DiscoveryHealth>({
    queryKey: ["discovery-health"],
    queryFn:  () => apiFetch("/api/discovery/health"),
    staleTime: 30_000,
    retry: false,
  });

  const providerReady = !healthLoading && healthData?.health?.status === "configured";

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const MAX_POLL_FAILURES = 5;

  const pollStatus = useCallback(async () => {
    const runId = runIdRef.current;
    if (!runId) return;
    try {
      const result = await apiFetch<{
        status?: string;
        progress?: {
          currentStage?: string | null;
          percentComplete?: number;
          signalsCollected?: number;
          clustersBuilt?: number;
          opportunitiesCreated?: number;
        } | null;
      }>(`/discovery/runs/${runId}`);
      pollFailsRef.current = 0;
      const status: string = result?.status ?? "";

      // Update progress if available
      if (result?.progress) {
        const p = result.progress;
        setScanProgress({
          pct:     p.percentComplete    ?? 0,
          stage:   p.currentStage       ?? null,
          signals: p.signalsCollected   ?? 0,
          clusters: p.clustersBuilt     ?? 0,
          opps:    p.opportunitiesCreated ?? 0,
        });
      }

      if (status === "complete" || status === "partial") {
        stopPolling();
        setPhase("done");
        setScanProgress(null);
        onRunComplete();
        setTimeout(() => setPhase("idle"), 3_000);
      } else if (status === "failed" || status === "cancelled") {
        stopPolling();
        setPhase("error");
        setScanProgress(null);
        setErrorMsg("Scan ended with status: " + status);
        setTimeout(() => setPhase("idle"), 5_000);
      }
    } catch {
      pollFailsRef.current += 1;
      if (pollFailsRef.current >= MAX_POLL_FAILURES) {
        stopPolling();
        setPhase("error");
        setScanProgress(null);
        setErrorMsg("Lost connection while tracking scan progress.");
        setTimeout(() => setPhase("idle"), 6_000);
      }
    }
  }, [apiFetch, stopPolling, onRunComplete]);

  const handleClick = useCallback(async () => {
    if (phase === "starting" || phase === "running") return;
    if (!providerReady) return;
    setPhase("starting");
    setErrorMsg(null);
    setScanProgress(null);

    let resp: Response;
    try {
      const token = await getToken().catch(() => null);
      resp = await fetch(`${BASE}/api/discovery/manual-run`, {
        method:  "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ dryRun: false }),
      });
    } catch {
      setPhase("error");
      setErrorMsg("Network error — check your connection.");
      setTimeout(() => setPhase("idle"), 5_000);
      return;
    }

    if (resp.status === 409) {
      // A run is already in progress
      const body = await resp.json().catch(() => ({})) as { runId?: string };
      runIdRef.current = body?.runId ?? null;
      if (runIdRef.current) {
        // We have a runId — poll until it finishes
        pollFailsRef.current = 0;
        setPhase("running");
        pollRef.current = setInterval(pollStatus, POLL_INTERVAL_MS);
      } else {
        // Governance denied with no runId — can't track, show a clear message
        setPhase("error");
        setErrorMsg("A scan is already running. Wait for it to finish, then try again.");
        setTimeout(() => setPhase("idle"), 8_000);
      }
      return;
    }

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({})) as { message?: string; reason?: string; hint?: string };
      const hint =
        resp.status === 503 ? "Discovery provider is not configured." :
        resp.status === 402 ? "Estimated cost exceeds the run budget." :
        body?.hint ?? body?.message ?? body?.reason ?? `Error ${resp.status}`;
      setPhase("error");
      setErrorMsg(hint);
      setTimeout(() => setPhase("idle"), 6_000);
      return;
    }

    // 200: execution is synchronous — run has already completed by the time we get here.
    // Immediately invalidate queries; no polling needed.
    setPhase("done");
    setScanProgress(null);
    onRunComplete();
    setTimeout(() => setPhase("idle"), 3_000);
  }, [phase, providerReady, BASE, getToken, pollStatus, onRunComplete]);

  const label =
    healthLoading       ? "Checking provider…" :
    phase === "starting" ? "Starting scan…" :
    phase === "running"  ? "Scan in progress…" :
    phase === "done"     ? "✓ Scan complete" :
    phase === "error"    ? (errorMsg ?? "Scan failed") :
    "▶ Run New Scan";

  const isActive   = phase === "starting" || phase === "running";
  const isDone     = phase === "done";
  const isErr      = phase === "error";
  const notReady   = !healthLoading && !providerReady;
  const isDisabled = isActive || healthLoading || notReady;

  const milestone  = scanProgress ? deriveMilestone(scanProgress.stage) : 1;
  const stageLabel = scanProgress ? deriveStageLabel(scanProgress.stage) : "Preparing…";
  const pct        = scanProgress?.pct ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>

      {/* Persistent setup callout — shown when provider is not ready */}
      {notReady && healthData?.health && (
        <DiscoverySetupCallout health={healthData.health} />
      )}

      {/* Progress indicator — shown only while running and progress data is available */}
      {phase === "running" && (
        <div style={{
          width: 240, background: "rgba(13,10,42,0.85)",
          border: `1px solid ${ACCENT_BORDER}`,
          borderRadius: 10, padding: "10px 12px",
          display: "flex", flexDirection: "column", gap: 6,
        }}>

          {/* Stage milestone dots */}
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            {(["Signals", "Clusters", "Opportunities"] as const).map((name, i) => {
              const step = (i + 1) as 1 | 2 | 3;
              const done = milestone > step;
              const active = milestone === step;
              return (
                <div key={name} style={{ display: "flex", alignItems: "center", flex: i < 2 ? 1 : undefined }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: done ? "#22C55E" : active ? ACCENT : "rgba(255,255,255,0.06)",
                      border: `2px solid ${done ? "#22C55E" : active ? ACCENT : "rgba(255,255,255,0.12)"}`,
                      transition: "all 0.4s ease",
                      boxShadow: active ? `0 0 8px ${ACCENT}60` : "none",
                    }}>
                      {done ? (
                        <span style={{ fontSize: 9, color: "#fff", fontWeight: 900 }}>✓</span>
                      ) : active ? (
                        <span style={{
                          display: "inline-block", width: 7, height: 7,
                          border: `1.5px solid rgba(255,255,255,0.4)`,
                          borderTopColor: "#fff", borderRadius: "50%",
                          animation: "spin 0.7s linear infinite",
                        }} />
                      ) : null}
                    </div>
                    <span style={{
                      fontSize: 8, fontWeight: 700, letterSpacing: "0.3px",
                      color: done ? "#22C55E" : active ? ACCENT : "rgba(148,163,184,0.4)",
                      whiteSpace: "nowrap",
                      transition: "color 0.3s",
                    }}>
                      {name}
                    </span>
                  </div>

                  {/* Connector line between dots */}
                  {i < 2 && (
                    <div style={{
                      flex: 1, height: 2, marginBottom: 11, marginLeft: 3, marginRight: 3,
                      background: done
                        ? "#22C55E"
                        : `linear-gradient(90deg, ${active ? ACCENT : "rgba(255,255,255,0.08)"}, rgba(255,255,255,0.08))`,
                      transition: "background 0.4s",
                      borderRadius: 2,
                    }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: 2 }}>
            <div style={{
              height: 4, background: "rgba(255,255,255,0.06)",
              borderRadius: 3, overflow: "hidden",
            }}>
              <div style={{
                height: "100%", borderRadius: 3,
                width: `${Math.max(pct, 4)}%`,
                background: `linear-gradient(90deg, ${ACCENT}, #A78BFA)`,
                transition: "width 0.8s ease",
              }} />
            </div>
            <div style={{
              display: "flex", justifyContent: "space-between",
              marginTop: 4,
            }}>
              <span style={{ fontSize: 9, color: "rgba(148,163,184,0.55)", fontStyle: "italic" }}>
                {stageLabel}
              </span>
              {pct > 0 && (
                <span style={{ fontSize: 9, color: "rgba(148,163,184,0.4)", fontWeight: 700 }}>
                  {pct}%
                </span>
              )}
            </div>
          </div>

          {/* Live counts row */}
          {scanProgress && (scanProgress.signals > 0 || scanProgress.clusters > 0 || scanProgress.opps > 0) && (
            <div style={{
              display: "flex", gap: 10, paddingTop: 4,
              borderTop: `1px solid ${ACCENT_BORDER}`,
            }}>
              {[
                { label: "signals",  val: scanProgress.signals  },
                { label: "clusters", val: scanProgress.clusters },
                { label: "opps",     val: scanProgress.opps     },
              ].map(({ label: lbl, val }) => val > 0 ? (
                <div key={lbl} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: ACCENT, lineHeight: 1 }}>{val}</span>
                  <span style={{ fontSize: 8, color: "rgba(148,163,184,0.4)", marginTop: 1 }}>{lbl}</span>
                </div>
              ) : null)}
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleClick}
        disabled={isDisabled}
        style={{
          display: "flex", alignItems: "center", gap: 7,
          padding: "8px 16px", borderRadius: 10, cursor: isDisabled ? "default" : "pointer",
          fontSize: 11, fontWeight: 800, letterSpacing: "0.3px",
          background: isDone    ? "rgba(34,197,94,0.15)" :
                      isErr     ? "rgba(239,68,68,0.12)" :
                      notReady  ? "rgba(255,255,255,0.04)" :
                      isActive  ? ACCENT_DIM : ACCENT,
          border: `1px solid ${
            isDone    ? "rgba(34,197,94,0.3)" :
            isErr     ? "rgba(239,68,68,0.3)" :
            notReady  ? "rgba(255,255,255,0.1)" :
            isActive  ? ACCENT_BORDER : ACCENT}`,
          color: isDone    ? "#22C55E" :
                 isErr     ? "#EF4444" :
                 notReady  ? "rgba(148,163,184,0.35)" :
                 isActive  ? ACCENT : "#030612",
          transition: "all 0.2s",
          opacity: isDisabled ? 0.6 : 1,
          whiteSpace: "nowrap",
        }}
      >
        {(isActive || healthLoading) && (
          <span style={{
            display: "inline-block", width: 10, height: 10,
            border: `2px solid ${ACCENT}50`, borderTopColor: ACCENT,
            borderRadius: "50%", animation: "spin 0.7s linear infinite",
          }} />
        )}
        {label}
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CompetitorIntelligencePage() {
  const apiFetch     = useApiFetch();
  const queryClient  = useQueryClient();
  const [tab, setTab] = useState<TabId>("overview");

  const { data: summary, isLoading: summaryLoading, isError } = useQuery<SummaryData>({
    queryKey: ["ci-summary"],
    queryFn:  () => apiFetch("/api/competitor-intelligence/summary"),
    staleTime: 60_000,
  });

  const handleRunComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["ci-summary"] });
    queryClient.invalidateQueries({ queryKey: ["ci-gaps"] });
    queryClient.invalidateQueries({ queryKey: ["ci-opportunities"] });
    queryClient.invalidateQueries({ queryKey: ["ci-history"] });
  }, [queryClient]);

  return (
    <AppShell>
      <div style={{
        maxWidth: 960, margin: "0 auto",
        padding: "24px 16px 64px",
        minHeight: "100vh", background: BG_PAGE,
      }}>
        {/* Page header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <span style={{ fontSize: 28 }}>🕵️</span>
            <div>
              <h1 style={{
                margin: 0, fontSize: 22, fontWeight: 900,
                color: "#FFFFFF", letterSpacing: "-0.3px",
              }}>
                Competitor Intelligence
              </h1>
              <div style={{ fontSize: 11, color: "rgba(148,163,184,0.55)", marginTop: 2 }}>
                Keyword gap analysis &amp; market positioning · powered by Discovery Engine
              </div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
              <RunScanButton onRunComplete={handleRunComplete} />
              <span style={{
                fontSize: 9, fontWeight: 800, letterSpacing: "0.5px",
                padding: "3px 10px", borderRadius: 20,
                background: ACCENT_DIM, color: ACCENT,
                border: `1px solid ${ACCENT_BORDER}`,
              }}>
                🏅 ADVANCED
              </span>
            </div>
          </div>
        </div>

        {/* Loading state */}
        {summaryLoading && <LoadingSpinner />}

        {/* Setup-needed state (tables missing — not an error, just uninitialized) */}
        {!summaryLoading && !isError && summary && !summary.hasData && summary.reason === "tables_not_initialized" && (
          <SetupNeededState />
        )}

        {/* No data state (tables exist but no completed runs yet) */}
        {!summaryLoading && !isError && summary && !summary.hasData && summary.reason !== "tables_not_initialized" && (
          <NoDataState totalRuns={summary.totalRuns ?? 0} />
        )}

        {/* Error state (genuine network/db failure) */}
        {isError && !summaryLoading && (
          <div style={{
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 12, padding: "16px 20px",
            fontSize: 12, color: "#EF4444",
          }}>
            Failed to load competitor intelligence data. Check your connection and try again.
          </div>
        )}

        {/* Main content */}
        {!summaryLoading && !isError && summary?.hasData && (
          <>
            {/* Tab bar */}
            <div style={{
              display: "flex", gap: 4, marginBottom: 20,
              background: "rgba(255,255,255,0.03)",
              borderRadius: 12, padding: 4,
              border: "1px solid rgba(255,255,255,0.07)",
              width: "fit-content",
            }}>
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 14px", borderRadius: 9, cursor: "pointer",
                  background: tab === t.id ? ACCENT_DIM : "transparent",
                  border: `1px solid ${tab === t.id ? ACCENT_BORDER : "transparent"}`,
                  color: tab === t.id ? ACCENT : "rgba(148,163,184,0.6)",
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.2px",
                  transition: "all 0.15s",
                }}>
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            {/* Tab content */}
            {tab === "overview"      && <OverviewTab summary={summary} apiFetch={apiFetch} />}
            {tab === "gaps"          && <GapsTab apiFetch={apiFetch} />}
            {tab === "opportunities" && <OpportunitiesTab apiFetch={apiFetch} />}
            {tab === "history"       && <HistoryTab apiFetch={apiFetch} />}
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </AppShell>
  );
}

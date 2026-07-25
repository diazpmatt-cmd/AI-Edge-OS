import { useState, useMemo } from "react";
import type { CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

type DimensionKey =
  | "searchDemand"
  | "competitorGap"
  | "revenueImpact"
  | "contentFeasibility"
  | "seasonalRelevance"
  | "aiSearchPotential";

interface ScoreCardExplanations extends Partial<Record<DimensionKey, string>> {}

interface ScoreCardEnrichment {
  competitorDomainCount?: number;
  paaQuestionCount?:      number;
  cpcUsd?:                number | null;
  coverageState?:         string;
}

interface ScoreCard extends Partial<Record<DimensionKey, number>> {
  composite?:    number;
  confidence?:   string;
  explanations?: ScoreCardExplanations;
  version?:      string;
  enrichment?:   ScoreCardEnrichment;
}

interface Opportunity {
  id: string;
  title: string;
  description: string;
  opportunityType: string;
  targetEngine: string;
  compositeScore: number;
  priority: string;
  scoreCard: ScoreCard;
  status: string;
  createdAt: string;
}

interface OpportunitiesData {
  hasData: boolean;
  runId?: string;
  weekLabel?: string;
  opportunities: Opportunity[];
  count: number;
  reason?: string;
}

type PriorityFilter = "all" | "high" | "medium" | "low";
type SortKey = "composite_score" | "search_demand" | "revenue_impact" | "newest" | "oldest";

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCENT        = "#34D399";
const ACCENT_BORDER = "rgba(52,211,153,0.25)";
const ACCENT_DIM    = "rgba(52,211,153,0.12)";
const BG_PAGE       = "#030612";
const BG_CARD       = "rgba(5,16,12,0.9)";

const PRIORITY_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  critical: { color: "#FF4444",  label: "Critical",        icon: "🚨" },
  high:     { color: "#22C55E",  label: "High Priority",   icon: "🔥" },
  medium:   { color: "#F59E0B",  label: "Medium Priority", icon: "⚡" },
  low:      { color: "#8B5CF6",  label: "Low Priority",    icon: "💡" },
};

const ENGINE_COLOR: Record<string, string> = {
  content:     "#FB923C",
  authority:   "#00AEEF",
  optimization:"#38BDF8",
  measurement: "#EAB308",
};

const OPPORTUNITY_TYPE_LABELS: Record<string, string> = {
  keyword_rank:       "Keyword Rank",
  ai_citation_gap:    "AI Citation Gap",
  competitor_gap:     "Competitor Gap",
  content_topic:      "Content Topic",
  local_listing:      "Local Listing",
  review_velocity:    "Review Velocity",
  schema_markup:      "Schema Markup",
  seasonal_push:      "Seasonal Push",
  voice_optimization: "Voice Optimization",
};

const OPPORTUNITY_TYPE_ICON: Record<string, string> = {
  keyword_rank:       "🔑",
  ai_citation_gap:    "🤖",
  competitor_gap:     "📊",
  content_topic:      "📝",
  local_listing:      "📍",
  review_velocity:    "⭐",
  schema_markup:      "🗂",
  seasonal_push:      "📅",
  voice_optimization: "🎙",
};

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  pending:     { color: "#94A3B8", label: "Pending" },
  assigned:    { color: "#00AEEF", label: "Assigned" },
  in_progress: { color: "#F59E0B", label: "In Progress" },
  complete:    { color: "#22C55E", label: "Complete" },
  suppressed:  { color: "#EF4444", label: "Suppressed" },
};

const SCORE_DIMENSIONS: { key: DimensionKey; label: string; icon: string }[] = [
  { key: "searchDemand",       label: "Search Demand",       icon: "🔍" },
  { key: "competitorGap",      label: "Competitor Gap",      icon: "📊" },
  { key: "revenueImpact",      label: "Revenue Impact",      icon: "💰" },
  { key: "contentFeasibility", label: "Content Feasibility", icon: "✏️" },
  { key: "aiSearchPotential",  label: "AI Search Potential", icon: "🤖" },
  { key: "seasonalRelevance",  label: "Seasonal Relevance",  icon: "📅" },
];

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

export function scoreColor(score: number): string {
  if (score >= 70) return "#22C55E";
  if (score >= 40) return "#F59E0B";
  return "#8B5CF6";
}

export function priorityColor(p: string): string {
  return PRIORITY_CONFIG[p]?.color ?? ACCENT;
}

export function groupByPriority(opps: Opportunity[]): Record<string, Opportunity[]> {
  const grouped: Record<string, Opportunity[]> = { high: [], medium: [], low: [] };
  for (const opp of opps) {
    const key = opp.priority in grouped ? opp.priority : "low";
    grouped[key].push(opp);
  }
  return grouped;
}

function confidenceColor(c: string): string {
  return c === "high" ? "#22C55E" : c === "medium" ? "#F59E0B" : "#8B5CF6";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

function engineColor(e: string): string {
  return ENGINE_COLOR[e] ?? "#8B5CF6";
}

function uniqueSorted(arr: string[]): string[] {
  return [...new Set(arr)].sort();
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{
          background: BG_CARD, border: "1px solid rgba(52,211,153,0.1)",
          borderRadius: 14, padding: "18px 20px",
          animation: "pulse 1.8s ease-in-out infinite",
          animationDelay: `${i * 0.15}s`,
        }}>
          <div style={{ height: 14, width: "45%", background: "rgba(255,255,255,0.06)", borderRadius: 6, marginBottom: 10 }} />
          <div style={{ height: 10, width: "70%", background: "rgba(255,255,255,0.04)", borderRadius: 4, marginBottom: 6 }} />
          <div style={{ height: 10, width: "55%", background: "rgba(255,255,255,0.04)", borderRadius: 4 }} />
        </div>
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
    </div>
  );
}

function EmptyState({ weekLabel }: { weekLabel?: string }) {
  return (
    <div style={{
      background: BG_CARD, border: `1px dashed ${ACCENT_BORDER}`,
      borderRadius: 16, padding: "48px 32px", textAlign: "center",
    }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: "#E2E8F0", marginBottom: 8 }}>
        No opportunities scored yet
      </div>
      <div style={{ fontSize: 13, color: "rgba(148,163,184,0.65)", marginBottom: 20, maxWidth: 380, margin: "0 auto 20px" }}>
        {weekLabel
          ? `The ${weekLabel} Discovery run completed but found no scored opportunities. Run a new scan to surface keyword gaps and market signals.`
          : "Complete a Discovery scan from the Competitive Edge Intelligence module to surface your highest-impact opportunities."}
      </div>
      <Link to="/admin/competitor-intelligence">
        <button style={{
          padding: "10px 22px", borderRadius: 10, fontSize: 12, fontWeight: 700,
          background: ACCENT_DIM, border: `1px solid ${ACCENT_BORDER}`,
          color: ACCENT, cursor: "pointer", letterSpacing: "0.3px",
        }}>
          Go to Competitive Edge Intelligence →
        </button>
      </Link>
    </div>
  );
}

function NoResultsState({ onClear }: { onClear: () => void }) {
  return (
    <div style={{
      background: BG_CARD, border: "1px dashed rgba(255,255,255,0.08)",
      borderRadius: 16, padding: "40px 28px", textAlign: "center",
    }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#E2E8F0", marginBottom: 6 }}>
        No results match your filters
      </div>
      <div style={{ fontSize: 12, color: "rgba(148,163,184,0.5)", marginBottom: 18 }}>
        Try adjusting your search or filter criteria.
      </div>
      <button onClick={onClear} style={{
        padding: "8px 18px", borderRadius: 9, fontSize: 12, fontWeight: 700,
        background: ACCENT_DIM, border: `1px solid ${ACCENT_BORDER}`,
        color: ACCENT, cursor: "pointer",
      }}>
        Clear all filters
      </button>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{
      background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)",
      borderRadius: 14, padding: "32px 24px", textAlign: "center",
    }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#FCA5A5", marginBottom: 6 }}>
        Failed to load opportunities
      </div>
      <div style={{ fontSize: 12, color: "rgba(148,163,184,0.6)", marginBottom: 18 }}>
        There was an error connecting to the Edge Opportunities backend. Check your connection and try again.
      </div>
      <button
        onClick={onRetry}
        aria-label="Retry"
        style={{
          padding: "8px 20px", borderRadius: 9, fontSize: 12, fontWeight: 700,
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
          color: "#EF4444", cursor: "pointer",
        }}
      >
        ↺ Retry
      </button>
    </div>
  );
}

function PriorityGroupHeader({ priority, count }: { priority: string; count: number }) {
  const cfg = PRIORITY_CONFIG[priority] ?? { color: ACCENT, label: priority, icon: "•" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, marginTop: 8 }}>
      <span style={{ fontSize: 14 }}>{cfg.icon}</span>
      <span style={{ fontSize: 13, fontWeight: 800, color: cfg.color, letterSpacing: "0.2px" }}>
        {cfg.label}
      </span>
      <span style={{
        fontSize: 9, fontWeight: 700, color: cfg.color,
        background: `${cfg.color}14`, border: `1px solid ${cfg.color}28`,
        borderRadius: 10, padding: "1px 7px",
      }}>{count}</span>
      <div style={{ flex: 1, height: 1, background: `${cfg.color}18` }} />
    </div>
  );
}

function ScoreDimRow({ label, icon, score, explanation }: {
  label: string; icon: string; score: number; explanation?: string;
}) {
  const color = scoreColor(score);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: "rgba(148,163,184,0.7)", display: "flex", alignItems: "center", gap: 5 }}>
          <span>{icon}</span>{label}
        </span>
        <span style={{ fontSize: 11, fontWeight: 800, color }}>{score}</span>
      </div>
      <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 2,
          width: `${Math.min(score, 100)}%`,
          background: color,
          transition: "width 0.5s ease",
        }} />
      </div>
      {explanation && (
        <div style={{ fontSize: 10, color: "rgba(148,163,184,0.45)", marginTop: 4, lineHeight: 1.5 }}>
          {explanation}
        </div>
      )}
    </div>
  );
}

function OpportunityCard({ opp, rank }: { opp: Opportunity; rank?: number }) {
  const [showDetails, setShowDetails] = useState(false);
  const pc  = PRIORITY_CONFIG[opp.priority] ?? { color: ACCENT, label: opp.priority, icon: "•" };
  const ec  = engineColor(opp.targetEngine);
  const sc  = scoreColor(opp.compositeScore);
  const icon      = OPPORTUNITY_TYPE_ICON[opp.opportunityType] ?? "⚡";
  const typeLabel = OPPORTUNITY_TYPE_LABELS[opp.opportunityType] ?? opp.opportunityType;
  const statusCfg = STATUS_CONFIG[opp.status] ?? { color: "rgba(148,163,184,0.4)", label: opp.status };
  const card      = opp.scoreCard;

  const hasDimensions = SCORE_DIMENSIONS.some(d => typeof card[d.key] === "number");
  const hasDetails    = hasDimensions || !!card.explanations || !!card.enrichment;

  return (
    <div style={{
      background: BG_CARD,
      border: `1px solid ${pc.color}20`,
      borderTop: `2px solid ${pc.color}55`,
      borderRadius: 14,
      padding: "16px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}>

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {rank !== undefined ? (
          <div style={{
            width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
            background: rank === 0 ? "rgba(234,179,8,0.15)" : rank === 1 ? "rgba(148,163,184,0.1)" : rank === 2 ? "rgba(196,148,90,0.12)" : `${pc.color}12`,
            border: `2px solid ${(rank === 0 ? "#EAB308" : rank === 1 ? "#94A3B8" : rank === 2 ? "#C4945A" : pc.color)}50`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 800,
            color: rank === 0 ? "#EAB308" : rank === 1 ? "#94A3B8" : rank === 2 ? "#C4945A" : pc.color,
          }}>
            #{rank + 1}
          </div>
        ) : (
          <span style={{
            fontSize: 18, width: 34, height: 34, borderRadius: 10, flexShrink: 0,
            background: `${pc.color}0E`, border: `1px solid ${pc.color}22`,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}>{icon}</span>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#E2E8F0", marginBottom: 4, lineHeight: 1.35 }}>
            {opp.title}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
              background: `${ec}18`, color: ec, border: `1px solid ${ec}30`,
            }}>{opp.targetEngine}</span>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
              background: `${pc.color}12`, color: pc.color, border: `1px solid ${pc.color}28`,
            }}>{pc.label}</span>
            <span style={{
              fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 10,
              background: "rgba(255,255,255,0.04)", color: statusCfg.color,
              border: `1px solid ${statusCfg.color}28`,
            }}>{statusCfg.label}</span>
            {card.confidence && (
              <span style={{
                fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 10,
                color: confidenceColor(card.confidence),
                background: `${confidenceColor(card.confidence)}12`,
                border: `1px solid ${confidenceColor(card.confidence)}28`,
              }}>
                {card.confidence} confidence
              </span>
            )}
            {card.version === "c5" && (
              <span style={{
                fontSize: 8, fontWeight: 700, padding: "1px 6px", borderRadius: 8,
                color: "#00AEEF", background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.2)",
              }}>ENRICHED</span>
            )}
          </div>
        </div>

        {/* Composite score badge */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1, color: sc }}>
            {opp.compositeScore}
          </div>
          <div style={{ fontSize: 8, color: "rgba(148,163,184,0.4)", marginTop: 2, letterSpacing: "0.4px" }}>SCORE</div>
        </div>
      </div>

      {/* Score bar */}
      <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 2,
          width: `${Math.min(opp.compositeScore, 100)}%`,
          background: `linear-gradient(90deg, ${sc}80, ${sc})`,
          transition: "width 0.7s cubic-bezier(0.4,0,0.2,1)",
        }} />
      </div>

      {/* Description */}
      {opp.description && (
        <div style={{ fontSize: 12, color: "rgba(148,163,184,0.75)", lineHeight: 1.6 }}>
          {opp.description}
        </div>
      )}

      {/* C5 enrichment quick stats */}
      {card.enrichment && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {card.enrichment.competitorDomainCount != null && (
            <span style={{ fontSize: 10, color: "rgba(148,163,184,0.6)" }}>
              <span style={{ fontWeight: 700, color: "#E2E8F0" }}>{card.enrichment.competitorDomainCount}</span>{" "}competitors ranking
            </span>
          )}
          {!!card.enrichment.paaQuestionCount && (
            <span style={{ fontSize: 10, color: "rgba(148,163,184,0.6)" }}>
              <span style={{ fontWeight: 700, color: "#E2E8F0" }}>{card.enrichment.paaQuestionCount}</span>{" "}PAA questions
            </span>
          )}
          {card.enrichment.cpcUsd != null && (
            <span style={{ fontSize: 10, color: "rgba(148,163,184,0.6)" }}>
              CPC{" "}<span style={{ fontWeight: 700, color: "#22C55E" }}>${card.enrichment.cpcUsd.toFixed(2)}</span>
            </span>
          )}
          {card.enrichment.coverageState && (
            <span style={{ fontSize: 10, color: "rgba(148,163,184,0.6)" }}>
              Coverage:{" "}<span style={{ fontWeight: 600, color: "#E2E8F0" }}>{card.enrichment.coverageState}</span>
            </span>
          )}
        </div>
      )}

      {/* Expandable details panel */}
      {showDetails && (
        <div style={{
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 10, padding: "14px 16px",
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: ACCENT, marginBottom: 12, letterSpacing: "0.4px" }}>
            WHY THIS OPPORTUNITY EXISTS
          </div>
          {hasDimensions ? (
            SCORE_DIMENSIONS.map(({ key, label, icon: dimIcon }) => {
              const val = card[key];
              if (typeof val !== "number") return null;
              return (
                <ScoreDimRow
                  key={key}
                  label={label}
                  icon={dimIcon}
                  score={val}
                  explanation={card.explanations?.[key]}
                />
              );
            })
          ) : (
            <div style={{ fontSize: 12, color: "rgba(148,163,184,0.5)", fontStyle: "italic" }}>
              Detailed dimension scores not available for this opportunity (scored before enrichment).
            </div>
          )}
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ fontSize: 10, color: "rgba(148,163,184,0.4)", lineHeight: 1.6 }}>
              <strong style={{ color: "rgba(148,163,184,0.6)" }}>Target engine:</strong>{" "}{opp.targetEngine}
              {card.version && (
                <span style={{ marginLeft: 12 }}>
                  <strong style={{ color: "rgba(148,163,184,0.6)" }}>Scoring version:</strong>{" "}{card.version}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: `${ec}90`, letterSpacing: "0.3px", textTransform: "uppercase" }}>
            {typeLabel}
          </span>
          {opp.createdAt && (
            <span style={{ fontSize: 9, color: "rgba(148,163,184,0.4)" }}>
              Discovered {formatDate(opp.createdAt)}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {hasDetails && (
            <button
              onClick={() => setShowDetails(v => !v)}
              aria-label={showDetails ? "Hide details" : "View details"}
              style={{
                padding: "6px 13px", borderRadius: 8, fontSize: 10, fontWeight: 700, cursor: "pointer",
                background: showDetails ? ACCENT_DIM : "rgba(255,255,255,0.04)",
                border: `1px solid ${showDetails ? ACCENT_BORDER : "rgba(255,255,255,0.1)"}`,
                color: showDetails ? ACCENT : "rgba(148,163,184,0.55)",
              }}
            >
              {showDetails ? "Hide Details" : "View Details"}
            </button>
          )}
          <Link to="/admin/competitor-intelligence">
            <button
              aria-label={`Take action on: ${opp.title}`}
              style={{
                padding: "6px 14px", borderRadius: 8, fontSize: 10, fontWeight: 800,
                cursor: "pointer", background: `${pc.color}0E`, border: `1px solid ${pc.color}30`,
                color: pc.color, letterSpacing: "0.3px", whiteSpace: "nowrap",
              }}
            >
              Take Action →
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Summary stat cards ────────────────────────────────────────────────────────

function SummaryStatCards({
  total, highCount, medCount, lowCount, weekLabel,
  activePriority, onSelectPriority,
}: {
  total: number; highCount: number; medCount: number; lowCount: number; weekLabel?: string;
  activePriority: PriorityFilter; onSelectPriority: (p: PriorityFilter) => void;
}) {
  const cards: { key: PriorityFilter; label: string; value: number; color: string; icon: string }[] = [
    { key: "all",    label: "Total Opportunities", value: total,     color: ACCENT,    icon: "📈" },
    { key: "high",   label: "High Priority",        value: highCount, color: "#22C55E", icon: "🔥" },
    { key: "medium", label: "Medium Priority",      value: medCount,  color: "#F59E0B", icon: "⚡" },
    { key: "low",    label: "Low Priority",         value: lowCount,  color: "#8B5CF6", icon: "💡" },
  ];

  return (
    <div style={{ marginBottom: 20 }}>
      {weekLabel && (
        <div style={{ marginBottom: 10 }}>
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: "0.6px",
            background: ACCENT_DIM, color: ACCENT, border: `1px solid ${ACCENT_BORDER}`,
            borderRadius: 20, padding: "3px 11px",
          }}>
            {weekLabel}
          </span>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {cards.map(c => {
          const active = activePriority === c.key;
          return (
            <button
              key={c.key}
              onClick={() => onSelectPriority(c.key)}
              aria-pressed={active}
              style={{
                background: active ? `${c.color}12` : BG_CARD,
                border: `1px solid ${active ? `${c.color}40` : "rgba(255,255,255,0.07)"}`,
                borderTop: `2px solid ${active ? c.color : "rgba(255,255,255,0.07)"}`,
                borderRadius: 12, padding: "14px 16px",
                cursor: "pointer", textAlign: "left",
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ fontSize: 16, marginBottom: 6 }}>{c.icon}</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: active ? c.color : "#E2E8F0", lineHeight: 1, marginBottom: 4 }}>
                {c.value}
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: active ? c.color : "rgba(148,163,184,0.45)", letterSpacing: "0.2px", lineHeight: 1.3 }}>
                {c.label}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Filter + sort bar ─────────────────────────────────────────────────────────

function FilterBar({
  engines, types, statuses,
  engineFilter, typeFilter, statusFilter, sortKey, searchQuery,
  onEngine, onType, onStatus, onSort, onSearch, onClear, activeFilterCount,
}: {
  engines: string[]; types: string[]; statuses: string[];
  engineFilter: string; typeFilter: string; statusFilter: string;
  sortKey: SortKey; searchQuery: string;
  onEngine: (v: string) => void; onType: (v: string) => void;
  onStatus: (v: string) => void; onSort: (v: SortKey) => void;
  onSearch: (v: string) => void; onClear: () => void;
  activeFilterCount: number;
}) {
  const selectStyle: CSSProperties = {
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
    color: "rgba(148,163,184,0.85)", borderRadius: 9, padding: "6px 10px",
    fontSize: 11, fontWeight: 600, cursor: "pointer", outline: "none",
    minWidth: 110,
  };

  return (
    <div style={{ marginBottom: 18 }}>
      {/* Search */}
      <div style={{ position: "relative", marginBottom: 10 }}>
        <span style={{
          position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
          fontSize: 13, color: "rgba(148,163,184,0.35)", pointerEvents: "none",
        }}>🔍</span>
        <input
          type="text"
          value={searchQuery}
          onChange={e => onSearch(e.target.value)}
          placeholder="Search opportunities…"
          aria-label="Search opportunities"
          style={{
            width: "100%", boxSizing: "border-box",
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: 10, padding: "9px 36px 9px 34px",
            fontSize: 12, color: "#E2E8F0", outline: "none", fontFamily: "inherit",
          }}
        />
        {searchQuery && (
          <button
            onClick={() => onSearch("")}
            aria-label="Clear search"
            style={{
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer",
              color: "rgba(148,163,184,0.5)", fontSize: 16, padding: 0, lineHeight: 1,
            }}
          >×</button>
        )}
      </div>

      {/* Filter + sort selects */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select value={engineFilter} onChange={e => onEngine(e.target.value)} style={selectStyle} aria-label="Filter by engine">
          <option value="">All Engines</option>
          {engines.map(e => (
            <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
          ))}
        </select>

        <select value={typeFilter} onChange={e => onType(e.target.value)} style={selectStyle} aria-label="Filter by opportunity type">
          <option value="">All Types</option>
          {types.map(t => (
            <option key={t} value={t}>{OPPORTUNITY_TYPE_LABELS[t] ?? t}</option>
          ))}
        </select>

        <select value={statusFilter} onChange={e => onStatus(e.target.value)} style={selectStyle} aria-label="Filter by status">
          <option value="">All Statuses</option>
          {statuses.map(s => (
            <option key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</option>
          ))}
        </select>

        <div style={{ flex: 1 }} />

        <select
          value={sortKey}
          onChange={e => onSort(e.target.value as SortKey)}
          style={{ ...selectStyle, minWidth: 148 }}
          aria-label="Sort by"
        >
          <option value="composite_score">↓ Composite Score</option>
          <option value="search_demand">↓ Search Demand</option>
          <option value="revenue_impact">↓ Revenue Impact</option>
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
        </select>

        {activeFilterCount > 0 && (
          <button onClick={onClear} style={{
            padding: "6px 12px", borderRadius: 9, fontSize: 10, fontWeight: 700,
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
            color: "#EF4444", cursor: "pointer",
          }}>
            Clear {activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EdgeOpportunitiesPage() {
  const apiFetch    = useApiFetch();
  const queryClient = useQueryClient();

  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [engineFilter,   setEngineFilter]   = useState("");
  const [typeFilter,     setTypeFilter]     = useState("");
  const [statusFilter,   setStatusFilter]   = useState("");
  const [searchQuery,    setSearchQuery]    = useState("");
  const [sortKey,        setSortKey]        = useState<SortKey>("composite_score");

  const { data, isLoading, isError, refetch } = useQuery<OpportunitiesData>({
    queryKey: ["edge-opportunities"],
    queryFn:  () => apiFetch("/api/competitor-intelligence/opportunities?limit=50") as Promise<OpportunitiesData>,
  });

  const allOpportunities = data?.opportunities ?? [];

  const engineOptions = useMemo(() => uniqueSorted(allOpportunities.map(o => o.targetEngine).filter(Boolean)), [allOpportunities]);
  const typeOptions   = useMemo(() => uniqueSorted(allOpportunities.map(o => o.opportunityType).filter(Boolean)), [allOpportunities]);
  const statusOptions = useMemo(() => uniqueSorted(allOpportunities.map(o => o.status).filter(Boolean)), [allOpportunities]);

  const grouped = useMemo(() => groupByPriority(allOpportunities), [allOpportunities]);

  const visible = useMemo(() => {
    let list = priorityFilter === "all"
      ? allOpportunities
      : (grouped[priorityFilter] ?? []);

    if (engineFilter)        list = list.filter(o => o.targetEngine   === engineFilter);
    if (typeFilter)          list = list.filter(o => o.opportunityType === typeFilter);
    if (statusFilter)        list = list.filter(o => o.status          === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(o =>
        o.title.toLowerCase().includes(q) || o.description.toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
      switch (sortKey) {
        case "search_demand":
          return ((b.scoreCard.searchDemand ?? 0) - (a.scoreCard.searchDemand ?? 0));
        case "revenue_impact":
          return ((b.scoreCard.revenueImpact ?? 0) - (a.scoreCard.revenueImpact ?? 0));
        case "newest":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        default:
          return b.compositeScore - a.compositeScore;
      }
    });
  }, [allOpportunities, grouped, priorityFilter, engineFilter, typeFilter, statusFilter, searchQuery, sortKey]);

  const visibleGrouped = useMemo(() => groupByPriority(visible), [visible]);

  const activeFilterCount = [engineFilter, typeFilter, statusFilter, searchQuery.trim()].filter(Boolean).length;
  const isDefaultView     = priorityFilter === "all" && !engineFilter && !typeFilter && !statusFilter && !searchQuery && sortKey === "composite_score";

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["edge-opportunities"] });
    refetch();
  }

  function clearAllFilters() {
    setEngineFilter("");
    setTypeFilter("");
    setStatusFilter("");
    setSearchQuery("");
    setSortKey("composite_score");
  }

  const isUninitialized = !data?.hasData && data?.reason === "tables_not_initialized";

  const PRIORITY_TABS: { key: PriorityFilter; label: string; count: number; color: string }[] = [
    { key: "all",    label: "All",    count: allOpportunities.length, color: ACCENT    },
    { key: "high",   label: "High",   count: grouped.high.length,    color: "#22C55E" },
    { key: "medium", label: "Medium", count: grouped.medium.length,  color: "#F59E0B" },
    { key: "low",    label: "Low",    count: grouped.low.length,     color: "#8B5CF6" },
  ];

  return (
    <AppShell>
      <div style={{ minHeight: "100vh", background: BG_PAGE, padding: "24px 20px 48px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>

          {/* Page header */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 26 }}>📈</span>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: "0.8px",
                      color: ACCENT, background: ACCENT_DIM,
                      border: `1px solid ${ACCENT_BORDER}`, borderRadius: 5, padding: "2px 8px",
                    }}>EDGE OPPORTUNITIES</span>
                  </div>
                  <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#FFFFFF", letterSpacing: "-0.3px", lineHeight: 1.2 }}>
                    Edge Opportunities
                  </h1>
                  <div style={{ fontSize: 11, color: "rgba(148,163,184,0.55)", marginTop: 3 }}>
                    Scored market signals ready to convert into revenue-generating actions
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                <Link to="/admin/competitor-intelligence">
                  <button style={{
                    padding: "8px 14px", borderRadius: 9, fontSize: 11, fontWeight: 700,
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(148,163,184,0.75)", cursor: "pointer",
                  }}>
                    ← Intelligence Hub
                  </button>
                </Link>
                <button
                  onClick={handleRefresh}
                  disabled={isLoading}
                  aria-label="Refresh opportunities"
                  style={{
                    padding: "8px 16px", borderRadius: 9, fontSize: 11, fontWeight: 700,
                    cursor: isLoading ? "default" : "pointer",
                    background: isLoading ? "rgba(52,211,153,0.04)" : ACCENT_DIM,
                    border: `1px solid ${ACCENT_BORDER}`, color: ACCENT,
                  }}
                >
                  {isLoading ? "Loading…" : "↻ Refresh"}
                </button>
              </div>
            </div>
          </div>

          {/* Loading */}
          {isLoading && <LoadingState />}

          {/* Error */}
          {!isLoading && isError && <ErrorState onRetry={handleRefresh} />}

          {/* Uninitialized */}
          {!isLoading && !isError && isUninitialized && (
            <div style={{
              background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)",
              borderRadius: 14, padding: "28px 24px", textAlign: "center",
            }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🔧</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#FCD34D", marginBottom: 6 }}>
                Discovery tables not yet initialized
              </div>
              <div style={{ fontSize: 12, color: "rgba(148,163,184,0.65)", marginBottom: 16 }}>
                The discovery system needs to run at least once to create opportunity records.
              </div>
              <Link to="/admin/competitor-intelligence">
                <button style={{
                  padding: "9px 20px", borderRadius: 9, fontSize: 12, fontWeight: 700,
                  background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
                  color: "#F59E0B", cursor: "pointer",
                }}>
                  Initialize Discovery →
                </button>
              </Link>
            </div>
          )}

          {/* Has data */}
          {!isLoading && !isError && data?.hasData && (
            <>
              {/* Summary stat cards (clickable, also set priority filter) */}
              <SummaryStatCards
                total={allOpportunities.length}
                highCount={grouped.high.length}
                medCount={grouped.medium.length}
                lowCount={grouped.low.length}
                weekLabel={data.weekLabel}
                activePriority={priorityFilter}
                onSelectPriority={setPriorityFilter}
              />

              {/* Priority filter tabs */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                {PRIORITY_TABS.map(f => (
                  <button
                    key={f.key}
                    onClick={() => setPriorityFilter(f.key)}
                    aria-pressed={priorityFilter === f.key}
                    style={{
                      padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                      cursor: "pointer",
                      background: priorityFilter === f.key ? `${f.color}18` : "rgba(255,255,255,0.03)",
                      border: `1px solid ${priorityFilter === f.key ? `${f.color}40` : "rgba(255,255,255,0.08)"}`,
                      color: priorityFilter === f.key ? f.color : "rgba(148,163,184,0.55)",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {f.label}
                    {f.count > 0 && (
                      <span style={{ marginLeft: 5, opacity: 0.7 }}>{f.count}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Search + additional filters + sort */}
              <FilterBar
                engines={engineOptions}
                types={typeOptions}
                statuses={statusOptions}
                engineFilter={engineFilter}
                typeFilter={typeFilter}
                statusFilter={statusFilter}
                sortKey={sortKey}
                searchQuery={searchQuery}
                onEngine={setEngineFilter}
                onType={setTypeFilter}
                onStatus={setStatusFilter}
                onSort={setSortKey}
                onSearch={setSearchQuery}
                onClear={clearAllFilters}
                activeFilterCount={activeFilterCount}
              />

              {/* Opportunity list */}
              {visible.length === 0 ? (
                activeFilterCount > 0 || searchQuery.trim()
                  ? <NoResultsState onClear={clearAllFilters} />
                  : <EmptyState weekLabel={data.weekLabel} />
              ) : isDefaultView ? (
                /* Grouped by priority when no additional filters/sort active */
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  {(["high", "medium", "low"] as const).map(tier => {
                    const tierOpps = visibleGrouped[tier] ?? [];
                    if (tierOpps.length === 0) return null;
                    return (
                      <div key={tier}>
                        <PriorityGroupHeader priority={tier} count={tierOpps.length} />
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {tierOpps.map((opp, i) => (
                            <OpportunityCard key={opp.id} opp={opp} rank={i} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Flat sorted list when any filter/sort is active */
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {visible.map((opp, i) => (
                    <OpportunityCard key={opp.id} opp={opp} rank={i} />
                  ))}
                </div>
              )}
            </>
          )}

          {/* No data — discovery ran but returned nothing */}
          {!isLoading && !isError && data && !data.hasData && !isUninitialized && (
            <EmptyState weekLabel={data.weekLabel} />
          )}

        </div>
      </div>
    </AppShell>
  );
}

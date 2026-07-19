import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Opportunity {
  id: string;
  title: string;
  description: string;
  opportunityType: string;
  targetEngine: string;
  compositeScore: number;
  priority: string;
  scoreCard: Record<string, unknown>;
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

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCENT        = "#34D399";
const ACCENT_BORDER = "rgba(52,211,153,0.25)";
const ACCENT_DIM    = "rgba(52,211,153,0.12)";
const BG_PAGE       = "#030612";
const BG_CARD       = "rgba(5,16,12,0.9)";

const PRIORITY_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  high:   { color: "#22C55E", label: "High Priority",   icon: "🔥" },
  medium: { color: "#F59E0B", label: "Medium Priority", icon: "⚡" },
  low:    { color: "#8B5CF6", label: "Low Priority",    icon: "💡" },
};

const ENGINE_COLOR: Record<string, string> = {
  content:      "#FB923C",
  optimization: "#00AEEF",
  backlink:     "#38BDF8",
  review:       "#EAB308",
  social:       "#F472B6",
};

const OPPORTUNITY_TYPE_ICON: Record<string, string> = {
  content:       "📝",
  optimization:  "⚙️",
  backlink:      "🔗",
  review:        "⭐",
  social:        "📱",
  keyword:       "🔑",
  visibility:    "👁",
  gap:           "📊",
};

type PriorityFilter = "all" | "high" | "medium" | "low";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

function priorityColor(p: string): string {
  return PRIORITY_CONFIG[p]?.color ?? ACCENT;
}

function engineColor(e: string): string {
  return ENGINE_COLOR[e] ?? "#8B5CF6";
}

function scoreColor(score: number): string {
  if (score >= 70) return "#22C55E";
  if (score >= 40) return "#F59E0B";
  return "#8B5CF6";
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
      <button onClick={onRetry} style={{
        padding: "8px 20px", borderRadius: 9, fontSize: 12, fontWeight: 700,
        background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
        color: "#EF4444", cursor: "pointer",
      }}>
        ↺ Retry
      </button>
    </div>
  );
}

function PriorityGroupHeader({ priority, count }: { priority: string; count: number }) {
  const cfg = PRIORITY_CONFIG[priority] ?? { color: ACCENT, label: priority, icon: "•" };
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, marginBottom: 12, marginTop: 8,
    }}>
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

function OpportunityCard({ opp, rank }: { opp: Opportunity; rank?: number }) {
  const [expanded, setExpanded] = useState(false);
  const pc   = PRIORITY_CONFIG[opp.priority] ?? { color: ACCENT, label: opp.priority, icon: "•" };
  const ec   = engineColor(opp.targetEngine);
  const sc   = scoreColor(opp.compositeScore);
  const icon = OPPORTUNITY_TYPE_ICON[opp.opportunityType] ?? "⚡";

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
        {rank !== undefined && (
          <div style={{
            width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
            background: rank === 0 ? "rgba(234,179,8,0.15)" : rank === 1 ? "rgba(148,163,184,0.1)" : rank === 2 ? "rgba(196,148,90,0.12)" : `${pc.color}12`,
            border: `2px solid ${rank === 0 ? "#EAB308" : rank === 1 ? "#94A3B8" : rank === 2 ? "#C4945A" : pc.color}50`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 800,
            color: rank === 0 ? "#EAB308" : rank === 1 ? "#94A3B8" : rank === 2 ? "#C4945A" : pc.color,
          }}>
            #{rank + 1}
          </div>
        )}
        {rank === undefined && (
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
            {opp.status && (
              <span style={{
                fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                background: "rgba(255,255,255,0.04)", color: "rgba(148,163,184,0.55)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}>{opp.status}</span>
            )}
          </div>
        </div>
        {/* Score badge */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1, color: sc }}>
            {opp.compositeScore}
          </div>
          <div style={{ fontSize: 8, color: "rgba(148,163,184,0.4)", marginTop: 2, letterSpacing: "0.4px" }}>
            SCORE
          </div>
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
          {expanded || opp.description.length <= 140
            ? opp.description
            : `${opp.description.slice(0, 140)}…`}
          {opp.description.length > 140 && (
            <button
              onClick={() => setExpanded(v => !v)}
              style={{
                background: "none", border: "none", color: ACCENT, cursor: "pointer",
                fontSize: 11, fontWeight: 700, padding: "0 0 0 6px",
              }}
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}

      {/* Footer row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: `${ec}90`, letterSpacing: "0.3px", textTransform: "uppercase" }}>
            {opp.opportunityType}
          </span>
          {opp.createdAt && (
            <span style={{ fontSize: 9, color: "rgba(148,163,184,0.4)" }}>
              Discovered {formatDate(opp.createdAt)}
            </span>
          )}
        </div>
        <Link to="/admin/competitor-intelligence">
          <button
            aria-label={`Take action on: ${opp.title}`}
            style={{
              padding: "7px 16px", borderRadius: 8, fontSize: 10, fontWeight: 800,
              cursor: "pointer", background: `${pc.color}0E`, border: `1px solid ${pc.color}30`,
              color: pc.color, letterSpacing: "0.3px", whiteSpace: "nowrap",
            }}
          >
            View in Intelligence →
          </button>
        </Link>
      </div>
    </div>
  );
}

function SummaryBar({
  total, highCount, medCount, lowCount, weekLabel,
}: {
  total: number; highCount: number; medCount: number; lowCount: number; weekLabel?: string;
}) {
  return (
    <div style={{
      display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 20,
    }}>
      {weekLabel && (
        <span style={{
          fontSize: 9, fontWeight: 800, letterSpacing: "0.6px",
          background: ACCENT_DIM, color: ACCENT, border: `1px solid ${ACCENT_BORDER}`,
          borderRadius: 20, padding: "3px 11px",
        }}>
          {weekLabel}
        </span>
      )}
      {[
        { label: `${total} total`,  color: ACCENT },
        { label: `${highCount} high`,   color: "#22C55E" },
        { label: `${medCount} medium`,  color: "#F59E0B" },
        { label: `${lowCount} low`,     color: "#8B5CF6" },
      ].map(({ label, color }) => (
        <span key={label} style={{
          fontSize: 10, fontWeight: 700, color,
          background: `${color}10`, border: `1px solid ${color}25`,
          borderRadius: 20, padding: "3px 11px",
        }}>{label}</span>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EdgeOpportunitiesPage() {
  const apiFetch    = useApiFetch();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<PriorityFilter>("all");

  const { data, isLoading, isError, refetch } = useQuery<OpportunitiesData>({
    queryKey: ["edge-opportunities"],
    queryFn:  () => apiFetch("/api/competitor-intelligence/opportunities?limit=50") as Promise<OpportunitiesData>,
  });

  const opportunities = data?.opportunities ?? [];

  const grouped: Record<string, Opportunity[]> = { high: [], medium: [], low: [] };
  for (const opp of opportunities) {
    const key = opp.priority in grouped ? opp.priority : "low";
    grouped[key].push(opp);
  }

  const visible = filter === "all"
    ? opportunities
    : (grouped[filter] ?? []);

  const FILTERS: { key: PriorityFilter; label: string; count: number; color: string }[] = [
    { key: "all",    label: "All",    count: opportunities.length,   color: ACCENT     },
    { key: "high",   label: "High",   count: grouped.high.length,    color: "#22C55E"  },
    { key: "medium", label: "Medium", count: grouped.medium.length,  color: "#F59E0B"  },
    { key: "low",    label: "Low",    count: grouped.low.length,     color: "#8B5CF6"  },
  ];

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["edge-opportunities"] });
    refetch();
  }

  const isUninitialized = !data?.hasData && data?.reason === "tables_not_initialized";

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

          {/* Uninitialized tables */}
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
              {/* Summary bar */}
              <SummaryBar
                total={opportunities.length}
                highCount={grouped.high.length}
                medCount={grouped.medium.length}
                lowCount={grouped.low.length}
                weekLabel={data.weekLabel}
              />

              {/* Priority filter tabs */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
                {FILTERS.map(f => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    aria-pressed={filter === f.key}
                    style={{
                      padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                      cursor: "pointer",
                      background: filter === f.key ? `${f.color}18` : "rgba(255,255,255,0.03)",
                      border: `1px solid ${filter === f.key ? `${f.color}40` : "rgba(255,255,255,0.08)"}`,
                      color: filter === f.key ? f.color : "rgba(148,163,184,0.55)",
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

              {/* Opportunity list */}
              {visible.length === 0 ? (
                <EmptyState weekLabel={data.weekLabel} />
              ) : filter === "all" ? (
                /* Grouped view when showing all */
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  {(["high", "medium", "low"] as const).map(tier => {
                    const tierOpps = grouped[tier];
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
                /* Flat list when filtering by a single tier */
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {visible.map((opp, i) => (
                    <OpportunityCard key={opp.id} opp={opp} rank={i} />
                  ))}
                </div>
              )}
            </>
          )}

          {/* No data — discovery has run but returned nothing */}
          {!isLoading && !isError && data && !data.hasData && !isUninitialized && (
            <EmptyState weekLabel={data.weekLabel} />
          )}

        </div>
      </div>
    </AppShell>
  );
}

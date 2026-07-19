import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCENT = "#34D399";

const PRIORITY_COLOR: Record<string, string> = {
  high:   "#22C55E",
  medium: "#F59E0B",
  low:    "#8B5CF6",
};

const ENGINE_COLOR: Record<string, string> = {
  content:      "#FB923C",
  optimization: "#00AEEF",
  backlink:     "#38BDF8",
  review:       "#EAB308",
  social:       "#F472B6",
};

const OPPORTUNITY_ICON: Record<string, string> = {
  content:       "📝",
  optimization:  "⚙️",
  backlink:      "🔗",
  review:        "⭐",
  social:        "📱",
  keyword:       "🔑",
  visibility:    "👁",
  gap:           "📊",
};

// ── Card ─────────────────────────────────────────────────────────────────────

function LiveOpportunityCard({ opp }: { opp: Opportunity }) {
  const color = PRIORITY_COLOR[opp.priority] ?? ACCENT;
  const eColor = ENGINE_COLOR[opp.targetEngine] ?? "#8B5CF6";
  const icon = OPPORTUNITY_ICON[opp.opportunityType] ?? "⚡";
  const scoreColor = opp.compositeScore >= 70 ? "#22C55E" : opp.compositeScore >= 40 ? "#F59E0B" : "#8B5CF6";

  return (
    <div style={{
      background: "linear-gradient(160deg, rgba(11,22,41,0.96), rgba(3,6,18,0.88))",
      border: `1px solid ${color}22`,
      borderTop: `2px solid ${color}60`,
      borderRadius: 14,
      padding: "18px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 17, width: 32, height: 32, borderRadius: 9,
            background: `${color}10`, border: `1px solid ${color}22`,
            display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>{icon}</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: "#E2E8F0", lineHeight: 1.3 }}>{opp.title}</span>
        </div>
        <span style={{
          fontSize: 8, fontWeight: 800, color: scoreColor,
          background: `${scoreColor}12`, border: `1px solid ${scoreColor}28`,
          borderRadius: 10, padding: "2px 8px", letterSpacing: "0.6px",
          flexShrink: 0, marginTop: 2,
        }}>{opp.compositeScore} score</span>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 9, fontWeight: 700, color: eColor,
          background: `${eColor}0C`, border: `1px solid ${eColor}20`,
          borderRadius: 10, padding: "2px 8px",
        }}>{opp.targetEngine}</span>
        <span style={{
          fontSize: 9, fontWeight: 700, color: color,
          background: `${color}0C`, border: `1px solid ${color}20`,
          borderRadius: 10, padding: "2px 8px",
        }}>{opp.priority} priority</span>
      </div>

      <div style={{
        fontSize: 11, fontWeight: 700, color: color,
        background: `${color}0C`, border: `1px solid ${color}1A`,
        borderRadius: 8, padding: "7px 11px",
      }}>
        {opp.opportunityType} opportunity · score {opp.compositeScore}/100
      </div>

      {opp.description && (
        <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.55, flex: 1 }}>
          {opp.description.length > 120 ? `${opp.description.slice(0, 120)}…` : opp.description}
        </div>
      )}

      <Link to="/admin/edge-opportunities">
        <button
          aria-label={`View opportunity: ${opp.title}`}
          style={{
            width: "100%", padding: "8px 0", borderRadius: 9, fontSize: 10, fontWeight: 800,
            cursor: "pointer", background: `${color}0E`, border: `1px solid ${color}30`,
            color: color, letterSpacing: "0.3px",
          }}
        >
          View Details →
        </button>
      </Link>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div style={{
      background: "linear-gradient(160deg, rgba(11,22,41,0.96), rgba(3,6,18,0.88))",
      border: "1px solid rgba(52,211,153,0.1)",
      borderRadius: 14, padding: "18px 16px",
      animation: "opcPulse 1.8s ease-in-out infinite",
    }}>
      <div style={{ height: 12, width: "60%", background: "rgba(255,255,255,0.06)", borderRadius: 5, marginBottom: 10 }} />
      <div style={{ height: 9, width: "40%", background: "rgba(255,255,255,0.04)", borderRadius: 4, marginBottom: 6 }} />
      <div style={{ height: 28, background: "rgba(255,255,255,0.04)", borderRadius: 8, marginBottom: 8 }} />
      <div style={{ height: 32, background: "rgba(255,255,255,0.04)", borderRadius: 9 }} />
    </div>
  );
}

function NoDataCard() {
  return (
    <div style={{
      background: "linear-gradient(160deg, rgba(11,22,41,0.96), rgba(3,6,18,0.88))",
      border: "1px dashed rgba(52,211,153,0.2)",
      borderRadius: 14, padding: "20px 16px", textAlign: "center",
      gridColumn: "1 / -1",
    }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>📊</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F0", marginBottom: 5 }}>
        No opportunities scored yet
      </div>
      <div style={{ fontSize: 11, color: "#64748B", marginBottom: 14, lineHeight: 1.5 }}>
        Complete a Discovery scan to surface your highest-impact keyword and market opportunities.
      </div>
      <Link to="/admin/competitor-intelligence">
        <button style={{
          padding: "7px 16px", borderRadius: 9, fontSize: 10, fontWeight: 700,
          background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)",
          color: ACCENT, cursor: "pointer",
        }}>
          Run Discovery →
        </button>
      </Link>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function OpportunityCenter() {
  const apiFetch = useApiFetch();

  const { data, isLoading } = useQuery<OpportunitiesData>({
    queryKey: ["opp-center-preview"],
    queryFn:  () => apiFetch("/api/competitor-intelligence/opportunities?limit=3") as Promise<OpportunitiesData>,
  });

  const topThree = data?.opportunities?.slice(0, 3) ?? [];
  const hasLive  = data?.hasData && topThree.length > 0;
  const total    = data?.count ?? 0;

  return (
    <div role="region" aria-label="Opportunity Center">
      <style>{`@keyframes opcPulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {isLoading && [0, 1, 2].map(i => <SkeletonCard key={i} />)}
        {!isLoading && !hasLive && <NoDataCard />}
        {!isLoading && hasLive && topThree.map(opp => (
          <LiveOpportunityCard key={opp.id} opp={opp} />
        ))}
      </div>

      {!isLoading && hasLive && (
        <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
          <Link to="/admin/edge-opportunities">
            <button style={{
              padding: "7px 16px", borderRadius: 9, fontSize: 10, fontWeight: 800,
              background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)",
              color: ACCENT, cursor: "pointer", letterSpacing: "0.3px",
            }}>
              View all {total > 3 ? `${total} ` : ""}opportunities →
            </button>
          </Link>
        </div>
      )}
    </div>
  );
}

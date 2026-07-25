import { AiInsightsPanel } from "@/components/AiInsightsPanel";
import { useInsights } from "@/lib/insights";
import { Link } from "wouter";

function RecommendedNextAction() {
  const { insights, loading } = useInsights();

  if (loading) return null;

  const top = insights
    .filter(i => i.data_available)
    .sort((a, b) => {
      const rank: Record<string, number> = { critical: 0, warning: 1, opportunity: 2, info: 3 };
      return (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9);
    })[0];

  if (!top) return null;

  const colors: Record<string, string> = {
    critical: "#EF4444", warning: "#F59E0B", opportunity: "#22C55E", info: "#3B82F6",
  };
  const color = colors[top.severity] ?? "#00AEEF";

  return (
    <div style={{
      background: `${color}08`,
      border: `1px solid ${color}25`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 12,
      padding: "14px 18px",
      marginBottom: 14,
      display: "flex", alignItems: "flex-start", gap: 14,
    }}>
      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>🎯</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 4 }}>
          Recommended Next Action
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0", marginBottom: 4 }}>{top.title}</div>
        <div style={{ fontSize: 11, color: "#94A3B8", lineHeight: 1.5 }}>{top.recommended_action}</div>
      </div>
    </div>
  );
}

export function AiExecutiveBrief() {
  return (
    <div style={{ marginBottom: 28 }}>
      <RecommendedNextAction />
      <AiInsightsPanel />
    </div>
  );
}

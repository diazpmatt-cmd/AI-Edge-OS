import { Link } from "wouter";
import type { KpiCardDef, HealthStatus } from "./types";

const STATUS_COLORS: Record<HealthStatus, string> = {
  healthy:          "#22C55E",
  warning:          "#F59E0B",
  critical:         "#EF4444",
  pending:          "#64748B",
  "setup-required": "#334155",
};

function KpiCard({ card }: { card: KpiCardDef }) {
  const accentColor = card.error ? "#EF4444" : STATUS_COLORS[card.status];

  const inner = (
    <div
      role="article"
      aria-label={`${card.label}: ${card.value}`}
      style={{
        background: "linear-gradient(135deg, rgba(11,22,41,0.96), rgba(3,6,18,0.88))",
        border: `1px solid ${accentColor}22`,
        borderTop: `2px solid ${accentColor}55`,
        borderRadius: 14,
        padding: "18px 18px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        cursor: card.link ? "pointer" : "default",
        transition: "border-color 0.15s",
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontSize: 9, fontWeight: 800, color: "#475569",
          textTransform: "uppercase", letterSpacing: "0.9px",
        }}>{card.label}</span>
        {card.setupRequired && (
          <span style={{
            fontSize: 8, fontWeight: 700, color: "#334155",
            background: "rgba(51,65,85,0.3)", border: "1px solid rgba(51,65,85,0.4)",
            borderRadius: 10, padding: "1px 7px", letterSpacing: "0.4px",
          }}>SETUP REQUIRED</span>
        )}
        {card.error && !card.loading && (
          <span style={{
            fontSize: 8, fontWeight: 700, color: "#EF4444",
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
            borderRadius: 10, padding: "1px 7px",
          }}>ERROR</span>
        )}
      </div>

      {card.loading ? (
        <div style={{
          height: 36,
          background: "linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%)",
          borderRadius: 6,
          marginTop: 4,
        }} />
      ) : (
        <div style={{ fontSize: 30, fontWeight: 900, color: accentColor, letterSpacing: "-1px", lineHeight: 1 }}>
          {card.value}
        </div>
      )}

      {!card.loading && card.sub && (
        <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.4 }}>
          {card.sub}
        </div>
      )}

      {!card.loading && card.trend && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: card.trend === "up" ? "#22C55E" : card.trend === "down" ? "#EF4444" : "#64748B",
          }}>
            {card.trend === "up" ? "▲" : card.trend === "down" ? "▼" : "—"}
          </span>
          {card.trendValue && (
            <span style={{ fontSize: 10, color: "#475569" }}>{card.trendValue}</span>
          )}
        </div>
      )}

      {card.link && (
        <div style={{ marginTop: "auto", paddingTop: 6 }}>
          <span style={{ fontSize: 10, color: accentColor, fontWeight: 700 }}>View details →</span>
        </div>
      )}
    </div>
  );

  if (card.link) {
    return <Link to={card.link} style={{ textDecoration: "none" }}>{inner}</Link>;
  }
  return inner;
}

interface Props {
  cards: KpiCardDef[];
}

export function ExecutiveKpiGrid({ cards }: Props) {
  return (
    <div
      role="list"
      aria-label="Executive KPI Row"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 12,
        marginBottom: 24,
      }}
    >
      {cards.map(card => (
        <div key={card.id} role="listitem" style={{ minWidth: 0 }}>
          <KpiCard card={card} />
        </div>
      ))}
    </div>
  );
}

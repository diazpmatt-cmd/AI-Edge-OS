import { Link } from "wouter";
import type { KpiCardDef, HealthStatus } from "./types";

const STATUS_COLORS: Record<HealthStatus, string> = {
  healthy:          "#22C55E",
  warning:          "#F59E0B",
  critical:         "#EF4444",
  pending:          "#64748B",
  "setup-required": "#334155",
};

// ── Package column definitions ────────────────────────────────────────────────
const PACKAGE_COLS = [
  {
    id: "revenue-ops",
    label: "Price Package",
    icon: "💰",
    accent: "#F59E0B",
    bg: "rgba(245,158,11,0.06)",
    border: "rgba(245,158,11,0.28)",
    headerBorder: "rgba(245,158,11,0.45)",
  },
  {
    id: "lead-pipeline",
    label: "A-La-Carte",
    icon: "📞",
    accent: "#F26C21",
    bg: "rgba(242,108,33,0.06)",
    border: "rgba(242,108,33,0.28)",
    headerBorder: "rgba(242,108,33,0.45)",
  },
  {
    id: "market-presence",
    label: "Visibility",
    icon: "📍",
    accent: "#00AEEF",
    bg: "rgba(0,174,239,0.06)",
    border: "rgba(0,174,239,0.25)",
    headerBorder: "rgba(0,174,239,0.4)",
  },
  {
    id: "ai-performance",
    label: "AI Engine",
    icon: "🤖",
    accent: "#8B5CF6",
    bg: "rgba(139,92,246,0.06)",
    border: "rgba(139,92,246,0.25)",
    headerBorder: "rgba(139,92,246,0.4)",
  },
] as const;

// ── Single KPI card ───────────────────────────────────────────────────────────
function KpiCard({ card, colAccent }: { card: KpiCardDef; colAccent: string }) {
  const accentColor = card.error ? "#EF4444" : STATUS_COLORS[card.status];

  const inner = (
    <div
      role="article"
      aria-label={`${card.label}: ${card.value}`}
      style={{
        background: "linear-gradient(135deg, rgba(11,22,41,0.96), rgba(3,6,18,0.88))",
        border: `1px solid ${colAccent}1A`,
        borderTop: `2px solid ${accentColor}66`,
        borderRadius: 12,
        padding: "16px 16px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 5,
        cursor: card.link ? "pointer" : "default",
        transition: "border-color 0.15s, box-shadow 0.15s",
        width: "100%",
        boxSizing: "border-box",
      }}
      onMouseEnter={e => {
        if (card.link) {
          (e.currentTarget as HTMLElement).style.borderColor = `${colAccent}44`;
          (e.currentTarget as HTMLElement).style.boxShadow = `0 0 12px ${colAccent}18`;
        }
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = `${colAccent}1A`;
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
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
          }}>SETUP REQ.</span>
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
          height: 32,
          background: "linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%)",
          borderRadius: 6, marginTop: 2,
        }} />
      ) : (
        <div style={{ fontSize: 26, fontWeight: 900, color: accentColor, letterSpacing: "-0.5px", lineHeight: 1 }}>
          {card.value}
        </div>
      )}

      {!card.loading && card.sub && (
        <div style={{ fontSize: 10.5, color: "#64748B", lineHeight: 1.4 }}>{card.sub}</div>
      )}

      {!card.loading && card.trend && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: card.trend === "up" ? "#22C55E" : card.trend === "down" ? "#EF4444" : "#64748B",
          }}>
            {card.trend === "up" ? "▲" : card.trend === "down" ? "▼" : "—"}
          </span>
          {card.trendValue && <span style={{ fontSize: 9, color: "#475569" }}>{card.trendValue}</span>}
        </div>
      )}

      {card.link && (
        <div style={{ marginTop: "auto", paddingTop: 4 }}>
          <span style={{ fontSize: 9.5, color: accentColor, fontWeight: 700 }}>View details →</span>
        </div>
      )}
    </div>
  );

  if (card.link) {
    return <Link to={card.link} style={{ textDecoration: "none", display: "block" }}>{inner}</Link>;
  }
  return inner;
}

// ── Package column ────────────────────────────────────────────────────────────
function PackageColumn({
  col,
  cards,
}: {
  col: typeof PACKAGE_COLS[number];
  cards: KpiCardDef[];
}) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      flex: "1 1 0",
      minWidth: 0,
      borderRadius: 14,
      border: `1px solid ${col.border}`,
      overflow: "hidden",
    }}>
      {/* Column header */}
      <div style={{
        background: col.bg,
        borderBottom: `1px solid ${col.headerBorder}`,
        padding: "9px 13px",
        display: "flex",
        alignItems: "center",
        gap: 7,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 14, lineHeight: 1 }}>{col.icon}</span>
        <span style={{
          fontSize: 10, fontWeight: 800, color: col.accent,
          letterSpacing: "0.7px", textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}>{col.label}</span>
        <div style={{ flex: 1 }} />
        <div style={{
          width: 7, height: 7, borderRadius: "50%",
          background: col.accent, opacity: 0.7,
          boxShadow: `0 0 6px ${col.accent}`,
        }} />
      </div>

      {/* Cards stacked inside */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "10px 10px",
        background: "rgba(3,6,18,0.45)",
        flex: 1,
      }}>
        {cards.length === 0 ? (
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, color: "#334155", padding: "16px 0",
          }}>
            No metrics
          </div>
        ) : (
          cards.map(card => <KpiCard key={card.id} card={card} colAccent={col.accent} />)
        )}
      </div>
    </div>
  );
}

// ── Main grid ─────────────────────────────────────────────────────────────────
interface Props {
  cards: KpiCardDef[];
}

export function ExecutiveKpiGrid({ cards }: Props) {
  const hasPackages = cards.some(c => c.packageId);

  // Flat fallback (no packageId set) — original behaviour preserved
  if (!hasPackages) {
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
            <KpiCard card={card} colAccent={card.color} />
          </div>
        ))}
      </div>
    );
  }

  // Package column layout
  return (
    <div
      role="list"
      aria-label="Executive KPI Row"
      style={{
        display: "flex",
        flexDirection: "row",
        gap: 10,
        marginBottom: 24,
        alignItems: "stretch",
        flexWrap: "wrap",
      }}
    >
      {PACKAGE_COLS.map(col => {
        const colCards = cards.filter(c => c.packageId === col.id);
        return (
          <div
            key={col.id}
            role="listitem"
            style={{ flex: "1 1 160px", minWidth: 140, display: "flex" }}
          >
            <PackageColumn col={col} cards={colCards} />
          </div>
        );
      })}
    </div>
  );
}

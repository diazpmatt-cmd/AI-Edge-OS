import { Link } from "wouter";

interface Opportunity {
  id: string;
  title: string;
  source: string;
  impact: string;
  effort: "low" | "medium" | "high";
  confidence: "high" | "medium" | "low";
  action: string;
  link: string;
  color: string;
  icon: string;
}

const EFFORT_LABELS: Record<string, string> = { low: "Low effort", medium: "Medium effort", high: "High effort" };
const CONFIDENCE_COLORS: Record<string, string> = { high: "#22C55E", medium: "#F59E0B", low: "#64748B" };

const OPPORTUNITIES: Opportunity[] = [
  {
    id: "missed-calls",
    title: "Missed Call Revenue Recovery",
    source: "Lead Recovery AI",
    impact: "Est. pending baseline data",
    effort: "low",
    confidence: "high",
    action: "Improve SMS text-back automation and appointment booking flow to capture missed opportunities automatically.",
    link: "/admin/lead-recovery",
    color: "#22C55E",
    icon: "📞",
  },
  {
    id: "ai-search",
    title: "AI Search Visibility Gap",
    source: "AI Visibility Scanner",
    impact: "Est. pending scan",
    effort: "medium",
    confidence: "medium",
    action: "Create AI-readable business summaries and service-area city pages to appear in AI-generated search results.",
    link: "/admin/ai-visibility",
    color: "#8B5CF6",
    icon: "✨",
  },
  {
    id: "local-listings",
    title: "Local Directory Expansion",
    source: "Local Presence Engine",
    impact: "Est. pending baseline",
    effort: "low",
    confidence: "high",
    action: "Claim Apple Business Connect and Nextdoor Business listings. Bing Places is publishing — verify in 7–12 days.",
    link: "/admin/local-presence",
    color: "#00AEEF",
    icon: "📍",
  },
  {
    id: "reviews",
    title: "Review Velocity Campaign",
    source: "Reputation Module",
    impact: "Est. pending setup",
    effort: "low",
    confidence: "medium",
    action: "Launch automated post-service review request to increase monthly review count above competitor average.",
    link: "/admin/lead-recovery",
    color: "#F59E0B",
    icon: "⭐",
  },
];

function OpportunityCard({ opp }: { opp: Opportunity }) {
  return (
    <div style={{
      background: "linear-gradient(160deg, rgba(11,22,41,0.96), rgba(3,6,18,0.88))",
      border: `1px solid ${opp.color}1E`,
      borderTop: `2px solid ${opp.color}50`,
      borderRadius: 14,
      padding: "18px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>{opp.icon}</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: "#E2E8F0" }}>{opp.title}</span>
        </div>
        <span style={{
          fontSize: 8, fontWeight: 700, color: CONFIDENCE_COLORS[opp.confidence],
          background: `${CONFIDENCE_COLORS[opp.confidence]}12`, border: `1px solid ${CONFIDENCE_COLORS[opp.confidence]}25`,
          borderRadius: 10, padding: "2px 8px", letterSpacing: "0.5px", textTransform: "uppercase",
          flexShrink: 0,
        }}>{opp.confidence} confidence</span>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 9, fontWeight: 700, color: "#64748B",
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 10, padding: "2px 8px",
        }}>{opp.source}</span>
        <span style={{
          fontSize: 9, fontWeight: 700, color: "#64748B",
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 10, padding: "2px 8px",
        }}>{EFFORT_LABELS[opp.effort]}</span>
      </div>

      <div style={{
        fontSize: 11, fontWeight: 700, color: opp.color,
        background: `${opp.color}0C`, border: `1px solid ${opp.color}18`,
        borderRadius: 8, padding: "6px 10px",
      }}>
        {opp.impact}
      </div>

      <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.55, flex: 1 }}>{opp.action}</div>

      <Link to={opp.link}>
        <button
          aria-label={`Start: ${opp.title}`}
          style={{
            width: "100%", padding: "7px 0", borderRadius: 8, fontSize: 11, fontWeight: 700,
            cursor: "pointer", background: `${opp.color}0E`, border: `1px solid ${opp.color}30`,
            color: opp.color,
          }}
        >
          Open Module →
        </button>
      </Link>
    </div>
  );
}

export function OpportunityCenter() {
  return (
    <div role="region" aria-label="Opportunity Center">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {OPPORTUNITIES.map(opp => (
          <OpportunityCard key={opp.id} opp={opp} />
        ))}
      </div>
    </div>
  );
}

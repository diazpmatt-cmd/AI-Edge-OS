import { Link } from "wouter";
import { useSocialPostsQuery } from "@/hooks/useSocialPostsQuery";
import { useLeadsQuery } from "@/hooks/useLeadsQuery";
import { useCallIntelligenceQuery } from "@/hooks/useCallIntelligenceQuery";

const URGENCY_CONFIG = {
  urgent:     { label: "Urgent",     color: "#EF4444", bg: "rgba(239,68,68,0.1)",  border: "rgba(239,68,68,0.25)"  },
  today:      { label: "Today",      color: "#F59E0B", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)" },
  "this-week":{ label: "This Week",  color: "#3B82F6", bg: "rgba(59,130,246,0.1)", border: "rgba(59,130,246,0.25)" },
};

const IMPACT_COLORS = { high: "#22C55E", medium: "#F59E0B", low: "#64748B" };

interface ActionItemProps {
  icon: string;
  title: string;
  reason: string;
  impact: "high" | "medium" | "low";
  urgency: keyof typeof URGENCY_CONFIG;
  module: string;
  link: string;
  isPrimary?: boolean;
}

function ActionItemCard({ icon, title, reason, impact, urgency, module: mod, link, isPrimary }: ActionItemProps) {
  const u = URGENCY_CONFIG[urgency];
  return (
    <div style={{
      background: isPrimary
        ? "linear-gradient(135deg, rgba(0,174,239,0.08), rgba(3,6,18,0.9))"
        : "rgba(11,22,41,0.7)",
      border: isPrimary ? "1px solid rgba(0,174,239,0.25)" : "1px solid rgba(255,255,255,0.06)",
      borderRadius: 12, padding: "14px 16px",
      display: "flex", alignItems: "flex-start", gap: 12,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: isPrimary ? "rgba(0,174,239,0.12)" : "rgba(255,255,255,0.04)",
        border: isPrimary ? "1px solid rgba(0,174,239,0.25)" : "1px solid rgba(255,255,255,0.07)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16,
      }}>{icon}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>{title}</span>
          {isPrimary && (
            <span style={{
              fontSize: 8, fontWeight: 800, color: "#00AEEF",
              background: "rgba(0,174,239,0.12)", border: "1px solid rgba(0,174,239,0.3)",
              borderRadius: 10, padding: "1px 7px", letterSpacing: "0.5px", textTransform: "uppercase",
            }}>Next Best Action</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8, lineHeight: 1.4 }}>{reason}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 9, fontWeight: 700, color: u.color, background: u.bg, border: `1px solid ${u.border}`,
            borderRadius: 10, padding: "1px 8px", textTransform: "uppercase", letterSpacing: "0.5px",
          }}>{u.label}</span>
          <span style={{
            fontSize: 9, fontWeight: 700, color: IMPACT_COLORS[impact],
            background: `${IMPACT_COLORS[impact]}10`, border: `1px solid ${IMPACT_COLORS[impact]}25`,
            borderRadius: 10, padding: "1px 8px", textTransform: "uppercase", letterSpacing: "0.5px",
          }}>{impact} impact</span>
          <span style={{ fontSize: 9, color: "#334155", fontWeight: 600 }}>{mod}</span>
        </div>
      </div>

      <Link to={link} style={{ flexShrink: 0 }}>
        <button
          aria-label={`Action: ${title}`}
          style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
            background: isPrimary ? "rgba(0,174,239,0.15)" : "rgba(255,255,255,0.04)",
            border: isPrimary ? "1px solid rgba(0,174,239,0.35)" : "1px solid rgba(255,255,255,0.08)",
            color: isPrimary ? "#00AEEF" : "#64748B",
            whiteSpace: "nowrap",
          }}
        >
          Go →
        </button>
      </Link>
    </div>
  );
}

export function ActionCenter() {
  const { data: postsData, isLoading: postsLoading } = useSocialPostsQuery();
  const { data: leadsData, isLoading: leadsLoading } = useLeadsQuery();
  const { data: ciData, isLoading: ciLoading } = useCallIntelligenceQuery("30days");

  const loading = postsLoading || leadsLoading || ciLoading;

  const pendingPosts = (postsData ?? []).filter(p => p.status === "generated" || p.status === "draft");
  const newLeads = (leadsData?.leads ?? []).filter(l => l.status === "new" || l.status === "active").slice(0, 3);
  const missedCalls = ciData?.metrics?.missed_calls ?? 0;

  type ActionItem = {
    icon: string;
    title: string;
    reason: string;
    impact: "high" | "medium" | "low";
    urgency: keyof typeof URGENCY_CONFIG;
    module: string;
    link: string;
  };

  const actions: ActionItem[] = [];

  if (missedCalls > 0) {
    actions.push({
      icon: "📞",
      title: `${missedCalls} Missed Call${missedCalls !== 1 ? "s" : ""} Need Recovery`,
      reason: `Lead Recovery AI detected ${missedCalls} unanswered call${missedCalls !== 1 ? "s" : ""}. Follow up now to maximize conversion.`,
      impact: "high",
      urgency: "urgent",
      module: "Lead Recovery",
      link: "/admin/lead-recovery",
    });
  }

  if (pendingPosts.length > 0) {
    actions.push({
      icon: "📸",
      title: `${pendingPosts.length} Post${pendingPosts.length !== 1 ? "s" : ""} Awaiting Approval`,
      reason: "AI-generated content is ready to review and schedule across your connected platforms.",
      impact: "medium",
      urgency: "today",
      module: "Publishing Center",
      link: "/admin/social-publishing",
    });
  }

  if (newLeads.length > 0) {
    actions.push({
      icon: "🎯",
      title: `${newLeads.length} New Lead${newLeads.length !== 1 ? "s" : ""} in Pipeline`,
      reason: "New leads captured and ready for qualification or direct outreach.",
      impact: "high",
      urgency: "today",
      module: "Lead Recovery",
      link: "/admin/lead-recovery",
    });
  }

  actions.push({
    icon: "📍",
    title: "Complete Local Presence Setup",
    reason: "Apple Business Connect and Nextdoor Business listings are pending. Complete setup to maximize local visibility.",
    impact: "medium",
    urgency: "this-week",
    module: "Local Presence",
    link: "/admin/local-presence",
  });

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            height: 82,
            background: "linear-gradient(90deg, rgba(255,255,255,0.025) 25%, rgba(255,255,255,0.045) 50%, rgba(255,255,255,0.025) 75%)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12,
          }} />
        ))}
      </div>
    );
  }

  if (actions.length === 0) {
    return (
      <div style={{
        background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.15)",
        borderRadius: 12, padding: "32px 20px", textAlign: "center",
      }}>
        <div style={{ fontSize: 24, marginBottom: 10 }}>✅</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#22C55E", marginBottom: 6 }}>All clear</div>
        <div style={{ fontSize: 12, color: "#475569" }}>No pending actions right now. Great work!</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {actions.map((a, i) => (
        <ActionItemCard key={i} {...a} isPrimary={i === 0} />
      ))}
    </div>
  );
}

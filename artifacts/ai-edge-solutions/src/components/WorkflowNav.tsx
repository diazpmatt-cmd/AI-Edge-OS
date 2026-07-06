// ── BB&B Growth OS — Workflow Navigator ──────────────────────────────────────
// Shows the 7-step daily operating workflow with current step highlighted.
// Drop anywhere inside a BB&B page (no AppShell dependency).

import { Link, useLocation } from "wouter";

const STEPS = [
  { key: "morning-brief",     icon: "☀️", label: "Morning Brief",     route: "/admin/morning-brief"     },
  { key: "mission-control",   icon: "🚀", label: "Mission Control",   route: "/admin/mission-control"   },
  { key: "content-autopilot", icon: "⚡", label: "Content Autopilot", route: "/admin/bbb-autopilot"     },
  { key: "media-engine",      icon: "🎥", label: "Media Engine",      route: "/admin/media-engine"      },
  { key: "publishing",        icon: "✈",  label: "Publishing",        route: "/admin/social-publishing" },
  { key: "growth-execution",  icon: "🎯", label: "Growth Execution",  route: "/admin/bbb-execution"     },
  { key: "apollos",           icon: "🧠", label: "Apollos",           route: "/admin/apollos"           },
] as const;

export function WorkflowNav() {
  const [location] = useLocation();

  const currentIdx = STEPS.findIndex(s => location.startsWith(s.route));
  const nextStep   = currentIdx >= 0 && currentIdx < STEPS.length - 1 ? STEPS[currentIdx + 1] : null;

  return (
    <div style={{
      background: "rgba(255,255,255,0.02)",
      border:     "1px solid rgba(255,255,255,0.06)",
      borderRadius: 12, padding: "9px 14px", marginBottom: 18,
      display: "flex", alignItems: "center", gap: 2,
      overflowX: "auto" as const, scrollbarWidth: "none" as const,
    }}>
      {STEPS.map((step, idx) => {
        const isCurrent = currentIdx === idx;
        const isPast    = currentIdx > idx;
        const isNext    = currentIdx + 1 === idx;

        return (
          <div key={step.key} style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
            {idx > 0 && (
              <span style={{ color: "rgba(255,255,255,0.12)", fontSize: 9, padding: "0 2px" }}>›</span>
            )}
            <Link
              to={step.route}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 9px", borderRadius: 7, textDecoration: "none",
                fontSize: 10.5, fontWeight: isCurrent ? 800 : 600,
                background: isCurrent
                  ? "linear-gradient(135deg, rgba(242,108,33,0.18) 0%, rgba(0,119,182,0.12) 100%)"
                  : isNext
                  ? "rgba(255,255,255,0.03)"
                  : "transparent",
                border: isCurrent
                  ? "1px solid rgba(242,108,33,0.4)"
                  : isNext
                  ? "1px solid rgba(255,255,255,0.08)"
                  : "1px solid transparent",
                color: isCurrent
                  ? "#F26C21"
                  : isPast
                  ? "#22C55E"
                  : isNext
                  ? "#94A3B8"
                  : "#475569",
                transition: "all 0.15s",
              }}
            >
              <span style={{ fontSize: 12 }}>{step.icon}</span>
              <span>{step.label}</span>
              {isPast && <span style={{ fontSize: 9, color: "#22C55E", marginLeft: 1 }}>✓</span>}
            </Link>
          </div>
        );
      })}

      {/* Next step shortcut — right-aligned */}
      {nextStep && (
        <Link
          to={nextStep.route}
          style={{
            marginLeft: "auto", flexShrink: 0,
            display: "flex", alignItems: "center", gap: 5,
            padding: "4px 12px", borderRadius: 7, textDecoration: "none",
            fontSize: 10.5, fontWeight: 700, color: "#F26C21",
            background: "rgba(242,108,33,0.07)",
            border: "1px solid rgba(242,108,33,0.22)",
            transition: "all 0.15s",
            whiteSpace: "nowrap" as const,
          }}
        >
          Next: {nextStep.icon} {nextStep.label} →
        </Link>
      )}
    </div>
  );
}

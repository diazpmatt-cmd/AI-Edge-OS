import { useState, type ReactNode } from "react";

interface Props {
  id: string;
  title: string;
  accentColor?: string;
  defaultExpanded?: boolean;
  right?: ReactNode;
  children: ReactNode;
}

export function DashboardSection({ id, title, accentColor, defaultExpanded = true, right, children }: Props) {
  const [expanded, setExpanded] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(`cc-section-${id}`);
      return stored === null ? defaultExpanded : stored === "true";
    } catch {
      return defaultExpanded;
    }
  });

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    try { localStorage.setItem(`cc-section-${id}`, String(next)); } catch { /* ignore */ }
  };

  const titleColor = accentColor ?? "#475569";
  const dividerColor = accentColor
    ? `linear-gradient(90deg, ${accentColor}40 0%, ${accentColor}10 40%, transparent 100%)`
    : "rgba(255,255,255,0.05)";

  return (
    <div style={{ marginBottom: 28 }} role="region" aria-label={title}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: expanded ? 16 : 0 }}>
        <button
          onClick={toggle}
          aria-expanded={expanded}
          aria-controls={`cc-section-body-${id}`}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            background: "none", border: "none", cursor: "pointer", padding: 0,
          }}
        >
          {accentColor && (
            <span style={{
              width: 3, height: 14, borderRadius: 2,
              background: accentColor,
              boxShadow: `0 0 6px ${accentColor}80`,
              flexShrink: 0,
              display: "inline-block",
            }} />
          )}
          <span style={{
            fontSize: 10, color: accentColor ? `${accentColor}99` : "#475569",
            transition: "transform 0.2s",
            display: "inline-block", transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
          }}>▾</span>
          <span style={{
            fontSize: 11, fontWeight: 800,
            color: titleColor,
            letterSpacing: "1.1px", textTransform: "uppercase", whiteSpace: "nowrap",
          }}>
            {title}
          </span>
        </button>
        <div style={{ flex: 1, height: 1, background: dividerColor }} />
        {right}
      </div>

      {expanded && (
        <div id={`cc-section-body-${id}`}>
          {children}
        </div>
      )}
    </div>
  );
}

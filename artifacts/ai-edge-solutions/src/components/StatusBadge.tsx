/**
 * Global status color system — AI Edge Solutions
 *
 * GREEN  #22C55E — success / connected / published / healthy / won / booked
 * YELLOW #F59E0B — warning / pending / scheduled / sms_sent / contacted
 * RED    #EF4444 — failed / error / blocked / missed / lost
 * BLUE   #3B82F6 — active / processing / selected / live / new / in_progress / qualified
 * GRAY   #6B7280 — disabled / coming soon / unmatched / neutral
 * LAVENDER #C4B5FD — draft (special exception)
 */

import React from "react";

export type StatusKey =
  | "active" | "live" | "connected" | "healthy" | "enabled" | "published"
  | "verified" | "won" | "booked" | "responded" | "completed" | "success"
  | "pending" | "scheduled" | "warning" | "sms_sent" | "contacted" | "partial"
  | "needs_action" | "verification_pending"
  | "failed" | "error" | "missed" | "lost" | "blocked" | "critical"
  | "new" | "processing" | "selected" | "in_progress" | "qualified" | "running"
  | "monitoring" | "transferred"
  | "disabled" | "coming_soon" | "unmatched" | "paused" | "gray"
  | "draft";

interface StatusMeta { label: string; color: string; bg: string; border: string }

export const STATUS_COLORS: Record<string, StatusMeta> = {
  active:               { label: "Active",               color: "#3B82F6", bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.25)"  },
  live:                 { label: "Live",                  color: "#3B82F6", bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.25)"  },
  connected:            { label: "Connected",             color: "#22C55E", bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.25)"   },
  healthy:              { label: "Healthy",               color: "#22C55E", bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.25)"   },
  enabled:              { label: "Enabled",               color: "#22C55E", bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.25)"   },
  published:            { label: "Published",             color: "#22C55E", bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.25)"   },
  verified:             { label: "Verified",              color: "#22C55E", bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.25)"   },
  won:                  { label: "Won ✓",                 color: "#22C55E", bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.25)"   },
  booked:               { label: "Booked",                color: "#22C55E", bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.25)"   },
  responded:            { label: "Responded",             color: "#3B82F6", bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.25)"  },
  completed:            { label: "Completed",             color: "#22C55E", bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.25)"   },
  success:              { label: "Success",               color: "#22C55E", bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.25)"   },
  pending:              { label: "Pending",               color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.25)"  },
  scheduled:            { label: "Scheduled",             color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.25)"  },
  warning:              { label: "Warning",               color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.25)"  },
  sms_sent:             { label: "SMS Sent",              color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.25)"  },
  contacted:            { label: "Contacted",             color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.25)"  },
  partial:              { label: "Partial",               color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.25)"  },
  needs_action:         { label: "Needs Action",          color: "#EF4444", bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.25)"   },
  verification_pending: { label: "Verification Pending",  color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.25)"  },
  failed:               { label: "Failed",                color: "#EF4444", bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.25)"   },
  error:                { label: "Error",                 color: "#EF4444", bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.25)"   },
  missed:               { label: "Missed",                color: "#EF4444", bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.25)"   },
  lost:                 { label: "Lost",                  color: "#EF4444", bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.25)"   },
  blocked:              { label: "Blocked",               color: "#EF4444", bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.25)"   },
  critical:             { label: "Critical",              color: "#EF4444", bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.25)"   },
  new:                  { label: "New",                   color: "#3B82F6", bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.25)"  },
  processing:           { label: "Processing",            color: "#3B82F6", bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.25)"  },
  selected:             { label: "Selected",              color: "#3B82F6", bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.25)"  },
  in_progress:          { label: "In Progress",           color: "#3B82F6", bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.25)"  },
  qualified:            { label: "Qualified",             color: "#3B82F6", bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.25)"  },
  running:              { label: "Running",               color: "#3B82F6", bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.25)"  },
  monitoring:           { label: "Monitoring",            color: "#3B82F6", bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.25)"  },
  transferred:          { label: "Transferred",           color: "#22C55E", bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.25)"   },
  disabled:             { label: "Disabled",              color: "#6B7280", bg: "rgba(107,114,128,0.12)", border: "rgba(107,114,128,0.25)" },
  coming_soon:          { label: "Coming Soon",           color: "#6B7280", bg: "rgba(107,114,128,0.12)", border: "rgba(107,114,128,0.25)" },
  unmatched:            { label: "Unmatched",             color: "#6B7280", bg: "rgba(107,114,128,0.12)", border: "rgba(107,114,128,0.25)" },
  paused:               { label: "Paused",                color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.25)"  },
  gray:                 { label: "—",                     color: "#6B7280", bg: "rgba(107,114,128,0.12)", border: "rgba(107,114,128,0.25)" },
  draft:                { label: "Draft",                 color: "#C4B5FD", bg: "rgba(196,181,253,0.12)", border: "rgba(196,181,253,0.25)" },
  pending_review:       { label: "Pending Review",        color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.25)"  },
  approved:             { label: "Approved",              color: "#22C55E", bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.25)"   },
  rejected:             { label: "Rejected",              color: "#EF4444", bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.25)"   },
};

type Variant = "pill" | "dot" | "text";

interface StatusBadgeProps {
  status: string;
  label?: string;
  variant?: Variant;
  size?: "xs" | "sm" | "md";
  uppercase?: boolean;
}

export function StatusBadge({
  status,
  label,
  variant = "pill",
  size = "sm",
  uppercase = true,
}: StatusBadgeProps) {
  const meta = STATUS_COLORS[status] ?? {
    label: status,
    color: "#6B7280",
    bg: "rgba(107,114,128,0.12)",
    border: "rgba(107,114,128,0.25)",
  };
  const displayLabel = label ?? meta.label;
  const fontSize = size === "xs" ? 10 : size === "sm" ? 11 : 12;

  if (variant === "dot") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
        <span style={{ fontSize, fontWeight: 700, color: meta.color }}>{displayLabel}</span>
      </span>
    );
  }

  if (variant === "text") {
    return (
      <span style={{ fontSize, fontWeight: 700, color: meta.color }}>
        {displayLabel}
      </span>
    );
  }

  return (
    <span style={{
      display: "inline-block",
      fontSize,
      fontWeight: 800,
      color: meta.color,
      background: meta.bg,
      border: `1px solid ${meta.border}`,
      borderRadius: 20,
      padding: size === "xs" ? "1px 7px" : "3px 10px",
      textTransform: uppercase ? "uppercase" : undefined,
      letterSpacing: uppercase ? "0.5px" : undefined,
      whiteSpace: "nowrap",
    }}>
      {displayLabel}
    </span>
  );
}

export function getStatusColor(status: string): string {
  return STATUS_COLORS[status]?.color ?? "#6B7280";
}

export function getStatusMeta(status: string): StatusMeta {
  return STATUS_COLORS[status] ?? {
    label: status,
    color: "#6B7280",
    bg: "rgba(107,114,128,0.12)",
    border: "rgba(107,114,128,0.25)",
  };
}

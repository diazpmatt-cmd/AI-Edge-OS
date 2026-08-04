import { useLayoutEffect, useRef } from "react";
import type { SocialProvider } from "@/lib/social-providers";

// ── PlatformStateChip ────────────────────────────────────────────────────────
// Small inline badge showing a platform's current publishing availability.
// Used in Publishing Center and Content Autopilot.
//
// COLOR RULES — Canonical Status Color System
// ─────────────────────────────────────────────
// Platform selection and operational readiness are separate signals:
//
// UNSELECTED     White / neutral — available but not chosen for this post
// SELECTED       Green (#22C55E) — chosen for this post
// READY CHIP     Green (#22C55E) — connected + publishing works
// WARNING CHIP   Yellow (#F59E0B) — demo, pending approval, or needs attention
// BLOCKED CHIP   Red (#EF4444) — disconnected, failed, or unavailable
// COMING SOON    Gray (#94A3B8) — disabled / roadmap / not yet released

// ── Canonical Status Color Map ────────────────────────────────────────────────
// Import this in any page that needs to derive card/border/badge colors.
// Never derive colors from provider.color or p.color on status-bearing elements.

export const PLATFORM_STATUS_COLORS = {
  ready: {
    color:  "#22C55E",
    bg:     "rgba(34,197,94,0.08)",
    border: "rgba(34,197,94,0.2)",
    dot:    "#22C55E",
    label:  "Ready",
  },
  action_required: {
    color:  "#F59E0B",
    bg:     "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.2)",
    dot:    "#F59E0B",
    label:  "Action Required",
  },
  blocked: {
    color:  "#EF4444",
    bg:     "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.2)",
    dot:    "#EF4444",
    label:  "Blocked",
  },
  pending: {
    color:  "#94A3B8",
    bg:     "rgba(100,116,139,0.06)",
    border: "rgba(100,116,139,0.15)",
    dot:    "#64748B",
    label:  "Coming Soon",
  },
} as const;

export type PlatformUIState =
  | "ready"        // operational + connected + publish capable
  | "disconnected" // operational but not connected in the DB  → BLOCKED
  | "pending"      // pending_approval / demo                   → WARNING
  | "coming_soon"; // no publish pipeline yet                   → COMING SOON

// Map PlatformUIState strings to canonical status keys.
const UI_STATE_TO_STATUS: Record<PlatformUIState, keyof typeof PLATFORM_STATUS_COLORS> = {
  ready:        "ready",
  disconnected: "blocked",
  pending:      "action_required",
  coming_soon:  "pending",
};

const STATE_LABEL: Record<PlatformUIState, string> = {
  ready:        "Ready",
  disconnected: "Disconnected",
  pending:      "Pending Approval",
  coming_soon:  "Coming Soon",
};

interface Props {
  state: PlatformUIState;
  showConnectLink?: boolean;  // renders a "→ Connect" link when state === "disconnected"
  size?: "xs" | "sm";
}

export function PlatformStateChip({ state, showConnectLink = false, size = "xs" }: Props) {
  const chipRef = useRef<HTMLSpanElement>(null);
  const statusKey = UI_STATE_TO_STATUS[state];
  const m = PLATFORM_STATUS_COLORS[statusKey];
  const label = STATE_LABEL[state];
  const fs = size === "xs" ? 9 : 10.5;

  // Mark the shared parent with readiness and selection state. The Publishing
  // Center's selected inline background is green; neutral buttons use white.
  // Comparing the exact selected token avoids treating every neutral button as
  // selected when its opacity changes.
  useLayoutEffect(() => {
    const parent = chipRef.current?.parentElement;
    if (!parent) return;

    parent.dataset.platformState = state;

    const button = parent.querySelector(":scope > button") as HTMLButtonElement | null;
    if (!button) {
      delete parent.dataset.platformSelected;
      return;
    }

    const background = button.style.background.replace(/\s/g, "").toLowerCase();
    const isSelected = background === "rgba(34,197,94,0.18)";
    parent.dataset.platformSelected = String(isSelected);
  });

  return (
    <span
      ref={chipRef}
      className="platform-state-chip"
      data-platform-state={state}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        fontSize: fs, fontWeight: 700, letterSpacing: "0.25px",
        color: m.color,
        background: m.bg,
        border: `1px solid ${m.border}`,
        borderRadius: 6, padding: size === "xs" ? "1px 6px" : "2px 8px",
        whiteSpace: "nowrap" as const,
        verticalAlign: "middle",
      }}
    >
      <span style={{
        width: 5, height: 5, borderRadius: "50%",
        background: m.color, flexShrink: 0,
      }} />
      {label}
      {showConnectLink && state === "disconnected" && (
        <a
          href="/admin/connections"
          style={{ color: "#00AEEF", textDecoration: "none", fontWeight: 800, marginLeft: 2 }}
          onClick={e => e.stopPropagation()}
        >
          → Connect
        </a>
      )}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function resolvePlatformUIState(
  provider: SocialProvider,
  isConnected: boolean,
): PlatformUIState {
  if (provider.status === "pending_approval") return "pending";
  if (provider.status === "coming_soon")      return "coming_soon";
  if (isConnected)                            return "ready";
  return "disconnected";
}

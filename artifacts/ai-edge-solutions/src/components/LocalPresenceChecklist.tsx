import { useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Config types
// ─────────────────────────────────────────────────────────────────────────────

export type ChannelStatus   = "connected" | "pending" | "not_started" | "needs_action";
export type ChannelPriority = "high" | "medium" | "low";
export type ChannelCategory = "Search" | "Maps" | "Social" | "Directory";

export type PresenceChannel = {
  id:             string;
  name:           string;
  icon:           string;
  category:       ChannelCategory;
  status:         ChannelStatus;
  priority:       ChannelPriority;
  why_it_matters: string;
  next_action:    string;
  action_url?:    string;
  setup_time?:    string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Static channel config
// Statuses reflect current setup state — NOT analytics or performance data.
// Google's status is passed in as a prop (live from API).
// ─────────────────────────────────────────────────────────────────────────────

const BASE_CHANNELS: PresenceChannel[] = [
  {
    id:             "google",
    name:           "Google Business Profile",
    icon:           "🟢",
    category:       "Search",
    status:         "connected",        // overridden by gbpConnected prop
    priority:       "high",
    why_it_matters: "Google handles ~90% of local searches. A complete GBP profile is the single highest-ROI local visibility action for any service business.",
    next_action:    "Verify NAP data, add pest control photos, enable messaging.",
    action_url:     "https://business.google.com",
    setup_time:     "Done",
  },
  {
    id:             "apple",
    name:           "Apple Business Connect",
    icon:           "🍎",
    category:       "Maps",
    status:         "pending",
    priority:       "high",
    why_it_matters: "Apple Maps is the default navigator for all iPhone users — over 500M devices. Baldwin County has a high iPhone share. Unclaimed listings show generic placeholder data.",
    next_action:    "Complete place card claim at register.apple.com. Estimated 1–5 business days for approval.",
    action_url:     "https://register.apple.com/placesonmaps",
    setup_time:     "~30 min",
  },
  {
    id:             "bing",
    name:           "Bing Places",
    icon:           "🔷",
    category:       "Search",
    status:         "pending",
    priority:       "high",
    why_it_matters: "Bing powers ~27% of US desktop searches and all Microsoft Edge, Cortana, and Alexa local results. Can be imported directly from Google in ~15 minutes.",
    next_action:    "Complete verification in Bing Places. Import directly from your Google listing to save time.",
    action_url:     "https://www.bingplaces.com",
    setup_time:     "~15 min",
  },
  {
    id:             "nextdoor",
    name:           "Nextdoor Business",
    icon:           "🏘",
    category:       "Social",
    status:         "pending",
    priority:       "high",
    why_it_matters: "Nextdoor reaches hyperlocal neighborhood feeds. Pest control is one of the top service categories recommended by neighbors. Word-of-mouth amplification is built in.",
    next_action:    "Claim your business page at business.nextdoor.com. Verify with your business address.",
    action_url:     "https://business.nextdoor.com",
    setup_time:     "~20 min",
  },
  {
    id:             "facebook",
    name:           "Facebook",
    icon:           "📘",
    category:       "Social",
    status:         "connected",
    priority:       "medium",
    why_it_matters: "Facebook Business page enables local ads targeting, customer reviews, and Messenger lead capture. Also feeds Facebook Maps / local search.",
    next_action:    "Add service categories, update hours, and enable Messenger auto-reply for new inquiries.",
    action_url:     "https://business.facebook.com",
    setup_time:     "Done",
  },
  {
    id:             "instagram",
    name:           "Instagram",
    icon:           "📸",
    category:       "Social",
    status:         "connected",
    priority:       "medium",
    why_it_matters: "Instagram reaches younger homeowners and renters in coastal Alabama. Geo-tagged pest control before/after posts perform well in local Explore feeds.",
    next_action:    "Add Baldwin County location to profile. Begin monthly before/after treatment posts.",
    action_url:     "https://www.instagram.com",
    setup_time:     "Done",
  },
  {
    id:             "yelp",
    name:           "Yelp",
    icon:           "⭐",
    category:       "Directory",
    status:         "not_started",
    priority:       "medium",
    why_it_matters: "Yelp is heavily indexed by Google for service searches. A claimed and reviewed Yelp profile captures high-intent searchers comparing pest control providers.",
    next_action:    "Claim your Yelp listing at biz.yelp.com. Add photos and respond to any existing reviews.",
    action_url:     "https://biz.yelp.com",
    setup_time:     "~20 min",
  },
  {
    id:             "angi",
    name:           "Angi (Angie's List)",
    icon:           "🔨",
    category:       "Directory",
    status:         "not_started",
    priority:       "high",
    why_it_matters: "Angi is a leading home services directory for pest control leads. GorillaDesk lead data shows 'Angi's Leads' as an existing source — a claimed profile increases bid quality.",
    next_action:    "Create or claim your Angi Pro profile at pro.angi.com. Match your NAP exactly to GorillaDesk records.",
    action_url:     "https://pro.angi.com",
    setup_time:     "~30 min",
  },
  {
    id:             "thumbtack",
    name:           "Thumbtack",
    icon:           "📌",
    category:       "Directory",
    status:         "not_started",
    priority:       "medium",
    why_it_matters: "Thumbtack drives high-intent quote requests for pest control. Competitive in Baldwin County with strong mobile usage from renters and seasonal homeowners.",
    next_action:    "Create a Thumbtack Pro profile at thumbtack.com/pro. Set your service area to Baldwin County cities.",
    action_url:     "https://www.thumbtack.com/pro",
    setup_time:     "~25 min",
  },
  {
    id:             "youtube",
    name:           "YouTube",
    icon:           "▶",
    category:       "Social",
    status:         "not_started",
    priority:       "low",
    why_it_matters: "YouTube is the #2 search engine. Educational pest control videos (bed bug identification, treatment process) build trust and rank in Google Search for informational queries.",
    next_action:    "Create a branded YouTube channel. Start with a 2-minute 'What to expect at your first bed bug treatment' video.",
    action_url:     "https://www.youtube.com",
    setup_time:     "~1 hr",
  },
  {
    id:             "waze",
    name:           "Waze",
    icon:           "🗺",
    category:       "Maps",
    status:         "not_started",
    priority:       "low",
    why_it_matters: "Waze powers local ads for drivers in service areas. Pins on Waze show during commute hours and can display promotions to nearby drivers.",
    next_action:    "Add your business to Waze at business.waze.com after GBP is fully optimized.",
    action_url:     "https://business.waze.com",
    setup_time:     "~15 min",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Style maps
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<ChannelStatus, {
  label: string; color: string; bg: string; border: string; dot: string;
}> = {
  connected:    { label: "Connected",      color: "#22C55E", bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.25)",   dot: "#22C55E" },
  pending:      { label: "Setup Pending",  color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.25)",  dot: "#F59E0B" },
  not_started:  { label: "Not Started",    color: "#64748B", bg: "rgba(71,85,105,0.15)",   border: "rgba(71,85,105,0.2)",    dot: "#475569" },
  needs_action: { label: "Needs Action",   color: "#EF4444", bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.25)",   dot: "#EF4444" },
};

const PRIORITY_STYLE: Record<ChannelPriority, { label: string; color: string; bg: string }> = {
  high:   { label: "High",   color: "#EF4444", bg: "rgba(239,68,68,0.1)"   },
  medium: { label: "Medium", color: "#F59E0B", bg: "rgba(245,158,11,0.1)"  },
  low:    { label: "Low",    color: "#475569", bg: "rgba(71,85,105,0.12)"  },
};

const CATEGORY_COLOR: Record<ChannelCategory, string> = {
  Search:    "#00AEEF",
  Maps:      "#22C55E",
  Social:    "#3B82F6",
  Directory: "#F59E0B",
};

const ALL_CATEGORIES: ChannelCategory[] = ["Search", "Maps", "Social", "Directory"];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  gbpConnected?: boolean;
};

export function LocalPresenceChecklist({ gbpConnected = false }: Props) {
  const [activeCategory, setActiveCategory] = useState<"all" | ChannelCategory>("all");
  const [expandedId,     setExpandedId]     = useState<string | null>(null);

  // Apply live GBP status to the config
  const channels: PresenceChannel[] = BASE_CHANNELS.map(c =>
    c.id === "google" ? { ...c, status: gbpConnected ? "connected" : "needs_action" } : c
  );

  // Filter by category
  const visible = activeCategory === "all"
    ? channels
    : channels.filter(c => c.category === activeCategory);

  // Summary counts (across all channels, not filtered)
  const connected   = channels.filter(c => c.status === "connected").length;
  const pending     = channels.filter(c => c.status === "pending").length;
  const notStarted  = channels.filter(c => c.status === "not_started").length;
  const total       = channels.length;
  const donePct     = Math.round((connected / total) * 100);

  return (
    <div style={{ marginBottom: 28 }}>

      {/* ── Section header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "1.1px", textTransform: "uppercase", whiteSpace: "nowrap" }}>
          Discovery Channel Checklist
        </div>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
        <span style={{ fontSize: 10, color: "#475569" }}>{connected} of {total} live</span>
      </div>

      {/* ── Summary bar ── */}
      <div style={{
        background: "linear-gradient(135deg, rgba(11,22,41,0.95), rgba(3,6,18,0.85))",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 14, padding: "16px 20px", marginBottom: 14,
        display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
      }}>
        {/* Progress */}
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8" }}>Setup progress</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#00AEEF" }}>{connected}/{total} channels</span>
          </div>
          <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${donePct}%`,
              background: "linear-gradient(90deg, #00AEEF, #22C55E)",
              borderRadius: 3, transition: "width 0.4s",
            }} />
          </div>
        </div>

        {/* Status pills */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { label: "Connected",   count: connected,  color: "#22C55E" },
            { label: "Pending",     count: pending,    color: "#F59E0B" },
            { label: "Not started", count: notStarted, color: "#475569" },
          ].map(s => (
            <div key={s.label} style={{
              display: "flex", alignItems: "center", gap: 5,
              background: `${s.color}10`, border: `1px solid ${s.color}25`,
              borderRadius: 20, padding: "4px 10px",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.count}</span>
              <span style={{ fontSize: 11, color: "#475569", fontWeight: 500 }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Static label — setup status, not analytics */}
        <div style={{
          fontSize: 9, color: "#334155", fontWeight: 700,
          letterSpacing: "0.6px", textTransform: "uppercase",
          flexShrink: 0,
        }}>
          Setup status
        </div>
      </div>

      {/* ── Category filter tabs ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {(["all", ...ALL_CATEGORIES] as const).map(cat => {
          const isActive = activeCategory === cat;
          const color    = cat === "all" ? "#00AEEF" : CATEGORY_COLOR[cat];
          return (
            <button key={cat} onClick={() => setActiveCategory(cat)} style={{
              padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
              cursor: "pointer", border: "none", transition: "all 0.15s",
              background: isActive ? `${color}18` : "rgba(255,255,255,0.04)",
              color: isActive ? color : "#475569",
              outline: isActive ? `1px solid ${color}35` : "1px solid transparent",
              textTransform: cat === "all" ? "capitalize" : "none",
            }}>
              {cat === "all" ? `All (${total})` : `${cat} (${channels.filter(c => c.category === cat).length})`}
            </button>
          );
        })}
      </div>

      {/* ── Channel rows ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visible.map(channel => {
          const ss       = STATUS_STYLE[channel.status];
          const ps       = PRIORITY_STYLE[channel.priority];
          const catColor = CATEGORY_COLOR[channel.category];
          const isOpen   = expandedId === channel.id;

          return (
            <div
              key={channel.id}
              style={{
                background: channel.status === "connected"
                  ? "linear-gradient(135deg, rgba(34,197,94,0.05), rgba(11,22,41,0.9))"
                  : channel.status === "pending"
                  ? "linear-gradient(135deg, rgba(245,158,11,0.04), rgba(11,22,41,0.9))"
                  : "rgba(11,22,41,0.7)",
                border: `1px solid ${ss.border}`,
                borderRadius: 12,
                overflow: "hidden",
                transition: "border-color 0.15s",
              }}
            >
              {/* ── Row header — always visible ── */}
              <button
                onClick={() => setExpandedId(isOpen ? null : channel.id)}
                style={{
                  width: "100%", background: "transparent", border: "none",
                  cursor: "pointer", padding: "12px 16px",
                  display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                }}
              >
                {/* Status dot */}
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: ss.dot, flexShrink: 0,
                  boxShadow: channel.status === "connected" ? `0 0 6px ${ss.dot}` : "none",
                }} />

                {/* Icon */}
                <span style={{ fontSize: 16, flexShrink: 0 }}>{channel.icon}</span>

                {/* Name */}
                <span style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0", flex: 1, minWidth: 0, textAlign: "left" }}>
                  {channel.name}
                </span>

                {/* Category badge */}
                <span style={{
                  fontSize: 9, fontWeight: 700, color: catColor,
                  background: `${catColor}14`, border: `1px solid ${catColor}28`,
                  borderRadius: 20, padding: "2px 8px",
                  letterSpacing: "0.5px", textTransform: "uppercase", flexShrink: 0,
                  display: "none" as any, // hidden on small, shown on wider viewports via conditional
                }}>
                  {channel.category}
                </span>

                {/* Priority chip */}
                <span style={{
                  fontSize: 9, fontWeight: 700, color: ps.color,
                  background: ps.bg, borderRadius: 20, padding: "2px 8px",
                  letterSpacing: "0.5px", textTransform: "uppercase", flexShrink: 0,
                }}>
                  {ps.label}
                </span>

                {/* Status badge */}
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  background: ss.bg, border: `1px solid ${ss.border}`,
                  borderRadius: 20, padding: "3px 10px",
                  fontSize: 10, fontWeight: 700, color: ss.color,
                  flexShrink: 0, minWidth: 90, justifyContent: "center",
                }}>
                  {ss.label}
                </span>

                {/* Expand chevron */}
                <span style={{
                  fontSize: 10, color: "#334155", flexShrink: 0,
                  transition: "transform 0.2s",
                  transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                }}>
                  ▼
                </span>
              </button>

              {/* ── Expanded detail ── */}
              {isOpen && (
                <div style={{
                  borderTop: `1px solid ${ss.border}`,
                  background: "rgba(3,6,18,0.5)",
                  padding: "14px 16px 16px",
                  display: "flex", flexDirection: "column", gap: 12,
                }}>
                  {/* Why it matters */}
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#334155", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 5 }}>
                      Why it matters
                    </div>
                    <div style={{ fontSize: 12, color: "#94A3B8", lineHeight: 1.6 }}>
                      {channel.why_it_matters}
                    </div>
                  </div>

                  {/* Next action */}
                  <div style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    background: "rgba(255,255,255,0.03)", borderRadius: 9,
                    padding: "10px 12px", border: "1px solid rgba(255,255,255,0.05)",
                  }}>
                    <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>⚡</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "#334155", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 4 }}>
                        Next action
                      </div>
                      <div style={{ fontSize: 12, color: "#CBD5E1", lineHeight: 1.55 }}>
                        {channel.next_action}
                      </div>
                    </div>
                  </div>

                  {/* Footer: time + open link */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      {/* Category */}
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: catColor,
                        background: `${catColor}14`, border: `1px solid ${catColor}28`,
                        borderRadius: 20, padding: "2px 8px", letterSpacing: "0.5px",
                        textTransform: "uppercase",
                      }}>
                        {channel.category}
                      </span>
                      {/* Setup time estimate */}
                      {channel.setup_time && (
                        <span style={{ fontSize: 10, color: "#475569" }}>
                          ⏱ {channel.setup_time}
                        </span>
                      )}
                      {/* Status note */}
                      <span style={{ fontSize: 9, color: "#334155", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Setup status — not analytics
                      </span>
                    </div>

                    {/* Action link */}
                    {channel.action_url && channel.status !== "connected" && (
                      <a
                        href={channel.action_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "6px 14px", borderRadius: 8,
                          background: `${catColor}10`, border: `1px solid ${catColor}30`,
                          color: catColor, fontSize: 11, fontWeight: 700,
                          textDecoration: "none", flexShrink: 0,
                        }}
                      >
                        Open {channel.name.split(" ")[0]} ↗
                      </a>
                    )}
                    {channel.status === "connected" && (
                      <a
                        href={channel.action_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "6px 14px", borderRadius: 8,
                          background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)",
                          color: "#22C55E", fontSize: 11, fontWeight: 700,
                          textDecoration: "none", flexShrink: 0,
                        }}
                      >
                        Manage ↗
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}

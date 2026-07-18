import { Link, useLocation } from "wouter";
import { toast } from "sonner";

// ── Medal hierarchy color families ─────────────────────────────────────────────
// Matches the permanent color coding for AI Edge OS modules.
const F = {
  home:          { accent: "#E2E8F0", glow: "rgba(226,232,240,0.15)", bg: "#0D1520" },
  dailyCommand:  { accent: "#FBBF24", glow: "rgba(251,191,36,0.18)",  bg: "#1A1200" },
  gbpEngine:     { accent: "#EAB308", glow: "rgba(234,179,8,0.18)",   bg: "#191400" },
  localPresence: { accent: "#94A3B8", glow: "rgba(148,163,184,0.15)", bg: "#0F1825" },
  aiVisibility:  { accent: "#C4945A", glow: "rgba(196,148,90,0.15)",  bg: "#1A1000" },
  competitor:    { accent: "#8B5CF6", glow: "rgba(139,92,246,0.15)",  bg: "#0D0A2A" },
  authority:     { accent: "#38BDF8", glow: "rgba(56,189,248,0.15)",  bg: "#061420" },
  opportunity:   { accent: "#34D399", glow: "rgba(52,211,153,0.15)",  bg: "#061A0F" },
  creativeStudio:{ accent: "#FB923C", glow: "rgba(251,146,60,0.15)",  bg: "#1A0E00" },
  aiCMO:         { accent: "#F472B6", glow: "rgba(244,114,182,0.15)", bg: "#1A0516" },
  growth:        { accent: "#22C55E", glow: "rgba(34,197,94,0.18)",   bg: "#071F10" },
  platform:      { accent: "#64748B", glow: "rgba(100,116,139,0.12)", bg: "#07101A" },
} as const;

type FamilyKey = keyof typeof F;

interface ModuleTile {
  to: string;
  icon: string;
  label: string;
  sub: string;
  family: FamilyKey;
  comingSoon?: boolean;
}

interface SectionDef {
  id: string;
  headerEmoji: string;
  name: string;
  tagline: string;
  accentColor: string;
  tiles: ModuleTile[];
  comingSoon?: boolean;
}

// ── Section registry — medal hierarchy order ───────────────────────────────────
const SECTIONS: SectionDef[] = [
  {
    id: "home",
    headerEmoji: "🏠",
    name: "Home",
    tagline: "Your executive command hub",
    accentColor: "#E2E8F0",
    tiles: [
      { to: "/admin/dashboard", icon: "🏠", label: "Command Center", sub: "Executive dashboard", family: "home" },
    ],
  },
  {
    id: "daily-command",
    headerEmoji: "🌅",
    name: "Daily Command",
    tagline: "Start every day with clarity and direction",
    accentColor: "#FBBF24",
    tiles: [
      { to: "/admin/morning-brief",   icon: "☀️",  label: "Morning Brief",   sub: "Daily AI briefing",   family: "dailyCommand" },
      { to: "/admin/mission-control", icon: "🚀",  label: "Mission Control", sub: "Daily execution hub", family: "dailyCommand" },
    ],
  },
  {
    id: "gbp-engine",
    headerEmoji: "🥇",
    name: "GBP Audit & Optimization Engine",
    tagline: "Flagship · Google Business Profile health scoring and optimization",
    accentColor: "#EAB308",
    tiles: [
      { to: "/admin/gbp-audit", icon: "🏥", label: "GBP Health Audit", sub: "Profile optimization", family: "gbpEngine" },
    ],
  },
  {
    id: "local-presence",
    headerEmoji: "🥈",
    name: "Local Presence Engine",
    tagline: "Maps, listings, and reputation management",
    accentColor: "#94A3B8",
    tiles: [
      { to: "/admin/local-presence", icon: "📍", label: "Local Presence",  sub: "Maps & listings",       family: "localPresence" },
      { to: "/admin/reviews",        icon: "⭐", label: "Reviews Engine",  sub: "Reputation management", family: "localPresence" },
    ],
  },
  {
    id: "ai-visibility",
    headerEmoji: "🥉",
    name: "AI Visibility Engine",
    tagline: "Voice search, AI presence, and search intelligence",
    accentColor: "#C4945A",
    tiles: [
      { to: "/admin/ai-visibility", icon: "✨",  label: "AI Visibility", sub: "Search AI presence", family: "aiVisibility" },
      { to: "/admin/voice-search",  icon: "🔊",  label: "Voice Search",  sub: "Voice SEO engine",   family: "aiVisibility" },
    ],
  },
  {
    id: "competitor-intel",
    headerEmoji: "🏅",
    name: "Competitor Intelligence",
    tagline: "Market intelligence and competitive positioning",
    accentColor: "#8B5CF6",
    tiles: [
      { to: "/admin/competitor-intelligence", icon: "🕵️", label: "Competitor Intel", sub: "Keyword gap analysis", family: "competitor" },
    ],
  },
  {
    id: "authority-backlink",
    headerEmoji: "🏅",
    name: "Authority & Backlink Engine",
    tagline: "Domain authority building and link acquisition",
    accentColor: "#38BDF8",
    tiles: [
      { to: "/admin/authority-engine", icon: "🔗", label: "Authority Engine", sub: "Citations & backlinks", family: "authority" },
    ],
  },
  {
    id: "opportunity-workflow",
    headerEmoji: "🏅",
    name: "Opportunity-to-Action Workflow",
    tagline: "Convert market signals into revenue-generating actions",
    accentColor: "#34D399",
    comingSoon: true,
    tiles: [
      { to: "#", icon: "⚡", label: "Opp → Action", sub: "Signal-to-revenue", family: "opportunity", comingSoon: true },
    ],
  },
  {
    id: "creative-studio",
    headerEmoji: "🏅",
    name: "Creative Studio",
    tagline: "Content creation, publishing, and brand asset management",
    accentColor: "#FB923C",
    tiles: [
      { to: "/admin/social-publishing", icon: "✈",  label: "Publishing Center", sub: "Social media engine",  family: "creativeStudio" },
      { to: "/admin/bbb-autopilot",     icon: "⚡", label: "Content Autopilot", sub: "Automated publishing", family: "creativeStudio" },
      { to: "/admin/media-engine",      icon: "🎥", label: "Media Engine",      sub: "Content & video hub",  family: "creativeStudio" },
      { to: "/admin/asset-library",     icon: "📁", label: "Asset Library",     sub: "Brand assets",         family: "creativeStudio" },
    ],
  },
  {
    id: "ai-cmo",
    headerEmoji: "🏅",
    name: "AI CMO",
    tagline: "Strategic AI marketing intelligence and campaign orchestration",
    accentColor: "#F472B6",
    tiles: [
      { to: "/admin/apollos", icon: "🧠", label: "Apollos AI", sub: "Business intelligence", family: "aiCMO" },
    ],
  },
  {
    id: "growth",
    headerEmoji: "📈",
    name: "Growth",
    tagline: "Lead pipeline, revenue recovery, and growth execution",
    accentColor: "#22C55E",
    tiles: [
      { to: "/admin/lead-recovery",     icon: "📞", label: "Lead Recovery AI",  sub: "Missed call conversion",    family: "growth" },
      { to: "/admin/call-intelligence", icon: "📊", label: "Call Intelligence", sub: "Call tracking & analytics", family: "growth" },
      { to: "/admin/bbb-execution",     icon: "🎯", label: "Growth Execution",  sub: "Revenue campaigns",         family: "growth" },
      { to: "/admin/ai-receptionist",   icon: "🤖", label: "AI Receptionist",   sub: "24/7 call handling",        family: "growth" },
      { to: "/admin/referrals",         icon: "🤝", label: "Referral Engine",   sub: "Customers → growth",        family: "growth" },
    ],
  },
  {
    id: "platform",
    headerEmoji: "⚙️",
    name: "Platform Tools",
    tagline: "System configuration, integrations, and developer tools",
    accentColor: "#64748B",
    tiles: [
      { to: "/admin/bbb-operations", icon: "🐛", label: "BB&B Ops Center",    sub: "Operations dashboard",   family: "platform" },
      { to: "/admin/connections",    icon: "🔗", label: "Connected Accounts", sub: "Integrations & OAuth",   family: "platform" },
      { to: "/admin/diagnostics",    icon: "🛰",  label: "System Diagnostics", sub: "Platform health",        family: "platform" },
      { to: "/admin/secrets",        icon: "🔑", label: "Secrets Vault",      sub: "API keys & credentials", family: "platform" },
    ],
  },
];

// ── Tile card ──────────────────────────────────────────────────────────────────
function ModuleTileCard({ tile, location }: { tile: ModuleTile; location: string }) {
  const active = !tile.comingSoon && location.startsWith(tile.to);
  const { accent, glow, bg } = F[tile.family];

  if (tile.comingSoon) {
    return (
      <div
        onClick={() => toast.info(`${tile.label} — Coming soon!`, { description: "This module is in active development." })}
        style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 6, padding: "15px 10px 13px",
          borderRadius: 11, cursor: "pointer", position: "relative",
          background: bg, border: `1.5px dashed ${accent}30`,
          boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
          opacity: 0.58, transition: "opacity 0.15s",
          minHeight: 86,
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "0.75"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "0.58"; }}
      >
        <div style={{
          position: "absolute", top: 5, right: 6,
          fontSize: 7.5, fontWeight: 800, letterSpacing: "0.5px",
          color: accent, background: `${accent}18`, border: `1px solid ${accent}30`,
          borderRadius: 5, padding: "1px 5px",
        }}>
          SOON
        </div>
        <span style={{ fontSize: 24, lineHeight: 1, filter: "grayscale(0.6) brightness(0.75)" }}>
          {tile.icon}
        </span>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(148,163,184,0.55)", letterSpacing: "0.2px" }}>
            {tile.label}
          </div>
          <div style={{ fontSize: 9, color: `${accent}55`, marginTop: 2 }}>
            {tile.sub}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link
      to={tile.to}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 6, padding: "15px 10px 13px",
        borderRadius: 11, textDecoration: "none", position: "relative",
        background: active
          ? `linear-gradient(135deg, ${bg}, ${bg}EE)`
          : `linear-gradient(135deg, ${bg}, ${bg}BB)`,
        border: active
          ? `1.5px solid ${accent}`
          : `1.5px solid ${accent}2A`,
        boxShadow: active
          ? `0 0 16px ${glow}, 0 2px 8px rgba(0,0,0,0.4)`
          : "0 2px 6px rgba(0,0,0,0.25)",
        cursor: "pointer", transition: "all 0.15s",
        minHeight: 86,
      }}
      onMouseEnter={e => {
        if (!active) {
          const el = e.currentTarget as HTMLElement;
          el.style.border = `1.5px solid ${accent}60`;
          el.style.boxShadow = `0 0 12px ${glow}, 0 4px 12px rgba(0,0,0,0.35)`;
          el.style.transform = "translateY(-1px)";
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          const el = e.currentTarget as HTMLElement;
          el.style.border = `1.5px solid ${accent}2A`;
          el.style.boxShadow = "0 2px 6px rgba(0,0,0,0.25)";
          el.style.transform = "translateY(0)";
        }
      }}
    >
      {active && (
        <div style={{
          position: "absolute", top: 6, right: 7,
          width: 6, height: 6, borderRadius: "50%",
          background: accent, boxShadow: `0 0 6px ${accent}`,
        }} />
      )}
      <span style={{
        fontSize: 26, lineHeight: 1,
        filter: active ? "none" : "saturate(0.85) brightness(0.88)",
      }}>
        {tile.icon}
      </span>
      <div style={{ textAlign: "center" }}>
        <div style={{
          fontSize: 10.5, fontWeight: 700, lineHeight: 1.2,
          color: active ? "#FFFFFF" : "rgba(200,215,235,0.85)",
          letterSpacing: "0.2px",
        }}>
          {tile.label}
        </div>
        <div style={{
          fontSize: 9, fontWeight: 500, lineHeight: 1.3,
          color: active ? `${accent}CC` : `${accent}80`,
          marginTop: 2,
        }}>
          {tile.sub}
        </div>
      </div>
    </Link>
  );
}

// ── Section header emoji sizing per rank ──────────────────────────────────────
function medalFontSize(emoji: string): number {
  if (emoji === "🥇" || emoji === "🥈" || emoji === "🥉") return 22;
  if (emoji === "🏅") return 20;
  return 18;
}

// ── Section card ──────────────────────────────────────────────────────────────
function SectionCard({ section, location }: { section: SectionDef; location: string }) {
  const { accentColor, comingSoon } = section;
  const isRanked = ["🥇","🥈","🥉","🏅"].includes(section.headerEmoji);

  return (
    <div style={{
      borderRadius: 14,
      border: comingSoon
        ? `1px dashed ${accentColor}28`
        : `1px solid ${accentColor}20`,
      overflow: "hidden",
      marginBottom: 10,
      transition: "border-color 0.2s",
    }}>
      {/* Section header */}
      <div style={{
        background: comingSoon
          ? `${accentColor}05`
          : `${accentColor}08`,
        borderBottom: `1px solid ${accentColor}${comingSoon ? "18" : "22"}`,
        padding: "10px 16px",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        {/* Medal / icon */}
        <span style={{
          fontSize: medalFontSize(section.headerEmoji),
          lineHeight: 1,
          filter: comingSoon ? "grayscale(0.5) brightness(0.8)" : "none",
          flexShrink: 0,
        }}>
          {section.headerEmoji}
        </span>

        {/* Name + tagline */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11, fontWeight: 800,
            color: comingSoon ? `${accentColor}80` : accentColor,
            letterSpacing: "0.5px",
            display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap",
          }}>
            {section.name}
            {isRanked && !comingSoon && (
              <span style={{
                fontSize: 8, fontWeight: 700, letterSpacing: "0.4px",
                color: accentColor, background: `${accentColor}15`,
                border: `1px solid ${accentColor}30`, borderRadius: 5,
                padding: "1px 5px",
              }}>
                {section.headerEmoji === "🥇" ? "FLAGSHIP" :
                 section.headerEmoji === "🥈" ? "CORE" :
                 section.headerEmoji === "🥉" ? "CORE" : "ADVANCED"}
              </span>
            )}
            {comingSoon && (
              <span style={{
                fontSize: 8, fontWeight: 700, letterSpacing: "0.4px",
                color: accentColor, background: `${accentColor}15`,
                border: `1px solid ${accentColor}30`, borderRadius: 5,
                padding: "1px 5px",
              }}>
                COMING SOON
              </span>
            )}
          </div>
          <div style={{
            fontSize: 9.5, color: `rgba(148,163,184,${comingSoon ? "0.4" : "0.55"})`,
            marginTop: 1, lineHeight: 1.3,
          }}>
            {section.tagline}
          </div>
        </div>

        {/* Module count badge */}
        {!comingSoon && (
          <div style={{
            fontSize: 9, fontWeight: 700,
            color: accentColor, background: `${accentColor}12`,
            border: `1px solid ${accentColor}28`,
            borderRadius: 7, padding: "2px 8px", flexShrink: 0,
            letterSpacing: "0.3px",
          }}>
            {section.tiles.length} {section.tiles.length === 1 ? "module" : "modules"}
          </div>
        )}
      </div>

      {/* Tile grid */}
      <div style={{
        padding: "12px 12px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))",
        gap: 7,
        background: "rgba(3,6,18,0.45)",
      }}>
        {section.tiles.map(tile => (
          <ModuleTileCard key={tile.to + tile.label} tile={tile} location={location} />
        ))}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function ModulePackageGrid() {
  const [location] = useLocation();
  return (
    <div>
      {SECTIONS.map(section => (
        <SectionCard key={section.id} section={section} location={location} />
      ))}
    </div>
  );
}

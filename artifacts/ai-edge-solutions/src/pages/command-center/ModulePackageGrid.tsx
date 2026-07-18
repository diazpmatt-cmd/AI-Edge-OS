import { Link, useLocation } from "wouter";

// ── Canonical AI Edge functional families ─────────────────────────────────────
// Pricing package = WHERE the module lives
// Family = WHAT COLOR the tile uses
const F = {
  home:           { accent: "#CBD5E1", bg: "#0D1520" },  // 🏠 Home — White/Silver
  dailyCommand:   { accent: "#FBBF24", bg: "#1A1200" },  // 🌅 Daily Command — Gold
  growth:         { accent: "#22C55E", bg: "#071F10" },  // 📈 Growth — Green
  localPresence:  { accent: "#2DD4BF", bg: "#071E1E" },  // 🌎 Local Presence — Teal/Blue
  aiIntelligence: { accent: "#A78BFA", bg: "#0D0A2A" },  // 🧠 AI Intelligence — Purple
  creativeStudio: { accent: "#FB923C", bg: "#1A0E00" },  // 🎨 Creative Studio — Orange
  automation:     { accent: "#38BDF8", bg: "#06141E" },  // ⚙️ Automation — Electric Blue
  operations:     { accent: "#94A3B8", bg: "#0F1520" },  // 🏢 Operations — Gray
  development:    { accent: "#64748B", bg: "#07101A" },  // 🧪 Development — Dark Blue
} as const;

interface ModuleTile {
  to: string;
  icon: string;
  label: string;
  sub: string;
  family: keyof typeof F;
}

interface PackageGroup {
  id: string;
  name: string;
  tagline: string;
  accentColor: string;
  borderColor: string;
  headerBg: string;
  tiles: ModuleTile[];
}

// ── Module registry — ordered by family within each pricing package ────────────
const PACKAGES: PackageGroup[] = [
  {
    id: "price-package",
    name: "Price Package",
    tagline: "Core growth services included in your monthly plan",
    accentColor: "#F59E0B",
    borderColor: "rgba(245,158,11,0.35)",
    headerBg: "rgba(245,158,11,0.07)",
    tiles: [
      // 🌅 Daily Command
      { to: "/admin/morning-brief",     icon: "☀️",  label: "Morning Brief",       sub: "Daily AI briefing",          family: "dailyCommand"   },
      { to: "/admin/mission-control",   icon: "🚀",  label: "Mission Control",     sub: "Daily execution hub",        family: "dailyCommand"   },
      // 📈 Growth
      { to: "/admin/bbb-execution",     icon: "🎯",  label: "Growth Execution",    sub: "Revenue campaigns",          family: "growth"         },
      // ⚙️ Automation
      { to: "/admin/social-publishing", icon: "✈",   label: "Publishing Center",   sub: "Social media engine",        family: "automation"     },
      { to: "/admin/bbb-autopilot",     icon: "⚡",  label: "Content Autopilot",   sub: "Automated publishing",       family: "automation"     },
      // 🌎 Local Presence
      { to: "/admin/gbp-audit",          icon: "🏥",  label: "GBP Health Audit",    sub: "Profile optimization",       family: "localPresence"  },
      { to: "/admin/reviews",           icon: "⭐",  label: "Reviews Engine",      sub: "Reputation management",      family: "localPresence"  },
      { to: "/admin/local-presence",    icon: "📍",  label: "Local Presence",      sub: "Maps & listings",            family: "localPresence"  },
      // 🏢 Operations
      { to: "/admin/bbb-operations",    icon: "🐛",  label: "BB&B Ops Center",     sub: "Operations dashboard",       family: "operations"     },
    ],
  },
  {
    id: "a-la-carte",
    name: "A-La-Carte",
    tagline: "Premium add-on services for accelerated growth",
    accentColor: "#F26C21",
    borderColor: "rgba(242,108,33,0.35)",
    headerBg: "rgba(242,108,33,0.07)",
    tiles: [
      // 📈 Growth
      { to: "/admin/lead-recovery",     icon: "📞",  label: "Lead Recovery AI",    sub: "Missed call conversion",     family: "growth"         },
      { to: "/admin/call-intelligence", icon: "📊",  label: "Call Intelligence",   sub: "Call tracking & analytics",  family: "growth"         },
      // ⚙️ Automation
      { to: "/admin/ai-receptionist",   icon: "🤖",  label: "AI Receptionist",     sub: "24/7 call handling",         family: "automation"     },
      // 🧠 AI Intelligence
      { to: "/admin/apollos",           icon: "🧠",  label: "Apollos AI",           sub: "Business intelligence",      family: "aiIntelligence" },
      { to: "/admin/ai-visibility",     icon: "✨",  label: "AI Visibility",        sub: "Search AI presence",         family: "aiIntelligence" },
      { to: "/admin/voice-search",      icon: "🔊",  label: "Voice Search",         sub: "Voice SEO engine",           family: "aiIntelligence" },
    ],
  },
  {
    id: "included",
    name: "Included Tools",
    tagline: "Platform tools included with every AI Edge account",
    accentColor: "#00AEEF",
    borderColor: "rgba(0,174,239,0.3)",
    headerBg: "rgba(0,174,239,0.06)",
    tiles: [
      // 🏠 Home
      { to: "/admin/dashboard",         icon: "🏠",  label: "Command Center",      sub: "Executive dashboard",        family: "home"           },
      // 🎨 Creative Studio
      { to: "/admin/media-engine",      icon: "🎥",  label: "Media Engine",        sub: "Content & video hub",        family: "creativeStudio" },
      { to: "/admin/asset-library",     icon: "📁",  label: "Asset Library",       sub: "Brand asset storage",        family: "creativeStudio" },
      // 🧪 Development
      { to: "/admin/connections",       icon: "🔗",  label: "Connected Accounts",  sub: "Integrations & OAuth",       family: "development"    },
      { to: "/admin/diagnostics",       icon: "🛰",   label: "System Diagnostics", sub: "Platform health",            family: "development"    },
      { to: "/admin/secrets",           icon: "🔑",  label: "Secrets Vault",       sub: "API keys & credentials",     family: "development"    },
    ],
  },
];

// ── Tile card ─────────────────────────────────────────────────────────────────
function ModuleTileCard({ tile, location }: { tile: ModuleTile; location: string }) {
  const active = location.startsWith(tile.to);
  const { accent, bg } = F[tile.family];

  return (
    <Link
      to={tile.to}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "16px 10px 14px",
        borderRadius: 12,
        textDecoration: "none",
        background: active
          ? `linear-gradient(135deg, ${bg} 0%, ${bg}CC 100%)`
          : `linear-gradient(135deg, ${bg} 0%, ${bg}99 100%)`,
        border: active
          ? `1.5px solid ${accent}`
          : `1.5px solid ${accent}33`,
        boxShadow: active
          ? `0 0 14px ${accent}33, 0 2px 8px rgba(0,0,0,0.4)`
          : "0 2px 8px rgba(0,0,0,0.25)",
        cursor: "pointer",
        transition: "all 0.15s",
        minHeight: 90,
        position: "relative",
      }}
      onMouseEnter={e => {
        if (!active) {
          const el = e.currentTarget as HTMLElement;
          el.style.border = `1.5px solid ${accent}77`;
          el.style.boxShadow = `0 0 10px ${accent}22, 0 4px 12px rgba(0,0,0,0.35)`;
          el.style.transform = "translateY(-1px)";
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          const el = e.currentTarget as HTMLElement;
          el.style.border = `1.5px solid ${accent}33`;
          el.style.boxShadow = "0 2px 8px rgba(0,0,0,0.25)";
          el.style.transform = "translateY(0)";
        }
      }}
    >
      {active && (
        <div style={{
          position: "absolute", top: 6, right: 7,
          width: 6, height: 6, borderRadius: "50%",
          background: accent,
          boxShadow: `0 0 6px ${accent}`,
        }} />
      )}

      <span style={{
        fontSize: 26, lineHeight: 1,
        filter: active ? "none" : "saturate(0.8) brightness(0.85)",
      }}>
        {tile.icon}
      </span>

      <div style={{ textAlign: "center" }}>
        <div style={{
          fontSize: 11, fontWeight: 700, lineHeight: 1.2,
          color: active ? "#FFFFFF" : "rgba(200,215,235,0.8)",
          letterSpacing: "0.2px",
        }}>
          {tile.label}
        </div>
        <div style={{
          fontSize: 9.5, fontWeight: 500, lineHeight: 1.3,
          color: active ? `${accent}CC` : `${accent}88`,
          marginTop: 2,
        }}>
          {tile.sub}
        </div>
      </div>
    </Link>
  );
}

// ── Package section ───────────────────────────────────────────────────────────
function PackageSection({ pkg, location }: { pkg: PackageGroup; location: string }) {
  return (
    <div style={{
      borderRadius: 16,
      border: `1px solid ${pkg.borderColor}`,
      overflow: "hidden",
      marginBottom: 16,
    }}>
      {/* Package header */}
      <div style={{
        background: pkg.headerBg,
        borderBottom: `1px solid ${pkg.borderColor}`,
        padding: "12px 18px",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}>
        <div style={{
          width: 10, height: 10, borderRadius: "50%",
          background: pkg.accentColor,
          boxShadow: `0 0 8px ${pkg.accentColor}88`,
          flexShrink: 0,
        }} />
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 11, fontWeight: 800, color: pkg.accentColor,
            letterSpacing: "0.8px", textTransform: "uppercase",
          }}>
            {pkg.name}
          </div>
          <div style={{ fontSize: 10, color: "rgba(148,163,184,0.6)", marginTop: 1 }}>
            {pkg.tagline}
          </div>
        </div>
        <div style={{
          fontSize: 9, fontWeight: 700, color: pkg.accentColor,
          background: `${pkg.accentColor}14`,
          border: `1px solid ${pkg.accentColor}33`,
          borderRadius: 8, padding: "2px 9px",
          letterSpacing: "0.4px",
        }}>
          {pkg.tiles.length} modules
        </div>
      </div>

      {/* Tile grid */}
      <div style={{
        padding: "14px 14px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))",
        gap: 8,
        background: "rgba(3,6,18,0.5)",
      }}>
        {pkg.tiles.map(tile => (
          <ModuleTileCard key={tile.to} tile={tile} location={location} />
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
      {PACKAGES.map(pkg => (
        <PackageSection key={pkg.id} pkg={pkg} location={location} />
      ))}
    </div>
  );
}

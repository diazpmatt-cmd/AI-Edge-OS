import { Link, useLocation } from "wouter";

interface ModuleTile {
  to: string;
  icon: string;
  label: string;
  sub: string;
  bg: string;
  accent: string;
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

const PACKAGES: PackageGroup[] = [
  {
    id: "price-package",
    name: "Price Package",
    tagline: "Core growth services included in your monthly plan",
    accentColor: "#F59E0B",
    borderColor: "rgba(245,158,11,0.35)",
    headerBg: "rgba(245,158,11,0.07)",
    tiles: [
      { to: "/admin/morning-brief",     icon: "☀️", label: "Morning Brief",       sub: "Daily AI briefing",        bg: "#1A1200", accent: "#FBBF24" },
      { to: "/admin/mission-control",   icon: "🚀", label: "Mission Control",     sub: "Execution hub",            bg: "#0A0E26", accent: "#00AEEF" },
      { to: "/admin/bbb-execution",     icon: "🎯", label: "Growth Execution",    sub: "Revenue campaigns",        bg: "#1A0E08", accent: "#F26C21" },
      { to: "/admin/bbb-autopilot",     icon: "⚡", label: "Content Autopilot",   sub: "Automated publishing",     bg: "#150E1A", accent: "#F26C21" },
      { to: "/admin/bbb-operations",    icon: "🐛", label: "BB&B Ops Center",     sub: "Operations dashboard",     bg: "#0D1A2E", accent: "#00AEEF" },
      { to: "/admin/social-publishing", icon: "✈",  label: "Publishing Center",   sub: "Social media engine",      bg: "#281400", accent: "#F59E0B" },
      { to: "/admin/reviews",           icon: "⭐", label: "Reviews Engine",      sub: "Reputation management",    bg: "#261A00", accent: "#FCD34D" },
      { to: "/admin/local-presence",    icon: "📍", label: "Local Presence",      sub: "Maps & listings",          bg: "#0A1E1E", accent: "#2DD4BF" },
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
      { to: "/admin/lead-recovery",     icon: "📞", label: "Lead Recovery AI",    sub: "Missed call conversion",   bg: "#0A2010", accent: "#4ADE80" },
      { to: "/admin/ai-receptionist",   icon: "🤖", label: "AI Receptionist",     sub: "24/7 call handling",       bg: "#180D2E", accent: "#3B82F6" },
      { to: "/admin/ai-visibility",     icon: "✨", label: "AI Visibility",        sub: "Search AI presence",       bg: "#221800", accent: "#FBBF24" },
      { to: "/admin/call-intelligence", icon: "📊", label: "Call Intelligence",   sub: "Call tracking & analytics",bg: "#0D1828", accent: "#60A5FA" },
      { to: "/admin/apollos",           icon: "🧠", label: "Apollos AI",           sub: "Business intelligence",    bg: "#0D0A2A", accent: "#A78BFA" },
      { to: "/admin/voice-search",      icon: "🔊", label: "Voice Search",         sub: "Voice SEO engine",         bg: "#1A1026", accent: "#818CF8" },
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
      { to: "/admin/dashboard",         icon: "🏠", label: "Command Center",      sub: "Executive dashboard",      bg: "#0D2218", accent: "#22C55E" },
      { to: "/admin/media-engine",      icon: "🎥", label: "Media Engine",        sub: "Content & video hub",      bg: "#0D1428", accent: "#00AEEF" },
      { to: "/admin/asset-library",     icon: "📁", label: "Asset Library",       sub: "Brand asset storage",      bg: "#0A1A2E", accent: "#00AEEF" },
      { to: "/admin/connections",       icon: "🔗", label: "Connected Accounts",  sub: "Integrations & OAuth",     bg: "#261200", accent: "#F59E0B" },
      { to: "/admin/diagnostics",       icon: "🛰",  label: "System Diagnostics", sub: "Platform health",          bg: "#0A1A1A", accent: "#94A3B8" },
      { to: "/admin/secrets",           icon: "🔑", label: "Secrets Vault",       sub: "API keys & credentials",   bg: "#071C2A", accent: "#00AEEF" },
    ],
  },
];

function ModuleTileCard({ tile, location }: { tile: ModuleTile; location: string }) {
  const active = location.startsWith(tile.to);
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
          ? `linear-gradient(135deg, ${tile.bg} 0%, ${tile.bg}CC 100%)`
          : `linear-gradient(135deg, ${tile.bg} 0%, ${tile.bg}99 100%)`,
        border: active
          ? `1.5px solid ${tile.accent}`
          : `1.5px solid ${tile.accent}33`,
        boxShadow: active ? `0 0 14px ${tile.accent}33, 0 2px 8px rgba(0,0,0,0.4)` : "0 2px 8px rgba(0,0,0,0.25)",
        cursor: "pointer",
        transition: "all 0.15s",
        minHeight: 90,
        position: "relative",
      }}
      onMouseEnter={e => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.border = `1.5px solid ${tile.accent}77`;
          (e.currentTarget as HTMLElement).style.boxShadow = `0 0 10px ${tile.accent}22, 0 4px 12px rgba(0,0,0,0.35)`;
          (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.border = `1.5px solid ${tile.accent}33`;
          (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.25)";
          (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
        }
      }}
    >
      {active && (
        <div style={{
          position: "absolute", top: 6, right: 7,
          width: 6, height: 6, borderRadius: "50%",
          background: tile.accent,
          boxShadow: `0 0 6px ${tile.accent}`,
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
          color: active ? `${tile.accent}CC` : "rgba(148,163,184,0.5)",
          marginTop: 2,
        }}>
          {tile.sub}
        </div>
      </div>
    </Link>
  );
}

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

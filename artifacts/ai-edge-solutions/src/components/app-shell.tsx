import { Link, useLocation } from "wouter";
import { LogOut } from "lucide-react";
import { useClerk, useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { useTheme } from "@/contexts/theme-context";

const logoSrc = `${import.meta.env.BASE_URL}logo-transparent.png`;

const NAV_ITEMS = [
  { to: "/admin/dashboard",          icon: "🏠", label: "Command\nCenter",          bg: "#0D2218", accent: "#22C55E" },
  { to: "/admin/bizai",              icon: "🧠", label: "BizAI",                    bg: "#1A0D2E", accent: "#C084FC" },
  { to: "/admin/client-onboarding",   icon: "👤", label: "Client\nOnboarding",        bg: "#0D1A2E", accent: "#38BDF8" },
  { to: "/admin/connections",        icon: "🔗", label: "Connected\nAccounts",       bg: "#261200", accent: "#F59E0B" },
  { to: "/admin/distribution",       icon: "📦", label: "Distribution",              bg: "#0A2020", accent: "#06B6D4" },
  { to: "/admin/repurpose",          icon: "🎯", label: "Repurpose",                 bg: "#26071A", accent: "#F472B6" },
  { to: "/admin/lead-recovery",      icon: "📞", label: "Lead\nRecovery AI",         bg: "#0A2010", accent: "#4ADE80" },
  { to: "/admin/call-intelligence",  icon: "📊", label: "Call\nIntelligence",        bg: "#0D1828", accent: "#60A5FA" },
  { to: "/admin/ai-receptionist",    icon: "🤖", label: "AI\nReceptionist",          bg: "#180D2E", accent: "#3B82F6" },
  { to: "/admin/social-publishing",  icon: "✈",  label: "Publishing\nCenter",        bg: "#281400", accent: "#F59E0B" },
  { to: "/admin/auto-content",       icon: "⚡", label: "Auto Content\nEngine",      bg: "#0A0E26", accent: "#818CF8" },
  { to: "/admin/image-assets",       icon: "🖼",  label: "Image Asset\nManager",     bg: "#0A1226", accent: "#67E8F9" },
  { to: "/admin/ai-visibility",      icon: "✨", label: "AI Visibility\nEngine",     bg: "#221800", accent: "#FBBF24" },
  { to: "/admin/local-presence",     icon: "📍", label: "Local Presence\nEngine",    bg: "#0A1E1E", accent: "#2DD4BF" },
  { to: "/admin/voice-search",       icon: "🔊", label: "Voice Search\nEngine",      bg: "#1A1026", accent: "#818CF8" },
  { to: "/admin/reviews",            icon: "⭐", label: "Reviews\nEngine",           bg: "#261A00", accent: "#FCD34D" },
  { to: "/admin/assessments",        icon: "📋", label: "Business\nAssessments",     bg: "#1A1A0A", accent: "#86EFAC" },
  { to: "/admin/diagnostics",        icon: "🛰",  label: "System\nDiagnostics",      bg: "#0A1A1A", accent: "#94A3B8" },
  { to: "/admin/revenue-attribution", icon: "💰", label: "Revenue\nAttribution",      bg: "#0A1E0A", accent: "#22C55E" },
];

const SIDEBAR_W = 252;

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { theme, setTheme, colors: t, isDark } = useTheme();

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut({ redirectUrl: window.location.origin });
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: t.bg,
      display: "flex",
      transition: "background 0.25s, color 0.25s",
    }}>

      {/* Sidebar — always dark for visual consistency with colored tiles */}
      <aside style={{
        position: "fixed", inset: "0 auto 0 0", width: SIDEBAR_W,
        background: isDark
          ? "linear-gradient(180deg, #0B1629 0%, #060E1E 100%)"
          : "linear-gradient(180deg, #1A2640 0%, #111825 100%)",
        borderRight: `1px solid ${isDark ? "rgba(0,174,239,0.12)" : "rgba(0,174,239,0.18)"}`,
        display: "flex", flexDirection: "column", zIndex: 30,
        transition: "background 0.25s",
      }}
        className="app-sidebar"
      >
        {/* Logo + theme toggle */}
        <div style={{ padding: "18px 16px 14px", borderBottom: "1px solid rgba(0,174,239,0.08)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Link to="/">
              <img src={logoSrc} alt="AI Edge Solutions" style={{ height: 38, width: "auto", objectFit: "contain" }} />
            </Link>
            {/* Theme toggle pill */}
            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 10px", borderRadius: 20, cursor: "pointer",
                background: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.12)",
                border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.2)",
                color: isDark ? "#94A3B8" : "#E2E8F0",
                fontSize: 13, fontWeight: 600, transition: "all 0.2s",
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.14)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.12)"}
            >
              <span style={{ fontSize: 14 }}>{isDark ? "☀️" : "🌙"}</span>
              <span style={{ fontSize: 10.5 }}>{isDark ? "Light" : "Dark"}</span>
            </button>
          </div>
          <div style={{ fontSize: 9.5, color: "#00AEEF", fontWeight: 700, letterSpacing: "0.9px", textTransform: "uppercase", marginTop: 8, opacity: 0.8 }}>
            Command Center
          </div>
        </div>

        {/* Navigation grid */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "10px 8px 10px", scrollbarWidth: "none" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {NAV_ITEMS.map(({ to, icon, label, bg, accent }) => {
              const active = location.startsWith(to);
              const lines = label.split("\n");
              return (
                <Link key={to} to={to} style={{
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  padding: "14px 6px 12px",
                  borderRadius: 12, textDecoration: "none",
                  background: active
                    ? `linear-gradient(135deg, ${bg} 0%, ${bg}CC 100%)`
                    : `linear-gradient(135deg, ${bg} 0%, ${bg}99 100%)`,
                  border: active
                    ? `1.5px solid ${accent}`
                    : `1.5px solid ${accent}33`,
                  boxShadow: active ? `0 0 12px ${accent}33` : "none",
                  cursor: "pointer", transition: "all 0.15s",
                  minHeight: 78,
                }}
                  onMouseEnter={e => {
                    if (!active) {
                      (e.currentTarget as HTMLElement).style.border = `1.5px solid ${accent}88`;
                      (e.currentTarget as HTMLElement).style.boxShadow = `0 0 8px ${accent}22`;
                    }
                  }}
                  onMouseLeave={e => {
                    if (!active) {
                      (e.currentTarget as HTMLElement).style.border = `1.5px solid ${accent}33`;
                      (e.currentTarget as HTMLElement).style.boxShadow = "none";
                    }
                  }}
                >
                  <span style={{ fontSize: 26, lineHeight: 1, marginBottom: 7, filter: active ? "none" : "saturate(0.85) brightness(0.9)" }}>
                    {icon}
                  </span>
                  <div style={{ textAlign: "center" }}>
                    {lines.map((line, i) => (
                      <div key={i} style={{
                        fontSize: 10.5, fontWeight: 600, lineHeight: 1.25,
                        color: active ? "#FFFFFF" : "rgba(200,215,235,0.75)",
                        letterSpacing: "0.2px",
                      }}>
                        {line}
                      </div>
                    ))}
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Back to website */}
          <a href="/" style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            marginTop: 8, padding: "8px 12px", borderRadius: 9, textDecoration: "none",
            color: "rgba(148,163,184,0.45)", fontSize: 11.5, fontWeight: 500,
            border: "1px solid transparent", transition: "all 0.15s",
          }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.color = "#FFFFFF";
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.color = "rgba(148,163,184,0.45)";
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
          >
            <span style={{ opacity: 0.6 }}>↩</span> Back to Website
          </a>
        </nav>

        {/* User info + sign out */}
        <div style={{ padding: "12px 12px", borderTop: "1px solid rgba(0,174,239,0.08)", flexShrink: 0 }}>
          {user ? (
            <>
              <div style={{ fontSize: 10.5, color: "#475569", marginBottom: 7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.primaryEmailAddress?.emailAddress}
              </div>
              <button
                onClick={handleSignOut}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  padding: "7px 12px", borderRadius: 8, cursor: "pointer",
                  background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                  color: "#EF4444", fontSize: 12, fontWeight: 600,
                }}
              >
                <LogOut style={{ width: 12, height: 12 }} /> Sign out
              </button>
            </>
          ) : (
            <Link to="/sign-in" style={{
              display: "block", textAlign: "center", padding: "8px",
              borderRadius: 8, background: "#00AEEF", color: "#fff",
              fontSize: 13, fontWeight: 700, textDecoration: "none",
            }}>
              Sign in
            </Link>
          )}
        </div>
      </aside>

      {/* Mobile header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 20,
        background: isDark ? "rgba(6,14,30,0.97)" : "rgba(255,255,255,0.97)",
        backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${t.border}`,
        padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
        transition: "background 0.25s",
      }}
        className="app-mobile-header"
      >
        <Link to="/admin/dashboard" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
          <img src={logoSrc} alt="AI Edge Solutions" style={{ height: 32, width: "auto" }} />
        </Link>
        <nav style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
          {NAV_ITEMS.slice(0, 8).map(({ to, label, accent }) => (
            <Link key={to} to={to} style={{
              padding: "5px 10px", borderRadius: 7, textDecoration: "none", fontSize: 11,
              background: location.startsWith(to) ? `${accent}22` : "transparent",
              color: location.startsWith(to) ? accent : t.text2,
              border: location.startsWith(to) ? `1px solid ${accent}55` : "1px solid transparent",
              fontWeight: 600,
            }}>
              {label.replace("\n", " ")}
            </Link>
          ))}
          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            style={{ padding: "5px 10px", borderRadius: 7, background: t.cardSubtle, border: `1px solid ${t.border}`, color: t.text2, fontSize: 13, cursor: "pointer" }}
          >
            {isDark ? "☀️" : "🌙"}
          </button>
          {user
            ? <button onClick={handleSignOut} style={{ padding: "5px 10px", borderRadius: 7, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#EF4444", fontSize: 12, cursor: "pointer" }}>Sign out</button>
            : <Link to="/sign-in" style={{ padding: "5px 10px", borderRadius: 7, background: "#00AEEF", color: "#fff", fontSize: 12, textDecoration: "none" }}>Sign in</Link>
          }
        </nav>
      </header>

      {/* Main content */}
      <main
        style={{ flex: 1, minWidth: 0, overflowX: "hidden", paddingLeft: SIDEBAR_W, transition: "background 0.25s" }}
        className="app-main"
      >
        <div style={{ maxWidth: 1200, width: "100%", boxSizing: "border-box", margin: "0 auto", padding: "32px 24px 48px" }}>
          {children}
        </div>
      </main>

      <style>{`
        .app-sidebar nav::-webkit-scrollbar { display: none; }
        @media (max-width: 900px) {
          .app-sidebar { display: none !important; }
          .app-main { padding-left: 0 !important; }
          .app-mobile-header { display: flex !important; }
        }
        @media (min-width: 901px) {
          .app-mobile-header { display: none !important; }
        }
        * { transition: background-color 0.2s, border-color 0.2s, color 0.2s; }
      `}</style>
    </div>
  );
}

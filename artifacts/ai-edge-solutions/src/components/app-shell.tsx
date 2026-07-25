import { Link, useLocation } from "wouter";
import { LogOut } from "lucide-react";
import { useClerk, useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { useTheme } from "@/contexts/theme-context";
import { useActiveBusiness } from "@/contexts/business-context";

const logoSrc = `${import.meta.env.BASE_URL}logo-transparent.png`;
const TOP_NAV_H = 70;

// Darken a hex color by mixing with black for gradient endpoints
function accentDark(hex: string): string {
  const map: Record<string, string> = {
    "#00AEEF": "#007AB8",
    "#F26C21": "#C04E10",
  };
  return map[hex] ?? hex;
}

// ── Business tabs ─────────────────────────────────────────────────────────────
function BusinessTabs() {
  const { activeBusiness, businesses, setActiveBusinessId } = useActiveBusiness();
  const queryClient = useQueryClient();

  const handleSelect = (id: string) => {
    if (id !== activeBusiness.id) {
      setActiveBusinessId(id);
      queryClient.clear();
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Active business"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        overflowX: "auto",
        scrollbarWidth: "none",
        padding: "0 4px",
      }}
    >
      {businesses.map(b => {
        const isActive = b.id === activeBusiness.id;
        const accent = b.accentColor;
        const dark = accentDark(accent);
        const statusLabel = b.status === "active" ? "Active" : "Onboarding";
        const location = b.profile.city && b.profile.state
          ? `${b.profile.city}, ${b.profile.state}`
          : null;

        return (
          <button
            key={b.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => handleSelect(b.id)}
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 4,
              padding: "10px 22px",
              borderRadius: 10,
              cursor: "pointer",
              border: isActive
                ? `1px solid ${accent}55`
                : "1px solid rgba(255,255,255,0.10)",
              background: isActive
                ? `linear-gradient(135deg, ${accent} 0%, ${dark} 100%)`
                : "rgba(255,255,255,0.07)",
              boxShadow: isActive
                ? `0 4px 20px ${accent}55, 0 2px 8px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.18)`
                : "0 1px 4px rgba(0,0,0,0.25)",
              transition: "all 0.2s",
              minWidth: 0,
              flexShrink: 0,
              transform: isActive ? "translateY(-1px)" : "translateY(0)",
            }}
            onMouseEnter={e => {
              if (!isActive) {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "rgba(255,255,255,0.12)";
                el.style.borderColor = `${accent}40`;
                el.style.transform = "translateY(-1px)";
                el.style.boxShadow = `0 4px 12px ${accent}22, 0 2px 6px rgba(0,0,0,0.2)`;
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "rgba(255,255,255,0.07)";
                el.style.borderColor = "rgba(255,255,255,0.10)";
                el.style.transform = "translateY(0)";
                el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.25)";
              }
            }}
          >
            {/* Row 1: status dot + business name */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                background: isActive ? "rgba(255,255,255,0.9)" : accent,
                boxShadow: isActive
                  ? "0 0 6px rgba(255,255,255,0.6)"
                  : `0 0 6px ${accent}99`,
              }} />
              <span style={{
                fontSize: 14,
                fontWeight: isActive ? 800 : 600,
                color: isActive ? "#FFFFFF" : "#94A3B8",
                whiteSpace: "nowrap",
                letterSpacing: isActive ? "-0.3px" : "0",
                textShadow: isActive ? "0 1px 4px rgba(0,0,0,0.3)" : "none",
              }}>
                {b.name}
              </span>
            </div>

            {/* Row 2: industry · location [· status] */}
            <div style={{
              display: "flex", alignItems: "center", gap: 5, paddingLeft: 16,
            }}>
              {b.profile.industry && (
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  color: isActive ? "rgba(255,255,255,0.75)" : "#475569",
                  whiteSpace: "nowrap",
                }}>
                  {b.profile.industry}
                </span>
              )}
              {b.profile.industry && location && (
                <span style={{ fontSize: 10, color: isActive ? "rgba(255,255,255,0.4)" : "#334155" }}>·</span>
              )}
              {location && (
                <span style={{
                  fontSize: 10, fontWeight: 500,
                  color: isActive ? "rgba(255,255,255,0.75)" : "#475569",
                  whiteSpace: "nowrap",
                }}>
                  {location}
                </span>
              )}
              {!isActive && (
                <>
                  <span style={{ fontSize: 10, color: "#334155" }}>·</span>
                  <span style={{
                    fontSize: 9, fontWeight: 700,
                    color: accent,
                    textTransform: "uppercase", letterSpacing: "0.5px",
                  }}>
                    {statusLabel}
                  </span>
                </>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── User menu ─────────────────────────────────────────────────────────────────
function UserMenu() {
  const { signOut } = useClerk();
  const { user } = useUser();
  const queryClient = useQueryClient();

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut({ redirectUrl: window.location.origin });
  };

  if (!user) {
    return (
      <Link to="/sign-in" style={{
        padding: "6px 14px", borderRadius: 8, background: "#00AEEF",
        color: "#fff", fontSize: 12, fontWeight: 700, textDecoration: "none",
      }}>
        Sign in
      </Link>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{
        fontSize: 11, color: "#475569",
        maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {user.primaryEmailAddress?.emailAddress}
      </span>
      <button
        onClick={handleSignOut}
        title="Sign out"
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "6px 11px", borderRadius: 8, cursor: "pointer",
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
          color: "#EF4444", fontSize: 12, fontWeight: 600, transition: "all 0.15s",
        }}
      >
        <LogOut style={{ width: 12, height: 12 }} />
        <span>Sign out</span>
      </button>
    </div>
  );
}

// ── App shell ─────────────────────────────────────────────────────────────────
export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { setTheme, isDark } = useTheme();

  return (
    <div style={{ minHeight: "100vh", background: isDark ? "#030612" : "#F1F5F9", transition: "background 0.25s" }}>

      {/* ── Fixed top navigation bar ── */}
      <header
        className="app-topnav"
        style={{
          position: "fixed", inset: "0 0 auto 0", height: TOP_NAV_H, zIndex: 30,
          background: "linear-gradient(180deg, #0A1525 0%, #050D1A 100%)",
          borderBottom: "1px solid rgba(0,174,239,0.10)",
          display: "flex", alignItems: "center",
          padding: "0 16px",
          gap: 12,
          boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
        }}
      >
        {/* Logo — always navigates to Command Center home */}
        <Link
          to="/admin/dashboard"
          style={{ display: "flex", alignItems: "center", textDecoration: "none", flexShrink: 0 }}
        >
          <img src={logoSrc} alt="AI Edge Solutions" style={{ height: 38, width: "auto", objectFit: "contain" }} />
        </Link>

        {/* Separator */}
        <div style={{ width: 1, height: 32, background: "rgba(255,255,255,0.08)", flexShrink: 0 }} />

        {/* Business tabs — horizontally scrollable on small screens */}
        <BusinessTabs />

        {/* Push right controls to far right */}
        <div style={{ flex: 1 }} />

        {/* Right controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 11px", borderRadius: 8, cursor: "pointer",
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
              color: "#94A3B8", fontSize: 12, fontWeight: 600, transition: "all 0.2s",
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)")}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)")}
          >
            <span style={{ fontSize: 14 }}>{isDark ? "☀️" : "🌙"}</span>
            <span>{isDark ? "Light" : "Dark"}</span>
          </button>

          <UserMenu />
        </div>
      </header>

      {/* ── Main content — full width below top nav ── */}
      <main
        className="app-main"
        style={{ paddingTop: TOP_NAV_H, minWidth: 0, overflowX: "hidden" }}
      >
        {!location.startsWith("/admin/dashboard") && (
          <div style={{
            padding: "8px 24px",
            borderBottom: isDark ? "1px solid rgba(0,174,239,0.07)" : "1px solid rgba(0,174,239,0.12)",
            background: isDark ? "rgba(3,6,18,0.6)" : "rgba(240,247,255,0.8)",
          }}>
            <Link
              to="/admin/dashboard"
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: 11, fontWeight: 600, color: "#00AEEF",
                textDecoration: "none", opacity: 0.75, transition: "opacity 0.15s",
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.opacity = "1")}
              onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.opacity = "0.75")}
            >
              ← Command Edge Center
            </Link>
          </div>
        )}

        <div style={{
          maxWidth: 1200, width: "100%",
          boxSizing: "border-box", margin: "0 auto",
          padding: "32px 24px 48px",
        }}>
          {children}
        </div>
      </main>

      <style>{`
        * { transition: background-color 0.2s, border-color 0.2s, color 0.2s; }
        [role="tablist"]::-webkit-scrollbar { display: none; }
        @media (max-width: 640px) {
          .app-topnav { padding: 0 10px; gap: 8px; }
        }
      `}</style>
    </div>
  );
}

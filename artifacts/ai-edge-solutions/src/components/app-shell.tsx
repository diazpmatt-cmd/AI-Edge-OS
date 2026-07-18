import { Link, useLocation } from "wouter";
import { LogOut } from "lucide-react";
import { useClerk, useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { useTheme } from "@/contexts/theme-context";
import { useActiveBusiness } from "@/contexts/business-context";

const logoSrc = `${import.meta.env.BASE_URL}logo-transparent.png`;
const TOP_NAV_H = 54;

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
        alignSelf: "stretch",
        overflowX: "auto",
        scrollbarWidth: "none",
        gap: 2,
      }}
    >
      {businesses.map(b => {
        const isActive = b.id === activeBusiness.id;
        const statusColor = b.status === "active" ? "#22C55E" : "#F59E0B";
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
              alignSelf: "stretch",
              padding: "0 18px",
              cursor: "pointer",
              border: "none",
              borderBottom: isActive
                ? "2px solid #00AEEF"
                : "2px solid transparent",
              borderTop: "2px solid transparent",
              borderLeft: "none",
              borderRight: "none",
              background: isActive
                ? "linear-gradient(180deg, rgba(0,174,239,0.10) 0%, rgba(0,174,239,0.04) 100%)"
                : "transparent",
              transition: "all 0.18s",
              minWidth: 0,
              flexShrink: 0,
              position: "relative",
            }}
            onMouseEnter={e => {
              if (!isActive) {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "rgba(255,255,255,0.04)";
                el.style.borderBottomColor = "rgba(255,255,255,0.15)";
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "transparent";
                el.style.borderBottomColor = "transparent";
              }
            }}
          >
            {/* Name + status dot row */}
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{
                width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                background: statusColor,
                boxShadow: isActive ? `0 0 7px ${statusColor}CC` : `0 0 4px ${statusColor}66`,
              }} />
              <span style={{
                fontSize: 13, fontWeight: isActive ? 800 : 500,
                color: isActive ? "#E2E8F0" : "#64748B",
                whiteSpace: "nowrap",
                letterSpacing: isActive ? "-0.2px" : "0",
              }}>
                {b.name}
              </span>
            </div>

            {/* Sub-line: industry · location · status */}
            <div style={{
              display: "flex", alignItems: "center", gap: 5, marginTop: 2,
              paddingLeft: 14,
            }}>
              {b.profile.industry && (
                <span style={{
                  fontSize: 9, fontWeight: 600,
                  color: isActive ? "#475569" : "#334155",
                  whiteSpace: "nowrap",
                }}>
                  {b.profile.industry}
                </span>
              )}
              {b.profile.industry && location && (
                <span style={{ fontSize: 9, color: "#1E293B" }}>·</span>
              )}
              {location && (
                <span style={{
                  fontSize: 9, fontWeight: 500,
                  color: isActive ? "#475569" : "#334155",
                  whiteSpace: "nowrap",
                }}>
                  {location}
                </span>
              )}
              {!isActive && (
                <>
                  <span style={{ fontSize: 9, color: "#1E293B" }}>·</span>
                  <span style={{
                    fontSize: 9, fontWeight: 700,
                    color: statusColor,
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
          background: "linear-gradient(180deg, #0B1629 0%, #060E1E 100%)",
          borderBottom: "1px solid rgba(0,174,239,0.12)",
          display: "flex", alignItems: "center",
          padding: "0 0 0 16px",
          boxShadow: "0 2px 20px rgba(0,0,0,0.4)",
          overflow: "hidden",
        }}
      >
        {/* Logo — always navigates to Command Center home */}
        <Link
          to="/admin/dashboard"
          style={{ display: "flex", alignItems: "center", textDecoration: "none", flexShrink: 0, marginRight: 10 }}
        >
          <img src={logoSrc} alt="AI Edge Solutions" style={{ height: 36, width: "auto", objectFit: "contain" }} />
        </Link>

        {/* Separator */}
        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.08)", flexShrink: 0, marginRight: 6 }} />

        {/* Business tabs — horizontally scrollable */}
        <BusinessTabs />

        {/* Push right */}
        <div style={{ flex: 1 }} />

        {/* Right controls — pinned, no shrink */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px", flexShrink: 0 }}>
          {/* Light / Dark toggle */}
          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 11px", borderRadius: 8, cursor: "pointer",
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
              color: "#94A3B8", fontSize: 12, fontWeight: 600, transition: "all 0.2s",
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)")}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)")}
          >
            <span style={{ fontSize: 14 }}>{isDark ? "☀️" : "🌙"}</span>
            <span>{isDark ? "Light" : "Dark"}</span>
          </button>

          {/* User menu */}
          <UserMenu />
        </div>
      </header>

      {/* ── Main content — full width below top nav ── */}
      <main
        className="app-main"
        style={{ paddingTop: TOP_NAV_H, minWidth: 0, overflowX: "hidden" }}
      >
        {/* Back-to-Command-Center breadcrumb — shown on every page except the dashboard */}
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
              ← Command Center
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
        @media (max-width: 600px) {
          .app-topnav { padding-left: 10px; }
        }
      `}</style>
    </div>
  );
}

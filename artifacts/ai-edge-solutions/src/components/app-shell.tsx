import { Link, useLocation } from "wouter";
import { LogOut, ChevronDown } from "lucide-react";
import { useClerk, useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { useTheme } from "@/contexts/theme-context";
import { useActiveBusiness } from "@/contexts/business-context";

const logoSrc = `${import.meta.env.BASE_URL}logo-transparent.png`;
const TOP_NAV_H = 54;

// ── Business selector dropdown ────────────────────────────────────────────────
function BusinessSelector() {
  const { activeBusiness, businesses, setActiveBusinessId } = useActiveBusiness();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSelect = (id: string) => {
    if (id !== activeBusiness.id) {
      setActiveBusinessId(id);
      queryClient.clear();
    }
    setOpen(false);
  };

  const activeStatusColor = activeBusiness.status === "active" ? "#22C55E" : "#F59E0B";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        aria-label="Select active business"
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 14px 6px 12px", borderRadius: 10, cursor: "pointer",
          background: open ? "rgba(0,174,239,0.12)" : "rgba(255,255,255,0.06)",
          border: `1px solid ${open ? "rgba(0,174,239,0.35)" : "rgba(255,255,255,0.1)"}`,
          transition: "all 0.15s",
        }}
      >
        <div style={{ textAlign: "left" }}>
          <div style={{
            fontSize: 9, fontWeight: 700, color: "#64748B",
            textTransform: "uppercase", letterSpacing: "0.7px", lineHeight: 1,
          }}>
            Active Business
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 3 }}>
            <div style={{
              width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
              background: activeStatusColor,
              boxShadow: `0 0 6px ${activeStatusColor}88`,
            }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0", whiteSpace: "nowrap" }}>
              {activeBusiness.name}
            </span>
          </div>
        </div>
        <ChevronDown style={{
          width: 14, height: 14, color: "#64748B", flexShrink: 0,
          transition: "transform 0.2s",
          transform: open ? "rotate(180deg)" : "none",
        }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0,
          minWidth: 230, zIndex: 50,
          background: "linear-gradient(180deg, #0B1629 0%, #060E1E 100%)",
          border: "1px solid rgba(0,174,239,0.2)",
          borderRadius: 12, padding: "6px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,174,239,0.06)",
          animation: "dropdownIn 0.12s ease-out",
        }}>
          <div style={{
            fontSize: 9, fontWeight: 700, color: "#334155",
            textTransform: "uppercase", letterSpacing: "1px",
            padding: "4px 10px 8px",
          }}>
            Select Business
          </div>
          {businesses.map(b => {
            const isCurrent = b.id === activeBusiness.id;
            const bColor = b.status === "active" ? "#22C55E" : "#F59E0B";
            return (
              <button
                key={b.id}
                onClick={() => handleSelect(b.id)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 10px", borderRadius: 8, cursor: "pointer", textAlign: "left",
                  background: isCurrent ? "rgba(0,174,239,0.1)" : "transparent",
                  border: isCurrent ? "1px solid rgba(0,174,239,0.22)" : "1px solid transparent",
                  transition: "all 0.12s",
                }}
                onMouseEnter={e => { if (!isCurrent) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={e => { if (!isCurrent) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <div style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: bColor, boxShadow: `0 0 5px ${bColor}88`,
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 13, fontWeight: isCurrent ? 700 : 500,
                    color: isCurrent ? "#00AEEF" : "#CBD5E1",
                  }}>
                    {b.name}
                  </div>
                  {b.status !== "active" && (
                    <div style={{ fontSize: 10, color: "#64748B", textTransform: "capitalize", marginTop: 1 }}>
                      {b.status}
                    </div>
                  )}
                </div>
                {isCurrent && <span style={{ fontSize: 13, color: "#00AEEF", flexShrink: 0 }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
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
          padding: "0 20px", gap: 14,
          boxShadow: "0 2px 20px rgba(0,0,0,0.4)",
        }}
      >
        {/* Logo — always navigates to Command Center home */}
        <Link
          to="/admin/dashboard"
          style={{ display: "flex", alignItems: "center", textDecoration: "none", flexShrink: 0 }}
        >
          <img src={logoSrc} alt="AI Edge Solutions" style={{ height: 36, width: "auto", objectFit: "contain" }} />
        </Link>

        {/* Separator */}
        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.08)", flexShrink: 0 }} />

        {/* Active Business selector */}
        <BusinessSelector />

        {/* Push right */}
        <div style={{ flex: 1 }} />

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
        @keyframes dropdownIn {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
        @media (max-width: 600px) {
          .app-topnav { padding: 0 12px; gap: 8px; }
        }
      `}</style>
    </div>
  );
}

import { Link, useLocation } from "wouter";
import { LogOut } from "lucide-react";
import { useClerk, useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode } from "react";

const logoSrc = `${import.meta.env.BASE_URL}logo-transparent.png`;

const NAV_ITEMS = [
  { to: "/admin/dashboard",           icon: "⬡",  label: "Command Center" },
  { to: "/admin/connections",         icon: "⚡",  label: "Connected Accounts" },
  { to: "/admin/distribution",        icon: "◈",  label: "Distribution" },
  { to: "/admin/repurpose",           icon: "✦",  label: "Repurpose" },
  { to: "/admin/lead-recovery",       icon: "📞", label: "Lead Recovery" },
  { to: "/admin/social-publishing",   icon: "📸", label: "Publishing Center" },
  { to: "/admin/auto-content",        icon: "🤖", label: "Auto Content Engine" },
  { to: "/admin/diagnostics",         icon: "🛰",  label: "System Diagnostics" },
];

const SIDEBAR_W = 240;

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const queryClient = useQueryClient();

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut({ redirectUrl: window.location.origin });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#030612", display: "flex" }}>

      {/* Sidebar */}
      <aside style={{
        position: "fixed", inset: "0 auto 0 0", width: SIDEBAR_W,
        background: "linear-gradient(180deg, #0B1629 0%, #060E1E 100%)",
        borderRight: "1px solid rgba(0,174,239,0.1)",
        display: "flex", flexDirection: "column", zIndex: 30,
      }}
        className="app-sidebar"
      >
        {/* Logo */}
        <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid rgba(0,174,239,0.08)" }}>
          <Link to="/">
            <img src={logoSrc} alt="AI Edge Solutions" style={{ height: 40, width: "auto", objectFit: "contain" }} />
          </Link>
          <div style={{ fontSize: 10, color: "#00AEEF", fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", marginTop: 8, opacity: 0.8 }}>
            Command Center
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_ITEMS.map(({ to, icon, label }) => {
            const active = location.startsWith(to);
            return (
              <Link key={to} to={to} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 9, textDecoration: "none",
                background: active ? "rgba(0,174,239,0.12)" : "transparent",
                border: active ? "1px solid rgba(0,174,239,0.25)" : "1px solid transparent",
                color: active ? "#00AEEF" : "rgba(192,200,220,0.7)",
                fontSize: 13.5, fontWeight: active ? 700 : 500,
                transition: "all 0.15s",
              }}
                onMouseEnter={e => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                    (e.currentTarget as HTMLElement).style.color = "#FFFFFF";
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                    (e.currentTarget as HTMLElement).style.color = "rgba(192,200,220,0.7)";
                  }
                }}
              >
                <span style={{ fontSize: 13, opacity: active ? 1 : 0.7 }}>{icon}</span>
                {label}
              </Link>
            );
          })}

          <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "8px 4px" }} />

          <a href="/" style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "9px 12px", borderRadius: 9, textDecoration: "none",
            color: "rgba(148,163,184,0.5)", fontSize: 13, fontWeight: 500,
            border: "1px solid transparent", transition: "all 0.15s",
          }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.color = "#FFFFFF";
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.color = "rgba(148,163,184,0.5)";
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
          >
            <span style={{ fontSize: 13, opacity: 0.6 }}>↩</span>
            Back to Website
          </a>
        </nav>

        {/* User info + sign out */}
        <div style={{ padding: "14px 16px", borderTop: "1px solid rgba(0,174,239,0.08)" }}>
          {user ? (
            <>
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.primaryEmailAddress?.emailAddress}
              </div>
              <button
                onClick={handleSignOut}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 12px", borderRadius: 8, cursor: "pointer",
                  background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                  color: "#EF4444", fontSize: 12.5, fontWeight: 600,
                }}
              >
                <LogOut style={{ width: 13, height: 13 }} /> Sign out
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
        background: "rgba(6,14,30,0.97)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(0,174,239,0.1)",
        padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}
        className="app-mobile-header"
      >
        <Link to="/dashboard" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
          <img src={logoSrc} alt="AI Edge Solutions" style={{ height: 32, width: "auto" }} />
        </Link>
        <nav style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {NAV_ITEMS.map(({ to, label }) => (
            <Link key={to} to={to} style={{
              padding: "5px 10px", borderRadius: 7, textDecoration: "none", fontSize: 12,
              background: location.startsWith(to) ? "rgba(0,174,239,0.15)" : "transparent",
              color: location.startsWith(to) ? "#00AEEF" : "rgba(192,192,192,0.7)",
              border: location.startsWith(to) ? "1px solid rgba(0,174,239,0.3)" : "1px solid transparent",
              fontWeight: 600,
            }}>
              {label}
            </Link>
          ))}
          {user
            ? <button onClick={handleSignOut} style={{ padding: "5px 10px", borderRadius: 7, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#EF4444", fontSize: 12, cursor: "pointer" }}>Sign out</button>
            : <Link to="/sign-in" style={{ padding: "5px 10px", borderRadius: 7, background: "#00AEEF", color: "#fff", fontSize: 12, textDecoration: "none" }}>Sign in</Link>
          }
        </nav>
      </header>

      {/* Main content */}
      <main style={{ flex: 1, minWidth: 0, overflowX: "hidden", paddingLeft: SIDEBAR_W }} className="app-main">
        <div style={{ maxWidth: 1200, width: "100%", boxSizing: "border-box", margin: "0 auto", padding: "32px 24px 48px" }}>
          {children}
        </div>
      </main>

      <style>{`
        @media (max-width: 900px) {
          .app-sidebar { display: none !important; }
          .app-main { padding-left: 0 !important; }
          .app-mobile-header { display: flex !important; }
        }
        @media (min-width: 901px) {
          .app-mobile-header { display: none !important; }
        }
      `}</style>
    </div>
  );
}

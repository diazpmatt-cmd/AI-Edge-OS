import { Link, useLocation } from "wouter";
import { LogOut } from "lucide-react";
import { useClerk, useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { useTheme } from "@/contexts/theme-context";

const logoSrc = `${import.meta.env.BASE_URL}logo-transparent.png`;
const SIDEBAR_W = 252;

// ── Nav group definitions ─────────────────────────────────────────────────────

interface NavLink {
  to: string;
  icon: string;
  label: string;
}

interface NavGroup {
  id: string;
  label: string;
  accent: string;
  links: NavLink[];
  devOnly?: boolean;
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: "home",
    label: "Home",
    accent: "#E2E8F0",
    links: [
      { to: "/admin/dashboard",       icon: "🏠", label: "Command Center"    },
    ],
  },
  {
    id: "daily",
    label: "Daily Command",
    accent: "#FBBF24",
    links: [
      { to: "/admin/morning-brief",   icon: "☀️", label: "Morning Brief"      },
      { to: "/admin/mission-control", icon: "🚀", label: "Mission Control"     },
    ],
  },
  {
    id: "growth",
    label: "Growth",
    accent: "#22C55E",
    links: [
      { to: "/admin/bbb-execution",   icon: "🎯", label: "Growth Execution"   },
      { to: "/admin/lead-recovery",   icon: "📞", label: "Lead Recovery"      },
    ],
  },
  {
    id: "local",
    label: "Local Presence",
    accent: "#00AEEF",
    links: [
      { to: "/admin/local-presence",  icon: "📍", label: "Local Presence"     },
    ],
  },
  {
    id: "intelligence",
    label: "AI Intelligence",
    accent: "#A78BFA",
    links: [
      { to: "/admin/ai-visibility",   icon: "✨", label: "AI Visibility"      },
      { to: "/admin/apollos",         icon: "🧠", label: "Apollos"            },
    ],
  },
  {
    id: "creative",
    label: "Creative Studio",
    accent: "#F59E0B",
    links: [
      { to: "/admin/media-engine",    icon: "🎥", label: "Media Engine"       },
      { to: "/admin/social-publishing", icon: "📸", label: "Publishing Center" },
    ],
  },
  {
    id: "automation",
    label: "Automation",
    accent: "#06B6D4",
    links: [
      { to: "/admin/auto-content",    icon: "⚡", label: "Auto Content Engine" },
      { to: "/admin/bbb-operations",  icon: "🐛", label: "BB&B Ops Center"    },
      { to: "/admin/connections",     icon: "🔗", label: "Connections"        },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    accent: "#94A3B8",
    links: [
      { to: "/admin/client-onboarding",   icon: "🚀", label: "Client Onboarding"   },
      { to: "/admin/revenue-attribution", icon: "💰", label: "Revenue Attribution"  },
      { to: "/admin/profit-center",       icon: "📊", label: "Profit Center"        },
    ],
  },
  {
    id: "development",
    label: "Development",
    accent: "#38BDF8",
    devOnly: true,
    links: [
      { to: "/admin/diagnostics",     icon: "🛰",  label: "System Diagnostics" },
    ],
  },
];

// ── SidebarGroup — collapsible nav group ─────────────────────────────────────

function SidebarGroup({ group, location }: { group: NavGroup; location: string }) {
  const isActiveGroup = group.links.some(l => location.startsWith(l.to));
  const [open, setOpen] = useState<boolean>(() => {
    if (isActiveGroup) return true;
    try {
      const stored = localStorage.getItem(`nav-group-${group.id}`);
      return stored === null ? true : stored === "true";
    } catch { return true; }
  });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(`nav-group-${group.id}`, String(next)); } catch { /* ignore */ }
  };

  return (
    <div style={{ marginBottom: 4 }}>
      <button
        onClick={toggle}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex", alignItems: "center", gap: 8,
          padding: "5px 8px 5px 10px", borderRadius: 7,
          background: "transparent", border: "none", cursor: "pointer",
          transition: "background 0.12s",
        }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
      >
        <div style={{
          width: 4, height: 4, borderRadius: "50%", flexShrink: 0,
          background: isActiveGroup ? group.accent : `${group.accent}55`,
        }} />
        <span style={{
          flex: 1, textAlign: "left",
          fontSize: 9, fontWeight: 800, color: isActiveGroup ? group.accent : "#475569",
          letterSpacing: "1px", textTransform: "uppercase",
        }}>
          {group.label}
        </span>
        <span style={{
          fontSize: 10, color: "#334155",
          transition: "transform 0.15s",
          transform: open ? "rotate(0deg)" : "rotate(-90deg)",
          display: "inline-block",
        }}>▾</span>
      </button>

      {open && (
        <div style={{ paddingLeft: 10, marginBottom: 4 }}>
          {group.links.map(link => {
            const active = location.startsWith(link.to) && (link.to !== "/" || location === "/");
            return (
              <Link
                key={link.to}
                to={link.to}
                style={{
                  display: "flex", alignItems: "center", gap: 9,
                  padding: "7px 10px", borderRadius: 8,
                  textDecoration: "none",
                  background: active ? `${group.accent}14` : "transparent",
                  border: active ? `1px solid ${group.accent}30` : "1px solid transparent",
                  marginBottom: 2,
                  transition: "background 0.12s, border-color 0.12s",
                }}
                onMouseEnter={e => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                }}
                onMouseLeave={e => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>{link.icon}</span>
                <span style={{
                  fontSize: 12, fontWeight: active ? 700 : 500,
                  color: active ? group.accent : "rgba(203,213,225,0.75)",
                  letterSpacing: "0.1px",
                }}>
                  {link.label}
                </span>
                {active && (
                  <div style={{
                    marginLeft: "auto", width: 5, height: 5, borderRadius: "50%",
                    background: group.accent, flexShrink: 0,
                    boxShadow: `0 0 6px ${group.accent}`,
                  }} />
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Floating Command Center — quick-access FAB ────────────────────────────────

const FAB_ACTIONS = [
  { to: "/admin/dashboard",         icon: "🏠", label: "Command Center"   },
  { to: "/admin/morning-brief",     icon: "☀️", label: "Morning Brief"    },
  { to: "/admin/mission-control",   icon: "🚀", label: "Mission Control"  },
  { to: "/admin/social-publishing", icon: "📸", label: "Publishing"       },
  { to: "/admin/lead-recovery",     icon: "📞", label: "Leads"            },
  { to: "/admin/apollos",           icon: "🧠", label: "Apollos"          },
  { to: "/admin/diagnostics",       icon: "🛰",  label: "Diagnostics"      },
];

function FloatingCommandCenter({ location }: { location: string }) {
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

  useEffect(() => { setOpen(false); }, [location]);

  return (
    <div ref={ref} style={{ position: "fixed", bottom: 24, right: 24, zIndex: 100 }}>
      {open && (
        <div style={{
          position: "absolute", bottom: 64, right: 0,
          background: "linear-gradient(180deg, #0B1629 0%, #060E1E 100%)",
          border: "1px solid rgba(0,174,239,0.25)",
          borderRadius: 14, padding: "8px 6px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.55)",
          display: "flex", flexDirection: "column", gap: 3,
          minWidth: 190,
          animation: "fabMenuIn 0.15s ease-out",
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#00AEEF", letterSpacing: "1px", textTransform: "uppercase", padding: "2px 10px 6px", opacity: 0.7 }}>
            Quick Access
          </div>
          {FAB_ACTIONS.map(({ to, icon, label }) => {
            const active = location.startsWith(to);
            return (
              <Link key={to} to={to} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 12px", borderRadius: 9, textDecoration: "none",
                background: active ? "rgba(0,174,239,0.12)" : "transparent",
                border: active ? "1px solid rgba(0,174,239,0.25)" : "1px solid transparent",
                color: active ? "#00AEEF" : "rgba(200,215,235,0.85)",
                fontSize: 13, fontWeight: active ? 700 : 500,
                transition: "all 0.12s",
              }}
                onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "rgba(0,174,239,0.07)"; (e.currentTarget as HTMLElement).style.color = "#fff"; } }}
                onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "rgba(200,215,235,0.85)"; } }}
              >
                <span style={{ fontSize: 16, minWidth: 22, textAlign: "center" }}>{icon}</span>
                {label}
              </Link>
            );
          })}
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        title="Quick Navigation"
        aria-label="Quick Navigation"
        aria-expanded={open}
        style={{
          width: 52, height: 52, borderRadius: "50%",
          background: open ? "linear-gradient(135deg, #0077B6 0%, #00AEEF 100%)" : "linear-gradient(135deg, #030612 0%, #0B1629 100%)",
          border: `2px solid ${open ? "#00AEEF" : "rgba(0,174,239,0.4)"}`,
          boxShadow: open ? "0 0 0 4px rgba(0,174,239,0.18), 0 4px 20px rgba(0,174,239,0.4)" : "0 4px 20px rgba(0,0,0,0.5)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 22, lineHeight: 1, transition: "transform 0.2s", transform: open ? "rotate(45deg)" : "none" }}>
          {open ? "✕" : "⚡"}
        </span>
      </button>
    </div>
  );
}

// ── AppShell ──────────────────────────────────────────────────────────────────

export function AppShell({ children }: { children: ReactNode }) {
  const [location]  = useLocation();
  const { signOut } = useClerk();
  const { user }    = useUser();
  const queryClient = useQueryClient();
  const { theme, setTheme, colors: t, isDark } = useTheme();

  const isDev = import.meta.env.DEV;

  const visibleGroups = NAV_GROUPS.filter(g => !g.devOnly || isDev);

  const handleSignOut = useCallback(async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut({ redirectUrl: window.location.origin });
  }, [queryClient, signOut]);

  const topLinks = NAV_GROUPS
    .filter(g => !g.devOnly || isDev)
    .flatMap(g => g.links)
    .slice(0, 6);

  return (
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", transition: "background 0.25s, color 0.25s" }}>

      {/* ── Sidebar ── */}
      <aside
        className="app-sidebar"
        aria-label="Main Navigation"
        style={{
          position: "fixed", inset: "0 auto 0 0", width: SIDEBAR_W,
          background: isDark ? "linear-gradient(180deg, #0B1629 0%, #060E1E 100%)" : "linear-gradient(180deg, #1A2640 0%, #111825 100%)",
          borderRight: `1px solid ${isDark ? "rgba(0,174,239,0.12)" : "rgba(0,174,239,0.18)"}`,
          display: "flex", flexDirection: "column", zIndex: 30,
          transition: "background 0.25s",
        }}
      >
        {/* Logo + theme toggle */}
        <div style={{ padding: "18px 16px 14px", borderBottom: "1px solid rgba(0,174,239,0.08)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Link to="/">
              <img src={logoSrc} alt="AI Edge Solutions" style={{ height: 38, width: "auto", objectFit: "contain" }} />
            </Link>
            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
              aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 10px", borderRadius: 20, cursor: "pointer",
                background: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.12)",
                border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.2)",
                color: isDark ? "#94A3B8" : "#E2E8F0",
                fontSize: 13, fontWeight: 600, transition: "all 0.2s",
              }}
            >
              <span style={{ fontSize: 14 }}>{isDark ? "☀️" : "🌙"}</span>
              <span style={{ fontSize: 10.5 }}>{isDark ? "Light" : "Dark"}</span>
            </button>
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 9, color: "#00AEEF", fontWeight: 700, letterSpacing: "0.9px", textTransform: "uppercase", opacity: 0.75 }}>
              AI Edge OS
            </div>
          </div>
        </div>

        {/* Navigation groups */}
        <nav
          className="app-sidebar-nav"
          aria-label="Primary Navigation"
          style={{ flex: 1, overflowY: "auto", padding: "12px 8px 10px", scrollbarWidth: "none" }}
        >
          {visibleGroups.map(group => (
            <SidebarGroup key={group.id} group={group} location={location} />
          ))}

          <div style={{ marginTop: 6 }}>
            <a
              href="/"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "8px 12px", borderRadius: 9, textDecoration: "none",
                color: "rgba(148,163,184,0.45)", fontSize: 11.5, fontWeight: 500,
                border: "1px solid transparent", transition: "all 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#FFFFFF"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(148,163,184,0.45)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <span style={{ opacity: 0.6 }}>↩</span> Back to Website
            </a>
          </div>
        </nav>

        {/* User + sign out */}
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

      {/* ── Mobile header ── */}
      <header
        className="app-mobile-header"
        style={{
          position: "sticky", top: 0, zIndex: 20,
          background: isDark ? "rgba(6,14,30,0.97)" : "rgba(255,255,255,0.97)",
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${t.border}`,
          padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
          transition: "background 0.25s",
        }}
      >
        <Link to="/admin/dashboard" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
          <img src={logoSrc} alt="AI Edge Solutions" style={{ height: 32, width: "auto" }} />
        </Link>
        <nav aria-label="Mobile Navigation" style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
          {topLinks.map(({ to, label, icon }) => (
            <Link key={to} to={to} style={{
              padding: "5px 10px", borderRadius: 7, textDecoration: "none", fontSize: 11,
              background: location.startsWith(to) ? "rgba(0,174,239,0.15)" : "transparent",
              color: location.startsWith(to) ? "#00AEEF" : t.text2,
              border: location.startsWith(to) ? "1px solid rgba(0,174,239,0.3)" : "1px solid transparent",
              fontWeight: 600,
            }}>
              {icon} {label}
            </Link>
          ))}
          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label={isDark ? "Light mode" : "Dark mode"}
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

      {/* ── Main content ── */}
      <main
        className="app-main"
        style={{ flex: 1, minWidth: 0, overflowX: "hidden", paddingLeft: SIDEBAR_W, transition: "background 0.25s" }}
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
              ← Command Center
            </Link>
          </div>
        )}
        <div style={{ maxWidth: 1200, width: "100%", boxSizing: "border-box", margin: "0 auto", padding: "32px 24px 48px" }}>
          {children}
        </div>
      </main>

      {/* Floating Command Center */}
      <FloatingCommandCenter location={location} />

      <style>{`
        .app-sidebar-nav::-webkit-scrollbar { display: none; }
        @media (max-width: 900px) {
          .app-sidebar { display: none !important; }
          .app-main { padding-left: 0 !important; }
          .app-mobile-header { display: flex !important; }
        }
        @media (min-width: 901px) {
          .app-mobile-header { display: none !important; }
        }
        @keyframes fabMenuIn {
          from { opacity: 0; transform: translateY(8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

import { Link, useLocation } from "wouter";
import { Bug, LayoutDashboard, LogOut, Plug, Radio, Settings2, Sparkles } from "lucide-react";
import { useClerk, useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";

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
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2 px-6 py-6">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Bug className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="font-display text-sm font-bold">AI Edge Solutions</div>
            <div className="text-[11px] text-sidebar-foreground/60">SEO Autopilot</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          <SideLink to="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />} active={location.startsWith("/dashboard")}>Dashboard</SideLink>
          <SideLink to="/repurpose" icon={<Sparkles className="h-4 w-4" />} active={location.startsWith("/repurpose")}>Repurpose</SideLink>
          <SideLink to="/distribution" icon={<Radio className="h-4 w-4" />} active={location.startsWith("/distribution")}>Distribution</SideLink>
          <SideLink to="/connections" icon={<Plug className="h-4 w-4" />} active={location.startsWith("/connections")}>Connected Accounts</SideLink>
          <SideLink to="/" icon={<Settings2 className="h-4 w-4" />} active={location === "/"}>Business Profile</SideLink>
        </nav>
        <div className="space-y-2 border-t border-sidebar-border p-4">
          {user ? (
            <>
              <div className="truncate text-[11px] text-sidebar-foreground/60" title={user.primaryEmailAddress?.emailAddress}>
                {user.primaryEmailAddress?.emailAddress}
              </div>
              <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={handleSignOut}>
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </Button>
            </>
          ) : (
            <Link to="/sign-in" className="block rounded-md bg-primary px-3 py-1.5 text-center text-xs font-medium text-primary-foreground">Sign in</Link>
          )}
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-navy px-4 py-3 text-navy-foreground lg:hidden">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <Bug className="h-4 w-4" />
          </div>
          <span className="font-display text-sm font-bold">AI Edge Solutions</span>
        </Link>
        <nav className="flex flex-wrap items-center justify-end gap-1 text-xs">
          {[
            { to: "/dashboard", label: "Dashboard" },
            { to: "/distribution", label: "Distribution" },
            { to: "/connections", label: "Connections" },
          ].map(({ to, label }) => (
            <Link key={to} to={to} className={`rounded-md px-2.5 py-1.5 ${location.startsWith(to) ? "bg-primary text-primary-foreground" : "text-navy-foreground/80"}`}>{label}</Link>
          ))}
          {user
            ? <button onClick={handleSignOut} className="rounded-md bg-primary/90 px-2.5 py-1.5 text-primary-foreground">Sign out</button>
            : <Link to="/sign-in" className="rounded-md bg-primary px-2.5 py-1.5 text-primary-foreground">Sign in</Link>
          }
        </nav>
      </header>

      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}

function SideLink({ to, icon, active, children }: { to: string; icon: ReactNode; active: boolean; children: ReactNode }) {
  return (
    <Link to={to} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"}`}>
      <span className={active ? "text-primary-foreground" : ""}>{icon}</span>
      {children}
    </Link>
  );
}

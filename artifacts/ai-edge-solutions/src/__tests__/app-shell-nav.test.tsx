import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@clerk/react", () => ({
  useClerk: () => ({ signOut: vi.fn() }),
  useUser: () => ({
    user: {
      firstName: "Test",
      primaryEmailAddress: { emailAddress: "test@aiedge.com" },
    },
  }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: () => ({ cancelQueries: vi.fn(), clear: vi.fn() }),
  };
});

// Wouter mock — parameterised so we can simulate different active routes
let mockLocation = "/admin/dashboard";
vi.mock("wouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("wouter")>();
  return {
    ...actual,
    useLocation: () => [mockLocation],
    Link: ({ to, children, style, ...rest }: { to: string; children: ReactNode; style?: React.CSSProperties; [k: string]: unknown }) =>
      <a href={to} style={style} data-testid={`link-${to}`} {...rest}>{children}</a>,
  };
});

vi.mock("@/contexts/theme-context", () => ({
  useTheme: () => ({
    theme: "dark", setTheme: vi.fn(), isDark: true,
    colors: {
      bg: "#030612", text: "#E2E8F0", text2: "#94A3B8", text3: "#475569",
      border: "rgba(255,255,255,0.08)", card: "rgba(11,22,41,0.95)",
      cardSubtle: "rgba(255,255,255,0.03)", shadow: "none",
    },
  }),
}));

vi.mock("@/lib/nav-order", () => ({
  loadSavedOrder: (_default: unknown[]) => _default,
  saveNavOrder: vi.fn(),
  clearNavOrder: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  Reorder: {
    Group: ({ children, style }: { children: ReactNode; style?: React.CSSProperties }) => <div style={style}>{children}</div>,
    Item:  ({ children, style }: { children: ReactNode; style?: React.CSSProperties }) => <div style={style}>{children}</div>,
  },
  useDragControls: () => ({ start: vi.fn() }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

async function renderShell(location = "/admin/dashboard") {
  mockLocation = location;
  const { AppShell } = await import("../components/app-shell");
  return render(<AppShell><div>Main Content</div></AppShell>);
}

// ── PRIMARY NAV TILES ─────────────────────────────────────────────────────────

const PRIMARY_TILES = [
  { label: /Morning\s*Brief/i,       to: "/admin/morning-brief"     },
  { label: /Mission\s*Control/i,     to: "/admin/mission-control"   },
  { label: /Apollos/i,               to: "/admin/apollos"           },
  { label: /Command\s*Center/i,      to: "/admin/dashboard"         },
  { label: /Media\s*Engine/i,        to: "/admin/media-engine"      },
  { label: /Asset\s*Library/i,       to: "/admin/asset-library"     },
  { label: /Growth\s*Execution/i,    to: "/admin/bbb-execution"     },
  { label: /Content\s*Autopilot/i,   to: "/admin/bbb-autopilot"     },
  { label: /BB&B\s*Ops/i,            to: "/admin/bbb-operations"    },
  { label: /Publishing\s*Center/i,   to: "/admin/social-publishing" },
  { label: /Connected\s*Accounts/i,  to: "/admin/connections"       },
  { label: /Lead\s*Recovery/i,       to: "/admin/lead-recovery"     },
  { label: /Reviews\s*Engine/i,      to: "/admin/reviews"           },
  { label: /Local Presence/i,        to: "/admin/local-presence"    },
  { label: /System\s*Diagnostics/i,  to: "/admin/diagnostics"       },
];

describe("AppShell — primary nav tile rendering", () => {
  beforeEach(() => vi.resetModules());

  it("renders all primary nav tiles in the sidebar", async () => {
    await renderShell("/admin/dashboard");
    for (const { to } of PRIMARY_TILES) {
      // Each tile must have a sidebar link to its destination
      expect(document.querySelector(`a[href="${to}"]`), `Missing tile link for ${to}`).toBeTruthy();
    }
  });

  it("renders tiles as links with correct href values", async () => {
    await renderShell("/admin/dashboard");
    for (const { to } of PRIMARY_TILES) {
      const link = document.querySelector(`a[href="${to}"]`);
      expect(link, `Expected a link to ${to}`).toBeTruthy();
    }
  });

  it("renders tiles in a two-column grid", async () => {
    await renderShell("/admin/dashboard");
    const { AppShell: A } = await import("../components/app-shell");
    const { container } = render(<A><div /></A>);
    const grid = container.querySelector('[style*="grid-template-columns: 1fr 1fr"]');
    expect(grid).toBeTruthy();
  });
});

// ── ACTIVE STATE ──────────────────────────────────────────────────────────────

describe("AppShell — active tile state", () => {
  beforeEach(() => vi.resetModules());

  it("marks Command Center tile as active when at /admin/dashboard", async () => {
    await renderShell("/admin/dashboard");
    // Active tile: box-shadow glow is present (not "none")
    const link = document.querySelector<HTMLElement>('a[href="/admin/dashboard"]');
    expect(link).toBeTruthy();
    const style = link!.getAttribute("style") ?? "";
    expect(style).toMatch(/box-shadow: 0 0 12px/);
  });

  it("marks Morning Brief tile as active when at /admin/morning-brief", async () => {
    await renderShell("/admin/morning-brief");
    // Active tile: box-shadow glow is present (not "none")
    const link = document.querySelector<HTMLElement>('a[href="/admin/morning-brief"]');
    expect(link).toBeTruthy();
    const style = link!.getAttribute("style") ?? "";
    expect(style).toMatch(/box-shadow: 0 0 12px/);
  });

  it("does NOT mark dashboard tile active when on a different route", async () => {
    await renderShell("/admin/morning-brief");
    // Inactive tile: box-shadow is "none"
    const dashLink = document.querySelector<HTMLElement>('a[href="/admin/dashboard"]');
    expect(dashLink).toBeTruthy();
    const style = dashLink!.getAttribute("style") ?? "";
    expect(style).toContain("box-shadow: none");
  });
});

// ── NAVIGATION TARGETS ────────────────────────────────────────────────────────

describe("AppShell — navigation targets", () => {
  beforeEach(() => vi.resetModules());

  it("Command Center tile links to /admin/dashboard", async () => {
    await renderShell("/admin/dashboard");
    expect(document.querySelector('a[href="/admin/dashboard"]')).toBeTruthy();
  });

  it("Lead Recovery tile links to /admin/lead-recovery", async () => {
    await renderShell("/admin/dashboard");
    expect(document.querySelector('a[href="/admin/lead-recovery"]')).toBeTruthy();
  });

  it("Local Presence tile links to /admin/local-presence", async () => {
    await renderShell("/admin/dashboard");
    expect(document.querySelector('a[href="/admin/local-presence"]')).toBeTruthy();
  });

  it("Publishing Center tile links to /admin/social-publishing", async () => {
    await renderShell("/admin/dashboard");
    expect(document.querySelector('a[href="/admin/social-publishing"]')).toBeTruthy();
  });

  it("Growth Execution tile links to /admin/bbb-execution", async () => {
    await renderShell("/admin/dashboard");
    expect(document.querySelector('a[href="/admin/bbb-execution"]')).toBeTruthy();
  });
});

// ── SIDEBAR CONTROLS ─────────────────────────────────────────────────────────

describe("AppShell — sidebar controls", () => {
  beforeEach(() => vi.resetModules());

  it("renders logo image", async () => {
    await renderShell();
    const logo = screen.getAllByAltText("AI Edge Solutions")[0];
    expect(logo).toBeTruthy();
  });

  it("renders theme toggle button", async () => {
    await renderShell();
    expect(screen.getByTitle(/Switch to Light Mode/i)).toBeTruthy();
  });

  it("renders Edit Order button", async () => {
    await renderShell();
    const editBtn = screen.getByText("Edit Order");
    expect(editBtn).toBeTruthy();
  });

  it("toggles to Done when Edit Order is clicked", async () => {
    await renderShell();
    const editBtn = screen.getByText("Edit Order");
    fireEvent.click(editBtn);
    expect(screen.getByText("Done")).toBeTruthy();
  });

  it("shows Reset Order button in edit mode", async () => {
    await renderShell();
    fireEvent.click(screen.getByText("Edit Order"));
    expect(screen.getByText(/Reset Order/i)).toBeTruthy();
  });

  it("renders Advanced & Future Tools toggle", async () => {
    await renderShell();
    expect(screen.getByText(/Advanced.*Future Tools/i)).toBeTruthy();
  });

  it("shows secondary nav when Advanced toggle is clicked", async () => {
    await renderShell();
    const toggle = screen.getByText(/Advanced.*Future Tools/i).closest("button")!;
    fireEvent.click(toggle);
    expect(document.querySelector('a[href="/admin/profit-center"]')).toBeTruthy();
  });

  it("renders user email address", async () => {
    await renderShell();
    expect(screen.getByText("test@aiedge.com")).toBeTruthy();
  });

  it("renders Sign out button", async () => {
    await renderShell();
    // Both sidebar and mobile header can render sign-out; at least one must exist
    expect(screen.getAllByText(/Sign out/i).length).toBeGreaterThanOrEqual(1);
  });

  it("renders Back to Website link", async () => {
    await renderShell();
    expect(screen.getByText(/Back to Website/i)).toBeTruthy();
  });

  it("renders main content area to the right of sidebar", async () => {
    await renderShell();
    expect(screen.getByText("Main Content")).toBeTruthy();
  });

  it("renders back-to-command-center breadcrumb on non-dashboard routes", async () => {
    await renderShell("/admin/lead-recovery");
    // The breadcrumb text is "← Command Center" — unique arrow prefix avoids ambiguity
    const crumbs = screen.queryAllByText(/← Command Center/i);
    expect(crumbs.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT render breadcrumb on /admin/dashboard", async () => {
    await renderShell("/admin/dashboard");
    const crumbs = screen.queryAllByText(/← Command Center/i);
    expect(crumbs).toHaveLength(0);
  });
});

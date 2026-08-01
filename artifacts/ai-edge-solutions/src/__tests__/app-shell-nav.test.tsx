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

let mockLocation = "/admin/dashboard";
vi.mock("wouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("wouter")>();
  return {
    ...actual,
    useLocation: () => [mockLocation],
    Link: ({
      to, children, style, ...rest
    }: { to: string; children: ReactNode; style?: React.CSSProperties; [k: string]: unknown }) =>
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

vi.mock("@/contexts/business-context", () => ({
  useActiveBusiness: () => ({
    activeBusiness: {
      id: "bed-bugs-and-beyond",
      name: "Bed Bugs & Beyond",
      shortName: "BB&B",
      profile: {
        businessName: "Bed Bugs and Beyond",
        websiteUrl: "https://bedbugsandbeyond.net",
        industry: "Pest Control",
        city: "Foley", state: "Alabama",
        mainServices: "Pest control", targetCustomers: "Homeowners",
      },
      status: "active",
    },
    businesses: [
      {
        id: "bed-bugs-and-beyond", name: "Bed Bugs & Beyond", shortName: "BB&B",
        profile: { businessName: "Bed Bugs and Beyond", industry: "Pest Control", city: "Foley", state: "Alabama", websiteUrl: "", mainServices: "", targetCustomers: "" },
        status: "active",
      },
      {
        id: "simplishelling", name: "SimpliShelling", shortName: "SS",
        profile: { businessName: "SimpliShelling", industry: "E-commerce / Retail", city: "Gulf Shores", state: "Alabama", websiteUrl: "", mainServices: "", targetCustomers: "" },
        status: "onboarding",
      },
    ],
    setActiveBusinessId: vi.fn(),
  }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

async function renderShell(location = "/admin/dashboard") {
  mockLocation = location;
  const { AppShell } = await import("../components/app-shell");
  return render(<AppShell><div>Main Content</div></AppShell>);
}

// ── TOP NAV BAR ───────────────────────────────────────────────────────────────

describe("AppShell — top navigation bar", () => {
  beforeEach(() => vi.resetModules());

  it("renders the AI Edge logo", async () => {
    await renderShell();
    expect(screen.getAllByAltText("AI Edge Solutions").length).toBeGreaterThanOrEqual(1);
  });

  it("logo links to /admin/dashboard", async () => {
    await renderShell();
    expect(document.querySelector('a[href="/admin/dashboard"]')).toBeTruthy();
  });

  it("renders theme toggle button", async () => {
    await renderShell();
    expect(screen.getByTitle(/Switch to Light Mode/i)).toBeTruthy();
  });

  it("renders the user email address", async () => {
    await renderShell();
    expect(screen.getByText("test@aiedge.com")).toBeTruthy();
  });

  it("renders sign out button", async () => {
    await renderShell();
    expect(screen.getAllByText(/Sign out/i).length).toBeGreaterThanOrEqual(1);
  });

  it("renders main content", async () => {
    await renderShell();
    expect(screen.getByText("Main Content")).toBeTruthy();
  });
});

// ── BUSINESS TABS ─────────────────────────────────────────────────────────────

describe("AppShell — business tabs", () => {
  beforeEach(() => vi.resetModules());

  it("renders a tablist with aria-label", async () => {
    await renderShell();
    expect(document.querySelector('[role="tablist"]')).toBeTruthy();
  });

  it("renders one tab per business", async () => {
    await renderShell();
    const tabs = document.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(2);
  });

  it("shows active business tab as selected", async () => {
    await renderShell();
    const tabs = document.querySelectorAll('[role="tab"]');
    const activeTab = Array.from(tabs).find(t => t.getAttribute("aria-selected") === "true");
    expect(activeTab).toBeTruthy();
    expect(activeTab!.textContent).toContain("Bed Bugs & Beyond");
  });

  it("shows all business names as tabs (always visible, no dropdown)", async () => {
    await renderShell();
    expect(screen.getByText("SimpliShelling")).toBeTruthy();
    expect(screen.getAllByText(/Bed Bugs & Beyond/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows onboarding status for non-active business tab", async () => {
    await renderShell();
    expect(screen.getByText(/Onboarding/i)).toBeTruthy();
  });

  it("shows industry info in each tab", async () => {
    await renderShell();
    expect(screen.getByText("Pest Control")).toBeTruthy();
  });

  it("marks inactive tab as aria-selected=false", async () => {
    await renderShell();
    const tabs = document.querySelectorAll('[role="tab"]');
    const inactiveTab = Array.from(tabs).find(t => t.getAttribute("aria-selected") === "false");
    expect(inactiveTab).toBeTruthy();
    expect(inactiveTab!.textContent).toContain("SimpliShelling");
  });
});

// ── NO SIDEBAR ────────────────────────────────────────────────────────────────

describe("AppShell — sidebar removed", () => {
  beforeEach(() => vi.resetModules());

  it("does not render a .app-sidebar element", async () => {
    await renderShell();
    expect(document.querySelector(".app-sidebar")).toBeNull();
  });

  it("does not render the Edit Order button", async () => {
    await renderShell();
    expect(screen.queryByText("Edit Order")).toBeNull();
  });

  it("does not render Advanced & Future Tools toggle", async () => {
    await renderShell();
    expect(screen.queryByText(/Advanced.*Future Tools/i)).toBeNull();
  });
});

// ── COMMAND EDGE CENTER FLOATING CONTROL ─────────────────────────────────────

describe("AppShell — Command Edge Center floating control", () => {
  beforeEach(() => vi.resetModules());

  it("shows the exact visible label on non-dashboard routes", async () => {
    await renderShell("/admin/lead-recovery");
    const link = screen.getByRole("link", { name: "Open Command Edge Center" });
    expect(link.textContent?.trim()).toBe("Command Edge Center");
    expect(link.querySelector(".command-edge-center-icon")).toBeTruthy();
    expect(link.querySelector(".command-edge-center-chevron")).toBeTruthy();
  });

  it("preserves the dashboard destination", async () => {
    await renderShell("/admin/reviews");
    const link = screen.getByRole("link", { name: "Open Command Edge Center" });
    expect(link.getAttribute("href")).toBe("/admin/dashboard");
  });

  it("is a fixed floating control with a reserved content gutter", async () => {
    await renderShell("/admin/reviews");
    const link = screen.getByRole("link", { name: "Open Command Edge Center" });
    const main = document.querySelector("main");
    const styles = Array.from(document.querySelectorAll("style")).map(style => style.textContent).join("\n");

    expect(link.classList.contains("command-edge-center-link")).toBe(true);
    expect(main?.classList.contains("app-main--with-command-edge")).toBe(true);
    expect(styles).toContain("position: fixed");
    expect(styles).toContain("padding-left: 252px");
  });

  it("is keyboard focusable and exposes a visible focus treatment", async () => {
    await renderShell("/admin/reviews");
    const link = screen.getByRole("link", { name: "Open Command Edge Center" });
    link.focus();
    const styles = Array.from(document.querySelectorAll("style")).map(style => style.textContent).join("\n");

    expect(document.activeElement).toBe(link);
    expect(link.tabIndex).toBe(0);
    expect(styles).toContain(".command-edge-center-link:focus-visible");
  });

  it("ships compact responsive docking and reduced-motion rules", async () => {
    await renderShell("/admin/reviews");
    const styles = Array.from(document.querySelectorAll("style")).map(style => style.textContent).join("\n");

    expect(styles).toContain("@media (max-width: 1100px)");
    expect(styles).toContain("@media (max-width: 560px)");
    expect(styles).toContain("padding-bottom: 88px");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("does NOT show the return control on /admin/dashboard", async () => {
    await renderShell("/admin/dashboard");
    expect(screen.queryByRole("link", { name: "Open Command Edge Center" })).toBeNull();
    expect(document.querySelector("main")?.classList.contains("app-main--with-command-edge")).toBe(false);
  });
});

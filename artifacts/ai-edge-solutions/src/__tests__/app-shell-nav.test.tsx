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
        profile: {}, status: "active",
      },
      {
        id: "simplishelling", name: "SimpliShelling", shortName: "SS",
        profile: {}, status: "onboarding",
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

// ── BUSINESS SELECTOR ─────────────────────────────────────────────────────────

describe("AppShell — business selector", () => {
  beforeEach(() => vi.resetModules());

  it("shows 'Active Business' label", async () => {
    await renderShell();
    expect(screen.getByText(/Active Business/i)).toBeTruthy();
  });

  it("shows active business name in selector", async () => {
    await renderShell();
    expect(screen.getAllByText(/Bed Bugs & Beyond/i).length).toBeGreaterThanOrEqual(1);
  });

  it("has a selector button with aria-label", async () => {
    await renderShell();
    expect(screen.getByLabelText(/Select active business/i)).toBeTruthy();
  });

  it("opens dropdown on selector click", async () => {
    await renderShell();
    const btn = screen.getByLabelText(/Select active business/i);
    fireEvent.click(btn);
    expect(screen.getByText(/Select Business/i)).toBeTruthy();
  });

  it("lists all businesses in dropdown", async () => {
    await renderShell();
    fireEvent.click(screen.getByLabelText(/Select active business/i));
    expect(screen.getByText("SimpliShelling")).toBeTruthy();
  });

  it("shows onboarding status for non-active businesses", async () => {
    await renderShell();
    fireEvent.click(screen.getByLabelText(/Select active business/i));
    expect(screen.getByText("onboarding")).toBeTruthy();
  });

  it("closes dropdown when same item is selected", async () => {
    await renderShell();
    fireEvent.click(screen.getByLabelText(/Select active business/i));
    expect(screen.getByText(/Select Business/i)).toBeTruthy();
    const items = screen.getAllByText(/Bed Bugs & Beyond/i);
    fireEvent.click(items[items.length - 1]);
    expect(screen.queryByText(/Select Business/i)).toBeNull();
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

// ── BREADCRUMB ────────────────────────────────────────────────────────────────

describe("AppShell — breadcrumb navigation", () => {
  beforeEach(() => vi.resetModules());

  it("shows ← Command Center breadcrumb on non-dashboard routes", async () => {
    await renderShell("/admin/lead-recovery");
    expect(screen.getAllByText(/← Command Center/i).length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT show breadcrumb on /admin/dashboard", async () => {
    await renderShell("/admin/dashboard");
    expect(screen.queryAllByText(/← Command Center/i)).toHaveLength(0);
  });

  it("shows breadcrumb on /admin/reviews", async () => {
    await renderShell("/admin/reviews");
    expect(screen.getAllByText(/← Command Center/i).length).toBeGreaterThanOrEqual(1);
  });
});

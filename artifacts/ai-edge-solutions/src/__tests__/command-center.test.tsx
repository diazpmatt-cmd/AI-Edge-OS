import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";

// ── Mock heavy external deps ──────────────────────────────────────────────────

vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: { firstName: "Test", primaryEmailAddress: { emailAddress: "test@example.com" } } }),
  useClerk: () => ({ signOut: vi.fn() }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
    useQueryClient: () => ({ cancelQueries: vi.fn(), clear: vi.fn() }),
  };
});

vi.mock("wouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("wouter")>();
  return {
    ...actual,
    useLocation: () => ["/admin/dashboard"],
    Link: ({ to, children, ...rest }: { to: string; children: ReactNode; [k: string]: unknown }) =>
      <a href={to} {...rest}>{children}</a>,
  };
});

vi.mock("@/lib/gorilladesk-analytics", () => ({
  useGorilladeskAnalytics: () => ({
    data: { revenue: null, jobs: null, customers: null, payments: null, marketing: null },
    loading: false, error: null, syncing: false, lastSyncedAt: null,
    syncFromGorillaDesk: vi.fn(),
  }),
}));

vi.mock("@/hooks/useLeadsQuery", () => ({
  useLeadsQuery: () => ({ data: null, isLoading: false }),
}));

vi.mock("@/hooks/useCallIntelligenceQuery", () => ({
  useCallIntelligenceQuery: () => ({
    data: {
      metrics: { missed_calls: 3, leads_captured: 1, recovery_rate: null, total_calls: 10, transferred_calls: 2, sms_conversations: 5 },
      recent_activity: [],
    },
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useSocialPostsQuery", () => ({
  useSocialPostsQuery: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/lib/insights", () => ({
  useInsights: () => ({
    insights: [],
    generatedAt: null,
    dataSources: [],
    loading: false,
    error: null,
  }),
}));

vi.mock("@/lib/api", () => ({
  useApiFetch: () => vi.fn(() => Promise.resolve({})),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/contexts/business-context", () => ({
  useActiveBusiness: () => ({
    activeBusiness: {
      id: "bed-bugs-and-beyond",
      name: "Bed Bugs & Beyond",
      currentTier: "core",
      profile: {
        businessName: "Bed Bugs & Beyond",
        industry: "Pest Control",
        city: "Foley",
        state: "AL",
        mainServices: ["bed bug inspection", "fumigation"],
        targetCustomers: ["homeowners", "hotels"],
      },
    },
  }),
}));

vi.mock("@/lib/business-data", () => ({
  loadProfile: () => ({
    businessName: "Bed Bugs & Beyond", industry: "Pest Control",
    city: "Foley", state: "AL",
    mainServices: ["bed bug inspection", "heat treatment"],
    targetCustomers: ["homeowners", "hotels"],
  }),
}));

vi.mock("@/lib/keywords-store", () => ({
  fetchKeywords: vi.fn(() => Promise.resolve([])),
  insertKeywords: vi.fn(k => Promise.resolve(k)),
  clearKeywords: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/articles-store", () => ({
  fetchArticles: vi.fn(() => Promise.resolve([])),
  insertArticles: vi.fn(a => Promise.resolve(a)),
  clearArticles: vi.fn(() => Promise.resolve()),
  buildContentPlan: vi.fn(() => []),
}));

vi.mock("@/lib/keywords.functions", () => ({
  generateKeywordIdeas: vi.fn(() => Promise.resolve({ keywords: [] })),
}));

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

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// ── Main + handoff integration invariants ─────────────────────────────────────

describe("Command Center handoff integration", () => {
  it("preserves main navigation hierarchy while activating every handoff module route", async () => {
    const { SECTIONS } = await import("../pages/command-center/ModulePackageGrid");
    const tiles = SECTIONS.flatMap(section => section.tiles);

    expect(SECTIONS.find(section => section.id === "gbp-engine")?.name)
      .toBe("GBP Audit & Optimization Engine");
    expect(SECTIONS.find(section => section.id === "local-presence")?.name)
      .toBe("Local Presence Engine");

    for (const route of [
      "/admin/ai-visibility",
      "/admin/competitor-intelligence",
      "/admin/authority-engine",
      "/admin/edge-opportunities",
      "/admin/web-leads",
      "/admin/referrals",
    ]) {
      const tile = tiles.find(candidate => candidate.to === route);
      expect(tile, `missing integrated route ${route}`).toBeDefined();
      expect(tile?.comingSoon).not.toBe(true);
    }
  });

  it("preserves the main SEO dashboard and adds business-aware GBP health", async () => {
    const { default: CommandCenter } = await import("../pages/command-center");
    render(<CommandCenter />);

    expect(screen.getByText("SEO Content Engine")).toBeTruthy();
    expect(screen.getByText("GBP Health")).toBeTruthy();
    expect(screen.getByText("YOUR PLAN")).toBeTruthy();
  });
});

// ── DashboardSection ──────────────────────────────────────────────────────────

describe("DashboardSection", () => {
  beforeEach(() => { localStorage.clear(); });

  it("renders children when expanded by default", async () => {
    const { DashboardSection } = await import("../pages/command-center/DashboardSection");
    render(
      <DashboardSection id="test-section" title="Test Section">
        <span>Section Content</span>
      </DashboardSection>
    );
    expect(screen.getByText("Section Content")).toBeTruthy();
  });

  it("hides children when defaultExpanded=false", async () => {
    const { DashboardSection } = await import("../pages/command-center/DashboardSection");
    render(
      <DashboardSection id="test-section2" title="Test Section" defaultExpanded={false}>
        <span>Hidden Content</span>
      </DashboardSection>
    );
    expect(screen.queryByText("Hidden Content")).toBeNull();
  });

  it("toggles children on header click", async () => {
    const { DashboardSection } = await import("../pages/command-center/DashboardSection");
    render(
      <DashboardSection id="test-toggle" title="Toggle Test">
        <span>Toggled Content</span>
      </DashboardSection>
    );
    const header = screen.getByRole("button", { name: /Toggle Test/i });
    expect(screen.getByText("Toggled Content")).toBeTruthy();
    fireEvent.click(header);
    expect(screen.queryByText("Toggled Content")).toBeNull();
    fireEvent.click(header);
    expect(screen.getByText("Toggled Content")).toBeTruthy();
  });

  it("persists collapsed state to localStorage", async () => {
    const { DashboardSection } = await import("../pages/command-center/DashboardSection");
    const { unmount } = render(
      <DashboardSection id="persist-test" title="Persist Test">
        <span>Content</span>
      </DashboardSection>
    );
    const header = screen.getByRole("button", { name: /Persist Test/i });
    fireEvent.click(header);
    unmount();
    expect(localStorage.getItem("cc-section-persist-test")).toBe("false");
  });

  it("restores collapsed state from localStorage", async () => {
    localStorage.setItem("cc-section-restore-test", "false");
    const { DashboardSection } = await import("../pages/command-center/DashboardSection");
    render(
      <DashboardSection id="restore-test" title="Restore Test">
        <span>Restore Content</span>
      </DashboardSection>
    );
    expect(screen.queryByText("Restore Content")).toBeNull();
  });

  it("renders right slot in header", async () => {
    const { DashboardSection } = await import("../pages/command-center/DashboardSection");
    render(
      <DashboardSection id="right-test" title="Right Test" right={<span>Right Slot</span>}>
        <span>Body</span>
      </DashboardSection>
    );
    expect(screen.getByText("Right Slot")).toBeTruthy();
  });
});

// ── ExecutiveHeader ───────────────────────────────────────────────────────────

describe("ExecutiveHeader", () => {
  it("renders business name", async () => {
    const { ExecutiveHeader } = await import("../pages/command-center/ExecutiveHeader");
    render(
      <ExecutiveHeader businessName="Test Business" healthStatus="healthy" aiStatus="active" activeAutomations={4} />
    );
    expect(screen.getByText(/Test Business/)).toBeTruthy();
  });

  it("shows action-required badge for critical status", async () => {
    const { ExecutiveHeader } = await import("../pages/command-center/ExecutiveHeader");
    render(
      <ExecutiveHeader businessName="Test" healthStatus="critical" aiStatus="active" activeAutomations={2} />
    );
    expect(screen.getByText(/Action Required/i)).toBeTruthy();
  });

  it("shows healthy badge for healthy status", async () => {
    const { ExecutiveHeader } = await import("../pages/command-center/ExecutiveHeader");
    render(
      <ExecutiveHeader businessName="Test" healthStatus="healthy" aiStatus="active" activeAutomations={4} />
    );
    expect(screen.getByText(/healthy/i)).toBeTruthy();
  });

  it("displays active automation count", async () => {
    const { ExecutiveHeader } = await import("../pages/command-center/ExecutiveHeader");
    render(
      <ExecutiveHeader businessName="Test" healthStatus="healthy" aiStatus="active" activeAutomations={7} />
    );
    expect(screen.getByText(/7/)).toBeTruthy();
  });

  it("renders topPriorityAction when provided", async () => {
    const { ExecutiveHeader } = await import("../pages/command-center/ExecutiveHeader");
    render(
      <ExecutiveHeader
        businessName="Test" healthStatus="warning" aiStatus="active" activeAutomations={2}
        topPriorityAction="Fix your phone system"
        topPriorityLink="/admin/lead-recovery"
      />
    );
    expect(screen.getByText(/Fix your phone system/i)).toBeTruthy();
  });

  it("omits priority banner when topPriorityAction is undefined", async () => {
    const { ExecutiveHeader } = await import("../pages/command-center/ExecutiveHeader");
    render(
      <ExecutiveHeader businessName="Test" healthStatus="healthy" aiStatus="active" activeAutomations={3} />
    );
    expect(screen.queryByText(/Priority Action/i)).toBeNull();
  });
});

// ── ExecutiveKpiGrid ──────────────────────────────────────────────────────────

describe("ExecutiveKpiGrid", () => {
  const cards = [
    { id: "a", label: "Revenue",         value: "$12,000", sub: "30 days",  status: "healthy" as const, color: "#F59E0B" },
    { id: "b", label: "Leads",           value: "5",       sub: "active",   status: "healthy" as const, color: "#22C55E" },
    { id: "c", label: "Reputation",      value: "—",       sub: "Setup",    status: "pending" as const, color: "#F59E0B" },
    { id: "d", label: "Local Visibility",value: "Partial", sub: "4 pltfms", status: "warning" as const, color: "#00AEEF" },
    { id: "e", label: "AI Productivity", value: "6",       sub: "items",    status: "healthy" as const, color: "#8B5CF6" },
  ];

  it("renders all KPI card labels", async () => {
    const { ExecutiveKpiGrid } = await import("../pages/command-center/ExecutiveKpiGrid");
    render(<ExecutiveKpiGrid cards={cards} />);
    expect(screen.getByText("Revenue")).toBeTruthy();
    expect(screen.getByText("Leads")).toBeTruthy();
    expect(screen.getByText("Reputation")).toBeTruthy();
    expect(screen.getByText("Local Visibility")).toBeTruthy();
    expect(screen.getByText("AI Productivity")).toBeTruthy();
  });

  it("renders KPI values", async () => {
    const { ExecutiveKpiGrid } = await import("../pages/command-center/ExecutiveKpiGrid");
    render(<ExecutiveKpiGrid cards={cards} />);
    expect(screen.getByText("$12,000")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
  });

  it("renders loading state", async () => {
    const { ExecutiveKpiGrid } = await import("../pages/command-center/ExecutiveKpiGrid");
    const loadingCards = [
      { id: "a", label: "Revenue", value: "…", sub: "Loading", status: "pending" as const, color: "#F59E0B", loading: true },
    ];
    render(<ExecutiveKpiGrid cards={loadingCards} />);
    expect(screen.getByText("Revenue")).toBeTruthy();
  });

  it("renders setup-required badge", async () => {
    const { ExecutiveKpiGrid } = await import("../pages/command-center/ExecutiveKpiGrid");
    const setupCards = [
      { id: "c", label: "Reputation", value: "—", sub: "Setup required", status: "setup-required" as const, color: "#F59E0B", setupRequired: true },
    ];
    render(<ExecutiveKpiGrid cards={setupCards} />);
    const matches = screen.getAllByText(/Setup required/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});

// ── OpportunityCenter ─────────────────────────────────────────────────────────

describe("OpportunityCenter", () => {
  it("renders no-data state when API returns no data", async () => {
    const { OpportunityCenter } = await import("../pages/command-center/OpportunityCenter");
    render(<OpportunityCenter />);
    expect(screen.getByText(/No opportunities scored yet/i)).toBeTruthy();
  });

  it("shows Run Discovery CTA in no-data state", async () => {
    const { OpportunityCenter } = await import("../pages/command-center/OpportunityCenter");
    render(<OpportunityCenter />);
    expect(screen.getByRole("button", { name: /Run Discovery/i })).toBeTruthy();
  });

  it("Run Discovery links to /admin/competitor-intelligence", async () => {
    const { OpportunityCenter } = await import("../pages/command-center/OpportunityCenter");
    render(<OpportunityCenter />);
    const link = document.querySelector('a[href="/admin/competitor-intelligence"]');
    expect(link).toBeTruthy();
  });
});

// ── SystemStatusPanel ─────────────────────────────────────────────────────────

describe("SystemStatusPanel", () => {
  it("renders key module names", async () => {
    const { SystemStatusPanel } = await import("../pages/command-center/SystemStatusPanel");
    render(<SystemStatusPanel />);
    expect(screen.getByText(/Lead Recovery AI/i)).toBeTruthy();
    expect(screen.getByText(/Local Edge Presence/i)).toBeTruthy();
    expect(screen.getByText(/System Diagnostics/i)).toBeTruthy();
  });

  it("renders Open buttons for each module", async () => {
    const { SystemStatusPanel } = await import("../pages/command-center/SystemStatusPanel");
    render(<SystemStatusPanel />);
    const opens = screen.getAllByRole("button", { name: /Open/i });
    expect(opens.length).toBeGreaterThanOrEqual(4);
  });

  it("renders status labels", async () => {
    const { SystemStatusPanel } = await import("../pages/command-center/SystemStatusPanel");
    render(<SystemStatusPanel />);
    expect(screen.getAllByText(/Active|Ready|In Progress|Pending|Monitoring|Partial/i).length).toBeGreaterThanOrEqual(3);
  });
});

// ── AiActivityFeed ────────────────────────────────────────────────────────────

describe("AiActivityFeed (empty state)", () => {
  it("renders empty state when no posts or CI data", async () => {
    const { AiActivityFeed } = await import("../pages/command-center/AiActivityFeed");
    render(<AiActivityFeed />);
    expect(screen.getByText(/No AI activity yet/i)).toBeTruthy();
  });

  it("shows description in empty state", async () => {
    const { AiActivityFeed } = await import("../pages/command-center/AiActivityFeed");
    render(<AiActivityFeed />);
    expect(screen.getByText(/Activity appears here/i)).toBeTruthy();
  });
});

// ── BusinessHealthPanel ───────────────────────────────────────────────────────

describe("BusinessHealthPanel", () => {
  it("renders health metric rows", async () => {
    const { BusinessHealthPanel } = await import("../pages/command-center/BusinessHealthPanel");
    render(<BusinessHealthPanel />);
    expect(screen.getByText(/Business Edge Profile/i)).toBeTruthy();
    expect(screen.getByText(/Bing Places/i)).toBeTruthy();
  });

  it("renders action buttons for each health row", async () => {
    const { BusinessHealthPanel } = await import("../pages/command-center/BusinessHealthPanel");
    render(<BusinessHealthPanel />);
    const improveBtns = screen.getAllByRole("button", { name: /Improve/i });
    expect(improveBtns.length).toBeGreaterThanOrEqual(2);
  });
});

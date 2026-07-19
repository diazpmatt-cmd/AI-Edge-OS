import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@clerk/react", () => ({
  useUser:  () => ({ user: { firstName: "Test", primaryEmailAddress: { emailAddress: "test@example.com" } } }),
  useClerk: () => ({ signOut: vi.fn() }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery:       vi.fn(() => ({ data: undefined, isLoading: false, isError: false })),
    useQueryClient: () => ({ invalidateQueries: vi.fn(), cancelQueries: vi.fn(), clear: vi.fn() }),
  };
});

vi.mock("wouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("wouter")>();
  return {
    ...actual,
    useLocation: () => ["/admin/edge-opportunities"],
    Link: ({ to, children, ...rest }: { to: string; children: ReactNode; [k: string]: unknown }) =>
      <a href={to} {...rest}>{children}</a>,
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
      id: "bbb", name: "Bed Bugs & Beyond", shortName: "BB&B",
      profile: { businessName: "Bed Bugs and Beyond", industry: "Pest Control", city: "Las Vegas", state: "NV", websiteUrl: "", mainServices: "", targetCustomers: "" },
      status: "active",
    },
    businesses: [],
    setActiveBusinessId: vi.fn(),
  }),
}));

vi.mock("@/lib/api", () => ({
  useApiFetch: () => vi.fn(() => Promise.resolve({})),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const HIGH_OPP = {
  id: "h1", title: "High-Value Keyword Gap",
  description: "Target competitor keywords in pest control niche.",
  opportunityType: "content", targetEngine: "content",
  compositeScore: 88, priority: "high",
  scoreCard: {}, status: "new", createdAt: "2026-07-01T00:00:00Z",
};

const MED_OPP = {
  id: "m1", title: "Local Citation Opportunity",
  description: "Build citations on missing directories.",
  opportunityType: "optimization", targetEngine: "optimization",
  compositeScore: 55, priority: "medium",
  scoreCard: {}, status: "new", createdAt: "2026-07-01T00:00:00Z",
};

const LOW_OPP = {
  id: "l1", title: "Social Backlink Signal",
  description: "Acquire social profile backlinks.",
  opportunityType: "backlink", targetEngine: "backlink",
  compositeScore: 28, priority: "low",
  scoreCard: {}, status: "new", createdAt: "2026-07-01T00:00:00Z",
};

// ── Pure helper logic (inline re-implementation for unit testing) ──────────────

function scoreColor(score: number): string {
  if (score >= 70) return "#22C55E";
  if (score >= 40) return "#F59E0B";
  return "#8B5CF6";
}

function priorityColor(p: string): string {
  const m: Record<string, string> = { high: "#22C55E", medium: "#F59E0B", low: "#8B5CF6" };
  return m[p] ?? "#34D399";
}

function groupByPriority(opps: typeof HIGH_OPP[]) {
  const grouped: Record<string, typeof HIGH_OPP[]> = { high: [], medium: [], low: [] };
  for (const opp of opps) {
    const key = opp.priority in grouped ? opp.priority : "low";
    grouped[key].push(opp);
  }
  return grouped;
}

// ── Pure logic tests ──────────────────────────────────────────────────────────

describe("scoreColor()", () => {
  it("returns green for scores >= 70", () => {
    expect(scoreColor(70)).toBe("#22C55E");
    expect(scoreColor(88)).toBe("#22C55E");
    expect(scoreColor(100)).toBe("#22C55E");
  });

  it("returns amber for scores 40–69", () => {
    expect(scoreColor(40)).toBe("#F59E0B");
    expect(scoreColor(55)).toBe("#F59E0B");
    expect(scoreColor(69)).toBe("#F59E0B");
  });

  it("returns purple for scores < 40", () => {
    expect(scoreColor(0)).toBe("#8B5CF6");
    expect(scoreColor(28)).toBe("#8B5CF6");
    expect(scoreColor(39)).toBe("#8B5CF6");
  });
});

describe("priorityColor()", () => {
  it("maps high → green", () => {
    expect(priorityColor("high")).toBe("#22C55E");
  });
  it("maps medium → amber", () => {
    expect(priorityColor("medium")).toBe("#F59E0B");
  });
  it("maps low → purple", () => {
    expect(priorityColor("low")).toBe("#8B5CF6");
  });
  it("falls back to accent for unknown priority", () => {
    expect(priorityColor("unknown")).toBe("#34D399");
  });
});

describe("groupByPriority()", () => {
  it("groups opportunities by priority tier", () => {
    const g = groupByPriority([HIGH_OPP, MED_OPP, LOW_OPP]);
    expect(g.high).toHaveLength(1);
    expect(g.medium).toHaveLength(1);
    expect(g.low).toHaveLength(1);
  });

  it("places unknown priority into low bucket", () => {
    const unknown = { ...LOW_OPP, id: "u1", priority: "critical" };
    const g = groupByPriority([unknown]);
    expect(g.low).toHaveLength(1);
    expect(g.high).toHaveLength(0);
    expect(g.medium).toHaveLength(0);
  });

  it("preserves backend ordering within each tier", () => {
    const a = { ...HIGH_OPP, id: "a", compositeScore: 95 };
    const b = { ...HIGH_OPP, id: "b", compositeScore: 80 };
    const g = groupByPriority([a, b]);
    expect(g.high[0].id).toBe("a");
    expect(g.high[1].id).toBe("b");
  });

  it("handles empty array", () => {
    const g = groupByPriority([]);
    expect(g.high).toHaveLength(0);
    expect(g.medium).toHaveLength(0);
    expect(g.low).toHaveLength(0);
  });
});

// ── OpportunityCenter — live states ──────────────────────────────────────────

describe("OpportunityCenter — live states", () => {
  it("renders no-data state when API returns undefined", async () => {
    const { OpportunityCenter } = await import("../pages/command-center/OpportunityCenter");
    render(<OpportunityCenter />);
    expect(screen.getByText(/No opportunities scored yet/i)).toBeTruthy();
  });

  it("shows Run Discovery CTA in no-data state", async () => {
    const { OpportunityCenter } = await import("../pages/command-center/OpportunityCenter");
    render(<OpportunityCenter />);
    expect(screen.getByRole("button", { name: /Run Discovery/i })).toBeTruthy();
  });

  it("Run Discovery CTA links to /admin/competitor-intelligence", async () => {
    const { OpportunityCenter } = await import("../pages/command-center/OpportunityCenter");
    render(<OpportunityCenter />);
    const link = document.querySelector('a[href="/admin/competitor-intelligence"]');
    expect(link).toBeTruthy();
  });

  it("renders live opportunity title when API has data", async () => {
    const { useQuery } = await import("@tanstack/react-query");
    vi.mocked(useQuery).mockReturnValueOnce({
      data: { hasData: true, opportunities: [HIGH_OPP, MED_OPP], count: 2, runId: "r1" },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useQuery>);
    const { OpportunityCenter } = await import("../pages/command-center/OpportunityCenter");
    render(<OpportunityCenter />);
    expect(screen.getByText("High-Value Keyword Gap")).toBeTruthy();
  });

  it("renders 'View all' link to /admin/edge-opportunities when has data", async () => {
    const { useQuery } = await import("@tanstack/react-query");
    vi.mocked(useQuery).mockReturnValueOnce({
      data: { hasData: true, opportunities: [HIGH_OPP, MED_OPP], count: 5, runId: "r1" },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useQuery>);
    const { OpportunityCenter } = await import("../pages/command-center/OpportunityCenter");
    render(<OpportunityCenter />);
    const viewAllLink = document.querySelector('a[href="/admin/edge-opportunities"]');
    expect(viewAllLink).toBeTruthy();
  });

  it("shows skeleton cards while loading", async () => {
    const { useQuery } = await import("@tanstack/react-query");
    vi.mocked(useQuery).mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useQuery>);
    const { OpportunityCenter } = await import("../pages/command-center/OpportunityCenter");
    const { container } = render(<OpportunityCenter />);
    expect(screen.queryByText(/No opportunities scored yet/i)).toBeNull();
    expect(container.querySelector("[style*='animation']")).toBeTruthy();
  });
});

// ── EdgeOpportunitiesPage — states ────────────────────────────────────────────

describe("EdgeOpportunitiesPage — loading state", () => {
  it("renders skeleton during load", async () => {
    const { useQuery } = await import("@tanstack/react-query");
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);
    const { default: EdgeOpportunitiesPage } = await import("../pages/EdgeOpportunitiesPage");
    const { container } = render(<EdgeOpportunitiesPage />);
    expect(container.querySelector("[style*='animation']")).toBeTruthy();
    expect(screen.queryByText(/Edge Opportunities/)).toBeTruthy();
  });
});

describe("EdgeOpportunitiesPage — empty state", () => {
  it("renders empty state when hasData is false", async () => {
    const { useQuery } = await import("@tanstack/react-query");
    vi.mocked(useQuery).mockReturnValue({
      data: { hasData: false, opportunities: [], count: 0 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);
    const { default: EdgeOpportunitiesPage } = await import("../pages/EdgeOpportunitiesPage");
    render(<EdgeOpportunitiesPage />);
    expect(screen.getByText(/No opportunities scored yet/i)).toBeTruthy();
  });

  it("renders Go to Competitive Edge Intelligence link in empty state", async () => {
    const { useQuery } = await import("@tanstack/react-query");
    vi.mocked(useQuery).mockReturnValue({
      data: { hasData: false, opportunities: [], count: 0 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);
    const { default: EdgeOpportunitiesPage } = await import("../pages/EdgeOpportunitiesPage");
    render(<EdgeOpportunitiesPage />);
    const link = document.querySelector('a[href="/admin/competitor-intelligence"]');
    expect(link).toBeTruthy();
  });
});

describe("EdgeOpportunitiesPage — error state", () => {
  it("renders error message when fetch fails", async () => {
    const { useQuery } = await import("@tanstack/react-query");
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);
    const { default: EdgeOpportunitiesPage } = await import("../pages/EdgeOpportunitiesPage");
    render(<EdgeOpportunitiesPage />);
    expect(screen.getByText(/Failed to load opportunities/i)).toBeTruthy();
  });

  it("Retry button calls refetch", async () => {
    const mockRefetch = vi.fn();
    const { useQuery } = await import("@tanstack/react-query");
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    } as unknown as ReturnType<typeof useQuery>);
    const { default: EdgeOpportunitiesPage } = await import("../pages/EdgeOpportunitiesPage");
    render(<EdgeOpportunitiesPage />);
    const retryBtn = screen.getByRole("button", { name: /Retry/i });
    fireEvent.click(retryBtn);
    expect(mockRefetch).toHaveBeenCalled();
  });
});

describe("EdgeOpportunitiesPage — live data", () => {
  it("renders opportunity titles when data is returned", async () => {
    const { useQuery } = await import("@tanstack/react-query");
    vi.mocked(useQuery).mockReturnValue({
      data: {
        hasData: true, runId: "r1", weekLabel: "Week of Jul 14",
        opportunities: [HIGH_OPP, MED_OPP, LOW_OPP],
        count: 3,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);
    const { default: EdgeOpportunitiesPage } = await import("../pages/EdgeOpportunitiesPage");
    render(<EdgeOpportunitiesPage />);
    expect(screen.getByText("High-Value Keyword Gap")).toBeTruthy();
    expect(screen.getByText("Local Citation Opportunity")).toBeTruthy();
    expect(screen.getByText("Social Backlink Signal")).toBeTruthy();
  });

  it("renders priority filter tabs", async () => {
    const { useQuery } = await import("@tanstack/react-query");
    vi.mocked(useQuery).mockReturnValue({
      data: { hasData: true, opportunities: [HIGH_OPP, MED_OPP, LOW_OPP], count: 3 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);
    const { default: EdgeOpportunitiesPage } = await import("../pages/EdgeOpportunitiesPage");
    render(<EdgeOpportunitiesPage />);
    expect(screen.getByRole("button", { name: /^All/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^High/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Medium/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Low/i })).toBeTruthy();
  });

  it("filters to only high-priority cards when High tab clicked", async () => {
    const { useQuery } = await import("@tanstack/react-query");
    vi.mocked(useQuery).mockReturnValue({
      data: { hasData: true, opportunities: [HIGH_OPP, MED_OPP, LOW_OPP], count: 3 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);
    const { default: EdgeOpportunitiesPage } = await import("../pages/EdgeOpportunitiesPage");
    render(<EdgeOpportunitiesPage />);

    const highTab = screen.getByRole("button", { name: /^High/i });
    fireEvent.click(highTab);

    expect(screen.getByText("High-Value Keyword Gap")).toBeTruthy();
    expect(screen.queryByText("Local Citation Opportunity")).toBeNull();
    expect(screen.queryByText("Social Backlink Signal")).toBeNull();
  });

  it("renders week label badge", async () => {
    const { useQuery } = await import("@tanstack/react-query");
    vi.mocked(useQuery).mockReturnValue({
      data: { hasData: true, weekLabel: "Week of Jul 14", opportunities: [HIGH_OPP], count: 1 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);
    const { default: EdgeOpportunitiesPage } = await import("../pages/EdgeOpportunitiesPage");
    render(<EdgeOpportunitiesPage />);
    expect(screen.getByText("Week of Jul 14")).toBeTruthy();
  });

  it("shows priority group headers in All view", async () => {
    const { useQuery } = await import("@tanstack/react-query");
    vi.mocked(useQuery).mockReturnValue({
      data: { hasData: true, opportunities: [HIGH_OPP, MED_OPP, LOW_OPP], count: 3 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);
    const { default: EdgeOpportunitiesPage } = await import("../pages/EdgeOpportunitiesPage");
    render(<EdgeOpportunitiesPage />);
    expect(screen.getAllByText("High Priority").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Medium Priority").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Low Priority").length).toBeGreaterThanOrEqual(1);
  });
});

// ── ModulePackageGrid — Edge Opportunities tile ───────────────────────────────

describe("ModulePackageGrid — Edge Opportunities tile", () => {
  it("Edge Opportunities tile links to /admin/edge-opportunities", async () => {
    const { SECTIONS } = await import("../pages/command-center/ModulePackageGrid");
    const section = SECTIONS.find((s) => s.id === "opportunity-workflow");
    expect(section).toBeTruthy();
    const tile = section!.tiles.find((t) => t.to === "/admin/edge-opportunities");
    expect(tile).toBeTruthy();
  });

  it("Edge Opportunities section has no comingSoon flag", async () => {
    const { SECTIONS } = await import("../pages/command-center/ModulePackageGrid");
    const section = SECTIONS.find((s) => s.id === "opportunity-workflow");
    expect(section!.comingSoon).toBeFalsy();
  });

  it("Edge Opportunities tile has no comingSoon flag", async () => {
    const { SECTIONS } = await import("../pages/command-center/ModulePackageGrid");
    const section = SECTIONS.find((s) => s.id === "opportunity-workflow");
    const tile = section!.tiles.find((t) => t.to === "/admin/edge-opportunities");
    expect(tile!.comingSoon).toBeFalsy();
  });

  it("Edge Opportunities tile label is 'Edge Opportunities'", async () => {
    const { SECTIONS } = await import("../pages/command-center/ModulePackageGrid");
    const section = SECTIONS.find((s) => s.id === "opportunity-workflow");
    const tile = section!.tiles.find((t) => t.to === "/admin/edge-opportunities");
    expect(tile!.label).toBe("Edge Opportunities");
  });
});

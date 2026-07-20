/**
 * C9R-3 tests: AiVisibilityReadModelView pure helpers + component rendering.
 *
 * Pure helper functions are exported from the component for direct unit testing.
 * Component tests use @testing-library/react with mocked infrastructure.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Infrastructure mocks ─────────────────────────────────────────────────────

vi.mock("@clerk/react", () => ({
  useAuth:  () => ({ getToken: vi.fn(() => Promise.resolve("tok")) }),
  useUser:  () => ({ user: { firstName: "Test", primaryEmailAddress: { emailAddress: "t@t.com" } } }),
  useClerk: () => ({ signOut: vi.fn() }),
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

vi.mock("@/lib/api", () => ({
  useApiFetch: () => vi.fn(() => Promise.resolve({})),
}));

// ── Import the module under test ─────────────────────────────────────────────

import AiVisibilityReadModelView, {
  getCoverageStatusConfig,
  getPriorityConfig,
  getCategoryConfig,
  getWorkflowRoute,
  getWorkflowLabel,
  getSourceLabel,
  groupRecommendationsByPriority,
  countAvailableSources,
  formatScore,
  type RMRecommendation,
  type RMCoverageDiagnostic,
  type RMReadModel,
} from "../components/AiVisibilityReadModelView";

// ── Theme fixture ────────────────────────────────────────────────────────────

const DARK_COLORS = {
  text: "#E2E8F0", text2: "#94A3B8", text3: "#475569",
  border: "rgba(255,255,255,0.08)", card: "rgba(11,22,41,0.95)", cardSubtle: "rgba(255,255,255,0.03)",
};

// ── Recommendation fixtures ──────────────────────────────────────────────────

const makeCoverageRec = (overrides: Partial<RMRecommendation> = {}): RMRecommendation => ({
  id: "aivo::test001",
  clientId: "client-abc",
  category: "citation_directory",
  serviceId: null,
  geography: "Foley, AL",
  title: "Complete Yelp local listing",
  priority: "high",
  whatWasObserved: ["Yelp listing is incomplete"],
  whyItMatters: ["Yelp drives 12% of local discovery queries"],
  evidence: [],
  references: [],
  workflow: { kind: "local_presence", recordId: "ch-001", action: "complete_channel" },
  humanApprovalRequired: false,
  lifecycle: null,
  potentialValue: 72,
  attainability: 85,
  potentialFactors: null,
  attainabilityFactors: null,
  basis: "weighted",
  ...overrides,
});

const makeCoverageItem = (overrides: Partial<RMCoverageDiagnostic> = {}): RMCoverageDiagnostic => ({
  source: "local_presence",
  status: "available",
  detail: "Local presence profile and 1 channel observed.",
  observedAt: "2026-07-19T12:00:00Z",
  ...overrides,
});

const makeModel = (overrides: Partial<RMReadModel> = {}): RMReadModel => {
  const recs = [makeCoverageRec()];
  const cov  = [makeCoverageItem(), makeCoverageItem({ source: "google_business", status: "not_connected", detail: "No GBP connection found.", observedAt: null })];
  return {
    id: "aivrm::abc123",
    clientId: "client-abc",
    generatedAt: "2026-07-19T12:00:00Z",
    recommendations: recs,
    coverage: cov,
    rejected: [],
    summary: { recommendationCount: 1, rejectedCount: 0, availableSourceCount: 1, unavailableSourceCount: 1 },
    ...overrides,
  };
};

// ── Pure helper tests ─────────────────────────────────────────────────────────

describe("getCoverageStatusConfig", () => {
  it("returns green for available", () => {
    const cfg = getCoverageStatusConfig("available");
    expect(cfg.color).toBe("#22C55E");
    expect(cfg.label).toBe("Available");
    expect(cfg.icon).toBe("✓");
  });

  it("returns amber for not_connected", () => {
    const cfg = getCoverageStatusConfig("not_connected");
    expect(cfg.color).toBe("#F59E0B");
    expect(cfg.label).toBe("Not Connected");
  });

  it("returns indigo for not_implemented", () => {
    const cfg = getCoverageStatusConfig("not_implemented");
    expect(cfg.color).toBe("#6366F1");
    expect(cfg.label).toBe("Coming Soon");
  });

  it("returns blue for not_tenant_safe", () => {
    const cfg = getCoverageStatusConfig("not_tenant_safe");
    expect(cfg.color).toBe("#00AEEF");
  });

  it("returns gray for no_observation", () => {
    const cfg = getCoverageStatusConfig("no_observation");
    expect(cfg.color).toBe("#64748B");
    expect(cfg.label).toBe("No Data Yet");
  });

  it("returns red for provider_error", () => {
    const cfg = getCoverageStatusConfig("provider_error");
    expect(cfg.color).toBe("#EF4444");
    expect(cfg.label).toBe("Provider Error");
    expect(cfg.icon).toBe("⚠");
  });

  it("returns gray fallback for unknown status", () => {
    const cfg = getCoverageStatusConfig("mystery_status");
    expect(cfg.color).toBe("#64748B");
    expect(cfg.label).toBe("mystery_status");
  });
});

describe("getPriorityConfig", () => {
  it.each([
    ["critical", "#EF4444", "Critical", "🚨"],
    ["high",     "#F59E0B", "High",     "🔥"],
    ["medium",   "#3B82F6", "Medium",   "⚡"],
    ["low",      "#6B7280", "Low",      "💡"],
  ] as const)("%s maps correctly", (priority, color, label, icon) => {
    const cfg = getPriorityConfig(priority);
    expect(cfg.color).toBe(color);
    expect(cfg.label).toBe(label);
    expect(cfg.icon).toBe(icon);
  });

  it("falls back to gray for unknown priority", () => {
    const cfg = getPriorityConfig("extreme");
    expect(cfg.color).toBe("#6B7280");
    expect(cfg.label).toBe("extreme");
  });
});

describe("getCategoryConfig", () => {
  it("maps local_presence to blue", () => {
    expect(getCategoryConfig("local_presence").color).toBe("#00AEEF");
    expect(getCategoryConfig("local_presence").icon).toBe("📍");
  });

  it("maps backlink to amber", () => {
    expect(getCategoryConfig("backlink").color).toBe("#F59E0B");
  });

  it("maps content to orange", () => {
    expect(getCategoryConfig("content").color).toBe("#FB923C");
  });

  it("falls back for unknown category", () => {
    const cfg = getCategoryConfig("unknown_cat");
    expect(cfg.color).toBe("#94A3B8");
  });
});

describe("getWorkflowRoute", () => {
  it.each([
    ["local_presence",    "/admin/local-presence"],
    ["discovery",         "/admin/competitor-intelligence"],
    ["backlink",          "/admin/authority-engine"],
    ["content_autopilot", "/admin/content-autopilot"],
    ["measurement",       "/admin/ai-visibility"],
  ] as const)("%s → %s", (kind, route) => {
    expect(getWorkflowRoute(kind)).toBe(route);
  });

  it("defaults to ai-visibility for unknown kind", () => {
    expect(getWorkflowRoute("unknown")).toBe("/admin/ai-visibility");
  });
});

describe("getWorkflowLabel", () => {
  it("returns human-readable engine names", () => {
    expect(getWorkflowLabel("local_presence")).toBe("Local Presence Engine");
    expect(getWorkflowLabel("discovery")).toBe("Competitor Intelligence");
    expect(getWorkflowLabel("backlink")).toBe("Authority & Backlink Engine");
    expect(getWorkflowLabel("content_autopilot")).toBe("Content Autopilot");
  });
});

describe("getSourceLabel", () => {
  it("returns formatted labels", () => {
    expect(getSourceLabel("local_presence")).toBe("Local Presence");
    expect(getSourceLabel("google_business")).toBe("Google Business");
    expect(getSourceLabel("google_search_console")).toBe("Search Console");
    expect(getSourceLabel("backlink")).toBe("Authority & Backlinks");
  });

  it("replaces underscores for unknown sources", () => {
    expect(getSourceLabel("some_engine")).toBe("some engine");
  });
});

describe("groupRecommendationsByPriority", () => {
  it("groups recs into the four priority buckets", () => {
    const recs = [
      makeCoverageRec({ id: "r1", priority: "critical" }),
      makeCoverageRec({ id: "r2", priority: "high"     }),
      makeCoverageRec({ id: "r3", priority: "high"     }),
      makeCoverageRec({ id: "r4", priority: "medium"   }),
      makeCoverageRec({ id: "r5", priority: "low"      }),
    ];
    const g = groupRecommendationsByPriority(recs);
    expect(g.critical).toHaveLength(1);
    expect(g.high).toHaveLength(2);
    expect(g.medium).toHaveLength(1);
    expect(g.low).toHaveLength(1);
  });

  it("places unknown priority into low bucket", () => {
    const rec = makeCoverageRec({ id: "r1", priority: "extreme" as RMRecommendation["priority"] });
    const g = groupRecommendationsByPriority([rec]);
    expect(g.low).toHaveLength(1);
    expect(g.high).toHaveLength(0);
  });

  it("returns empty buckets when no recs provided", () => {
    const g = groupRecommendationsByPriority([]);
    expect(g.critical).toHaveLength(0);
    expect(g.high).toHaveLength(0);
    expect(g.medium).toHaveLength(0);
    expect(g.low).toHaveLength(0);
  });
});

describe("countAvailableSources", () => {
  it("counts only available sources", () => {
    const coverage: RMCoverageDiagnostic[] = [
      makeCoverageItem({ status: "available" }),
      makeCoverageItem({ source: "google_business",  status: "not_connected"   }),
      makeCoverageItem({ source: "discovery",         status: "no_observation"  }),
      makeCoverageItem({ source: "backlink",          status: "available"       }),
    ];
    expect(countAvailableSources(coverage)).toBe(2);
  });

  it("returns 0 for empty coverage", () => {
    expect(countAvailableSources([])).toBe(0);
  });
});

describe("formatScore", () => {
  it("rounds to nearest integer", () => {
    expect(formatScore(72.6)).toBe("73");
    expect(formatScore(72.4)).toBe("72");
  });

  it("clamps to 0–100", () => {
    expect(formatScore(-5)).toBe("0");
    expect(formatScore(105)).toBe("100");
  });
});

// ── Component rendering tests ─────────────────────────────────────────────────

const RENDER_PROPS = {
  model:    null as RMReadModel | null,
  loading:  false,
  error:    null as string | null,
  onRetry:  vi.fn(),
  isDark:   true,
  colors:   DARK_COLORS,
};

describe("AiVisibilityReadModelView — loading state", () => {
  it("renders loading skeleton when loading=true", () => {
    render(<AiVisibilityReadModelView {...RENDER_PROPS} loading={true} />);
    expect(screen.getByTestId("rm-loading")).toBeTruthy();
  });

  it("does not render main view while loading", () => {
    render(<AiVisibilityReadModelView {...RENDER_PROPS} loading={true} />);
    expect(screen.queryByTestId("rm-view")).toBeNull();
    expect(screen.queryByTestId("rm-error")).toBeNull();
  });
});

describe("AiVisibilityReadModelView — error state", () => {
  it("renders error banner when error is set", () => {
    render(<AiVisibilityReadModelView {...RENDER_PROPS} error="Network timeout" />);
    expect(screen.getByTestId("rm-error")).toBeTruthy();
  });

  it("shows the error message text", () => {
    render(<AiVisibilityReadModelView {...RENDER_PROPS} error="Network timeout" />);
    expect(screen.getByText("Network timeout")).toBeTruthy();
  });

  it("calls onRetry when retry button is clicked", () => {
    const onRetry = vi.fn();
    render(<AiVisibilityReadModelView {...RENDER_PROPS} error="fail" onRetry={onRetry} />);
    fireEvent.click(screen.getByTestId("rm-retry-btn"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("AiVisibilityReadModelView — empty state", () => {
  it("renders empty state when model has 0 recommendations", () => {
    const model = makeModel({ recommendations: [], summary: { recommendationCount: 0, rejectedCount: 0, availableSourceCount: 0, unavailableSourceCount: 0 } });
    render(<AiVisibilityReadModelView {...RENDER_PROPS} model={model} />);
    expect(screen.getByTestId("rm-empty")).toBeTruthy();
  });

  it("renders empty state when model is null", () => {
    render(<AiVisibilityReadModelView {...RENDER_PROPS} model={null} />);
    expect(screen.getByTestId("rm-empty")).toBeTruthy();
  });
});

describe("AiVisibilityReadModelView — data state", () => {
  it("renders main view with recommendation cards", () => {
    const model = makeModel();
    render(<AiVisibilityReadModelView {...RENDER_PROPS} model={model} />);
    expect(screen.getByTestId("rm-view")).toBeTruthy();
    expect(screen.getByTestId("rec-card-aivo::test001")).toBeTruthy();
  });

  it("renders recommendation title", () => {
    const model = makeModel();
    render(<AiVisibilityReadModelView {...RENDER_PROPS} model={model} />);
    expect(screen.getByText("Complete Yelp local listing")).toBeTruthy();
  });

  it("renders summary KPI count for recommendations", () => {
    const model = makeModel();
    render(<AiVisibilityReadModelView {...RENDER_PROPS} model={model} />);
    expect(screen.getByText("Recommendations")).toBeTruthy();
    expect(screen.getByText("Sources Active")).toBeTruthy();
  });

  it("renders coverage cards for each source", () => {
    const model = makeModel();
    render(<AiVisibilityReadModelView {...RENDER_PROPS} model={model} />);
    expect(screen.getByTestId("coverage-local_presence")).toBeTruthy();
    expect(screen.getByTestId("coverage-google_business")).toBeTruthy();
  });

  it("renders workflow deep-link pointing to correct route", () => {
    const model = makeModel();
    render(<AiVisibilityReadModelView {...RENDER_PROPS} model={model} />);
    const link = screen.getByTestId("rec-wf-link-aivo::test001") as HTMLAnchorElement;
    expect(link.href).toContain("/admin/local-presence");
  });

  it("expands detail section when expand button is clicked", () => {
    const rec = makeCoverageRec({
      whyItMatters: ["First reason.", "Second reason."],
    });
    const model = makeModel({ recommendations: [rec] });
    render(<AiVisibilityReadModelView {...RENDER_PROPS} model={model} />);
    expect(screen.queryByText(/Second reason\./)).toBeNull();
    fireEvent.click(screen.getByTestId("rec-expand-aivo::test001"));
    expect(screen.getByText(/Second reason\./)).toBeTruthy();
  });

  it("collapses detail section on second click", () => {
    const rec = makeCoverageRec({ whyItMatters: ["First.", "Second expanded item."] });
    const model = makeModel({ recommendations: [rec] });
    render(<AiVisibilityReadModelView {...RENDER_PROPS} model={model} />);
    const btn = screen.getByTestId("rec-expand-aivo::test001");
    fireEvent.click(btn);
    expect(screen.getByText(/Second expanded item\./)).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.queryByText(/Second expanded item\./)).toBeNull();
  });

  it("groups recommendations: critical bucket rendered before high", () => {
    const critical = makeCoverageRec({ id: "aivo::crit", title: "Critical Action",  priority: "critical" });
    const high     = makeCoverageRec({ id: "aivo::high", title: "High Priority Rec", priority: "high"     });
    const model = makeModel({ recommendations: [high, critical] });
    render(<AiVisibilityReadModelView {...RENDER_PROPS} model={model} />);
    const cards = screen.getAllByText(/Action|Priority Rec/);
    expect(cards[0].textContent).toContain("Critical Action");
  });
});

describe("AiVisibilityReadModelView — rejected panel", () => {
  it("does not show rejected toggle when there are no rejections", () => {
    const model = makeModel({ rejected: [] });
    render(<AiVisibilityReadModelView {...RENDER_PROPS} model={model} />);
    expect(screen.queryByTestId("rm-rejected-toggle")).toBeNull();
  });

  it("shows collapsed toggle when rejections exist", () => {
    const model = makeModel({
      rejected: [{ dedupeKey: "some observation", code: "tenant_mismatch", reason: "Scope check failed." }],
      summary: { recommendationCount: 1, rejectedCount: 1, availableSourceCount: 1, unavailableSourceCount: 1 },
    });
    render(<AiVisibilityReadModelView {...RENDER_PROPS} model={model} />);
    expect(screen.getByTestId("rm-rejected-toggle")).toBeTruthy();
    expect(screen.queryByText("Scope check failed.")).toBeNull();
  });

  it("reveals rejected observations on toggle click", () => {
    const model = makeModel({
      rejected: [{ dedupeKey: "obs-key", code: "tenant_mismatch", reason: "Scope check failed." }],
      summary: { recommendationCount: 1, rejectedCount: 1, availableSourceCount: 1, unavailableSourceCount: 1 },
    });
    render(<AiVisibilityReadModelView {...RENDER_PROPS} model={model} />);
    fireEvent.click(screen.getByTestId("rm-rejected-toggle"));
    expect(screen.getByText("Scope check failed.")).toBeTruthy();
  });
});

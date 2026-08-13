import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  areCompetitorObservationsFreshForProviders,
  filterCachedObservationsToActiveProviders,
  shouldRegisterCompetitorMockProviders,
} from "../lib/competitor-enrichment-service.js";

describe("Competitor Intelligence production enrichment policy", () => {
  it("forbids mock enrichment providers in production", () => {
    expect(shouldRegisterCompetitorMockProviders("production")).toBe(false);
  });

  it("keeps deterministic fixtures available in test and development", () => {
    expect(shouldRegisterCompetitorMockProviders("test")).toBe(true);
    expect(shouldRegisterCompetitorMockProviders("development")).toBe(true);
  });

  it("fails closed for the exact production environment regardless of local defaults", () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(shouldRegisterCompetitorMockProviders()).toBe(false);
    } finally {
      if (original === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = original;
    }
  });

  it("filters historical mock cache rows out of production output", () => {
    const rows = [
      { provider_id: "mock-reviews", value: "demo" },
      { provider_id: "ai-edge-visibility", value: "real-ai" },
      { provider_id: "edge-authority", value: "real-authority" },
    ];

    expect(
      filterCachedObservationsToActiveProviders(rows, [
        "ai-edge-visibility",
        "edge-authority",
      ]),
    ).toEqual([
      { provider_id: "ai-edge-visibility", value: "real-ai" },
      { provider_id: "edge-authority", value: "real-authority" },
    ]);
  });

  it("accepts a fresh cache for exactly the active production providers", () => {
    const now = new Date("2026-08-13T02:45:00.000Z").getTime();
    const rows = [
      { provider_id: "ai-edge-visibility", observed_at: new Date(now - 60_000) },
      { provider_id: "edge-authority", observed_at: new Date(now - 120_000) },
    ];

    expect(
      areCompetitorObservationsFreshForProviders(
        rows,
        ["ai-edge-visibility", "edge-authority"],
        now,
      ),
    ).toBe(true);
  });

  it("rejects cache when an active provider is missing or stale", () => {
    const now = new Date("2026-08-13T02:45:00.000Z").getTime();
    const day = 24 * 60 * 60 * 1000;

    expect(
      areCompetitorObservationsFreshForProviders(
        [{ provider_id: "ai-edge-visibility", observed_at: new Date(now - 60_000) }],
        ["ai-edge-visibility", "edge-authority"],
        now,
      ),
    ).toBe(false);

    expect(
      areCompetitorObservationsFreshForProviders(
        [
          { provider_id: "ai-edge-visibility", observed_at: new Date(now - day - 1) },
          { provider_id: "edge-authority", observed_at: new Date(now - 60_000) },
        ],
        ["ai-edge-visibility", "edge-authority"],
        now,
      ),
    ).toBe(false);
  });

  it("guards mock registration inside the environment policy", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/competitor-enrichment-service.ts"),
      "utf8",
    );

    expect(source).toContain("if (shouldRegisterCompetitorMockProviders())");
    expect(source).toContain("ALL_MOCK_PROVIDERS.filter");
    expect(source).toContain("filterCachedObservationsToActiveProviders");
    expect(source).toContain("areCompetitorObservationsFreshForProviders");
    expect(source).toContain("registry.register(new AiEdgeVisibilityProvider(activePool))");
    expect(source).toContain("registry.register(new EdgeAuthorityProvider())");
  });
});

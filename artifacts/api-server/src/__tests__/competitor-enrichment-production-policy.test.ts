import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { shouldRegisterCompetitorMockProviders } from "../lib/competitor-enrichment-service.js";

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

  it("guards mock registration inside the environment policy", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/competitor-enrichment-service.ts"),
      "utf8",
    );

    expect(source).toContain("if (shouldRegisterCompetitorMockProviders())");
    expect(source).toContain("ALL_MOCK_PROVIDERS.filter");
    expect(source).toContain("registry.register(new AiEdgeVisibilityProvider(activePool))");
    expect(source).toContain("registry.register(new EdgeAuthorityProvider())");
  });
});

import { describe, expect, it, vi } from "vitest";
import type {
  AiQueryProvider,
  AiQueryRequest,
  AiQueryResult,
  AiQueryTenantContext,
} from "@workspace/db";
import {
  AI_VISIBILITY_DEFAULT_SURFACES,
  runAiQueryProviderRegistry,
  type AiQueryProviderDescriptor,
} from "./ai-query-provider-registry";

const context: AiQueryTenantContext = Object.freeze({
  clientId: "client-a",
  businessName: "Example Services",
  businessDomain: "example.test",
  businessPhone: null,
  activeServiceIds: Object.freeze(["service-a"]),
  authorizedGeographies: Object.freeze(["Foley, AL"]),
  competitors: Object.freeze([]),
  prohibitedPhrases: Object.freeze([]),
});

function provider(name: string, configured = true, success = true): AiQueryProvider {
  return {
    name,
    model: `${name}-model`,
    isConfigured: configured,
    execute: vi.fn(async (request: AiQueryRequest): Promise<AiQueryResult> => ({
      provider: name,
      model: `${name}-model`,
      query: request.query,
      responseText: success ? `${name} evidence for ${request.query}` : null,
      generatedAt: "2026-08-14T12:00:00.000Z",
      latencyMs: 5,
      success,
      failureReason: success ? null : "provider_error",
      businessMentioned: success,
      mentionType: success ? "exact" : null,
      mentionPosition: success ? 0 : null,
      competitorMentions: Object.freeze([]),
      citations: Object.freeze([]),
    })),
  };
}

function descriptors(openai: AiQueryProvider | null): readonly AiQueryProviderDescriptor[] {
  return AI_VISIBILITY_DEFAULT_SURFACES.map(surface => ({
    ...surface,
    provider: surface.surfaceId === "openai_model_observation" ? openai : null,
  }));
}

describe("AI query provider registry", () => {
  it("labels the existing OpenAI path as a model observation, not ChatGPT", async () => {
    const openai = provider("openai");
    const result = await runAiQueryProviderRegistry({
      descriptors: descriptors(openai),
      queries: ["best service in Foley"],
      tenantContext: context,
    });

    expect(result.coverage[0]).toMatchObject({
      surfaceId: "openai_model_observation",
      displayName: "OpenAI model observation",
      surfaceKind: "model_only",
      status: "available",
      providerName: "openai",
    });
    expect(result.coverage.some(item => item.surfaceId === "chatgpt")).toBe(false);
  });

  it("represents missing platforms as unavailable rather than zero observations", async () => {
    const result = await runAiQueryProviderRegistry({
      descriptors: descriptors(provider("openai")),
      queries: ["best service in Foley"],
      tenantContext: context,
    });

    for (const surfaceId of ["gemini", "claude", "perplexity", "copilot"]) {
      expect(result.coverage.find(item => item.surfaceId === surfaceId)).toMatchObject({
        status: "unavailable",
        attemptedQueryCount: 0,
        successfulQueryCount: 0,
      });
      expect(result.observations.some(item => item.surfaceId === surfaceId)).toBe(false);
    }
    expect(result.successfulSurfaceCount).toBe(1);
    expect(result.declaredSurfaceCount).toBe(5);
  });

  it("reuses one deterministic de-duplicated corpus independently per configured surface", async () => {
    const openai = provider("openai");
    const second = provider("grounded-provider");
    const result = await runAiQueryProviderRegistry({
      descriptors: [
        { surfaceId: "openai_model_observation", displayName: "OpenAI model observation", surfaceKind: "model_only", provider: openai },
        { surfaceId: "perplexity", displayName: "Perplexity", surfaceKind: "provider_native_web_grounded", provider: second },
      ],
      queries: [" query one ", "query one", "query two"],
      tenantContext: context,
    });

    expect(result.corpus).toEqual(["query one", "query two"]);
    expect(openai.execute).toHaveBeenCalledTimes(2);
    expect(second.execute).toHaveBeenCalledTimes(2);
    expect(result.observations.map(item => item.surfaceId)).toEqual([
      "openai_model_observation",
      "perplexity",
    ]);
  });

  it("isolates a failed provider from successful evidence on another surface", async () => {
    const good = provider("good");
    const bad = provider("bad", true, false);
    const result = await runAiQueryProviderRegistry({
      descriptors: [
        { surfaceId: "openai_model_observation", displayName: "OpenAI model observation", surfaceKind: "model_only", provider: good },
        { surfaceId: "perplexity", displayName: "Perplexity", surfaceKind: "provider_native_web_grounded", provider: bad },
      ],
      queries: ["query one"],
      tenantContext: context,
    });

    expect(result.coverage.find(item => item.surfaceId === "openai_model_observation")?.status).toBe("available");
    expect(result.coverage.find(item => item.surfaceId === "perplexity")?.status).toBe("failed");
    expect(result.successfulSurfaceCount).toBe(1);
  });

  it("does not execute a provider that reports itself unconfigured", async () => {
    const unconfigured = provider("openai", false);
    const result = await runAiQueryProviderRegistry({
      descriptors: descriptors(unconfigured),
      queries: ["query one"],
      tenantContext: context,
    });

    expect(unconfigured.execute).not.toHaveBeenCalled();
    expect(result.configuredSurfaceCount).toBe(0);
    expect(result.successfulSurfaceCount).toBe(0);
  });

  it("fails closed on duplicate surface identities", async () => {
    const p = provider("one");
    await expect(runAiQueryProviderRegistry({
      descriptors: [
        { surfaceId: "same", displayName: "A", surfaceKind: "model_only", provider: p },
        { surfaceId: "same", displayName: "B", surfaceKind: "model_only", provider: p },
      ],
      queries: ["query one"],
      tenantContext: context,
    })).rejects.toThrow("ai_query_surface_id_duplicate");
  });

  it("contains no provider construction, environment access, persistence, scheduler, or route surface", async () => {
    const source = await import("node:fs/promises").then(fs =>
      fs.readFile(new URL("./ai-query-provider-registry.ts", import.meta.url), "utf8"),
    );
    expect(source).not.toContain("process.env");
    expect(source).not.toContain("OpenAiQueryProvider");
    expect(source).not.toContain("Router(");
    expect(source).not.toContain("setInterval(");
    expect(source).not.toContain("INSERT INTO");
  });
});

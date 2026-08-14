import { describe, expect, it, vi } from "vitest";
import type { AiQueryProvider } from "@workspace/db";
import { buildProductionAiVisibilityProviderDescriptors } from "./ai-query-production-provider-descriptors.js";

function provider(name = "openai_model_observation"): AiQueryProvider {
  return {
    name,
    model: "test-model",
    isConfigured: true,
    execute: vi.fn(),
  } as AiQueryProvider;
}

describe("production AI Visibility provider descriptors", () => {
  it("binds only the current OpenAI model observation and leaves other surfaces unavailable", () => {
    const openai = provider();
    const descriptors = buildProductionAiVisibilityProviderDescriptors({ openAiProvider: openai });

    expect(descriptors).toHaveLength(5);
    expect(descriptors.find(item => item.surfaceId === "openai_model_observation")).toMatchObject({
      displayName: "OpenAI model observation",
      surfaceKind: "model_only",
      provider: openai,
    });

    for (const surfaceId of ["gemini", "claude", "perplexity", "copilot"]) {
      expect(descriptors.find(item => item.surfaceId === surfaceId)?.provider).toBeNull();
    }
    expect(openai.execute).not.toHaveBeenCalled();
  });

  it("rejects an ambiguous or cross-surface provider identity", () => {
    expect(() => buildProductionAiVisibilityProviderDescriptors({ openAiProvider: provider("openai") }))
      .toThrow("ai_visibility_openai_surface_identity_mismatch");
    expect(() => buildProductionAiVisibilityProviderDescriptors({ openAiProvider: provider("chatgpt") }))
      .toThrow("ai_visibility_openai_surface_identity_mismatch");
  });

  it("constructs descriptors without executing any provider request", () => {
    const openai = provider();
    buildProductionAiVisibilityProviderDescriptors({ openAiProvider: openai });
    expect(openai.execute).not.toHaveBeenCalled();
  });
});

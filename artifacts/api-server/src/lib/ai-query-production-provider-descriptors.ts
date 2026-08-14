import type { AiQueryProvider } from "@workspace/db";
import {
  AI_VISIBILITY_DEFAULT_SURFACES,
  type AiQueryProviderDescriptor,
} from "./ai-query-provider-registry.js";
import { OpenAiQueryProvider } from "./openai-ai-query-provider.js";

export interface ProductionAiVisibilityProviderDependencies {
  readonly openAiProvider?: AiQueryProvider;
}

/**
 * Production construction boundary for the provider-truth registry.
 *
 * Only the existing OpenAI-compatible model observation is constructed today.
 * Gemini, Claude, Perplexity, and Copilot remain explicitly unavailable until
 * independently reviewed provider implementations are supplied. Constructing
 * these descriptors performs no provider request and activates no scheduler.
 */
export function buildProductionAiVisibilityProviderDescriptors(
  dependencies: ProductionAiVisibilityProviderDependencies = {},
): readonly AiQueryProviderDescriptor[] {
  const openAiProvider = dependencies.openAiProvider ?? new OpenAiQueryProvider();

  if (openAiProvider.name !== "openai_model_observation") {
    throw new Error("ai_visibility_openai_surface_identity_mismatch");
  }

  return Object.freeze(
    AI_VISIBILITY_DEFAULT_SURFACES.map((surface): AiQueryProviderDescriptor => Object.freeze({
      ...surface,
      provider: surface.surfaceId === "openai_model_observation" ? openAiProvider : null,
    })),
  );
}

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

/**
 * AI provider facade.
 *
 * Default: Lovable AI Gateway (works automatically inside Lovable Cloud
 * because LOVABLE_API_KEY is auto-provisioned).
 *
 * To run outside Lovable (e.g. Replit) without Lovable AI, set:
 *   AI_PROVIDER=openai
 *   OPENAI_API_KEY=sk-...
 *   OPENAI_MODEL=gpt-4o-mini           (optional; default below)
 *   OPENAI_BASE_URL=https://api.openai.com/v1   (optional; for compat providers)
 *
 * Every server function that needs a chat model imports getAiModel()
 * from this file — there are NO other call sites — so swapping providers
 * is a one-file change.
 */

const DEFAULT_LOVABLE_MODEL = "google/gemini-3-flash-preview";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

export function createLovableAiGatewayProvider(lovableApiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}

function createOpenAiProvider(apiKey: string, baseURL?: string) {
  return createOpenAICompatible({
    name: "openai",
    baseURL: baseURL ?? "https://api.openai.com/v1",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

/**
 * Single entry point for chat models. Pass a model id to override the
 * provider default. Returns an AI-SDK LanguageModel ready for streamText /
 * generateText / Output.object().
 */
export function getAiModel(modelId?: string): LanguageModel {
  const provider = (process.env.AI_PROVIDER ?? "lovable").toLowerCase();

  if (provider === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("AI_PROVIDER=openai but OPENAI_API_KEY is not set.");
    const gw = createOpenAiProvider(key, process.env.OPENAI_BASE_URL);
    return gw(modelId ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL);
  }

  // default: lovable
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("AI service is not configured (LOVABLE_API_KEY missing).");
  const gw = createLovableAiGatewayProvider(key);
  return gw(modelId ?? DEFAULT_LOVABLE_MODEL);
}

/**
 * C9R-4: OpenAI-backed AiQueryProvider implementation.
 * Uses the same getAiModel() factory pattern as other routes in this server.
 * Detects mentions, competitors, and citations in every response automatically.
 */

import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  detectBusinessMention,
  detectCompetitorMentions,
  extractCitations,
} from "@workspace/db";
import type {
  AiQueryProvider,
  AiQueryRequest,
  AiQueryResult,
} from "@workspace/db";

// ── Model factory (mirrors artifacts/api-server/src/routes/ai.ts) ─────────────

function buildOpenAiModel() {
  const baseURL =
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??
    process.env.OPENAI_BASE_URL ??
    "https://api.openai.com/v1";
  const key =
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY ??
    process.env.OPENAI_API_KEY;
  if (!key) return null;
  const gw = createOpenAICompatible({
    name: "openai",
    baseURL,
    headers: { Authorization: `Bearer ${key}` },
  });
  return gw(process.env.OPENAI_MODEL ?? "gpt-4o-mini");
}

const SYSTEM_PROMPT =
  "You are a helpful local business assistant. When asked about services in a local area, provide a concise, factual list of businesses and recommendations. Respond in plain text (no markdown). Be specific about business names when you know them.";

// ── Provider implementation ───────────────────────────────────────────────────

export class OpenAiQueryProvider implements AiQueryProvider {
  readonly name = "openai";
  readonly model: string;

  constructor() {
    this.model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  }

  get isConfigured(): boolean {
    return !!(
      process.env.AI_INTEGRATIONS_OPENAI_API_KEY ??
      process.env.OPENAI_API_KEY
    );
  }

  async execute(request: AiQueryRequest): Promise<AiQueryResult> {
    const { query, tenantContext, timeoutMs = 15_000 } = request;
    const generatedAt = new Date().toISOString();
    const startMs = Date.now();

    if (!this.isConfigured) {
      return {
        provider: this.name,
        model: this.model,
        query,
        responseText: null,
        generatedAt,
        latencyMs: 0,
        success: false,
        failureReason: "not_configured",
        businessMentioned: false,
        mentionType: null,
        mentionPosition: null,
        competitorMentions: Object.freeze([]),
        citations: Object.freeze([]),
      };
    }

    try {
      const model = buildOpenAiModel();
      if (!model) throw new Error("Model could not be constructed — key present but factory failed.");

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let responseText: string;
      try {
        const result = await generateText({
          model,
          system: SYSTEM_PROMPT,
          prompt: query,
          abortSignal: controller.signal,
        });
        responseText = result.text;
      } finally {
        clearTimeout(timer);
      }

      const latencyMs = Date.now() - startMs;

      const mentionResult = detectBusinessMention(responseText, tenantContext);
      const competitorMentions = detectCompetitorMentions(responseText, tenantContext);
      const citations = extractCitations(responseText);

      return {
        provider: this.name,
        model: this.model,
        query,
        responseText,
        generatedAt,
        latencyMs,
        success: true,
        failureReason: null,
        businessMentioned: mentionResult.mentioned,
        mentionType: mentionResult.mentionType,
        mentionPosition: mentionResult.position,
        competitorMentions,
        citations,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - startMs;
      const message = err instanceof Error ? err.message : String(err);
      const lowerMsg = message.toLowerCase();

      let failureReason: AiQueryResult["failureReason"] = "provider_error";
      if (err instanceof Error && err.name === "AbortError") failureReason = "timeout";
      else if (lowerMsg.includes("401") || lowerMsg.includes("unauthorized") || lowerMsg.includes("invalid api key")) failureReason = "auth_failure";
      else if (lowerMsg.includes("429") || lowerMsg.includes("rate limit") || lowerMsg.includes("quota")) failureReason = "rate_limit";

      console.warn(`[ai-query-provider] query="${query}" failureReason=${failureReason}:`, message);

      return {
        provider: this.name,
        model: this.model,
        query,
        responseText: null,
        generatedAt,
        latencyMs,
        success: false,
        failureReason,
        businessMentioned: false,
        mentionType: null,
        mentionPosition: null,
        competitorMentions: Object.freeze([]),
        citations: Object.freeze([]),
      };
    }
  }
}

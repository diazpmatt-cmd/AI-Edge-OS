import type {
  AiQueryProvider,
  AiQueryRequest,
  AiQueryResult,
  AiQueryTenantContext,
} from "@workspace/db";

export type AiQuerySurfaceKind =
  | "model_only"
  | "provider_native_web_grounded"
  | "externally_observed_assistant";

export interface AiQueryProviderDescriptor {
  readonly surfaceId: string;
  readonly displayName: string;
  readonly surfaceKind: AiQuerySurfaceKind;
  readonly provider: AiQueryProvider | null;
}

export interface AiQuerySurfaceCoverage {
  readonly surfaceId: string;
  readonly displayName: string;
  readonly surfaceKind: AiQuerySurfaceKind;
  readonly status: "available" | "unavailable" | "failed";
  readonly providerName: string | null;
  readonly model: string | null;
  readonly successfulQueryCount: number;
  readonly attemptedQueryCount: number;
  readonly detail: string;
}

export interface AiQuerySurfaceObservation {
  readonly surfaceId: string;
  readonly displayName: string;
  readonly surfaceKind: AiQuerySurfaceKind;
  readonly providerName: string;
  readonly model: string;
  readonly results: readonly AiQueryResult[];
}

export interface AiQueryProviderRegistryRun {
  readonly corpus: readonly string[];
  readonly observations: readonly AiQuerySurfaceObservation[];
  readonly coverage: readonly AiQuerySurfaceCoverage[];
  readonly successfulSurfaceCount: number;
  readonly configuredSurfaceCount: number;
  readonly declaredSurfaceCount: number;
}

function normalizeCorpus(queries: readonly string[]): readonly string[] {
  return Object.freeze(
    [...queries]
      .map(query => query.trim())
      .filter(Boolean)
      .filter((query, index, all) => all.indexOf(query) === index),
  );
}

function assertUniqueSurfaces(descriptors: readonly AiQueryProviderDescriptor[]): void {
  const ids = descriptors.map(item => item.surfaceId.trim());
  if (ids.some(id => !id)) throw new Error("ai_query_surface_id_required");
  if (new Set(ids).size !== ids.length) throw new Error("ai_query_surface_id_duplicate");
}

/**
 * Execute one deterministic query corpus independently across configured
 * providers/surfaces. Missing providers remain unavailable and are never
 * inferred from another provider's observations.
 *
 * This is an isolated orchestration foundation only. It does not construct
 * providers, read credentials, persist scans, schedule work, or activate spend.
 */
export async function runAiQueryProviderRegistry(input: {
  readonly descriptors: readonly AiQueryProviderDescriptor[];
  readonly queries: readonly string[];
  readonly tenantContext: AiQueryTenantContext;
  readonly timeoutMs?: number;
}): Promise<AiQueryProviderRegistryRun> {
  assertUniqueSurfaces(input.descriptors);
  const corpus = normalizeCorpus(input.queries);
  const observations: AiQuerySurfaceObservation[] = [];
  const coverage: AiQuerySurfaceCoverage[] = [];
  let configuredSurfaceCount = 0;

  for (const descriptor of input.descriptors) {
    const provider = descriptor.provider;
    if (!provider || !provider.isConfigured) {
      coverage.push(Object.freeze({
        surfaceId: descriptor.surfaceId,
        displayName: descriptor.displayName,
        surfaceKind: descriptor.surfaceKind,
        status: "unavailable" as const,
        providerName: provider?.name ?? null,
        model: provider?.model ?? null,
        successfulQueryCount: 0,
        attemptedQueryCount: 0,
        detail: provider ? "Provider exists but is not configured." : "No provider is configured for this surface.",
      }));
      continue;
    }

    configuredSurfaceCount += 1;
    const results: AiQueryResult[] = [];
    for (const query of corpus) {
      let result: AiQueryResult;
      try {
        const request: AiQueryRequest = {
          query,
          tenantContext: input.tenantContext,
          ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
        };
        result = await provider.execute(request);
      } catch {
        result = {
          provider: provider.name,
          model: provider.model,
          query,
          responseText: null,
          generatedAt: new Date(0).toISOString(),
          latencyMs: 0,
          success: false,
          failureReason: "provider_error",
          businessMentioned: false,
          mentionType: null,
          mentionPosition: null,
          competitorMentions: Object.freeze([]),
          citations: Object.freeze([]),
        };
      }
      results.push(result);
    }

    const successfulQueryCount = results.filter(result => result.success).length;
    observations.push(Object.freeze({
      surfaceId: descriptor.surfaceId,
      displayName: descriptor.displayName,
      surfaceKind: descriptor.surfaceKind,
      providerName: provider.name,
      model: provider.model,
      results: Object.freeze(results),
    }));
    coverage.push(Object.freeze({
      surfaceId: descriptor.surfaceId,
      displayName: descriptor.displayName,
      surfaceKind: descriptor.surfaceKind,
      status: successfulQueryCount > 0 ? "available" as const : "failed" as const,
      providerName: provider.name,
      model: provider.model,
      successfulQueryCount,
      attemptedQueryCount: results.length,
      detail: successfulQueryCount > 0
        ? `${successfulQueryCount}/${results.length} queries produced provider evidence.`
        : `No query produced successful evidence for this surface.`,
    }));
  }

  const successfulSurfaceCount = coverage.filter(item => item.status === "available").length;
  return Object.freeze({
    corpus,
    observations: Object.freeze(observations),
    coverage: Object.freeze(coverage),
    successfulSurfaceCount,
    configuredSurfaceCount,
    declaredSurfaceCount: input.descriptors.length,
  });
}

export const AI_VISIBILITY_DEFAULT_SURFACES = Object.freeze([
  Object.freeze({
    surfaceId: "openai_model_observation",
    displayName: "OpenAI model observation",
    surfaceKind: "model_only" as const,
  }),
  Object.freeze({
    surfaceId: "gemini",
    displayName: "Gemini",
    surfaceKind: "externally_observed_assistant" as const,
  }),
  Object.freeze({
    surfaceId: "claude",
    displayName: "Claude",
    surfaceKind: "externally_observed_assistant" as const,
  }),
  Object.freeze({
    surfaceId: "perplexity",
    displayName: "Perplexity",
    surfaceKind: "provider_native_web_grounded" as const,
  }),
  Object.freeze({
    surfaceId: "copilot",
    displayName: "Copilot",
    surfaceKind: "externally_observed_assistant" as const,
  }),
]);

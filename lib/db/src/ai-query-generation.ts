/**
 * C9R-4: Deterministic tenant-scoped AI query generation.
 * Pure — no side-effects, no external dependencies.
 * The same tenant context always produces the same ordered list of queries.
 *
 * Fail-closed behaviour (C9R-7 correction):
 * - No active services  → returns [].
 * - No authorized geographies → returns [].
 * Callers MUST run a preflight check before invoking this function.
 * An empty return signals a preflight failure; callers must not execute
 * paid provider queries when this function returns an empty list.
 */

import type { AiQueryTenantContext } from "./ai-query-provider-types";

/** Maximum queries per scan run (cost / token guard). */
export const AI_QUERY_GENERATION_LIMIT = 8;

/**
 * Convert a service key like "bed_bug_treatment" or "bed-bug-treatment"
 * to a human label like "bed bug treatment".
 */
export function humanizeServiceId(serviceId: string): string {
  return serviceId
    .replace(/[-_]/g, " ")
    .toLowerCase()
    .trim();
}

/** Strip trailing punctuation left by template interpolation. */
function clean(s: string): string {
  return s.replace(/[.,;:!?]+$/, "").trim();
}

/**
 * Query templates. Each is a function of (serviceLabel, locationLabel).
 * They intentionally ask a natural question; the AI is not aware we are
 * evaluating whether it mentions a specific business.
 */
const QUERY_TEMPLATES: ReadonlyArray<(service: string, location: string) => string> = [
  (s, l) => `best ${s} in ${l}`,
  (s, l) => `recommended ${s} company in ${l}`,
  (s, l) => `who provides ${s} near ${l}`,
  (s, l) => `top ${s} services in ${l}`,
];

/**
 * Generate a deterministic, de-duplicated, sorted list of AI queries for a tenant.
 *
 * Rules applied in order:
 * 1. Return [] immediately if activeServiceIds or authorizedGeographies is empty
 *    (fail-closed — caller must run preflight before invoking this function).
 * 2. Build cross-product: service × geography × template.
 * 3. Remove queries whose lower-cased form contains any prohibited phrase.
 * 4. Deduplicate by lower-cased value.
 * 5. Sort lexicographically (determinism guarantee).
 * 6. Cap at AI_QUERY_GENERATION_LIMIT.
 *
 * There are NO generic fallbacks. "local services" and "my area" are not
 * produced by this function under any circumstances.
 */
export function generateAiQueries(context: AiQueryTenantContext): readonly string[] {
  const { activeServiceIds, authorizedGeographies, prohibitedPhrases } = context;

  if (activeServiceIds.length === 0 || authorizedGeographies.length === 0) {
    return Object.freeze([]);
  }

  const services    = activeServiceIds.map(humanizeServiceId);
  const geographies = [...authorizedGeographies];
  const prohibited  = prohibitedPhrases.map(p => p.toLowerCase().trim()).filter(Boolean);

  const seen       = new Set<string>();
  const candidates: string[] = [];

  for (const service of services) {
    for (const geography of geographies) {
      for (const template of QUERY_TEMPLATES) {
        const query = clean(template(service, geography));
        const lower = query.toLowerCase();

        if (prohibited.some(p => lower.includes(p))) continue;
        if (seen.has(lower)) continue;

        seen.add(lower);
        candidates.push(query);
      }
    }
  }

  return Object.freeze(
    candidates
      .sort((a, b) => a.localeCompare(b))
      .slice(0, AI_QUERY_GENERATION_LIMIT),
  );
}

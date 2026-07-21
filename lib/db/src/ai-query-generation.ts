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
 *
 * Representative selection (C9R-7 acceptance):
 * Queries are generated in service-priority round-robin order rather than
 * alphabetical order. This prevents alphabetically-early services (e.g. "ants")
 * from filling the limit before higher-priority services (e.g. "bed bug inspection")
 * appear. See SELECTION POLICY below.
 *
 * Intent diversity (C9R-7 session 3 correction):
 * Template is rotated per emitted slot (result.length % templates.length),
 * not per outer round. When services.length >= AI_QUERY_GENERATION_LIMIT, round 0
 * alone fills the list. Rotating by round would assign the same template to all
 * slots. Rotating by slot ensures each consecutive pair of emitted queries uses
 * a different intent (best, recommended, who provides, top).
 *
 * Service humanization (C9R-7 session 3 correction):
 * SERVICE_DISPLAY_NAMES maps bare pest slugs (e.g. "roaches") to natural
 * customer-search phrases (e.g. "roach control"). Slugs without an entry fall
 * back to humanizeServiceId(). This map is not tenant-specific.
 */

import type { AiQueryTenantContext } from "./ai-query-provider-types";

/** Maximum queries per scan run (cost / token guard). */
export const AI_QUERY_GENERATION_LIMIT = 8;

/**
 * Convert a service key like "bed_bug_treatment" or "bed-bug-treatment"
 * to a human label like "bed bug treatment".
 * This is the raw separator-to-space conversion with no semantic mapping.
 * Prefer displayServiceName() in query generation.
 */
export function humanizeServiceId(serviceId: string): string {
  return serviceId
    .replace(/[-_]/g, " ")
    .toLowerCase()
    .trim();
}

/**
 * Maps canonical service key slugs to natural customer-search phrases.
 * Keys are lowercase slugs with hyphens and underscores normalized to underscores.
 *
 * Purpose: prevent unnatural queries like "best roaches in Foley, AL".
 * These are general pest-control industry terms, not tenant-specific values.
 * Tenant display names must be provided via context, not hardcoded here.
 */
const SERVICE_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  roaches:          "roach control",
  rodents:          "rodent control",
  mosquitoes:       "mosquito control",
  ants:             "ant control",
  fleas:            "flea control",
  ticks:            "tick control",
  wasps_hornets:    "wasp and hornet control",
  spiders:          "spider control",
  moles:            "mole control",
  wildlife_removal: "wildlife removal",
};

/**
 * Convert a service key to a natural, customer-facing search phrase.
 *
 * Lookup order:
 * 1. SERVICE_DISPLAY_NAMES keyed by the lowercase, underscore-normalized slug.
 * 2. humanizeServiceId() fallback (separator → space, lowercase).
 *
 * This function is the canonical humanization entry point for query generation.
 * Use humanizeServiceId() only when a raw label is needed (e.g. label display).
 */
export function displayServiceName(serviceId: string): string {
  const key = serviceId.replace(/[-]/g, "_").toLowerCase().trim();
  return SERVICE_DISPLAY_NAMES[key] ?? humanizeServiceId(serviceId);
}

/** Strip trailing punctuation left by template interpolation. */
function clean(s: string): string {
  return s.replace(/[.,;:!?]+$/, "").trim();
}

/**
 * Query templates. Each is a function of (serviceLabel, locationLabel).
 * They intentionally ask a natural question; the AI is not aware we are
 * evaluating whether it mentions a specific business.
 *
 * Intent coverage (one per template):
 *   0 — best-provider search
 *   1 — recommendation search
 *   2 — provider-discovery / citation-producing question
 *   3 — top-of-market / comparison search
 */
const QUERY_TEMPLATES: ReadonlyArray<(service: string, location: string) => string> = [
  (s, l) => `best ${s} in ${l}`,
  (s, l) => `recommended ${s} company in ${l}`,
  (s, l) => `who provides ${s} near ${l}`,
  (s, l) => `top ${s} services in ${l}`,
];

/**
 * Generate a deterministic, de-duplicated list of AI queries for a tenant.
 *
 * SELECTION POLICY — service-priority round-robin:
 *
 * The caller supplies `activeServiceIds` in canonical priority order
 * (sort_order ASC from client_services). This function preserves that order.
 *
 * Iteration proceeds as nested loops:
 *   outer: round = 0, 1, 2, ... (each round advances the geo offset)
 *   inner: serviceIndex = 0 .. services.length-1 (one slot per service per round)
 *
 * Geography assignment: geoIndex = (round × services.length + serviceIndex) % geos.length
 * This distributes geographies across services within each round so that no single
 * geography fills the limit before others appear.
 *
 * Template assignment: templateIndex = result.length % templates.length
 * Template rotates by emitted slot count, not by round. This ensures that when
 * services.length >= AI_QUERY_GENERATION_LIMIT (e.g. 16 services, limit=8),
 * round 0 alone fills the list and each slot gets a distinct intent template.
 * Pattern over 8 slots: best, recommended, who provides, top, best, recommended,
 * who provides, top — two queries per intent, no intent dominates.
 *
 * Outcome:
 *   - The first AI_QUERY_GENERATION_LIMIT distinct, non-prohibited queries are returned.
 *   - Higher-priority services always appear before lower-priority ones (sort_order is respected).
 *   - Output covers multiple distinct intent templates regardless of service count.
 *   - Output is deterministic: same input → same output.
 *   - No alpha-sort is applied; service-priority order is the ordering guarantee.
 *
 * Rules applied:
 * 1. Return [] immediately if activeServiceIds or authorizedGeographies is empty
 *    (fail-closed — caller must run preflight before invoking this function).
 * 2. Generate queries using round-robin service-priority order (described above).
 * 3. Remove queries whose lower-cased form contains any prohibited phrase.
 * 4. Deduplicate by lower-cased value.
 * 5. Cap at AI_QUERY_GENERATION_LIMIT.
 *
 * There are NO generic fallbacks. "local services" and "my area" are not
 * produced by this function under any circumstances.
 */
export function generateAiQueries(context: AiQueryTenantContext): readonly string[] {
  const { activeServiceIds, authorizedGeographies, prohibitedPhrases } = context;

  if (activeServiceIds.length === 0 || authorizedGeographies.length === 0) {
    return Object.freeze([]);
  }

  const services   = activeServiceIds.map(displayServiceName);
  const geos       = [...authorizedGeographies];
  const prohibited = prohibitedPhrases.map(p => p.toLowerCase().trim()).filter(Boolean);
  const templates  = QUERY_TEMPLATES;

  const seen    = new Set<string>();
  const result: string[] = [];

  // Safety ceiling: enough rounds to exhaust all template × geography combinations
  const maxRounds = templates.length * Math.max(services.length, geos.length) + 1;

  outer: for (let round = 0; round < maxRounds; round++) {
    for (let si = 0; si < services.length; si++) {
      if (result.length >= AI_QUERY_GENERATION_LIMIT) break outer;

      // Template rotates by emitted slot index, not by round.
      // When services.length >= limit, one round fills the list:
      // rotating by round would assign the same template to every slot.
      const templateIdx = result.length % templates.length;
      const template    = templates[templateIdx];

      const gi    = (round * services.length + si) % geos.length;
      const query = clean(template(services[si], geos[gi]));
      const lower = query.toLowerCase();

      if (prohibited.some(p => lower.includes(p))) continue;
      if (seen.has(lower)) continue;

      seen.add(lower);
      result.push(query);
    }
  }

  return Object.freeze(result);
}

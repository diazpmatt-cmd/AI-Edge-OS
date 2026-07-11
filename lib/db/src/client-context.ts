/**
 * ClientContentContext — canonical per-client configuration carrier for the
 * AI Edge content engine.
 *
 * ── PHASE BOUNDARY ──────────────────────────────────────────────────────────
 * Phase A1 (this file): Interface definition + BB&B registry provider shim.
 *   • Only one registry provider exists: bbbRegistryProvider (backed by
 *     the static BBB_SERVICES array in bbb-services.ts).
 *   • buildClientContentContext() reproduces BB&B's exact defaults when called
 *     with null — behavior is CHARACTER-FOR-CHARACTER identical to the
 *     pre-Phase-A1 hardcoded strings in auto-content.ts.
 *
 * Phase B (future): DB-backed ServiceRegistryProvider + `clients` table.
 *   • This interface does NOT change; only the provider implementation swaps.
 *   • No migration of BBB_SERVICES or auto-content.ts is needed at that time.
 *
 * ── SAFETY RULES ────────────────────────────────────────────────────────────
 * • Never change the BB&B registry provider's getSystemBusinessRules() output
 *   without QA-ing the live autopilot.
 * • Never remove exports — downstream consumers depend on named exports.
 * • The BBB_REGION and BBB_DEFAULT_SERVICE_AREAS constants are the source of
 *   truth for all geographic defaults; do not duplicate them in routes.
 */

import {
  type BBBService,
  type WeeklyServiceSlot,
  getGeneratableServices,
  matchServiceByTopic,
  getServicePromptRules,
  validateTopicForGeneration,
  selectWeeklyServices,
  normalizeTopics,
  getDefaultTopics,
} from "./bbb-services";

export type { BBBService, WeeklyServiceSlot };

// ── BB&B geography constants (single source of truth) ─────────────────────────

export const BBB_DEFAULT_SERVICE_AREAS: string[] = [
  "Foley, AL", "Daphne, AL", "Loxley, AL", "Fairhope, AL", "Gulf Shores, AL",
  "Orange Beach, AL", "Summerdale, AL", "Spanish Fort, AL", "Elberta, AL",
  "Lillian, AL", "Perdido Beach, AL",
];

/** Human-readable region string used in AI system prompts for BB&B. */
export const BBB_REGION = "Gulf Coast of Alabama (Baldwin County)";

// ── ServiceRegistryProvider ────────────────────────────────────────────────────

/**
 * Abstraction over a client's service registry.
 *
 * In Phase A1, the only implementation is bbbRegistryProvider (backed by the
 * static BBB_SERVICES array). In Phase B, a DbServiceRegistryProvider will
 * be introduced for DB-backed per-client registries.
 *
 * All content-engine code that currently calls bbb-services.ts functions
 * directly should instead call methods on this interface — received via
 * ClientContentContext.registry.
 */
export interface ServiceRegistryProvider {
  /** Services eligible for AI content generation (generationAllowed = true). */
  getGeneratableServices(): BBBService[];

  /** Find the service record matching a topic display name (best-effort). */
  matchByTopic(topic: string): BBBService | undefined;

  /** Build per-service AI prompt rules (prohibited claims + differentiators). */
  getPromptRules(topic: string): string;

  /**
   * Validate a topic string against the registry.
   * Returns null if valid, or an error-code string if blocked.
   * Error codes: "SERVICE_COMING_SOON" | "SERVICE_DISABLED" | "SERVICE_NOT_GENERATABLE"
   */
  validateTopic(topic: string): string | null;

  /**
   * Select `count` weekly service slots using the 60/25/15 mix.
   * @param recentTopics Topics to deprioritize (recently used in prior plans).
   */
  selectWeeklySlots(count: number, recentTopics?: string[]): WeeklyServiceSlot[];

  /** Strip blocked/ineligible topics from a list (defence-in-depth normalizer). */
  normalizeTopics(topics: string[]): string[];

  /** Default topic list sorted by priority and revenue weight. */
  getDefaultTopics(): string[];

  /**
   * BUSINESS RULES block for the AI system prompt.
   * This string is appended after the generic CORE RULES section.
   * For BB&B it must begin with "BUSINESS RULES (MUST FOLLOW):" to preserve
   * the exact pre-Phase-A1 AI prompt behavior.
   */
  getSystemBusinessRules(): string;
}

// ── BB&B registry provider (Phase A1) ─────────────────────────────────────────

/**
 * Concrete ServiceRegistryProvider backed by the static BBB_SERVICES array.
 * Delegates directly to the existing bbb-services.ts functions so that the
 * underlying behavior is unchanged — this is a zero-cost compatibility shim.
 */
export const bbbRegistryProvider: ServiceRegistryProvider = {
  getGeneratableServices,
  matchByTopic: matchServiceByTopic,
  getPromptRules: getServicePromptRules,
  validateTopic: validateTopicForGeneration,
  selectWeeklySlots: selectWeeklyServices,
  normalizeTopics,
  getDefaultTopics,

  /**
   * Returns the BB&B-specific BUSINESS RULES section verbatim.
   * This string must produce character-for-character identical output to the
   * hardcoded rules that existed in auto-content.ts before Phase A1.
   */
  getSystemBusinessRules(): string {
    return (
      "BUSINESS RULES (MUST FOLLOW):\n" +
      "- BB&B uses targeted treatment of affected furniture and specific areas" +
      " \u2014 NOT whole-home heat treatment\n" +
      "- Do NOT claim BB&B offers heat treatment or whole-home heat treatment\n" +
      "- Do NOT claim guaranteed elimination or specific savings without verified data\n" +
      "- Do NOT generate termite content, wildlife removal content, or heat treatment content\n" +
      "- Do NOT generate chemical dosages, DIY fumigation instructions, or regulatory compliance claims\n" +
      "- Fumigation content must remain at awareness/educational level only"
    );
  },
};

// ── ClientContentContext ───────────────────────────────────────────────────────

/**
 * Canonical context object for AI content generation.
 *
 * Built by buildClientContentContext() from an auto_content_settings row.
 * Passing null reproduces BB&B's hardcoded defaults — identical behavior to
 * the pre-Phase-A1 codebase, verified field-by-field.
 *
 * Downstream code must treat this as read-only. Do not mutate fields after
 * construction — build a new context if overrides are needed.
 */
export interface ClientContentContext {
  // ── Identity ────────────────────────────────────────────────────────────────
  /** Business display name. BB&B default: "Bed Bugs & Beyond". */
  clientName: string;
  /** Industry identifier (snake_case). BB&B default: "pest_control". */
  industry: string;
  /** Human-readable industry for AI prompts. BB&B default: "pest control". */
  industryLabel: string;

  // ── Geography ───────────────────────────────────────────────────────────────
  /** City strings used for post rotation. BB&B default: 11 Baldwin County cities. */
  serviceAreas: string[];
  /**
   * Region string embedded in the AI system prompt.
   * BB&B default: "Gulf Coast of Alabama (Baldwin County)".
   */
  region: string;

  // ── Content settings ────────────────────────────────────────────────────────
  topics: string[];
  toneStyle: string[];
  ctaText: string;
  ctaPreference: string;
  approvalMode: string;
  frequency: string;
  postingTimes: string[];
  platforms: string[];
  postAngles: string[];

  // ── Registry ─────────────────────────────────────────────────────────────────
  /** Service registry operations scoped to this client. */
  registry: ServiceRegistryProvider;
}

// ── Defaults (exported for callers that need raw default arrays) ───────────────

export const DEFAULT_POST_ANGLES: string[] = [
  "educational", "warning", "promotional", "seasonal",
  "faq", "testimonial", "prevention", "emergency",
];

export const DEFAULT_TONE_STYLE: string[] = ["professional", "friendly"];

// ── Partial input type accepted by the builder ────────────────────────────────

/**
 * Flexible input to buildClientContentContext.
 * All fields are optional — missing fields fall back to BB&B defaults.
 * Arrays are accepted as already-parsed string[] (not JSON strings).
 */
export interface PartialClientConfig {
  clientName?: string | null;
  industry?: string | null;
  serviceAreas?: string[] | null;
  topics?: string[] | null;
  toneStyle?: string[] | null;
  postAngles?: string[] | null;
  postingTimes?: string[] | null;
  platforms?: string[] | null;
  approvalMode?: string | null;
  ctaText?: string | null;
  ctaPreference?: string | null;
  frequency?: string | null;
}

// ── Builder ────────────────────────────────────────────────────────────────────

/**
 * Convert a snake_case industry identifier to a human-readable label.
 * "pest_control" → "pest control"
 */
function deriveIndustryLabel(industry: string): string {
  return industry.replace(/_/g, " ").toLowerCase();
}

/**
 * Derive a human-readable region string for the AI system prompt.
 *
 * For BB&B (any service area containing ", AL"), returns BBB_REGION exactly.
 * This ensures the AI system prompt is character-for-character identical to
 * the pre-Phase-A1 hardcoded string for the live pilot.
 *
 * In Phase B, clients will have a stored `region` column; this function
 * becomes a fallback for legacy rows only.
 */
function deriveRegion(serviceAreas: string[]): string {
  if (serviceAreas.some(a => a.toLowerCase().includes(", al"))) {
    return BBB_REGION;
  }
  const firstArea = serviceAreas[0] ?? "";
  const [city, state] = firstArea.split(",").map(s => s.trim());
  if (state) return `${city} area, ${state}`;
  return city || "the local area";
}

/**
 * Build a ClientContentContext from resolved configuration values.
 *
 * Passing null for the config reproduces BB&B's hardcoded defaults,
 * yielding behavior CHARACTER-FOR-CHARACTER identical to pre-Phase-A1.
 *
 * @param config  Resolved configuration object, or null for pure BB&B defaults.
 * @param registryOverride  Optional registry provider override (for testing or
 *                          future Phase B DB-backed providers).
 */
export function buildClientContentContext(
  config: PartialClientConfig | null,
  registryOverride?: ServiceRegistryProvider,
): ClientContentContext {
  const registry = registryOverride ?? bbbRegistryProvider;

  const clientName    = config?.clientName    || "Bed Bugs & Beyond";
  const industry      = config?.industry      || "pest_control";
  const approvalMode  = config?.approvalMode  || "approval_required";
  const ctaText       = config?.ctaText       || "Call Now \u2014 (251) 324-9090";
  const ctaPreference = config?.ctaPreference || "call_now";
  const frequency     = config?.frequency     || "every_other_day";

  const serviceAreas = (config?.serviceAreas?.length)
    ? config.serviceAreas
    : BBB_DEFAULT_SERVICE_AREAS;

  const topics = (config?.topics?.length)
    ? config.topics
    : registry.getDefaultTopics();

  const toneStyle = (config?.toneStyle?.length)
    ? config.toneStyle
    : [...DEFAULT_TONE_STYLE];

  const postAngles = (config?.postAngles?.length)
    ? config.postAngles
    : [...DEFAULT_POST_ANGLES];

  const postingTimes = (config?.postingTimes?.length)
    ? config.postingTimes
    : ["08:00", "12:00", "17:00"];

  const platforms = (config?.platforms?.length)
    ? config.platforms
    : ["facebook"];

  const region = deriveRegion(serviceAreas);

  return {
    clientName,
    industry,
    industryLabel: deriveIndustryLabel(industry),
    serviceAreas,
    region,
    topics,
    toneStyle,
    ctaText,
    ctaPreference,
    approvalMode,
    frequency,
    postingTimes,
    platforms,
    postAngles,
    registry,
  };
}

// ── System prompt builder ──────────────────────────────────────────────────────

/**
 * Build the AI system prompt for social post generation.
 *
 * For the BB&B default context, the output is CHARACTER-FOR-CHARACTER
 * identical to the pre-Phase-A1 hardcoded template string in auto-content.ts:
 *
 *   "You are a local pest control social media copywriter for Bed Bugs & Beyond,
 *    serving the Gulf Coast of Alabama (Baldwin County). Write authentic..."
 *
 * The CORE RULES section is generic (applies to any local service business).
 * The BUSINESS RULES section is client-specific (from registry.getSystemBusinessRules()).
 */
export function buildSystemPrompt(context: ClientContentContext): string {
  return (
    `You are a local ${context.industryLabel} social media copywriter for ${context.clientName}, ` +
    `serving the ${context.region}. ` +
    `Write authentic, local posts that feel genuine. Return ONLY valid JSON:\n` +
    `{"caption":string,"hashtags":string[],"imagePrompt":string}\n` +
    `\n` +
    `CORE RULES:\n` +
    `- caption is 2-3 sentences, mentions the specific city by name, names the pest/service naturally\n` +
    `- matches the post angle (educational=informative, warning=urgent risk, promotional=offer/deal, seasonal=time-relevant, faq=question+answer, testimonial=social proof voice, prevention=tips, emergency=urgent call)\n` +
    `- ends with the CTA\n` +
    `- No markdown, no code fences\n` +
    `- hashtags: 5-8 tags mixing local and service tags\n` +
    `- imagePrompt: 1 sentence describing a realistic professional photo\n` +
    `- JSON only\n` +
    `\n` +
    context.registry.getSystemBusinessRules()
  );
}

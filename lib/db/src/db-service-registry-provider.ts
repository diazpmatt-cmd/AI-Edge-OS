/**
 * DB-backed ServiceRegistryProvider — Phase B2.
 *
 * createDbServiceRegistryProvider() is a factory that accepts pre-loaded
 * service data and returns a ServiceRegistryProvider implementation. All DB
 * fetching happens BEFORE this call; the provider operates entirely in-memory
 * and never issues a DB query during method invocations.
 *
 * Algorithm correctness guarantee:
 *   Every method delegates to a generic *In() variant of the corresponding
 *   bbb-services.ts function — the same algorithm, parameterised with the
 *   caller-supplied services array instead of the global BBB_SERVICES constant.
 *   BB&B parity is therefore guaranteed by construction when the services array
 *   matches BBB_SERVICES exactly (which the bootstrap seed ensures).
 *
 * Phase B2 safety rules:
 *   • Hard-coded keyword blocks (termite / wildlife / heat treatment) remain in
 *     validateTopicForGenerationWith() — these are code-level safety rails, not
 *     DB-overridable data.
 *   • The returned provider is immutable — callers must not mutate the services
 *     array after passing it to createDbServiceRegistryProvider.
 *   • An empty services array produces a provider that blocks all generation.
 */

import {
  type BBBService,
  type WeeklyServiceSlot,
  type ServiceCategory,
  type ServiceStatus,
  type ServiceUrgency,
  matchServiceByTopicIn,
  validateTopicForGenerationWith,
  selectWeeklyServicesFrom,
  normalizeTopicsIn,
  getDefaultTopicsFrom,
  getServicePromptRulesFor,
} from "./bbb-services";
import type { ServiceRegistryProvider } from "./client-context";

/**
 * In-memory service record reconstructed from DB columns.
 * Extends BBBService with the extra prompt_rule_prefix column and sort_order.
 * Cast at construction time in service-registry-loader.ts row-to-record.
 */
export interface DbServiceRecord extends BBBService {
  promptRulePrefix: string | null;
  sortOrder:        number;
}

/**
 * Result type returned by the DB loader.
 *
 * "no_services"      — the registry has not been seeded yet (bootstrap still
 *                      running or explicit first-time setup required). The caller
 *                      MUST return registry_not_configured — never fall back to
 *                      the static provider in production.
 * "invalid_registry" — rows are present but structurally unusable (duplicates,
 *                      missing required fields, invalid status values). The
 *                      `details` field names the failing check. Caller must
 *                      return registry_invalid.
 * "db_error"         — unexpected DB failure (network, schema mismatch, etc.).
 *                      Caller must return registry_unavailable and log safely.
 */
export type RegistryLoadResult =
  | { ok: true;  services: DbServiceRecord[]; systemBusinessRules: string }
  | { ok: false; reason: "no_services" | "invalid_registry" | "db_error"; details?: string; error?: unknown };

/**
 * Build an in-memory ServiceRegistryProvider from pre-fetched DB rows.
 *
 * @param services          All service records for this client, ordered by sort_order.
 * @param systemBusinessRules  The client_registry_rules.system_business_rules text.
 */
export function createDbServiceRegistryProvider(
  services: DbServiceRecord[],
  systemBusinessRules: string,
): ServiceRegistryProvider {
  // Freeze a defensive copy so external mutations cannot corrupt the provider.
  const frozenServices = Object.freeze(services.slice());

  return {
    getGeneratableServices(): BBBService[] {
      return frozenServices.filter(s => s.generationAllowed);
    },

    matchByTopic(topic: string): BBBService | undefined {
      return matchServiceByTopicIn(frozenServices, topic);
    },

    getPromptRules(topic: string): string {
      const service = matchServiceByTopicIn(frozenServices, topic) as DbServiceRecord | undefined;
      if (!service) return "";
      return getServicePromptRulesFor(service);
    },

    validateTopic(topic: string): string | null {
      return validateTopicForGenerationWith(frozenServices, topic);
    },

    selectWeeklySlots(count: number, recentTopics?: string[]): WeeklyServiceSlot[] {
      return selectWeeklyServicesFrom(frozenServices, count, recentTopics ?? []);
    },

    normalizeTopics(topics: string[]): string[] {
      return normalizeTopicsIn(frozenServices, topics);
    },

    getDefaultTopics(): string[] {
      return getDefaultTopicsFrom(frozenServices);
    },

    getSystemBusinessRules(): string {
      return systemBusinessRules;
    },
  };
}

/**
 * Reconstruct a DbServiceRecord from raw DB column values.
 * Exposed for use in service-registry-loader.ts (and test helpers).
 */
export function rowToDbServiceRecord(row: {
  serviceKey:             string;
  displayName:            string;
  category:               string;
  status:                 string;
  priority:               number;
  revenueWeight:          number;
  contentFrequencyWeight: number;
  urgency:                string;
  seasonality:            string | null;
  allowAiGeneration:      boolean;
  allowBooking:           boolean;
  allowCta:               boolean;
  allowPublishing:        boolean;
  supportedAudiences:     string;
  campaignGoals:          string;
  allowedContentAngles:   string;
  prohibitedClaims:       string;
  differentiators:        string;
  notes:                  string;
  promptRulePrefix:       string | null;
  sortOrder:              number;
}): DbServiceRecord {
  function parseJsonArr(raw: string): string[] {
    try { return JSON.parse(raw) as string[]; } catch { return []; }
  }
  return {
    serviceId:              row.serviceKey,
    displayName:            row.displayName,
    category:               row.category as ServiceCategory,
    status:                 row.status as ServiceStatus,
    priority:               row.priority,
    revenueWeight:          row.revenueWeight,
    contentFrequencyWeight: row.contentFrequencyWeight,
    urgency:                row.urgency as ServiceUrgency,
    seasonality:            row.seasonality,
    generationAllowed:      row.allowAiGeneration,
    bookingAllowed:         row.allowBooking,
    publishAllowed:         row.allowPublishing,
    ctaAllowed:             row.allowCta,
    supportedAudiences:     parseJsonArr(row.supportedAudiences),
    campaignGoals:          parseJsonArr(row.campaignGoals),
    allowedContentAngles:   parseJsonArr(row.allowedContentAngles),
    prohibitedClaims:       parseJsonArr(row.prohibitedClaims),
    differentiators:        parseJsonArr(row.differentiators),
    notes:                  row.notes,
    promptRulePrefix:       row.promptRulePrefix,
    sortOrder:              row.sortOrder,
  };
}

/**
 * Service Registry Loader — Phase B2.
 *
 * Responsible for:
 *   1. Bootstrapping the service-registry tables via raw SQL.
 *   2. Seeding the BB&B service registry from BBB_SERVICES (single source of
 *      truth) and bbbRegistryProvider.getSystemBusinessRules() (parity oracle).
 *   3. Exporting loadClientServiceRegistry(clientId) for use in client-resolver.
 *
 * ── Bootstrap readiness ──────────────────────────────────────────────────────
 * `registryBootstrapReady` is a Promise that resolves when the IIFE completes
 * (success OR failure). `loadClientServiceRegistry` awaits it so no request can
 * race table creation or seeding. This replaces the previous silent-fallback
 * pattern: if the bootstrap fails, subsequent loads will get a db_error result
 * (tables may not exist) and the caller returns registry_unavailable (HTTP 503).
 *
 * ── bbbRegistryProvider usage in this file ──────────────────────────────────
 * `bbbRegistryProvider.getSystemBusinessRules()` is called ONCE at seed time to
 * guarantee that the stored system_business_rules string is character-for-character
 * identical to the static provider's output. This is a parity oracle / seed-time
 * fixture use — NOT a runtime fallback. It must never be reached by a live request.
 *
 * SAFETY:
 *   • Never silently falls back to BB&B for an unknown tenant.
 *   • Returns typed RegistryLoadResult — callers must map to ClientResolveResult.
 *   • Never reads or writes autopilot_enabled.
 *   • Never publishes content.
 */

import { db, pool } from "@workspace/db";
import {
  BBB_SERVICES,
  bbbRegistryProvider,
} from "@workspace/db";
import {
  clientServicesTable,
  clientRegistryRulesTable,
} from "@workspace/db/schema";
import {
  createDbServiceRegistryProvider,
  rowToDbServiceRecord,
  validateRegistryRows,
  type DbServiceRecord,
  type RegistryLoadResult,
} from "@workspace/db";
import { eq, asc } from "drizzle-orm";

// ── Prompt-rule prefix (mirrors getServicePromptRules special-casing) ──────────

function getBbbPromptRulePrefix(serviceKey: string): string | null {
  if (serviceKey === "bed_bug_inspection" || serviceKey === "bed_bug_treatment") {
    return [
      "BED BUG TREATMENT POSITIONING:",
      "- BB&B uses targeted treatment of affected furniture and specific areas.",
      "- This approach is often more affordable than whole-home heat treatment.",
      "- DO NOT claim BB&B offers heat treatment.",
      "- DO NOT claim guaranteed elimination or exact cost savings.",
      "- ALLOWED: professional inspection, targeted treatment, often more affordable than whole-home heat.",
    ].join("\n");
  }
  if (serviceKey === "fumigation") {
    return [
      "FUMIGATION RULES:",
      "- Keep content at awareness/educational level.",
      "- DO NOT generate: chemical dosages, DIY instructions, regulatory compliance claims,",
      "  exact preparation steps, specific pricing, or guarantees.",
      "- ALLOWED: service awareness, general educational content, inspection/consultation CTA.",
    ].join("\n");
  }
  return null;
}

// ── Bootstrap readiness promise ────────────────────────────────────────────────
//
// Resolves when the IIFE completes (success or failure). Always resolves so
// requests are never blocked indefinitely even if bootstrap fails.
// loadClientServiceRegistry awaits this before issuing any DB queries.

let resolveRegistryBootstrap!: () => void;

/**
 * Awaitable sentinel: resolves once the service-registry bootstrap IIFE has
 * finished (tables created + BB&B seeded, or bootstrap error logged).
 *
 * Export allows tests to await it and verify bootstrap completed.
 */
export const registryBootstrapReady: Promise<void> = new Promise(resolve => {
  resolveRegistryBootstrap = resolve;
});

// ── Table bootstrap (idempotent) ───────────────────────────────────────────────

(async () => {
  try {
    // ── Schema ──────────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS client_services (
        id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id               UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        service_key             TEXT        NOT NULL,
        display_name            TEXT        NOT NULL,
        short_name              TEXT,
        category                TEXT        NOT NULL,
        description             TEXT        NOT NULL DEFAULT '',
        status                  TEXT        NOT NULL DEFAULT 'active',
        allow_ai_generation     BOOLEAN     NOT NULL DEFAULT TRUE,
        allow_booking           BOOLEAN     NOT NULL DEFAULT TRUE,
        allow_cta               BOOLEAN     NOT NULL DEFAULT TRUE,
        allow_publishing        BOOLEAN     NOT NULL DEFAULT TRUE,
        allow_recommendation    BOOLEAN     NOT NULL DEFAULT TRUE,
        supported_audiences     TEXT        NOT NULL DEFAULT '[]',
        campaign_goals          TEXT        NOT NULL DEFAULT '[]',
        allowed_content_angles  TEXT        NOT NULL DEFAULT '[]',
        prohibited_claims       TEXT        NOT NULL DEFAULT '[]',
        differentiators         TEXT        NOT NULL DEFAULT '[]',
        priority                INTEGER     NOT NULL DEFAULT 5,
        revenue_weight          INTEGER     NOT NULL DEFAULT 5,
        content_frequency_weight INTEGER    NOT NULL DEFAULT 5,
        urgency                 TEXT        NOT NULL DEFAULT 'medium',
        seasonality             TEXT,
        prompt_rule_prefix      TEXT,
        notes                   TEXT        NOT NULL DEFAULT '',
        sort_order              INTEGER     NOT NULL DEFAULT 0,
        is_active               BOOLEAN     NOT NULL DEFAULT TRUE,
        created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_client_services_client_key
        ON client_services(client_id, service_key);
      CREATE INDEX IF NOT EXISTS idx_client_services_client_id
        ON client_services(client_id);

      CREATE TABLE IF NOT EXISTS client_service_topics (
        id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        service_id            UUID        NOT NULL REFERENCES client_services(id) ON DELETE CASCADE,
        alias                 TEXT        NOT NULL,
        normalized_alias      TEXT        NOT NULL,
        is_primary            BOOLEAN     NOT NULL DEFAULT FALSE,
        weekly_eligible       BOOLEAN     NOT NULL DEFAULT TRUE,
        default_topic_eligible BOOLEAN   NOT NULL DEFAULT TRUE,
        prohibited_wording    TEXT,
        preferred_wording     TEXT,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_client_service_topics_service_alias
        ON client_service_topics(service_id, normalized_alias);
      CREATE INDEX IF NOT EXISTS idx_client_service_topics_service_id
        ON client_service_topics(service_id);

      CREATE TABLE IF NOT EXISTS client_registry_rules (
        id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id             UUID        NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
        system_business_rules TEXT        NOT NULL DEFAULT '',
        registry_version      INTEGER     NOT NULL DEFAULT 1,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_client_registry_rules_client_id
        ON client_registry_rules(client_id);
    `);

    // ── BB&B seed ────────────────────────────────────────────────────────────
    // Source of truth: BBB_SERVICES array (no SQL transcription risk).
    // Idempotent: ON CONFLICT DO NOTHING on (client_id, service_key).
    // bbbRegistryProvider.getSystemBusinessRules() is used as a parity oracle
    // at seed time — it is NOT a runtime fallback and must not be reached by
    // any live request.

    const bbbResult = await pool.query<{ id: string }>(
      `SELECT id FROM clients WHERE slug = 'bed-bugs-and-beyond' LIMIT 1`,
    );
    const bbbClientId = bbbResult.rows[0]?.id;

    if (bbbClientId) {
      for (let sortOrder = 0; sortOrder < BBB_SERVICES.length; sortOrder++) {
        const svc = BBB_SERVICES[sortOrder];
        const promptRulePrefix = getBbbPromptRulePrefix(svc.serviceId);
        await pool.query(
          `INSERT INTO client_services (
             client_id, service_key, display_name, category, status,
             allow_ai_generation, allow_booking, allow_cta, allow_publishing, allow_recommendation,
             supported_audiences, campaign_goals, allowed_content_angles,
             prohibited_claims, differentiators,
             priority, revenue_weight, content_frequency_weight, urgency, seasonality,
             prompt_rule_prefix, notes, sort_order
           ) VALUES (
             $1, $2, $3, $4, $5,
             $6, $7, $8, $9, $10,
             $11, $12, $13,
             $14, $15,
             $16, $17, $18, $19, $20,
             $21, $22, $23
           ) ON CONFLICT DO NOTHING`,
          [
            bbbClientId,
            svc.serviceId,
            svc.displayName,
            svc.category,
            svc.status,
            svc.generationAllowed,
            svc.bookingAllowed,
            svc.ctaAllowed,
            svc.publishAllowed,
            svc.generationAllowed,
            JSON.stringify(svc.supportedAudiences),
            JSON.stringify(svc.campaignGoals),
            JSON.stringify(svc.allowedContentAngles),
            JSON.stringify(svc.prohibitedClaims),
            JSON.stringify(svc.differentiators),
            svc.priority,
            svc.revenueWeight,
            svc.contentFrequencyWeight,
            svc.urgency,
            svc.seasonality ?? null,
            promptRulePrefix,
            svc.notes,
            sortOrder,
          ],
        );
      }

      // Seed system_business_rules from the parity oracle.
      await pool.query(
        `INSERT INTO client_registry_rules (client_id, system_business_rules, registry_version)
         VALUES ($1, $2, 1)
         ON CONFLICT DO NOTHING`,
        [bbbClientId, bbbRegistryProvider.getSystemBusinessRules()],
      );

      console.log("[SERVICE-REGISTRY] BB&B service registry seeded successfully");
    } else {
      console.warn("[SERVICE-REGISTRY] BB&B client not found — registry seed skipped (clients table not yet populated)");
    }

    console.log("[SERVICE-REGISTRY] service registry tables ready");
  } catch (err) {
    console.error("[SERVICE-REGISTRY] Bootstrap failed:", err);
  } finally {
    // Always resolve — even on error — so requests are never blocked indefinitely.
    // If tables were not created, subsequent loadClientServiceRegistry calls will
    // receive db_error and return registry_unavailable (HTTP 503).
    resolveRegistryBootstrap();
  }
})();

// ── DB loader ──────────────────────────────────────────────────────────────────

/**
 * Load the full service registry for a client from the DB.
 *
 * Always awaits `registryBootstrapReady` first, so this function is safe to
 * call immediately on server startup — it will block until tables exist.
 *
 * Returns typed failure results that the caller MUST map to ClientResolveResult
 * failure reasons. There is no implicit fallback to any static provider.
 *
 *   ok: false, reason: "no_services"      → caller returns registry_not_configured
 *   ok: false, reason: "invalid_registry" → caller returns registry_invalid
 *   ok: false, reason: "db_error"         → caller returns registry_unavailable
 */
export async function loadClientServiceRegistry(
  clientId: string,
): Promise<RegistryLoadResult> {
  // Block until the IIFE has completed (tables created + seed attempted).
  await registryBootstrapReady;

  try {
    const rows = await db
      .select({
        serviceKey:             clientServicesTable.serviceKey,
        displayName:            clientServicesTable.displayName,
        category:               clientServicesTable.category,
        status:                 clientServicesTable.status,
        priority:               clientServicesTable.priority,
        revenueWeight:          clientServicesTable.revenueWeight,
        contentFrequencyWeight: clientServicesTable.contentFrequencyWeight,
        urgency:                clientServicesTable.urgency,
        seasonality:            clientServicesTable.seasonality,
        allowAiGeneration:      clientServicesTable.allowAiGeneration,
        allowBooking:           clientServicesTable.allowBooking,
        allowCta:               clientServicesTable.allowCta,
        allowPublishing:        clientServicesTable.allowPublishing,
        supportedAudiences:     clientServicesTable.supportedAudiences,
        campaignGoals:          clientServicesTable.campaignGoals,
        allowedContentAngles:   clientServicesTable.allowedContentAngles,
        prohibitedClaims:       clientServicesTable.prohibitedClaims,
        differentiators:        clientServicesTable.differentiators,
        notes:                  clientServicesTable.notes,
        promptRulePrefix:       clientServicesTable.promptRulePrefix,
        sortOrder:              clientServicesTable.sortOrder,
      })
      .from(clientServicesTable)
      .where(eq(clientServicesTable.clientId, clientId))
      .orderBy(asc(clientServicesTable.sortOrder));

    if (!rows.length) {
      return { ok: false, reason: "no_services" };
    }

    const services: DbServiceRecord[] = rows.map(rowToDbServiceRecord);

    // Validate structural soundness before building the provider.
    const validationError = validateRegistryRows(services);
    if (validationError) {
      return { ok: false, reason: "invalid_registry", details: validationError };
    }

    const [rulesRow] = await db
      .select({ systemBusinessRules: clientRegistryRulesTable.systemBusinessRules })
      .from(clientRegistryRulesTable)
      .where(eq(clientRegistryRulesTable.clientId, clientId));

    const systemBusinessRules = rulesRow?.systemBusinessRules ?? "";

    return { ok: true, services, systemBusinessRules };
  } catch (err) {
    return { ok: false, reason: "db_error", error: err };
  }
}

export type { DbServiceRecord, RegistryLoadResult };
export { createDbServiceRegistryProvider };

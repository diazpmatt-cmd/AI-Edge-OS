/**
 * Service Registry Loader — Phase B2.
 *
 * Responsible for:
 *   1. Bootstrapping the service-registry tables via raw SQL (drizzle-kit push
 *      is blocked by a pre-existing constraint conflict — same pattern as
 *      client-resolver.ts and diagnostics.ts).
 *   2. Seeding the BB&B service registry from BBB_SERVICES (single source of
 *      truth) and bbbRegistryProvider.getSystemBusinessRules() (exact parity).
 *   3. Exporting loadClientServiceRegistry(clientId) for use by
 *      resolveClientContentContextFromDb.
 *
 * The bootstrap IIFE runs once at server start. The seed is idempotent:
 * repeated runs do NOT duplicate services, aliases, or rules.
 *
 * SAFETY:
 *   • Never silently falls back to BB&B for an unknown tenant.
 *   • Returns { ok: false, reason: "no_services" } when tables are empty,
 *     giving the caller the choice to fall back to the static provider.
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
  clientsTable,
} from "@workspace/db/schema";
import {
  createDbServiceRegistryProvider,
  rowToDbServiceRecord,
  type DbServiceRecord,
  type RegistryLoadResult,
} from "@workspace/db";
import { eq, asc } from "drizzle-orm";

// ── Prompt-rule prefix (mirrors getServicePromptRules special-casing) ──────────
// Stored in the DB so the generic getServicePromptRulesFor() produces output
// character-for-character identical to the static getServicePromptRules().

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

// ── Table bootstrap (idempotent) ───────────────────────────────────────────────
// Mirrors 0004_b2_service_registry.sql — runs on every server start.

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

      // Registry rules — seeded from bbbRegistryProvider.getSystemBusinessRules()
      // to guarantee exact character-for-character parity with the static provider.
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
  }
})();

// ── DB loader ──────────────────────────────────────────────────────────────────

/**
 * Load the full service registry for a client from the DB.
 *
 * Fetches all client_services rows + the client_registry_rules row in two
 * queries. The caller receives pre-parsed DbServiceRecord[] and can immediately
 * pass them to createDbServiceRegistryProvider() — no further DB access needed.
 *
 * Returns { ok: false, reason: "no_services" } when the registry hasn't been
 * seeded yet (bootstrap still in progress or first-time setup). Callers should
 * fall back to the static provider for supported clients in that case.
 */
export async function loadClientServiceRegistry(
  clientId: string,
): Promise<RegistryLoadResult> {
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

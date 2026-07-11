/**
 * DB-side client context resolver — Phase B1.
 *
 * Responsible for:
 *   1. Bootstrapping the `clients` table via raw SQL on startup (drizzle-kit push
 *      is blocked by a pre-existing constraint conflict — same pattern as diagnostics.ts).
 *   2. Fetching the clients row + settings snapshot and delegating to the pure
 *      buildContextFromRecords function in lib/db/src/client-context.ts.
 *
 * NEVER call this from lib/db/* — it imports from @workspace/db which would
 * create a circular dependency through lib/db/src/index.ts.
 *
 * SAFETY:
 *   • Never silently falls back to BB&B for an unknown tenant.
 *   • Returns { found: false, reason } for missing, inactive, or unsupported clients.
 *   • autopilot_enabled is NOT read or written here — the safety gate remains in
 *     the generate route's scheduler auth check.
 */

import { db, pool } from "@workspace/db";
import { clientsTable, autoContentSettingsTable } from "@workspace/db/schema";
import {
  buildContextFromRecords,
  type ClientResolveResult,
  type SettingsSnapshot,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  loadClientServiceRegistry,
  createDbServiceRegistryProvider,
} from "./service-registry-loader.js";

export type { ClientResolveResult };

// ── Table bootstrap (idempotent) ───────────────────────────────────────────────
// Mirrors 0003_b1_clients_table.sql — runs on every server start, no-ops when
// the table already exists.

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id        TEXT        NOT NULL,
        slug           TEXT        NOT NULL,
        client_name    TEXT        NOT NULL,
        industry       TEXT        NOT NULL DEFAULT 'pest_control',
        industry_label TEXT        NOT NULL DEFAULT 'pest control',
        region         TEXT        NOT NULL DEFAULT '',
        service_areas  TEXT        NOT NULL DEFAULT '[]',
        timezone       TEXT        NOT NULL DEFAULT 'America/Chicago',
        is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_slug    ON clients(slug);
    `);

    // BB&B backfill — idempotent, filtered by client_name + industry so only
    // the BB&B auto_content_settings row is selected.
    await pool.query(`
      INSERT INTO clients (
        user_id, slug, client_name, industry, industry_label,
        region, service_areas, timezone, is_active
      )
      SELECT
        acs.user_id,
        'bed-bugs-and-beyond',
        'Bed Bugs & Beyond',
        'pest_control',
        'pest control',
        'Gulf Coast of Alabama (Baldwin County)',
        '["Foley, AL","Daphne, AL","Loxley, AL","Fairhope, AL","Gulf Shores, AL","Orange Beach, AL","Summerdale, AL","Spanish Fort, AL","Elberta, AL","Lillian, AL","Perdido Beach, AL"]',
        'America/Chicago',
        TRUE
      FROM auto_content_settings acs
      WHERE acs.client_name = 'Bed Bugs & Beyond'
        AND acs.industry    = 'pest_control'
      LIMIT 1
      ON CONFLICT DO NOTHING
    `);

    console.log("[CLIENT-RESOLVER] clients table ready");
  } catch (err) {
    console.error("[CLIENT-RESOLVER] Bootstrap failed:", err);
  }
})();

// ── DB-backed resolver ─────────────────────────────────────────────────────────

/**
 * Fetch the clients row and (if present) the auto_content_settings row for
 * the given userId, then delegate to the pure buildContextFromRecords function.
 *
 * Returns { found: false, reason: "not_found" } when no clients row exists —
 * callers MUST handle this case and must NOT substitute BB&B defaults.
 */
export async function resolveClientContentContextFromDb(
  userId: string,
): Promise<ClientResolveResult> {
  const [clientRow] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.userId, userId));

  if (!clientRow) {
    return { found: false, reason: "not_found" };
  }

  // Select only the SettingsSnapshot columns so we don't pull sensitive fields
  // (e.g. usedCombos, autopilotEnabled) into the resolution path.
  const [settingsRow] = await db
    .select({
      approvalMode:  autoContentSettingsTable.approvalMode,
      frequency:     autoContentSettingsTable.frequency,
      postingTimes:  autoContentSettingsTable.postingTimes,
      platforms:     autoContentSettingsTable.platforms,
      toneStyle:     autoContentSettingsTable.toneStyle,
      postAngles:    autoContentSettingsTable.postAngles,
      topics:        autoContentSettingsTable.topics,
      ctaText:       autoContentSettingsTable.ctaText,
      ctaPreference: autoContentSettingsTable.ctaPreference,
    })
    .from(autoContentSettingsTable)
    .where(eq(autoContentSettingsTable.userId, userId));

  const snapshot: SettingsSnapshot | null = settingsRow ?? null;

  // ── Phase B2: Load DB-backed service registry ──────────────────────────────
  // Try the DB-backed registry first (normal path after bootstrap seed).
  // Falls back to resolveServiceRegistryProvider for supported clients when the
  // registry hasn't been seeded yet (first-time setup / bootstrap lag).
  const registryLoad = await loadClientServiceRegistry(clientRow.id);
  if (registryLoad.ok && registryLoad.services.length > 0) {
    const provider = createDbServiceRegistryProvider(
      registryLoad.services,
      registryLoad.systemBusinessRules,
    );
    return buildContextFromRecords(clientRow, snapshot, provider);
  }

  if (!registryLoad.ok && registryLoad.reason === "db_error") {
    console.error("[CLIENT-RESOLVER] DB error loading service registry for", clientRow.slug, ":", registryLoad.error);
  } else {
    console.warn("[CLIENT-RESOLVER] Service registry not yet seeded for", clientRow.slug, "— falling back to static provider");
  }
  return buildContextFromRecords(clientRow, snapshot);
}

/**
 * DB-side client context resolver — Phase B1/B2.
 *
 * Responsible for:
 *   1. Bootstrapping the `clients` table via raw SQL on startup.
 *   2. Fetching the clients row + settings snapshot.
 *   3. Loading the DB-backed service registry from service-registry-loader.ts.
 *   4. Returning a typed ClientResolveResult — never silently substituting
 *      bbbRegistryProvider for a missing or broken registry.
 *
 * NEVER call this from lib/db/* — it imports from @workspace/db which would
 * create a circular dependency through lib/db/src/index.ts.
 *
 * ── bbbRegistryProvider policy ──────────────────────────────────────────────
 * bbbRegistryProvider MUST NOT be reached by any code path through this file.
 * It is used only in:
 *   • service-registry-loader.ts IIFE (parity oracle at seed time)
 *   • Test fixtures and parity test suites
 * No import of bbbRegistryProvider exists in this file — this is intentional.
 *
 * SAFETY:
 *   • Every non-success branch returns a typed failure — no implicit fallback.
 *   • autopilot_enabled is NOT read or written here.
 *   • registry_unavailable is returned on DB errors (never exposed to clients).
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
 * Fetch the clients row + settings snapshot, load the DB-backed service
 * registry, and return a typed ClientResolveResult.
 *
 * FAILURE MAPPING (authoritative):
 *   not_found               — no clients row for this userId
 *   inactive                — client exists but is_active = false
 *   registry_not_configured — client exists but no registry rows seeded yet
 *   registry_invalid        — registry rows present but structurally unusable
 *   registry_unavailable    — DB error prevented loading the registry
 *   unsupported_registry    — slug maps to no known provider (legacy path, should
 *                             not occur in DB-backed mode with a providerOverride)
 *
 * There is NO fallback to bbbRegistryProvider. A typed failure is returned for
 * every non-success case. Callers must check `found` before using `context`.
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

  // ── Phase B2: Load DB-backed service registry (no fallback) ───────────────
  // loadClientServiceRegistry awaits registryBootstrapReady internally, so
  // this call is safe even on the very first request after server start.
  const registryLoad = await loadClientServiceRegistry(clientRow.id);

  if (!registryLoad.ok) {
    switch (registryLoad.reason) {
      case "db_error":
        // Do not expose internal error details to callers — log safely here.
        console.error(
          "[CLIENT-RESOLVER] DB error loading registry for",
          clientRow.slug,
          ":",
          registryLoad.error,
        );
        return { found: false, reason: "registry_unavailable" };

      case "invalid_registry":
        console.error(
          "[CLIENT-RESOLVER] Invalid registry rows for",
          clientRow.slug,
          "— details:",
          registryLoad.details,
        );
        return { found: false, reason: "registry_invalid" };

      case "no_services":
        console.warn(
          "[CLIENT-RESOLVER] No registry rows for",
          clientRow.slug,
          "— registry not yet seeded",
        );
        return { found: false, reason: "registry_not_configured" };
    }
  }

  const provider = createDbServiceRegistryProvider(
    registryLoad.services,
    registryLoad.systemBusinessRules,
  );
  return buildContextFromRecords(clientRow, snapshot, provider);
}

// ── Scheduler context resolver (by clientId, not userId) ──────────────────────

/**
 * Resolves a full DiscoveryContext for the C7 scheduler given a clientId.
 *
 * The HTTP route uses resolveClientContentContextFromDb(userId) — this variant
 * looks up the client by primary key (id) so the scheduler, which has no Clerk
 * userId, can still build a fresh context at dispatch time.
 *
 * Returns null when:
 *   - Client does not exist
 *   - Client is inactive
 *   - Registry is not configured, invalid, or unavailable
 *
 * Callers should treat null as a non-retryable skip for this tick.
 */
export async function resolveDiscoveryContextByClientId(
  clientId: string,
  now:      Date = new Date(),
): Promise<import("@workspace/db").DiscoveryContext | null> {
  const { buildDiscoveryContext, buildContextFromRecords } = await import("@workspace/db");

  const [clientRow] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId));

  if (!clientRow || !clientRow.isActive) return null;

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
    .where(eq(autoContentSettingsTable.userId, clientRow.userId));

  const snapshot: SettingsSnapshot | null = settingsRow ?? null;

  const registryLoad = await loadClientServiceRegistry(clientRow.id);
  if (!registryLoad.ok) {
    console.warn(
      `[CLIENT-RESOLVER] resolveDiscoveryContextByClientId: registry not available for clientId=${clientId} reason=${registryLoad.reason}`,
    );
    return null;
  }

  const provider = createDbServiceRegistryProvider(
    registryLoad.services,
    registryLoad.systemBusinessRules,
  );

  const resolved = buildContextFromRecords(clientRow, snapshot, provider);
  if (!resolved.found) return null;

  return buildDiscoveryContext({
    contentContext:   resolved.context,
    clientId:         clientRow.id,
    now,
    aiSearchGapScore: 50,
  });
}

// ── Lightweight active-check resolver ─────────────────────────────────────────

/**
 * Checks only that the clients row exists and is_active = true.
 * Does NOT load the service registry. Use this for write paths that need
 * tenant verification without registry-dependent validation (e.g. pause).
 *
 * Returns ok: true with client identity, or ok: false with reason.
 */
export async function resolveClientActiveCheck(userId: string): Promise<
  | { ok: true;  clientName: string; slug: string; clientId: string }
  | { ok: false; reason: "not_found" | "inactive" }
> {
  const [row] = await db
    .select({
      id:         clientsTable.id,
      slug:       clientsTable.slug,
      clientName: clientsTable.clientName,
      isActive:   clientsTable.isActive,
    })
    .from(clientsTable)
    .where(eq(clientsTable.userId, userId));

  if (!row) return { ok: false, reason: "not_found" };
  if (!row.isActive) return { ok: false, reason: "inactive" };
  return { ok: true, clientName: row.clientName, slug: row.slug, clientId: row.id };
}

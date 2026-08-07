import { Router } from "express";
import { getAuth } from "@clerk/express";
import {
  getDataForSEOBacklinkHealthState,
  parseDataForSEOBacklinkConfig,
  pool,
} from "@workspace/db";

import { SCHEDULER_SECRET } from "../lib/scheduler-secret.js";
import { getAuthorityProfile } from "../lib/authority-profile-store.js";
import { buildAuthorityDiscoveryContext } from "../lib/authority-discovery-context.js";
import { evaluateAuthorityScheduledReadiness } from "../lib/authority-scheduled-readiness.js";
import {
  ensureBacklinkScheduledModeSchemaReady,
  getBacklinkScheduledModeSchemaState,
} from "../lib/backlink-scheduled-mode-schema.js";
import { readAuthorityScheduledExecutionAuthorization } from "../lib/authority-scheduled-execution-authorization.js";

const router = Router();

/**
 * Fixture ingestion is test/demo-only and is intentionally unavailable through
 * the authenticated production Authority surface. The legacy handler below this
 * router still contains BB&B-specific fixture observations and must never write
 * those observations into an arbitrary tenant.
 */
router.post("/api/backlinks/ingest/fixture", (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(409).json({
    ok: false,
    outcome: "skipped",
    error: "BACKLINK_FIXTURE_INGEST_DISABLED",
    message:
      "Fixture backlink ingestion is disabled on the authenticated Authority surface because fixture evidence is not tenant-owned production data.",
  });
});

/**
 * Fail-closed readiness boundary for scheduled backlink discovery.
 *
 * This route intentionally stops before provider execution. It proves that the
 * scheduler can resolve a complete tenant-owned Authority context, truthful
 * scheduled-mode persistence, a truly configured live provider, and the
 * independent spend-authorization state without falling through to fixtures.
 * Actual provider execution remains disabled in this release.
 */
router.post("/api/backlinks/ingest/scheduled", async (req, res) => {
  if (req.headers["x-scheduler-secret"] !== SCHEDULER_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const clientId = req.headers["x-scheduler-client-id"];
  if (!clientId || typeof clientId !== "string" || !clientId.trim()) {
    res.status(400).json({ error: "x-scheduler-client-id header required" });
    return;
  }

  try {
    const trustedClientId = clientId.trim();
    await ensureBacklinkScheduledModeSchemaReady();

    const [clientResult, profile, services, competitors, scheduledModeSchema] = await Promise.all([
      pool.query<{ id: string; is_active: boolean }>(
        `SELECT id, is_active FROM clients WHERE id = $1 LIMIT 1`,
        [trustedClientId],
      ),
      getAuthorityProfile(trustedClientId),
      pool.query<{ service_key: string }>(
        `SELECT service_key
           FROM client_services
          WHERE client_id = $1
            AND is_active = TRUE
            AND status = 'active'
          ORDER BY sort_order, service_key`,
        [trustedClientId],
      ),
      pool.query<{ domain: string }>(
        `SELECT domain
           FROM competitors
          WHERE client_id = $1
            AND canonical_status = 'active'
          ORDER BY opportunity_score DESC, last_seen_at DESC
          LIMIT 100`,
        [trustedClientId],
      ),
      getBacklinkScheduledModeSchemaState(),
    ]);

    const clientActive = Boolean(clientResult.rows[0]?.is_active);
    const discoveryContext = buildAuthorityDiscoveryContext({
      profile,
      competitorDomains: competitors.rows.map((row) => row.domain),
      activeServiceIds: services.rows.map((row) => row.service_key),
    });
    const providerHealth = getDataForSEOBacklinkHealthState(
      parseDataForSEOBacklinkConfig(),
    );
    const authorization = readAuthorityScheduledExecutionAuthorization();
    const readiness = evaluateAuthorityScheduledReadiness({
      clientActive,
      discoveryContext,
      liveProviderHealth: providerHealth,
      scheduledModeSchemaReady: scheduledModeSchema.ready,
      executionAuthorized: authorization.authorized,
    });

    res.setHeader("Cache-Control", "no-store");
    res.status(409).json({
      ok: false,
      outcome: "skipped",
      ...readiness,
      authorization,
      provider: {
        name: providerHealth.provider,
        status: providerHealth.status,
      },
      contextReady: discoveryContext.ok,
      scheduledModeSchemaReady: scheduledModeSchema.ready,
    });
  } catch (error) {
    console.error("[AUTHORITY-SCHEDULED-READINESS] failed:", error);
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({
      ok: false,
      outcome: "skipped",
      ready: false,
      executionAuthorized: false,
      executionActivated: false,
      code: "AUTHORITY_SCHEDULED_READINESS_UNAVAILABLE",
      message: "Scheduled Authority readiness could not be evaluated safely.",
    });
  }
});

export default router;

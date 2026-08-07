import { Router } from "express";
import { getAuth } from "@clerk/express";
import {
  getDataForSEOBacklinkHealthState,
  parseDataForSEOBacklinkConfig,
  pool,
} from "@workspace/db";

import { resolveClientActiveCheck } from "../lib/client-resolver.js";
import {
  getAuthorityProfile,
  upsertAuthorityProfile,
} from "../lib/authority-profile-store.js";
import { validateAuthorityProfileInput } from "../lib/authority-profile-policy.js";
import { buildAuthorityDiscoveryContext } from "../lib/authority-discovery-context.js";
import { evaluateAuthorityScheduledReadiness } from "../lib/authority-scheduled-readiness.js";
import {
  ensureBacklinkScheduledModeSchemaReady,
  getBacklinkScheduledModeSchemaState,
} from "../lib/backlink-scheduled-mode-schema.js";

const router = Router();

async function resolveTenant(req: any, res: any) {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const resolved = await resolveClientActiveCheck(userId);
  if (!resolved.ok) {
    res.status(resolved.reason === "not_found" ? 404 : 409).json({
      error: "AUTHORITY_PROFILE_CLIENT_UNAVAILABLE",
      reason: resolved.reason,
    });
    return null;
  }
  return { userId, ...resolved };
}

async function readAuthorityContext(clientId: string) {
  const [services, competitors] = await Promise.all([
    pool.query<{ service_key: string }>(
      `SELECT service_key
         FROM client_services
        WHERE client_id = $1
          AND is_active = TRUE
          AND status = 'active'
        ORDER BY sort_order, service_key`,
      [clientId],
    ),
    pool.query<{ domain: string; business_name: string | null; threat_level: string | null }>(
      `SELECT domain, business_name, threat_level
         FROM competitors
        WHERE client_id = $1
          AND canonical_status = 'active'
        ORDER BY opportunity_score DESC, last_seen_at DESC
        LIMIT 100`,
      [clientId],
    ),
  ]);
  return {
    availableServiceIds: services.rows.map((row) => row.service_key),
    competitors: competitors.rows.map((row) => ({
      domain: row.domain,
      businessName: row.business_name,
      threatLevel: row.threat_level,
    })),
  };
}

function profileReadyForDiscovery(profile: Awaited<ReturnType<typeof getAuthorityProfile>>): boolean {
  return Boolean(
    profile?.discoveryEnabled &&
    profile.primaryDomain &&
    profile.primaryCity &&
    profile.primaryRegion &&
    profile.geography.length > 0 &&
    profile.serviceIds.length > 0
  );
}

router.get("/api/authority/profile", async (req, res) => {
  const tenant = await resolveTenant(req, res);
  if (!tenant) return;

  try {
    const [profile, context] = await Promise.all([
      getAuthorityProfile(tenant.clientId),
      readAuthorityContext(tenant.clientId),
    ]);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      clientId: tenant.clientId,
      clientName: tenant.clientName,
      profile,
      ...context,
      readyForDiscovery: profileReadyForDiscovery(profile),
    });
  } catch (error) {
    console.error("[AUTHORITY-PROFILE] read failed:", error);
    res.status(500).json({ error: "AUTHORITY_PROFILE_READ_FAILED" });
  }
});

router.put("/api/authority/profile", async (req, res) => {
  const tenant = await resolveTenant(req, res);
  if (!tenant) return;

  const validation = validateAuthorityProfileInput(req.body ?? {});
  if (!validation.ok) {
    res.status(422).json({ error: validation.code, message: validation.message });
    return;
  }

  try {
    const context = await readAuthorityContext(tenant.clientId);
    const allowedServices = new Set(context.availableServiceIds);
    const invalidServices = validation.value.serviceIds.filter(
      (serviceId) => !allowedServices.has(serviceId),
    );
    if (invalidServices.length > 0) {
      res.status(422).json({
        error: "AUTHORITY_PROFILE_SERVICE_SCOPE_INVALID",
        message: "Authority service scope must use active canonical service keys for this client.",
        invalidServiceIds: invalidServices,
      });
      return;
    }

    const profile = await upsertAuthorityProfile({
      clientId: tenant.clientId,
      ...validation.value,
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      clientId: tenant.clientId,
      clientName: tenant.clientName,
      profile,
      ...context,
      readyForDiscovery: profileReadyForDiscovery(profile),
    });
  } catch (error) {
    console.error("[AUTHORITY-PROFILE] write failed:", error);
    res.status(500).json({ error: "AUTHORITY_PROFILE_WRITE_FAILED" });
  }
});

router.get("/api/authority/discovery-context", async (req, res) => {
  const tenant = await resolveTenant(req, res);
  if (!tenant) return;

  try {
    const [profile, context] = await Promise.all([
      getAuthorityProfile(tenant.clientId),
      readAuthorityContext(tenant.clientId),
    ]);
    const result = buildAuthorityDiscoveryContext({
      profile,
      competitorDomains: context.competitors.map((competitor) => competitor.domain),
      activeServiceIds: context.availableServiceIds,
    });
    res.setHeader("Cache-Control", "no-store");
    if (!result.ok) {
      res.status(409).json({
        ready: false,
        code: result.code,
        message: result.message,
      });
      return;
    }
    res.status(200).json({
      ready: true,
      discovery: result.discovery,
      competitorCount: result.discovery.competitorDomains.length,
      source: "tenant_authority_profile",
    });
  } catch (error) {
    console.error("[AUTHORITY-PROFILE] discovery context failed:", error);
    res.status(500).json({ error: "AUTHORITY_DISCOVERY_CONTEXT_FAILED" });
  }
});

router.get("/api/authority/scheduled-readiness", async (req, res) => {
  const tenant = await resolveTenant(req, res);
  if (!tenant) return;

  try {
    await ensureBacklinkScheduledModeSchemaReady();
    const [profile, context, scheduledModeSchema] = await Promise.all([
      getAuthorityProfile(tenant.clientId),
      readAuthorityContext(tenant.clientId),
      getBacklinkScheduledModeSchemaState(),
    ]);
    const discoveryContext = buildAuthorityDiscoveryContext({
      profile,
      competitorDomains: context.competitors.map((competitor) => competitor.domain),
      activeServiceIds: context.availableServiceIds,
    });
    const providerHealth = getDataForSEOBacklinkHealthState(
      parseDataForSEOBacklinkConfig(),
    );
    const readiness = evaluateAuthorityScheduledReadiness({
      clientActive: true,
      discoveryContext,
      liveProviderHealth: providerHealth,
      scheduledModeSchemaReady: scheduledModeSchema.ready,
    });

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      ...readiness,
      provider: {
        name: providerHealth.provider,
        status: providerHealth.status,
        reason: providerHealth.reason,
      },
      contextReady: discoveryContext.ok,
      scheduledModeSchemaReady: scheduledModeSchema.ready,
      competitorCount: discoveryContext.ok
        ? discoveryContext.discovery.competitorDomains.length
        : 0,
    });
  } catch (error) {
    console.error("[AUTHORITY-PROFILE] scheduled readiness failed:", error);
    res.status(500).json({ error: "AUTHORITY_SCHEDULED_READINESS_FAILED" });
  }
});

export default router;

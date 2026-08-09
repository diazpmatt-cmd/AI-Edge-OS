import {
  db,
  localPresenceChannelsTable,
  localPresenceProfilesTable,
  pool,
} from "@workspace/db";
import {
  aiReceptionistSettingsTable,
  socialConnectionsTable,
} from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

import { resolveAuthorizedApollosClientTarget } from "./apollos-client-access.js";
import { resolveClientContentContextFromDb } from "./client-resolver.js";
import {
  buildApollosActivationPlan,
  buildApollosClientCoverage,
  explainApollosCoverageGap,
  type ApollosActivationPlan,
  type ApollosActivationPlanItem,
  type ApollosClientCoverage,
  type ApollosClientEvidence,
} from "./apollos-client-orchestrator.js";

export type ApollosLiveCoverageFailureReason =
  | "not_found"
  | "inactive"
  | "unsupported_registry"
  | "registry_not_configured"
  | "registry_invalid"
  | "registry_unavailable"
  | "unauthorized"
  | "selection_required"
  | "resolution_mismatch";

export interface ApollosSafeClientContext {
  readonly clientId: string;
  readonly clientName: string;
  readonly industry: string;
  readonly industryLabel: string;
  readonly region: string;
  readonly serviceAreas: readonly string[];
  readonly configuredPlatforms: readonly string[];
  readonly approvalMode: string;
  readonly frequency: string;
  readonly serviceNames: readonly string[];
}

export interface ApollosLiveCoverageSuccess {
  readonly ok: true;
  readonly context: ApollosSafeClientContext;
  readonly evidence: ApollosClientEvidence;
  readonly coverage: ApollosClientCoverage;
  readonly activationPlan: ApollosActivationPlan;
}

export type ApollosLiveCoverageResult =
  | ApollosLiveCoverageSuccess
  | { readonly ok: false; readonly reason: ApollosLiveCoverageFailureReason };

interface LocalPresenceEvidence {
  readonly configured: boolean;
  readonly channels: readonly { readonly channelName: string; readonly status: string }[];
}

interface DiscoveryEvidence {
  readonly configured: boolean;
  readonly degraded: boolean;
}

interface AuthorityEvidence {
  readonly configured: boolean;
}

interface ReceptionistEvidence {
  readonly configured: boolean;
  readonly misconfigured: boolean;
}

interface AiVisibilityEvidence {
  readonly configured: boolean;
}

const LIVE_LOCAL_PRESENCE_STATUSES = new Set([
  "connected",
  "verified_publishing",
  "live",
]);

const DEGRADED_DISCOVERY_STATUSES = new Set([
  "failed",
  "cancelled",
  "cancel_requested",
]);

const LOCAL_PRESENCE_FEATURE_BY_CHANNEL: Readonly<Record<string, string>> = Object.freeze({
  apple_business: "local_presence:apple",
  bing_places: "local_presence:bing",
  nextdoor: "local_presence:nextdoor",
});

function parsePlatformList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((value): value is string => typeof value === "string");
  }
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return raw.split(",").map((value) => value.trim()).filter(Boolean);
  }
}

async function loadAutopilotEvidence(userId: string): Promise<{
  readonly enabled: boolean;
  readonly paused: boolean;
  readonly platforms: readonly string[];
}> {
  const result = await db.execute(sql`
    SELECT platforms, auto_generate_enabled, engine_paused
    FROM auto_content_settings
    WHERE user_id = ${userId}
    LIMIT 1
  `);
  const row = result.rows?.[0] as {
    platforms?: unknown;
    auto_generate_enabled?: boolean;
    engine_paused?: boolean;
  } | undefined;

  return Object.freeze({
    enabled: !!row?.auto_generate_enabled,
    paused: !!row?.engine_paused,
    platforms: Object.freeze(parsePlatformList(row?.platforms)),
  });
}

async function loadLocalPresenceEvidence(clientSlug: string): Promise<LocalPresenceEvidence> {
  const [profiles, channels] = await Promise.all([
    db
      .select({ id: localPresenceProfilesTable.id })
      .from(localPresenceProfilesTable)
      .where(eq(localPresenceProfilesTable.clientId, clientSlug)),
    db
      .select({
        channelName: localPresenceChannelsTable.channelName,
        status: localPresenceChannelsTable.status,
      })
      .from(localPresenceChannelsTable)
      .where(eq(localPresenceChannelsTable.clientId, clientSlug)),
  ]);

  return Object.freeze({
    configured: profiles.length > 0 || channels.length > 0,
    channels: Object.freeze(channels.map((channel) => Object.freeze({ ...channel }))),
  });
}

async function loadDiscoveryEvidence(clientId: string): Promise<DiscoveryEvidence> {
  const result = await pool.query<{ status: string }>(
    `SELECT status
     FROM discovery_snapshots
     WHERE client_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [clientId],
  );
  const status = result.rows[0]?.status ?? null;
  return Object.freeze({
    configured: status !== null,
    degraded: status !== null && DEGRADED_DISCOVERY_STATUSES.has(status),
  });
}

async function loadAuthorityEvidence(clientId: string): Promise<AuthorityEvidence> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM backlink_workflows
     WHERE client_id = $1`,
    [clientId],
  );
  return Object.freeze({
    configured: Number(result.rows[0]?.count ?? 0) > 0,
  });
}

async function loadReceptionistEvidence(clientSlug: string): Promise<ReceptionistEvidence> {
  const rows = await db
    .select({
      id: aiReceptionistSettingsTable.id,
      transferPhone: aiReceptionistSettingsTable.transferPhone,
    })
    .from(aiReceptionistSettingsTable)
    .where(eq(aiReceptionistSettingsTable.clientId, clientSlug));
  const row = rows[0];
  if (!row) {
    return Object.freeze({ configured: false, misconfigured: false });
  }
  return Object.freeze({
    configured: true,
    misconfigured: typeof row.transferPhone !== "string" || row.transferPhone.trim().length === 0,
  });
}

async function loadAiVisibilityEvidence(clientId: string): Promise<AiVisibilityEvidence> {
  const result = await pool.query<{ present: number }>(
    `SELECT 1 AS present
     FROM ai_visibility_run_results
     WHERE client_id = $1
     LIMIT 1`,
    [clientId],
  ).catch((error: { code?: string }) => {
    if (error?.code === "42P01") {
      return { rows: [] as Array<{ present: number }> };
    }
    throw error;
  });

  return Object.freeze({ configured: result.rows.length > 0 });
}

export async function buildApollosLiveCoverageForUser(
  userId: string,
): Promise<ApollosLiveCoverageResult> {
  const resolved = await resolveClientContentContextFromDb(userId);
  if (!resolved.found) {
    return Object.freeze({ ok: false as const, reason: resolved.reason });
  }

  const [connections, autopilot, localPresence, discovery, authority, receptionist, aiVisibility] = await Promise.all([
    db
      .select({
        provider: socialConnectionsTable.provider,
        accessToken: socialConnectionsTable.accessToken,
      })
      .from(socialConnectionsTable)
      .where(eq(socialConnectionsTable.userId, userId)),
    loadAutopilotEvidence(userId),
    loadLocalPresenceEvidence(resolved.client.slug),
    loadDiscoveryEvidence(resolved.client.id),
    loadAuthorityEvidence(resolved.client.id),
    loadReceptionistEvidence(resolved.client.slug),
    loadAiVisibilityEvidence(resolved.client.id),
  ]);

  const connectedIntegrations = connections
    .filter((connection) => !!connection.accessToken)
    .map((connection) => connection.provider)
    .filter((provider): provider is string => typeof provider === "string" && provider.length > 0);

  const activeFeatures: string[] = [];
  const degradedFeatures: string[] = [];
  const misconfiguredFeatures: string[] = [];

  if (autopilot.enabled && autopilot.paused) {
    degradedFeatures.push("content_autopilot");
  } else if (autopilot.enabled) {
    activeFeatures.push("content_autopilot");
  }

  const configuredPlatforms = autopilot.platforms.length > 0
    ? [...autopilot.platforms]
    : [...resolved.context.platforms];

  if (autopilot.enabled && !autopilot.paused) {
    const connected = new Set(connectedIntegrations.map((provider) => provider.toLowerCase()));
    for (const platform of configuredPlatforms) {
      const normalized = platform.trim().toLowerCase();
      if (!normalized) continue;
      const integrationKey = normalized === "google_business_profile" || normalized === "gbp"
        ? "google_business"
        : normalized;
      if (connected.has(integrationKey)) {
        activeFeatures.push(`publishing:${normalized === "gbp" ? "google_business" : normalized}`);
      }
    }
  }

  if (localPresence.configured) {
    activeFeatures.push("local_presence_engine");
    for (const channel of localPresence.channels) {
      const feature = LOCAL_PRESENCE_FEATURE_BY_CHANNEL[channel.channelName];
      if (feature && LIVE_LOCAL_PRESENCE_STATUSES.has(channel.status)) {
        activeFeatures.push(feature);
      }
    }
  }

  if (discovery.configured) {
    if (discovery.degraded) degradedFeatures.push("discovery_engine");
    else activeFeatures.push("discovery_engine");
  }

  if (authority.configured) {
    activeFeatures.push("authority_engine");
  }

  if (receptionist.configured) {
    if (receptionist.misconfigured) misconfiguredFeatures.push("ai_receptionist");
    else activeFeatures.push("ai_receptionist");
  }

  if (aiVisibility.configured) {
    activeFeatures.push("ai_visibility_monitoring");
  }

  const evidence: ApollosClientEvidence = Object.freeze({
    connectedIntegrations: Object.freeze(connectedIntegrations),
    activeFeatures: Object.freeze([...new Set(activeFeatures)]),
    degradedFeatures: Object.freeze([...new Set(degradedFeatures)]),
    misconfiguredFeatures: Object.freeze([...new Set(misconfiguredFeatures)]),
  });

  const coverage = buildApollosClientCoverage({
    client: {
      id: resolved.client.id,
      name: resolved.client.clientName,
      industry: resolved.client.industry,
    },
    evidence,
  });

  const serviceNames = resolved.context.registry
    .getGeneratableServices()
    .map((service) => service.displayName);

  const context: ApollosSafeClientContext = Object.freeze({
    clientId: resolved.client.id,
    clientName: resolved.context.clientName,
    industry: resolved.context.industry,
    industryLabel: resolved.context.industryLabel,
    region: resolved.context.region,
    serviceAreas: Object.freeze([...resolved.context.serviceAreas]),
    configuredPlatforms: Object.freeze(configuredPlatforms),
    approvalMode: resolved.context.approvalMode,
    frequency: resolved.context.frequency,
    serviceNames: Object.freeze(serviceNames),
  });

  return Object.freeze({
    ok: true as const,
    context,
    evidence,
    coverage,
    activationPlan: buildApollosActivationPlan(coverage),
  });
}

export async function buildApollosLiveCoverageForActor(
  actorUserId: string,
  requestedClientId?: string | null,
): Promise<ApollosLiveCoverageResult> {
  const resolution = await resolveAuthorizedApollosClientTarget(actorUserId, requestedClientId);
  if (!resolution.ok) {
    return Object.freeze({ ok: false as const, reason: resolution.reason });
  }

  const live = await buildApollosLiveCoverageForUser(resolution.target.ownerUserId);
  if (!live.ok) return live;
  if (live.context.clientId !== resolution.target.clientId) {
    return Object.freeze({ ok: false as const, reason: "resolution_mismatch" as const });
  }
  return live;
}

export async function explainApollosLiveGapForUser(
  userId: string,
  capabilityKey: string,
): Promise<
  | { readonly ok: true; readonly gap: ApollosActivationPlanItem | null }
  | { readonly ok: false; readonly reason: ApollosLiveCoverageFailureReason }
> {
  const live = await buildApollosLiveCoverageForUser(userId);
  if (!live.ok) return live;
  return Object.freeze({
    ok: true as const,
    gap: explainApollosCoverageGap(live.coverage, capabilityKey),
  });
}

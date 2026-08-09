import { db } from "@workspace/db";
import { socialConnectionsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

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
  | "registry_unavailable";

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

export async function buildApollosLiveCoverageForUser(
  userId: string,
): Promise<ApollosLiveCoverageResult> {
  const resolved = await resolveClientContentContextFromDb(userId);
  if (!resolved.found) {
    return Object.freeze({ ok: false as const, reason: resolved.reason });
  }

  const [connections, autopilot] = await Promise.all([
    db
      .select({
        provider: socialConnectionsTable.provider,
        accessToken: socialConnectionsTable.accessToken,
      })
      .from(socialConnectionsTable)
      .where(eq(socialConnectionsTable.userId, userId)),
    loadAutopilotEvidence(userId),
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

  const evidence: ApollosClientEvidence = Object.freeze({
    connectedIntegrations: Object.freeze(connectedIntegrations),
    activeFeatures: Object.freeze(activeFeatures),
    degradedFeatures: Object.freeze(degradedFeatures),
    misconfiguredFeatures: Object.freeze(misconfiguredFeatures),
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
    .map((service) => service.name);

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

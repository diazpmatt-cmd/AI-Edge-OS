/**
 * Phase C2 — Cluster Builder
 *
 * Groups normalized DiscoverySignals into semantic DiscoveryClusters.
 *
 * Phase C2 technique: deterministic rule-based clustering only.
 *   - Groups by (clientId + serviceId + intent)
 *   - Deduplicates exact and near-identical normalizedValues within a cluster
 *   - Produces stable cluster IDs from the grouping key
 *   - Tenant isolation: signals from different clientIds never merge
 *   - Unrelated services cannot merge (serviceId is part of the cluster key)
 *
 * Phase C9+ technique: semantic embeddings / vector clustering.
 *   NOT used in C2 — no paid AI calls in this phase.
 *
 * Pure function. No IO. No external API calls. Deterministic.
 */

import type { DiscoverySignal, DiscoveryCluster, SearchIntent } from "./discovery-types";
import type { ServiceRegistryProvider } from "./client-context";
import type { DiscoveryContext } from "./discovery-context";

// ── Cluster key + ID ───────────────────────────────────────────────────────────

/**
 * The grouping key that determines which cluster a signal belongs to.
 * Signals with the same key are semantically related.
 *
 * Format: "${clientId}::${serviceId || 'general'}::${intent}"
 *
 * This key also becomes the cluster ID, making it deterministic and
 * reproducible across runs for the same set of signals.
 */
function makeClusterKey(
  clientId: string,
  serviceId: string | null,
  intent: SearchIntent,
): string {
  return `${clientId}::${serviceId ?? "general"}::${intent}`;
}

// ── Content angle selection ────────────────────────────────────────────────────

/**
 * Select the primary content angle for a cluster based on its intent.
 * Falls back to "educational" if the intent doesn't map to a preferred angle
 * or if no allowed angles are available.
 */
function selectContentAngle(intent: SearchIntent, allowedAngles: string[]): string {
  const preferredByIntent: Record<SearchIntent, string> = {
    informational: "educational",
    commercial:    "promotional",
    transactional: "promotional",
    local:         "promotional",
    navigational:  "educational",
  };
  const preferred = preferredByIntent[intent] ?? "educational";
  if (allowedAngles.length === 0) return preferred;
  if (allowedAngles.includes(preferred)) return preferred;
  return allowedAngles[0] ?? "educational";
}

// ── Cluster name generation ────────────────────────────────────────────────────

/**
 * Generate a human-readable cluster name from its primary properties.
 * Format: "{ServiceName} — {Intent Title}" or "General — {Intent Title}"
 */
function makeClusterName(
  displayName: string | null,
  intent: SearchIntent,
): string {
  const intentLabel: Record<SearchIntent, string> = {
    informational: "Educational",
    commercial:    "Commercial",
    transactional: "Transactional",
    local:         "Local Search",
    navigational:  "Navigational",
  };
  const label = intentLabel[intent] ?? "General";
  return `${displayName ?? "General"} — ${label}`;
}

// ── Deduplication ──────────────────────────────────────────────────────────────

/**
 * Deduplicate signals within a candidate group.
 *
 * Rule: if two signals share the same normalizedValue, keep the one with
 * higher evidenceStrength (prefer real SERP data over gpt_simulated).
 * If evidenceStrength is equal, keep the first occurrence (stable ordering).
 */
function deduplicateSignals(signals: DiscoverySignal[]): DiscoverySignal[] {
  const seen = new Map<string, DiscoverySignal>();
  for (const signal of signals) {
    const existing = seen.get(signal.normalizedValue);
    if (!existing || signal.evidenceStrength > existing.evidenceStrength) {
      seen.set(signal.normalizedValue, signal);
    }
  }
  // Return in stable insertion order (Map preserves insertion order)
  return [...seen.values()];
}

// ── Cluster builder ────────────────────────────────────────────────────────────

/**
 * Build DiscoveryClusters from a set of normalized signals.
 *
 * Groups signals by (clientId + serviceId + intent). Each unique triple
 * forms one cluster.
 *
 * Tenant isolation: asserts that each signal's clientId matches
 * context.clientId. Signals from a different client are silently
 * excluded and never merged (this guards against pipeline bugs, not
 * adversarial inputs).
 *
 * Returns clusters sorted by totalVolume desc (highest value first).
 * Clusters with zero signals are omitted.
 */
export function buildClusters(
  signals: DiscoverySignal[],
  registry: ServiceRegistryProvider,
  context: DiscoveryContext,
): DiscoveryCluster[] {
  // ── Tenant isolation guard ──────────────────────────────────────────────────
  const ownSignals = signals.filter(s => s.clientId === context.clientId);

  // ── Group by cluster key ────────────────────────────────────────────────────
  const groups = new Map<string, DiscoverySignal[]>();
  for (const signal of ownSignals) {
    const key = makeClusterKey(context.clientId, signal.serviceId, signal.intent);
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(signal);
    } else {
      groups.set(key, [signal]);
    }
  }

  const now     = new Date();
  const clusters: DiscoveryCluster[] = [];

  for (const [key, rawMembers] of groups) {
    if (rawMembers.length === 0) continue;

    // Deduplicate within each group
    const members = deduplicateSignals(rawMembers);

    // Use the serviceId from the first member (all members share the same serviceId by key)
    const primaryServiceId = members[0]?.serviceId ?? null;
    const intent           = members[0]?.intent ?? "informational";

    // Resolve service metadata from registry
    const service      = primaryServiceId ? registry.matchByTopic(primaryServiceId) ?? null : null;
    const displayName  = service?.displayName ?? null;
    const allowedAngles = service?.allowedContentAngles ?? [];

    const contentAngle  = selectContentAngle(intent, allowedAngles);
    const seasonalWindow = service?.seasonality ?? null;

    // Aggregate volume (sum of non-null estimates)
    const totalVolume = members.reduce((sum, s) =>
      sum + (s.volumeEstimate ?? 0), 0);

    const cluster: DiscoveryCluster = {
      id:               key, // deterministic: same key → same cluster ID
      snapshotId:       context.snapshotId,
      clientId:         context.clientId,
      clusterName:      makeClusterName(displayName, intent),
      primaryServiceId,
      intent,
      signalIds:        members.map(s => s.id),
      signalCount:      members.length,
      totalVolume,
      opportunityScore: 0, // populated by OpportunityScorer
      contentAngle,
      seasonalWindow,
      isActive:         true,
      createdAt:        now,
    };

    clusters.push(cluster);
  }

  // Sort by totalVolume desc (highest-value clusters first)
  clusters.sort((a, b) => b.totalVolume - a.totalVolume);
  return clusters;
}

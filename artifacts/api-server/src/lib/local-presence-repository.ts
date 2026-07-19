import { db, eq, and } from "@workspace/db";
import { desc } from "drizzle-orm";
import {
  localPresenceProfilesTable,
  localPresenceChannelsTable,
  gbpAuditSnapshotsTable,
  LOCAL_PRESENCE_PROVIDERS,
  mapGbpSnapshotToChannelUpdate,
  type LocalPresenceProfile,
  type LocalPresenceChannel,
  type GbpAuditSnapshot,
} from "@workspace/db";

// ── Completeness score per channel (0–100) ─────────────────────────────────
export function computeChannelCompletenessScore(channel: {
  status: string;
  listingUrl?: string | null;
  verificationStatus?: string | null;
}): number {
  let score = 0;
  if (channel.status !== "not_started") score += 30;
  if (channel.listingUrl) score += 25;
  if (["connected", "verified_publishing"].includes(channel.status)) score += 30;
  if (channel.verificationStatus === "verified") score += 15;
  return Math.min(score, 100);
}

// ── Overall presence score (0–100, weighted by provider) ───────────────────
export function computeOverallPresenceScore(channels: LocalPresenceChannel[]): number {
  let weightedScore = 0;

  for (const provider of LOCAL_PRESENCE_PROVIDERS) {
    const ch = channels.find(c => c.channelName === provider.channelName);
    if (!ch) continue;
    const pct = Math.min(ch.score ?? 0, 100) / 100;
    weightedScore += pct * provider.scoreWeight;
  }

  const activeCount = channels.filter(c =>
    ["connected", "verified_publishing", "setup_in_progress"].includes(c.status)
  ).length;
  const napBonus = activeCount >= 5 ? 5 : activeCount >= 3 ? 2 : 0;

  return Math.min(Math.round(weightedScore + napBonus), 100);
}

// ── GBP audit summary shape ────────────────────────────────────────────────
export interface GbpAuditSummary {
  overallScore: number;
  checksPassed: number;
  checksFailed: number;
  checksWarning: number;
  gbpConnected: boolean;
  locationTitle: string | null;
  completedAt: Date | null;
}

// ── Dashboard response shape ───────────────────────────────────────────────
export interface LocalPresenceDashboard {
  profile: LocalPresenceProfile;
  channels: LocalPresenceChannel[];
  overallScore: number;
  connectedCount: number;
  pendingCount: number;
  notStartedCount: number;
  gbpAuditSummary: GbpAuditSummary | null;
  providers: Array<{
    channelName: string;
    displayName: string;
    shortName: string;
    iconEmoji: string;
    tier: number;
    manualSetupUrl: string;
    syncSupported: boolean;
    channel: LocalPresenceChannel | null;
    completenessScore: number;
  }>;
}

// ── Repository ───────────────────────────────────────────────────────────────
export class LocalPresenceRepository {
  async getOrCreateProfile(clientId: string): Promise<LocalPresenceProfile> {
    const [existing] = await db
      .select()
      .from(localPresenceProfilesTable)
      .where(eq(localPresenceProfilesTable.clientId, clientId));
    if (existing) return existing;

    const [created] = await db
      .insert(localPresenceProfilesTable)
      .values({
        clientId,
        businessName: "",
        phone: null,
        website: null,
        address: null,
        city: null,
        state: null,
        zip: null,
        napJson: null,
      })
      .returning();
    return created;
  }

  async getChannels(clientId: string): Promise<LocalPresenceChannel[]> {
    return db
      .select()
      .from(localPresenceChannelsTable)
      .where(eq(localPresenceChannelsTable.clientId, clientId))
      .orderBy(localPresenceChannelsTable.channelName);
  }

  async upsertChannel(
    clientId: string,
    channelName: string,
    data: {
      status?: string;
      score?: number;
      listingUrl?: string | null;
      verificationStatus?: string | null;
      recommendedAction?: string | null;
      metadataJson?: string | null;
      lastSyncAt?: Date | null;
      providerId?: string | null;
      nextSyncAt?: Date | null;
      healthScore?: number;
      issuesJson?: string | null;
    }
  ): Promise<LocalPresenceChannel> {
    const completenessScore = computeChannelCompletenessScore({
      status: data.status ?? "not_started",
      listingUrl: data.listingUrl ?? null,
      verificationStatus: data.verificationStatus ?? null,
    });

    const [row] = await db
      .insert(localPresenceChannelsTable)
      .values({
        clientId,
        channelName,
        status: data.status ?? "not_started",
        score: data.score ?? 0,
        listingUrl: data.listingUrl ?? null,
        verificationStatus: data.verificationStatus ?? null,
        recommendedAction: data.recommendedAction ?? null,
        metadataJson: data.metadataJson ?? null,
        completenessScore,
        lastSyncAt: data.lastSyncAt ?? null,
        providerId: data.providerId ?? null,
        nextSyncAt: data.nextSyncAt ?? null,
        healthScore: data.healthScore ?? 0,
        issuesJson: data.issuesJson ?? null,
      })
      .onConflictDoUpdate({
        target: [localPresenceChannelsTable.clientId, localPresenceChannelsTable.channelName],
        set: {
          ...(data.status !== undefined && { status: data.status }),
          ...(data.score !== undefined && { score: data.score }),
          ...(data.listingUrl !== undefined && { listingUrl: data.listingUrl }),
          ...(data.verificationStatus !== undefined && { verificationStatus: data.verificationStatus }),
          ...(data.recommendedAction !== undefined && { recommendedAction: data.recommendedAction }),
          ...(data.metadataJson !== undefined && { metadataJson: data.metadataJson }),
          ...(data.lastSyncAt !== undefined && { lastSyncAt: data.lastSyncAt }),
          ...(data.providerId !== undefined && { providerId: data.providerId }),
          ...(data.nextSyncAt !== undefined && { nextSyncAt: data.nextSyncAt }),
          ...(data.healthScore !== undefined && { healthScore: data.healthScore }),
          ...(data.issuesJson !== undefined && { issuesJson: data.issuesJson }),
          completenessScore,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  // ── getDashboard: bridges GBP audit data into google_business channel ──────
  async getDashboard(clientId: string): Promise<LocalPresenceDashboard> {
    const profile = await this.getOrCreateProfile(clientId);
    const channels = await this.getChannels(clientId);

    // Fetch latest complete GBP audit snapshot for this client (read-time bridge)
    const [gbpSnapshot] = await db
      .select()
      .from(gbpAuditSnapshotsTable)
      .where(
        and(
          eq(gbpAuditSnapshotsTable.clientId, clientId),
          eq(gbpAuditSnapshotsTable.status, "complete"),
        )
      )
      .orderBy(desc(gbpAuditSnapshotsTable.completedAt))
      .limit(1);

    // Derive real-time google_business channel health from the GBP audit snapshot.
    // This replaces the hardcoded seed score with live data at read time.
    let effectiveChannels = channels;
    if (gbpSnapshot) {
      const update = mapGbpSnapshotToChannelUpdate(gbpSnapshot);
      effectiveChannels = channels.map(ch => {
        if (ch.channelName !== "google_business") return ch;
        return {
          ...ch,
          score: update.score,
          healthScore: update.healthScore,
          status: update.status,
          verificationStatus: update.verificationStatus,
          issuesJson: JSON.stringify(update.issues),
          lastSyncAt: update.lastSyncAt,
        };
      });
    }

    const overallScore = computeOverallPresenceScore(effectiveChannels);

    const connectedCount = effectiveChannels.filter(c =>
      ["connected", "verified_publishing"].includes(c.status)
    ).length;
    const pendingCount = effectiveChannels.filter(c =>
      ["setup_in_progress", "pending"].includes(c.status)
    ).length;
    const notStartedCount = effectiveChannels.filter(c => c.status === "not_started").length;

    const gbpAuditSummary: GbpAuditSummary | null = gbpSnapshot
      ? {
          overallScore: gbpSnapshot.overallScore,
          checksPassed: gbpSnapshot.checksPassed,
          checksFailed: gbpSnapshot.checksFailed,
          checksWarning: gbpSnapshot.checksWarning,
          gbpConnected: gbpSnapshot.gbpConnected,
          locationTitle: gbpSnapshot.locationTitle ?? null,
          completedAt: gbpSnapshot.completedAt ?? null,
        }
      : null;

    const providers = LOCAL_PRESENCE_PROVIDERS.map(p => {
      const ch = effectiveChannels.find(c => c.channelName === p.channelName) ?? null;
      return {
        channelName: p.channelName,
        displayName: p.displayName,
        shortName: p.shortName,
        iconEmoji: p.iconEmoji,
        tier: p.tier,
        manualSetupUrl: p.manualSetupUrl,
        syncSupported: p.syncSupported,
        channel: ch,
        completenessScore: ch ? computeChannelCompletenessScore(ch) : 0,
      };
    });

    return {
      profile,
      channels: effectiveChannels,
      overallScore,
      connectedCount,
      pendingCount,
      notStartedCount,
      gbpAuditSummary,
      providers,
    };
  }
}

export const localPresenceRepo = new LocalPresenceRepository();

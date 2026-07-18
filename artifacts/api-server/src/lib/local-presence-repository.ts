import { db, eq } from "@workspace/db";
import {
  localPresenceProfilesTable,
  localPresenceChannelsTable,
  LOCAL_PRESENCE_PROVIDERS,
  type LocalPresenceProfile,
  type LocalPresenceChannel,
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
          completenessScore,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  async getDashboard(clientId: string): Promise<{
    profile: LocalPresenceProfile;
    channels: LocalPresenceChannel[];
    overallScore: number;
    connectedCount: number;
    pendingCount: number;
    notStartedCount: number;
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
  }> {
    const profile = await this.getOrCreateProfile(clientId);
    const channels = await this.getChannels(clientId);
    const overallScore = computeOverallPresenceScore(channels);

    const connectedCount = channels.filter(c =>
      ["connected", "verified_publishing"].includes(c.status)
    ).length;
    const pendingCount = channels.filter(c =>
      ["setup_in_progress", "pending"].includes(c.status)
    ).length;
    const notStartedCount = channels.filter(c => c.status === "not_started").length;

    const providers = LOCAL_PRESENCE_PROVIDERS.map(p => {
      const ch = channels.find(c => c.channelName === p.channelName) ?? null;
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

    return { profile, channels, overallScore, connectedCount, pendingCount, notStartedCount, providers };
  }
}

export const localPresenceRepo = new LocalPresenceRepository();

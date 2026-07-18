import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, pool, eq } from "@workspace/db";
import { localPresenceProfilesTable, localPresenceChannelsTable } from "@workspace/db";
import { LOCAL_PRESENCE_PROVIDERS, getProviderDef } from "@workspace/db";
import {
  localPresenceRepo,
  computeChannelCompletenessScore,
  computeOverallPresenceScore,
} from "../lib/local-presence-repository";

const router = Router();

// ── Phase 1 schema bootstrap ──────────────────────────────────────────────────
async function bootstrapLocalPresenceColumns(): Promise<void> {
  try {
    await pool.query(`
      ALTER TABLE local_presence_channels
        ADD COLUMN IF NOT EXISTS completeness_score INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;
    `);
  } catch (err) {
    console.warn("[local-presence] bootstrap columns warning:", err);
  }
}
bootstrapLocalPresenceColumns().catch(e => console.warn("[local-presence] bootstrap:", e));

// ── Default channels seeded for new clients ───────────────────────────────────
// Aligned with LOCAL_PRESENCE_PROVIDERS. Add entries here when extending
// the provider registry in lib/db/src/local-presence-providers.ts.
const DEFAULT_CHANNELS = [
  { channelName: "google_business", status: "connected",          score: 35, verificationStatus: "verified",    recommendedAction: "Maintain photos, posts, and review responses" },
  { channelName: "apple_business",  status: "setup_in_progress",  score: 2,  verificationStatus: "pending",     recommendedAction: "Awaiting Apple verification — check business.apple.com" },
  { channelName: "bing_places",     status: "verified_publishing", score: 10, verificationStatus: "verified",    recommendedAction: "Monitor Bing Places for live confirmation (7–12 days)" },
  { channelName: "facebook",        status: "not_started",         score: 0,  verificationStatus: "not_started", recommendedAction: "Create Facebook Business page at facebook.com/pages/create" },
  { channelName: "yelp",            status: "setup_in_progress",  score: 2,  verificationStatus: "pending",     recommendedAction: "Claim and verify at biz.yelp.com" },
  { channelName: "nextdoor",        status: "setup_in_progress",  score: 2,  verificationStatus: "pending",     recommendedAction: "Claim business at business.nextdoor.com" },
  { channelName: "waze",            status: "not_started",         score: 0,  verificationStatus: "not_started", recommendedAction: "Add business at business.waze.com after GBP is optimized" },
  { channelName: "angi",            status: "setup_in_progress",  score: 2,  verificationStatus: "pending",     recommendedAction: "Complete Angi Pro profile at pro.angi.com" },
  { channelName: "thumbtack",       status: "setup_in_progress",  score: 2,  verificationStatus: "pending",     recommendedAction: "Complete profile approval at thumbtack.com/pro" },
];

// ── Ensure profile + channels exist for clientId ──────────────────────────────
async function ensureClient(clientId: string) {
  const [existing] = await db
    .select()
    .from(localPresenceProfilesTable)
    .where(eq(localPresenceProfilesTable.clientId, clientId));

  if (!existing) {
    await db.insert(localPresenceProfilesTable).values({
      clientId,
      businessName: "",
      phone: null,
      website: null,
      address: null,
      city: null,
      state: null,
      zip: null,
      napJson: null,
    });
  }

  const existingChannels = await db
    .select()
    .from(localPresenceChannelsTable)
    .where(eq(localPresenceChannelsTable.clientId, clientId));

  const existingNames = new Set(existingChannels.map(c => c.channelName));

  for (const ch of DEFAULT_CHANNELS) {
    if (!existingNames.has(ch.channelName)) {
      const cs = computeChannelCompletenessScore(ch);
      await db.insert(localPresenceChannelsTable).values({
        clientId,
        ...ch,
        completenessScore: cs,
        lastSyncAt: null,
      });
    }
  }
}

// ── GET /api/local-presence ───────────────────────────────────────────────────
router.get("/local-presence", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const clientId = (req.query.clientId as string) || "default";

  try {
    await ensureClient(clientId);

    const [profile] = await db
      .select()
      .from(localPresenceProfilesTable)
      .where(eq(localPresenceProfilesTable.clientId, clientId));

    const channels = await db
      .select()
      .from(localPresenceChannelsTable)
      .where(eq(localPresenceChannelsTable.clientId, clientId))
      .orderBy(localPresenceChannelsTable.channelName);

    const score = computeOverallPresenceScore(channels);

    return res.json({ profile, channels, score });
  } catch (err) {
    console.error("[local-presence] GET error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/local-presence/dashboard ────────────────────────────────────────
// Structured response including provider metadata, per-channel completeness
// scores, and the overall Local Presence Score. Designed for the Phase 1 UI.
router.get("/local-presence/dashboard", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const clientId = (req.query.clientId as string) || "default";

  try {
    await ensureClient(clientId);
    const dashboard = await localPresenceRepo.getDashboard(clientId);
    return res.json(dashboard);
  } catch (err) {
    console.error("[local-presence] dashboard error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/local-presence/score ────────────────────────────────────────────
router.get("/local-presence/score", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const clientId = (req.query.clientId as string) || "default";

  try {
    await ensureClient(clientId);

    const channels = await db
      .select()
      .from(localPresenceChannelsTable)
      .where(eq(localPresenceChannelsTable.clientId, clientId));

    const score = computeOverallPresenceScore(channels);
    const connected  = channels.filter(c => ["connected", "verified_publishing"].includes(c.status)).length;
    const inProgress = channels.filter(c => ["setup_in_progress", "pending"].includes(c.status)).length;
    const notStarted = channels.filter(c => c.status === "not_started").length;

    return res.json({ score, connected, inProgress, notStarted, total: channels.length });
  } catch (err) {
    console.error("[local-presence] score error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/local-presence/providers ────────────────────────────────────────
// Returns the canonical provider list with current channel status for a client.
router.get("/local-presence/providers", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const clientId = (req.query.clientId as string) || "default";

  try {
    await ensureClient(clientId);

    const channels = await db
      .select()
      .from(localPresenceChannelsTable)
      .where(eq(localPresenceChannelsTable.clientId, clientId));

    const providers = LOCAL_PRESENCE_PROVIDERS.map(p => {
      const ch = channels.find(c => c.channelName === p.channelName) ?? null;
      return {
        ...p,
        channel: ch,
        completenessScore: ch ? computeChannelCompletenessScore(ch) : 0,
      };
    });

    return res.json({ providers });
  } catch (err) {
    console.error("[local-presence] providers error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── PUT /api/local-presence/channel ──────────────────────────────────────────
router.put("/local-presence/channel", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const {
    clientId = "default",
    channelName,
    status,
    score,
    listingUrl,
    verificationStatus,
    recommendedAction,
    metadataJson,
    lastSyncAt,
  } = req.body;

  if (!channelName) return res.status(400).json({ error: "channelName required" });

  try {
    await ensureClient(clientId);

    const row = await localPresenceRepo.upsertChannel(clientId, channelName, {
      status,
      score,
      listingUrl,
      verificationStatus,
      recommendedAction,
      metadataJson,
      lastSyncAt: lastSyncAt ? new Date(lastSyncAt) : undefined,
    });

    return res.json(row);
  } catch (err) {
    console.error("[local-presence] PUT channel error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── PUT /api/local-presence/profile ──────────────────────────────────────────
router.put("/local-presence/profile", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { clientId = "default", businessName, phone, website, address, city, state, zip, napJson } = req.body;

  try {
    await ensureClient(clientId);

    const [row] = await db
      .update(localPresenceProfilesTable)
      .set({
        ...(businessName !== undefined && { businessName }),
        ...(phone        !== undefined && { phone }),
        ...(website      !== undefined && { website }),
        ...(address      !== undefined && { address }),
        ...(city         !== undefined && { city }),
        ...(state        !== undefined && { state }),
        ...(zip          !== undefined && { zip }),
        ...(napJson      !== undefined && { napJson }),
        updatedAt: new Date(),
      })
      .where(eq(localPresenceProfilesTable.clientId, clientId))
      .returning();

    return res.json(row);
  } catch (err) {
    console.error("[local-presence] PUT profile error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;

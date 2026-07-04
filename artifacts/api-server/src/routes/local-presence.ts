import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, eq, and, sql } from "@workspace/db";
import { localPresenceProfilesTable, localPresenceChannelsTable } from "@workspace/db";

const router = Router();

// ── Default channels seeded for new clients ───────────────────────────────────
const DEFAULT_CHANNELS = [
  { channelName: "google_business", status: "connected",          score: 35, verificationStatus: "verified",   recommendedAction: "Maintain photos, posts, and reviews responses" },
  { channelName: "apple_business",  status: "setup_in_progress",  score: 2,  verificationStatus: "pending",    recommendedAction: "Awaiting Apple verification — check business.apple.com" },
  { channelName: "bing_places",     status: "verified_publishing", score: 10, verificationStatus: "verified",   recommendedAction: "Monitor Bing Places for live confirmation (7–12 days)" },
  { channelName: "nextdoor",        status: "setup_in_progress",  score: 2,  verificationStatus: "pending",    recommendedAction: "Claim business at business.nextdoor.com" },
  { channelName: "yelp",            status: "setup_in_progress",  score: 2,  verificationStatus: "pending",    recommendedAction: "Claim and verify at biz.yelp.com" },
  { channelName: "facebook",        status: "not_started",         score: 0,  verificationStatus: "not_started",recommendedAction: "Create Facebook Business page at facebook.com/pages/create" },
  { channelName: "waze",            status: "not_started",         score: 0,  verificationStatus: "not_started",recommendedAction: "Add business at business.waze.com after GBP is optimized" },
  { channelName: "angi",            status: "setup_in_progress",  score: 2,  verificationStatus: "pending",    recommendedAction: "Complete Angi Pro profile at pro.angi.com" },
  { channelName: "thumbtack",       status: "setup_in_progress",  score: 2,  verificationStatus: "pending",    recommendedAction: "Complete profile approval at thumbtack.com/pro" },
];

const DEFAULT_PROFILE = {
  businessName: "Bed Bugs & Beyond",
  phone:        "(251) 324-9090",
  website:      "https://bedbugsandbeyond.net",
  address:      "Baldwin County",
  city:         "Foley",
  state:        "AL",
  zip:          "36535",
  napJson:      JSON.stringify({
    name: "Bed Bugs & Beyond",
    address: "Baldwin County, Alabama",
    phone: "(251) 324-9090",
    website: "https://bedbugsandbeyond.net",
  }),
};

// ── Score computation ─────────────────────────────────────────────────────────
function computeScore(channels: typeof localPresenceChannelsTable.$inferSelect[]) {
  const baseScore = channels.reduce((s, c) => s + (c.score ?? 0), 0);

  const verifiedCount = channels.filter(c =>
    ["connected", "verified_publishing"].includes(c.status)
  ).length;

  const setupCount = channels.filter(c =>
    !["not_started"].includes(c.status)
  ).length;

  // NAP bonus: +15 if 3+ channels are verified/in-progress
  const napBonus = setupCount >= 3 ? 15 : setupCount >= 1 ? 5 : 0;

  // Coverage bonus: +10 if 5+ platforms set up
  const coverageBonus = setupCount >= 5 ? 10 : 0;

  const raw = baseScore + napBonus + coverageBonus;
  return Math.min(raw, 100);
}

// ── Ensure profile + channels exist for clientId ──────────────────────────────
async function ensureClient(clientId: string) {
  // Profile
  const [existing] = await db
    .select()
    .from(localPresenceProfilesTable)
    .where(eq(localPresenceProfilesTable.clientId, clientId));

  if (!existing) {
    await db.insert(localPresenceProfilesTable).values({ clientId, ...DEFAULT_PROFILE });
  }

  // Channels
  const existingChannels = await db
    .select()
    .from(localPresenceChannelsTable)
    .where(eq(localPresenceChannelsTable.clientId, clientId));

  const existingNames = new Set(existingChannels.map(c => c.channelName));

  for (const ch of DEFAULT_CHANNELS) {
    if (!existingNames.has(ch.channelName)) {
      await db.insert(localPresenceChannelsTable).values({ clientId, ...ch });
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

    const score = computeScore(channels);

    return res.json({ profile, channels, score });
  } catch (err) {
    console.error("[local-presence] GET error:", err);
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

    const score = computeScore(channels);
    const connected   = channels.filter(c => c.status === "connected").length;
    const inProgress  = channels.filter(c => ["setup_in_progress", "verified_publishing"].includes(c.status)).length;
    const notStarted  = channels.filter(c => c.status === "not_started").length;

    return res.json({ score, connected, inProgress, notStarted, total: channels.length });
  } catch (err) {
    console.error("[local-presence] score error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── PUT /api/local-presence/channel ──────────────────────────────────────────
router.put("/local-presence/channel", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { clientId = "default", channelName, status, score, listingUrl, verificationStatus, recommendedAction, metadataJson } = req.body;

  if (!channelName) return res.status(400).json({ error: "channelName required" });

  try {
    await ensureClient(clientId);

    const now = new Date();
    const [row] = await db
      .insert(localPresenceChannelsTable)
      .values({
        clientId, channelName,
        status:            status            ?? "not_started",
        score:             score             ?? 0,
        listingUrl:        listingUrl        ?? null,
        verificationStatus:verificationStatus?? null,
        recommendedAction: recommendedAction ?? null,
        metadataJson:      metadataJson      ?? null,
      })
      .onConflictDoUpdate({
        target: [localPresenceChannelsTable.clientId, localPresenceChannelsTable.channelName],
        set: {
          ...(status             !== undefined && { status }),
          ...(score              !== undefined && { score }),
          ...(listingUrl         !== undefined && { listingUrl }),
          ...(verificationStatus !== undefined && { verificationStatus }),
          ...(recommendedAction  !== undefined && { recommendedAction }),
          ...(metadataJson       !== undefined && { metadataJson }),
          updatedAt: now,
        },
      })
      .returning();

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

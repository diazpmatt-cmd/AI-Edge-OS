import { Router } from "express";
import { db } from "@workspace/db";
import { reviewRequestsTable, reviewPlatformStatsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { getAuth } from "@clerk/express";

const router = Router();

// ── GET /reviews/stats ────────────────────────────────────────────────────────
router.get("/reviews/stats", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const rows = await db
      .select()
      .from(reviewPlatformStatsTable)
      .orderBy(reviewPlatformStatsTable.platform);
    res.json({ stats: rows });
  } catch (err) {
    console.error("reviews/stats GET error:", err);
    res.status(500).json({ error: "Failed to fetch review stats" });
  }
});

// ── PUT /reviews/stats/:platform ──────────────────────────────────────────────
router.put("/reviews/stats/:platform", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const platform = req.params.platform;
  const { reviewCount, averageRating } = req.body as { reviewCount?: number; averageRating?: string };

  try {
    const updated = await db
      .update(reviewPlatformStatsTable)
      .set({
        ...(reviewCount   !== undefined && { reviewCount }),
        ...(averageRating !== undefined && { averageRating }),
        lastUpdated: new Date(),
      })
      .where(eq(reviewPlatformStatsTable.platform, platform))
      .returning();

    if (updated.length === 0) {
      res.status(404).json({ error: "Platform not found" });
      return;
    }
    res.json({ stat: updated[0] });
  } catch (err) {
    console.error("reviews/stats PUT error:", err);
    res.status(500).json({ error: "Failed to update review stats" });
  }
});

// ── GET /reviews/requests ─────────────────────────────────────────────────────
router.get("/reviews/requests", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const rows = await db
      .select()
      .from(reviewRequestsTable)
      .orderBy(desc(reviewRequestsTable.sentAt));
    res.json({ requests: rows });
  } catch (err) {
    console.error("reviews/requests GET error:", err);
    res.status(500).json({ error: "Failed to fetch review requests" });
  }
});

// ── POST /reviews/requests ────────────────────────────────────────────────────
router.post("/reviews/requests", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { customerName, contact, contactType, platform, templateId, notes } = req.body as {
    customerName: string;
    contact: string;
    contactType: string;
    platform?: string;
    templateId?: string;
    notes?: string;
  };

  if (!customerName || !contact || !contactType) {
    res.status(400).json({ error: "customerName, contact, and contactType are required" });
    return;
  }

  try {
    const inserted = await db
      .insert(reviewRequestsTable)
      .values({
        customerName,
        contact,
        contactType,
        platform: platform ?? "google",
        templateId: templateId ?? null,
        notes: notes ?? null,
      })
      .returning();
    res.status(201).json({ request: inserted[0] });
  } catch (err) {
    console.error("reviews/requests POST error:", err);
    res.status(500).json({ error: "Failed to log review request" });
  }
});

// ── PATCH /reviews/requests/:id ───────────────────────────────────────────────
router.patch("/reviews/requests/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = Number(req.params.id);
  const { status, notes } = req.body as { status?: string; notes?: string };

  try {
    const updated = await db
      .update(reviewRequestsTable)
      .set({
        ...(status !== undefined && { status }),
        ...(notes  !== undefined && { notes }),
      })
      .where(eq(reviewRequestsTable.id, id))
      .returning();

    if (updated.length === 0) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    res.json({ request: updated[0] });
  } catch (err) {
    console.error("reviews/requests PATCH error:", err);
    res.status(500).json({ error: "Failed to update review request" });
  }
});

// ── DELETE /reviews/requests/:id ──────────────────────────────────────────────
router.delete("/reviews/requests/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = Number(req.params.id);

  try {
    const deleted = await db
      .delete(reviewRequestsTable)
      .where(eq(reviewRequestsTable.id, id))
      .returning();

    if (deleted.length === 0) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    res.json({ deleted: true });
  } catch (err) {
    console.error("reviews/requests DELETE error:", err);
    res.status(500).json({ error: "Failed to delete review request" });
  }
});

export default router;

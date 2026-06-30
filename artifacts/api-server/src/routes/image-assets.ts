import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { imageAssetsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

function getTagsArr(raw: string): string[] {
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

function toClient(row: typeof imageAssetsTable.$inferSelect) {
  return {
    id:         row.id,
    fileUrl:    row.fileUrl,
    fileName:   row.fileName,
    topicTags:  getTagsArr(row.topicTags),
    cityTags:   getTagsArr(row.cityTags),
    category:   row.category,
    uploadDate: row.uploadDate,
  };
}

// ── GET /image-assets ─────────────────────────────────────────────────────────
router.get("/image-assets", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const rows = await db
      .select()
      .from(imageAssetsTable)
      .where(eq(imageAssetsTable.userId, userId))
      .orderBy(imageAssetsTable.uploadDate);
    res.json({ assets: rows.map(toClient) });
  } catch (err) {
    console.error("[image-assets] GET error", err);
    res.status(500).json({ error: "Failed to load image assets" });
  }
});

// ── POST /image-assets ────────────────────────────────────────────────────────
router.post("/image-assets", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { fileUrl, fileName, topicTags = [], cityTags = [], category = "" } = req.body as {
    fileUrl: string; fileName: string; topicTags?: string[]; cityTags?: string[]; category?: string;
  };
  if (!fileUrl || !fileName) { res.status(400).json({ error: "fileUrl and fileName required" }); return; }
  try {
    const [row] = await db.insert(imageAssetsTable).values({
      userId,
      fileUrl,
      fileName,
      topicTags: JSON.stringify(topicTags),
      cityTags:  JSON.stringify(cityTags),
      category,
    }).returning();
    res.status(201).json({ asset: toClient(row) });
  } catch (err) {
    console.error("[image-assets] POST error", err);
    res.status(500).json({ error: "Failed to save image asset" });
  }
});

// ── PATCH /image-assets/:id ───────────────────────────────────────────────────
router.patch("/image-assets/:id", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { id } = req.params;
  const { topicTags, cityTags, category } = req.body as {
    topicTags?: string[]; cityTags?: string[]; category?: string;
  };
  try {
    const updates: Partial<typeof imageAssetsTable.$inferInsert> = {};
    if (topicTags !== undefined) updates.topicTags = JSON.stringify(topicTags);
    if (cityTags  !== undefined) updates.cityTags  = JSON.stringify(cityTags);
    if (category  !== undefined) updates.category  = category;
    const [row] = await db
      .update(imageAssetsTable)
      .set(updates)
      .where(and(eq(imageAssetsTable.id, id), eq(imageAssetsTable.userId, userId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ asset: toClient(row) });
  } catch (err) {
    console.error("[image-assets] PATCH error", err);
    res.status(500).json({ error: "Failed to update image asset" });
  }
});

// ── DELETE /image-assets/:id ──────────────────────────────────────────────────
router.delete("/image-assets/:id", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { id } = req.params;
  try {
    await db
      .delete(imageAssetsTable)
      .where(and(eq(imageAssetsTable.id, id), eq(imageAssetsTable.userId, userId)));
    res.json({ ok: true });
  } catch (err) {
    console.error("[image-assets] DELETE error", err);
    res.status(500).json({ error: "Failed to delete image asset" });
  }
});

// ── GET /image-assets/match ───────────────────────────────────────────────────
// Query: ?city=Foley&topic=Roaches&angle=warning
// Returns best matched image with score (0–100)
router.get("/image-assets/match", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const city  = String(req.query["city"]  ?? "").toLowerCase().trim();
  const topic = String(req.query["topic"] ?? "").toLowerCase().trim();
  const angle = String(req.query["angle"] ?? "").toLowerCase().trim();

  const ANGLE_TO_CATEGORY: Record<string, string> = {
    educational: "educational", warning: "warning", promotional: "treatment",
    seasonal: "seasonal", faq: "educational", testimonial: "branding",
    prevention: "prevention", emergency: "warning",
  };
  const wantedCategory = ANGLE_TO_CATEGORY[angle] ?? "";

  try {
    const rows = await db
      .select()
      .from(imageAssetsTable)
      .where(eq(imageAssetsTable.userId, userId));

    if (rows.length === 0) { res.json({ match: null }); return; }

    let best: { asset: ReturnType<typeof toClient>; score: number } | null = null;

    for (const row of rows) {
      const topicArr = getTagsArr(row.topicTags).map(t => t.toLowerCase());
      const cityArr  = getTagsArr(row.cityTags).map(c => c.toLowerCase());
      let score = 0;
      if (topic && topicArr.includes(topic)) score += 50;
      if (wantedCategory && row.category.toLowerCase() === wantedCategory) score += 30;
      if (city && cityArr.includes(city)) score += 20;
      if (best === null || score > best.score) {
        best = { asset: toClient(row), score };
      }
    }

    res.json({ match: best });
  } catch (err) {
    console.error("[image-assets] match error", err);
    res.status(500).json({ error: "Failed to match image" });
  }
});

// ── GET /image-assets/stats ───────────────────────────────────────────────────
router.get("/image-assets/stats", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const TOPICS = ["Bed Bugs","Roaches","Ants","Fleas","Ticks","Rats","Mice","Wasps","Spiders","Mosquitoes","Moles"];

  try {
    const rows = await db
      .select()
      .from(imageAssetsTable)
      .where(eq(imageAssetsTable.userId, userId));

    const total = rows.length;
    const tagged = rows.filter(r => {
      const tags = getTagsArr(r.topicTags);
      return tags.length > 0 || r.category !== "";
    }).length;
    const untagged = total - tagged;
    const coverageScore = total === 0 ? 0 : Math.round((tagged / total) * 100);

    // Per-topic counts
    const topicCounts: Record<string, number> = {};
    for (const topic of TOPICS) {
      topicCounts[topic] = rows.filter(r =>
        getTagsArr(r.topicTags).map(t => t.toLowerCase()).includes(topic.toLowerCase())
      ).length;
    }

    const suggestions: string[] = [];
    for (const [topic, count] of Object.entries(topicCounts)) {
      if (count === 0) suggestions.push(`No images tagged for "${topic}" — upload at least one.`);
      else if (count === 1) suggestions.push(`"${topic}" has only 1 image — upload more for variety.`);
      else if (count >= 6) suggestions.push(`"${topic}" has ${count} images — strong coverage.`);
    }
    const hasSeasonal = rows.some(r => r.category === "seasonal");
    if (!hasSeasonal) suggestions.push("No seasonal images found — add seasonal content for better engagement.");

    res.json({ total, tagged, untagged, coverageScore, topicCounts, suggestions: suggestions.slice(0, 6) });
  } catch (err) {
    console.error("[image-assets] stats error", err);
    res.status(500).json({ error: "Failed to load stats" });
  }
});

export default router;

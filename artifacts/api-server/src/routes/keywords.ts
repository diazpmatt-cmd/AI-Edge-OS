import { Router } from "express";
import { db } from "@workspace/db";
import { keywordsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";

const router = Router();

router.get("/keywords", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const rows = await db.select().from(keywordsTable).where(eq(keywordsTable.userId, userId));
  res.json(rows.map(rowToDto));
});

router.post("/keywords", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { items } = req.body as { items: any[] };
  if (!items?.length) { res.status(400).json({ error: "items required" }); return; }
  const inserted = await db.insert(keywordsTable).values(items.map((k: any) => ({
    userId, keyword: k.keyword, volume: k.volume ?? 0,
    difficulty: k.difficulty ?? "Medium", intent: k.intent ?? "Local",
    service: k.service, city: k.city, state: k.state,
  }))).returning();
  res.status(201).json(inserted.map(rowToDto));
});

router.delete("/keywords", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  await db.delete(keywordsTable).where(eq(keywordsTable.userId, userId));
  res.status(204).send();
});

function rowToDto(r: typeof keywordsTable.$inferSelect) {
  return { id: r.id, keyword: r.keyword, volume: r.volume, difficulty: r.difficulty, intent: r.intent, service: r.service, city: r.city, state: r.state };
}

export default router;

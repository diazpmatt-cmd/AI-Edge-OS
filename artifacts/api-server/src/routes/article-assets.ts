import { Router } from "express";
import { db } from "@workspace/db";
import { articleAssetsTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";

const router = Router();

router.get("/article-assets", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const rows = await db.select().from(articleAssetsTable).where(eq(articleAssetsTable.userId, userId));
  res.json(rows.map(rowToDto));
});

router.get("/article-assets/:articleId", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const rows = await db.select().from(articleAssetsTable)
    .where(and(eq(articleAssetsTable.articleId, req.params.articleId), eq(articleAssetsTable.userId, userId)));
  res.json(rows.map(rowToDto));
});

router.post("/article-assets/:articleId", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { assets } = req.body as { assets: any[] };
  if (!assets?.length) { res.status(400).json({ error: "assets required" }); return; }
  const articleId = req.params.articleId;
  const values = assets.map((a: any) => ({
    userId, articleId, channel: a.channel, body: a.body ?? "",
    status: a.status ?? "draft", errorMessage: a.errorMessage ?? null,
  }));
  const upserted = await db.insert(articleAssetsTable).values(values)
    .onConflictDoUpdate({
      target: [articleAssetsTable.articleId, articleAssetsTable.channel],
      set: {
        body: sql`excluded.body`,
        status: sql`excluded.status`,
        errorMessage: sql`excluded.error_message`,
        updatedAt: new Date(),
      },
    }).returning();
  res.json(upserted.map(rowToDto));
});

router.patch("/article-assets/item/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const body = req.body as any;
  const updated = await db.update(articleAssetsTable).set({
    ...(body.body !== undefined && { body: body.body }),
    ...(body.status !== undefined && { status: body.status }),
    ...(body.publishedUrl !== undefined && { publishedUrl: body.publishedUrl }),
    ...(body.errorMessage !== undefined && { errorMessage: body.errorMessage }),
    updatedAt: new Date(),
  }).where(and(eq(articleAssetsTable.id, req.params.id), eq(articleAssetsTable.userId, userId))).returning();
  if (!updated[0]) { res.status(404).send(); return; }
  res.json(rowToDto(updated[0]));
});

function rowToDto(r: typeof articleAssetsTable.$inferSelect) {
  return {
    id: r.id, articleId: r.articleId, channel: r.channel, body: r.body, status: r.status,
    publishedUrl: r.publishedUrl, publishedAt: r.publishedAt?.toISOString() ?? null,
    errorMessage: r.errorMessage, updatedAt: r.updatedAt.toISOString(),
  };
}

export default router;

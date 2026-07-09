import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { socialPostsTable } from "@workspace/db/schema";
import { getAuth } from "@clerk/express";

const router = Router();

type SocialPostRow = typeof socialPostsTable.$inferSelect;

function rowToDto(r: SocialPostRow) {
  return {
    ...r,
    scheduledAt: r.scheduledAt?.toISOString() ?? null,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    createdAt: r.createdAt?.toISOString() ?? null,
    updatedAt: r.updatedAt?.toISOString() ?? null,
  };
}

router.get("/", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const rows = await db.select().from(socialPostsTable)
    .where(eq(socialPostsTable.userId, userId))
    .orderBy(desc(socialPostsTable.createdAt));

  res.json(rows.map((r: SocialPostRow) => rowToDto(r)));
});

router.get("/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const post = await db.select().from(socialPostsTable)
    .where(and(eq(socialPostsTable.id, req.params.id), eq(socialPostsTable.userId, userId)))
    .then((r: Array<SocialPostRow>) => r[0]);

  if (!post) return res.status(404).json({ error: "Post not found" });

  res.json(rowToDto(post));
});

export default router;

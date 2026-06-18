import { Router } from "express";
import { db } from "@workspace/db";
import { articleDraftsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuth } from "@clerk/express";

const router = Router();

router.get("/articles", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const rows = await db.select().from(articleDraftsTable).where(eq(articleDraftsTable.userId, userId));
  res.json(rows.map(rowToDto));
});

router.post("/articles", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { items } = req.body as { items: any[] };
  if (!items?.length) { res.status(400).json({ error: "items required" }); return; }
  const inserted = await db.insert(articleDraftsTable).values(items.map((a: any) => ({
    id: a.id, userId, title: a.title, keyword: a.keyword, keywordId: a.keywordId ?? null,
    service: a.service, project: a.project ?? "ai-edge-solutions", body: a.body ?? "",
    metaTitle: a.metaTitle ?? "", metaDescription: a.metaDescription ?? "",
    slug: a.slug, status: a.status ?? "scheduled",
    scheduledFor: a.scheduledFor ? new Date(a.scheduledFor) : null,
    publishedAt: a.publishedAt ? new Date(a.publishedAt) : null,
    publishedUrl: a.publishedUrl ?? null, generatedAt: a.generatedAt ? new Date(a.generatedAt) : null,
    verifiedLiveAt: a.verifiedLiveAt ? new Date(a.verifiedLiveAt) : null,
    lastStatusCode: a.lastStatusCode ?? null, lastCheckedAt: a.lastCheckedAt ? new Date(a.lastCheckedAt) : null,
  }))).onConflictDoNothing().returning();
  res.status(201).json(inserted.map(rowToDto));
});

router.delete("/articles", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  await db.delete(articleDraftsTable).where(eq(articleDraftsTable.userId, userId));
  res.status(204).send();
});

router.get("/articles/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const row = await db.select().from(articleDraftsTable)
    .where(and(eq(articleDraftsTable.id, req.params.id), eq(articleDraftsTable.userId, userId)))
    .then((r) => r[0]);
  if (!row) { res.status(404).send(); return; }
  res.json(rowToDto(row));
});

router.patch("/articles/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const body = req.body as any;
  const updated = await db.update(articleDraftsTable).set({
    ...(body.title !== undefined && { title: body.title }),
    ...(body.body !== undefined && { body: body.body }),
    ...(body.metaTitle !== undefined && { metaTitle: body.metaTitle }),
    ...(body.metaDescription !== undefined && { metaDescription: body.metaDescription }),
    ...(body.slug !== undefined && { slug: body.slug }),
    ...(body.status !== undefined && { status: body.status }),
    ...(body.scheduledFor !== undefined && { scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null }),
    ...(body.publishedAt !== undefined && { publishedAt: body.publishedAt ? new Date(body.publishedAt) : null }),
    ...(body.publishedUrl !== undefined && { publishedUrl: body.publishedUrl }),
    ...(body.generatedAt !== undefined && { generatedAt: body.generatedAt ? new Date(body.generatedAt) : null }),
    ...(body.verifiedLiveAt !== undefined && { verifiedLiveAt: body.verifiedLiveAt ? new Date(body.verifiedLiveAt) : null }),
    ...(body.lastStatusCode !== undefined && { lastStatusCode: body.lastStatusCode }),
    ...(body.lastCheckedAt !== undefined && { lastCheckedAt: body.lastCheckedAt ? new Date(body.lastCheckedAt) : null }),
    updatedAt: new Date(),
  }).where(and(eq(articleDraftsTable.id, req.params.id), eq(articleDraftsTable.userId, userId))).returning();
  if (!updated[0]) { res.status(404).send(); return; }
  res.json(rowToDto(updated[0]));
});

function rowToDto(r: typeof articleDraftsTable.$inferSelect) {
  return {
    id: r.id, title: r.title, keyword: r.keyword, keywordId: r.keywordId,
    service: r.service, project: r.project, body: r.body,
    metaTitle: r.metaTitle, metaDescription: r.metaDescription, slug: r.slug, status: r.status,
    scheduledFor: r.scheduledFor?.toISOString() ?? null,
    publishedAt: r.publishedAt?.toISOString() ?? null, publishedUrl: r.publishedUrl,
    generatedAt: r.generatedAt?.toISOString() ?? null,
    verifiedLiveAt: r.verifiedLiveAt?.toISOString() ?? null,
    lastStatusCode: r.lastStatusCode, lastCheckedAt: r.lastCheckedAt?.toISOString() ?? null,
  };
}

export default router;

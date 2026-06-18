import { Router } from "express";
import { db } from "@workspace/db";
import { contentPackagesTable, contentAssetsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuth } from "@clerk/express";

const router = Router();

router.get("/content-packages", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const pkgs = await db.select().from(contentPackagesTable)
    .where(eq(contentPackagesTable.userId, userId))
    .orderBy(contentPackagesTable.createdAt);
  const assets = await db.select().from(contentAssetsTable)
    .where(eq(contentPackagesTable.userId, userId))
    .innerJoin(contentPackagesTable, eq(contentAssetsTable.packageId, contentPackagesTable.id));
  const assetsByPkg = new Map<string, any[]>();
  for (const row of assets) {
    const a = row.content_assets;
    if (!assetsByPkg.has(a.packageId)) assetsByPkg.set(a.packageId, []);
    assetsByPkg.get(a.packageId)!.push({ id: a.id, channel: a.channel, label: a.label, body: a.body });
  }
  res.json(pkgs.map((p) => ({
    id: p.id, businessName: p.businessName, service: p.service,
    city: p.city, state: p.state, keyword: p.keyword,
    createdAt: p.createdAt.toISOString(),
    assets: assetsByPkg.get(p.id) ?? [],
  })).reverse());
});

router.post("/content-packages", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { businessName, service, city, state, keyword, assets } = req.body as {
    businessName: string; service: string; city: string; state: string; keyword: string;
    assets: Array<{ channel: string; label: string; body: string }>;
  };
  const [pkg] = await db.insert(contentPackagesTable)
    .values({ userId, businessName, service, city, state, keyword })
    .returning();
  if (assets?.length) {
    await db.insert(contentAssetsTable).values(
      assets.map((a) => ({ packageId: pkg.id, channel: a.channel, label: a.label ?? "", body: a.body })),
    ).onConflictDoNothing();
  }
  const savedAssets = await db.select().from(contentAssetsTable)
    .where(eq(contentAssetsTable.packageId, pkg.id));
  res.status(201).json({
    id: pkg.id, businessName: pkg.businessName, service: pkg.service,
    city: pkg.city, state: pkg.state, keyword: pkg.keyword,
    createdAt: pkg.createdAt.toISOString(),
    assets: savedAssets.map((a) => ({ id: a.id, channel: a.channel, label: a.label, body: a.body })),
  });
});

router.delete("/content-packages/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  await db.delete(contentPackagesTable)
    .where(and(eq(contentPackagesTable.id, req.params.id), eq(contentPackagesTable.userId, userId)));
  res.status(204).send();
});

export default router;

/**
 * Asset Library API — DB Active (Phase 1)
 *
 * Protected admin routes for the Asset Library module.
 * All handlers are Clerk auth-guarded (getAuth → 401).
 * Records are scoped to the authenticated userId.
 * No file uploads, no storage provider calls, no external API calls.
 * fileUrl / thumbnailUrl are stored as placeholders only.
 */

import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  assetsTable,
  assetCollectionsTable,
  assetUsageEventsTable,
} from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

function requireAuth(req: Request, res: Response): string | null {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return userId;
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as string[]; } catch { return []; }
  }
  return [];
}

function toClientAsset(row: typeof assetsTable.$inferSelect) {
  return {
    id:           row.id,
    userId:       row.userId,
    clientId:     row.clientId,
    brand:        row.brand,
    assetType:    row.assetType,
    name:         row.name,
    fileUrl:      row.fileUrl,
    thumbnailUrl: row.thumbnailUrl,
    mimeType:     row.mimeType,
    fileSize:     row.fileSize,
    tags:         parseTags(row.tags),
    isFavorite:   row.isFavorite,
    sourceModule: row.sourceModule,
    metadata:     (() => { try { return JSON.parse(row.metadata) as Record<string, unknown>; } catch { return {}; } })(),
    createdAt:    row.createdAt,
    updatedAt:    row.updatedAt,
  };
}

function toClientCollection(row: typeof assetCollectionsTable.$inferSelect) {
  return {
    id:          row.id,
    userId:      row.userId,
    clientId:    row.clientId,
    name:        row.name,
    description: row.description,
    brand:       row.brand,
    coverUrl:    row.coverUrl,
    metadata:    (() => { try { return JSON.parse(row.metadata) as Record<string, unknown>; } catch { return {}; } })(),
    createdAt:   row.createdAt,
    updatedAt:   row.updatedAt,
  };
}

// ── GET /api/admin/assets ─────────────────────────────────────────────────────
router.get("/admin/assets", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const rows = await db
      .select()
      .from(assetsTable)
      .where(eq(assetsTable.userId, userId))
      .orderBy(desc(assetsTable.createdAt));

    res.json({ assets: rows.map(toClientAsset), total: rows.length });
  } catch (err) {
    console.error("[admin-assets] GET /admin/assets error:", err);
    res.status(500).json({ error: "Failed to load assets" });
  }
});

// ── POST /api/admin/assets ────────────────────────────────────────────────────
router.post("/admin/assets", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const {
    name, assetType, brand = "", clientId = "",
    fileUrl = "", thumbnailUrl = "", mimeType = "",
    fileSize = 0, tags = [], isFavorite = false,
    sourceModule = "", metadata = {},
  } = req.body as {
    name?: string; assetType?: string; brand?: string; clientId?: string;
    fileUrl?: string; thumbnailUrl?: string; mimeType?: string;
    fileSize?: number; tags?: string[]; isFavorite?: boolean;
    sourceModule?: string; metadata?: Record<string, unknown>;
  };

  if (!name || typeof name !== "string" || name.trim() === "") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (!assetType || typeof assetType !== "string" || assetType.trim() === "") {
    res.status(400).json({ error: "assetType is required" });
    return;
  }

  try {
    const [row] = await db.insert(assetsTable).values({
      userId,
      clientId,
      brand,
      assetType: assetType.trim(),
      name: name.trim(),
      fileUrl,
      thumbnailUrl,
      mimeType,
      fileSize,
      tags: JSON.stringify(Array.isArray(tags) ? tags : []),
      isFavorite,
      sourceModule,
      metadata: JSON.stringify(metadata ?? {}),
    }).returning();

    res.status(201).json({ asset: toClientAsset(row) });
  } catch (err) {
    console.error("[admin-assets] POST /admin/assets error:", err);
    res.status(500).json({ error: "Failed to create asset" });
  }
});

// ── PATCH /api/admin/assets/:id ───────────────────────────────────────────────
router.patch("/admin/assets/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { id } = req.params;
  const { name, assetType, brand, clientId, tags, isFavorite, sourceModule, metadata } = req.body as {
    name?: string; assetType?: string; brand?: string; clientId?: string;
    tags?: string[]; isFavorite?: boolean; sourceModule?: string;
    metadata?: Record<string, unknown>;
  };

  try {
    const updates: Partial<typeof assetsTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (name       !== undefined) updates.name        = name.trim();
    if (assetType  !== undefined) updates.assetType   = assetType.trim();
    if (brand      !== undefined) updates.brand       = brand;
    if (clientId   !== undefined) updates.clientId    = clientId;
    if (tags       !== undefined) updates.tags        = JSON.stringify(Array.isArray(tags) ? tags : []);
    if (isFavorite !== undefined) updates.isFavorite  = isFavorite;
    if (sourceModule !== undefined) updates.sourceModule = sourceModule;
    if (metadata   !== undefined) updates.metadata    = JSON.stringify(metadata);

    const [row] = await db
      .update(assetsTable)
      .set(updates)
      .where(and(eq(assetsTable.id, String(id)), eq(assetsTable.userId, userId)))
      .returning();

    if (!row) { res.status(404).json({ error: "Asset not found or access denied" }); return; }
    res.json({ asset: toClientAsset(row) });
  } catch (err) {
    console.error("[admin-assets] PATCH /admin/assets/:id error:", err);
    res.status(500).json({ error: "Failed to update asset" });
  }
});

// ── DELETE /api/admin/assets/:id ──────────────────────────────────────────────
router.delete("/admin/assets/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { id } = req.params;
  try {
    const [deleted] = await db
      .delete(assetsTable)
      .where(and(eq(assetsTable.id, String(id)), eq(assetsTable.userId, userId)))
      .returning({ id: assetsTable.id });

    if (!deleted) { res.status(404).json({ error: "Asset not found or access denied" }); return; }
    res.json({ ok: true, id: deleted.id });
  } catch (err) {
    console.error("[admin-assets] DELETE /admin/assets/:id error:", err);
    res.status(500).json({ error: "Failed to delete asset" });
  }
});

// ── GET /api/admin/asset-collections ─────────────────────────────────────────
router.get("/admin/asset-collections", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const rows = await db
      .select()
      .from(assetCollectionsTable)
      .where(eq(assetCollectionsTable.userId, userId))
      .orderBy(desc(assetCollectionsTable.createdAt));

    res.json({ collections: rows.map(toClientCollection), total: rows.length });
  } catch (err) {
    console.error("[admin-assets] GET /admin/asset-collections error:", err);
    res.status(500).json({ error: "Failed to load collections" });
  }
});

// ── POST /api/admin/asset-collections ────────────────────────────────────────
router.post("/admin/asset-collections", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { name, description = "", brand = "", clientId = "", coverUrl = "", metadata = {} } = req.body as {
    name?: string; description?: string; brand?: string;
    clientId?: string; coverUrl?: string; metadata?: Record<string, unknown>;
  };

  if (!name || typeof name !== "string" || name.trim() === "") {
    res.status(400).json({ error: "name is required" });
    return;
  }

  try {
    const [row] = await db.insert(assetCollectionsTable).values({
      userId,
      clientId,
      name: name.trim(),
      description,
      brand,
      coverUrl,
      metadata: JSON.stringify(metadata ?? {}),
    }).returning();

    res.status(201).json({ collection: toClientCollection(row) });
  } catch (err) {
    console.error("[admin-assets] POST /admin/asset-collections error:", err);
    res.status(500).json({ error: "Failed to create collection" });
  }
});

// ── POST /api/admin/asset-usage ───────────────────────────────────────────────
router.post("/admin/asset-usage", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const {
    assetId = "00000000-0000-0000-0000-000000000000",
    assetType = "", eventType = "", sourceModule = "", metadata = {},
  } = req.body as {
    assetId?: string; assetType?: string; eventType?: string;
    sourceModule?: string; metadata?: Record<string, unknown>;
  };

  try {
    await db.insert(assetUsageEventsTable).values({
      userId,
      assetId,
      assetType,
      eventType,
      sourceModule,
      metadata: JSON.stringify(metadata ?? {}),
    });

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error("[admin-assets] POST /admin/asset-usage error:", err);
    res.status(500).json({ error: "Failed to record usage event" });
  }
});

export default router;

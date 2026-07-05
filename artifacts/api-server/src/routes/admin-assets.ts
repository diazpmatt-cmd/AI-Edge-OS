/**
 * Asset Library API — Stub Mode
 *
 * Protected admin routes for the Asset Library module.
 * All handlers are auth-guarded via Clerk (getAuth).
 * Returns safe stub/mock responses — no storage provider calls,
 * no file upload handling, no external API calls.
 *
 * When real storage is connected, replace stub bodies with
 * db queries against: assetsTable, assetCollectionsTable,
 * assetCollectionItemsTable, assetTagsTable, assetUsageEventsTable.
 */

import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";

const router = Router();

function requireAuth(req: Request, res: Response): string | null {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return userId;
}

// ── GET /api/admin/assets ─────────────────────────────────────────────────────
router.get("/admin/assets", (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  res.json({
    stub: true,
    mode: "stub",
    assets: [],
    total: 0,
    message: "Asset Library backend ready — storage integration pending.",
  });
});

// ── POST /api/admin/assets ────────────────────────────────────────────────────
router.post("/admin/assets", (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  res.status(202).json({
    stub: true,
    mode: "stub",
    message: "Asset creation queued — storage integration pending.",
  });
});

// ── PATCH /api/admin/assets/:id ───────────────────────────────────────────────
router.patch("/admin/assets/:id", (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { id } = req.params;
  res.json({
    stub: true,
    mode: "stub",
    id,
    message: "Asset update queued — storage integration pending.",
  });
});

// ── DELETE /api/admin/assets/:id ──────────────────────────────────────────────
router.delete("/admin/assets/:id", (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { id } = req.params;
  res.json({
    stub: true,
    mode: "stub",
    id,
    message: "Asset deletion queued — storage integration pending.",
  });
});

// ── GET /api/admin/asset-collections ─────────────────────────────────────────
router.get("/admin/asset-collections", (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  res.json({
    stub: true,
    mode: "stub",
    collections: [],
    total: 0,
    message: "Collections backend ready — storage integration pending.",
  });
});

// ── POST /api/admin/asset-collections ────────────────────────────────────────
router.post("/admin/asset-collections", (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  res.status(202).json({
    stub: true,
    mode: "stub",
    message: "Collection creation queued — storage integration pending.",
  });
});

// ── POST /api/admin/asset-usage ───────────────────────────────────────────────
router.post("/admin/asset-usage", (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  res.status(202).json({
    stub: true,
    mode: "stub",
    message: "Usage event recorded — analytics integration pending.",
  });
});

export default router;

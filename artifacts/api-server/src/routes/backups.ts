import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  imageAssetsTable, socialPostsTable, autoContentSettingsTable, socialConnectionsTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { ObjectStorageService } from "../lib/objectStorage";

const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const archiver: any = _require("archiver");

const router = Router();

const BACKUP_DIR  = path.resolve(process.cwd(), "backups");
const STATUS_FILE = path.join(BACKUP_DIR, "status.json");
const PROJECT_ROOT = path.resolve(process.cwd(), "../..");

// ── Helpers ───────────────────────────────────────────────────────────────────

export type BackupKey = "code" | "database" | "assets" | "full";
export type BackupStatus = "healthy" | "warning" | "never";

export interface BackupTypeStatus {
  status: BackupStatus;
  lastBackupAt: string | null;
  sizeBytes: number;
  filename: string | null;
}

function ensureDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function readStatus(): Record<BackupKey, BackupTypeStatus> {
  const def: Record<BackupKey, BackupTypeStatus> = {
    code:     { status: "never", lastBackupAt: null, sizeBytes: 0, filename: null },
    database: { status: "never", lastBackupAt: null, sizeBytes: 0, filename: null },
    assets:   { status: "never", lastBackupAt: null, sizeBytes: 0, filename: null },
    full:     { status: "never", lastBackupAt: null, sizeBytes: 0, filename: null },
  };
  try {
    if (fs.existsSync(STATUS_FILE)) return { ...def, ...JSON.parse(fs.readFileSync(STATUS_FILE, "utf-8")) };
  } catch { /* ignore */ }
  return def;
}

function patchStatus(key: BackupKey, patch: Partial<BackupTypeStatus>) {
  ensureDir();
  const s = readStatus();
  s[key] = { ...s[key], ...patch };
  fs.writeFileSync(STATUS_FILE, JSON.stringify(s, null, 2));
}

function fmtTs(iso: string) {
  return iso.replace(/[:.]/g, "-").slice(0, 19);
}

function listHistory(): Array<{ filename: string; type: string; sizeBytes: number; createdAt: string }> {
  ensureDir();
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => !f.startsWith(".") && f !== "status.json" && (f.endsWith(".zip") || f.endsWith(".json")))
    .map(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      const type = f.startsWith("code-") ? "code"
        : f.startsWith("database-") ? "database"
        : f.startsWith("assets-")   ? "assets"
        : f.startsWith("manifest-") ? "full"
        : "other";
      return { filename: f, type, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);
}

// ── Core backup functions (reused by /full) ───────────────────────────────────

async function backupDatabase(userId: string) {
  ensureDir();
  const [posts, settings, images, connections] = await Promise.all([
    db.select().from(socialPostsTable).where(eq(socialPostsTable.userId, userId)),
    db.select().from(autoContentSettingsTable).where(eq(autoContentSettingsTable.userId, userId)),
    db.select().from(imageAssetsTable).where(eq(imageAssetsTable.userId, userId)),
    db.select().from(socialConnectionsTable).where(eq(socialConnectionsTable.userId, userId)),
  ]);
  const exportedAt = new Date().toISOString();
  const payload = {
    exportedAt, version: "1.0",
    tables: { social_posts: posts, auto_content_settings: settings, image_assets: images, social_connections: connections },
    rowCounts: { social_posts: posts.length, auto_content_settings: settings.length, image_assets: images.length, social_connections: connections.length },
  };
  const filename = `database-backup-${fmtTs(exportedAt)}.json`;
  const filepath = path.join(BACKUP_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(payload, null, 2));
  const { size } = fs.statSync(filepath);
  patchStatus("database", { status: "healthy", lastBackupAt: exportedAt, sizeBytes: size, filename });
  return { filename, sizeBytes: size, exportedAt, totalRows: posts.length + settings.length + images.length + connections.length };
}

async function backupCode() {
  ensureDir();
  const exportedAt = new Date().toISOString();
  const filename = `code-backup-${fmtTs(exportedAt)}.zip`;
  const filepath = path.join(BACKUP_DIR, filename);
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(filepath);
    const arc = archiver("zip", { zlib: { level: 4 } });
    output.on("close", resolve);
    arc.on("error", reject);
    arc.pipe(output);
    arc.glob("**", {
      cwd: PROJECT_ROOT,
      ignore: [
        "**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**",
        "**/.env*", "**/*.env", "**/backups/**", "**/.cache/**",
        "**/.local/**", "**/attached_assets/**", "**/*.log",
        "**/.expo/**", "**/.expo-shared/**", "**/pnpm-lock.yaml",
        "**/.agents/**",
      ],
    });
    arc.finalize();
  });
  const { size } = fs.statSync(filepath);
  patchStatus("code", { status: "healthy", lastBackupAt: exportedAt, sizeBytes: size, filename });
  return { filename, sizeBytes: size, exportedAt };
}

async function backupAssets(userId: string) {
  ensureDir();
  const exportedAt = new Date().toISOString();
  const filename = `assets-backup-${fmtTs(exportedAt)}.zip`;
  const filepath = path.join(BACKUP_DIR, filename);
  const rows = await db.select().from(imageAssetsTable).where(eq(imageAssetsTable.userId, userId));
  const metadata = rows.map(r => ({
    id: r.id, fileName: r.fileName, fileUrl: r.fileUrl,
    topicTags: JSON.parse(r.topicTags || "[]"),
    cityTags:  JSON.parse(r.cityTags  || "[]"),
    category: r.category, uploadDate: r.uploadDate,
  }));
  const storage = new ObjectStorageService();
  let downloaded = 0, skipped = 0;
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(filepath);
    const arc = archiver("zip", { zlib: { level: 6 } });
    output.on("close", resolve);
    arc.on("error", reject);
    arc.pipe(output);
    arc.append(
      JSON.stringify({ exportedAt, version: "1.0", totalAssets: rows.length, assets: metadata }, null, 2),
      { name: "metadata.json" },
    );
    (async () => {
      for (const row of rows) {
        try {
          const file = await storage.getObjectEntityFile(row.fileUrl);
          const resp = await storage.downloadObject(file);
          const buf = Buffer.from(await resp.arrayBuffer());
          const safe = row.fileName.replace(/[^a-zA-Z0-9._\-]/g, "_");
          arc.append(buf, { name: `images/${row.id}_${safe}` });
          downloaded++;
        } catch { skipped++; }
      }
      arc.finalize();
    })().catch(reject);
  });
  const { size } = fs.statSync(filepath);
  patchStatus("assets", { status: "healthy", lastBackupAt: exportedAt, sizeBytes: size, filename });
  return { filename, sizeBytes: size, exportedAt, totalAssets: rows.length, downloaded, skipped };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /backups/status
router.get("/backups/status", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  res.json({ status: readStatus(), history: listHistory() });
});

// GET /backups/list
router.get("/backups/list", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  res.json({ backups: listHistory() });
});

// GET /backups/download/:filename
router.get("/backups/download/:filename", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { filename } = req.params;
  if (!/^[a-zA-Z0-9._\-]+\.(zip|json)$/.test(filename)) {
    res.status(400).json({ error: "Invalid filename" }); return;
  }
  const fp = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(fp)) { res.status(404).json({ error: "Not found" }); return; }
  res.setHeader("Content-Type", filename.endsWith(".zip") ? "application/zip" : "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  fs.createReadStream(fp).pipe(res);
});

// DELETE /backups/:filename
router.delete("/backups/:filename", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { filename } = req.params;
  if (!/^[a-zA-Z0-9._\-]+\.(zip|json)$/.test(filename)) {
    res.status(400).json({ error: "Invalid filename" }); return;
  }
  const fp = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(fp)) { res.status(404).json({ error: "Not found" }); return; }
  fs.unlinkSync(fp);
  res.json({ ok: true });
});

// POST /backups/database
router.post("/backups/database", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const result = await backupDatabase(userId);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    patchStatus("database", { status: "warning" });
    console.error("[backups] database error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /backups/code
router.post("/backups/code", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const result = await backupCode();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    patchStatus("code", { status: "warning" });
    console.error("[backups] code error:", err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// POST /backups/assets
router.post("/backups/assets", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const result = await backupAssets(userId);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    patchStatus("assets", { status: "warning" });
    console.error("[backups] assets error:", err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// POST /backups/full — runs all 3 + writes manifest
router.post("/backups/full", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const exportedAt = new Date().toISOString();
  const results: Record<string, any> = {};
  const errors: Record<string, string> = {};

  try { results.database = await backupDatabase(userId); } catch (e: any) { errors.database = e.message; patchStatus("database", { status: "warning" }); }
  try { results.code     = await backupCode();           } catch (e: any) { errors.code     = e.message; patchStatus("code",     { status: "warning" }); }
  try { results.assets   = await backupAssets(userId);   } catch (e: any) { errors.assets   = e.message; patchStatus("assets",   { status: "warning" }); }

  const manifest = { exportedAt, version: "1.0", backups: results, errors };
  const mFilename = `manifest-${fmtTs(exportedAt)}.json`;
  ensureDir();
  fs.writeFileSync(path.join(BACKUP_DIR, mFilename), JSON.stringify(manifest, null, 2));

  const totalSize = Object.values(results).reduce((s: number, r: any) => s + (r?.sizeBytes ?? 0), 0);
  patchStatus("full", { status: Object.keys(errors).length === 0 ? "healthy" : "warning", lastBackupAt: exportedAt, sizeBytes: totalSize, filename: mFilename });

  res.json({ ok: true, manifest: mFilename, results, errors, exportedAt });
});

export default router;

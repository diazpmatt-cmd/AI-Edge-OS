import { Router } from "express";
import { db } from "@workspace/db";
import { socialPostsTable, socialConnectionsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

const UPLOADS_DIR = path.join(process.cwd(), "uploads", "social-posts");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);

const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPG, PNG, WEBP, or GIF files are allowed."));
  },
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
});

function rowToDto(r: typeof socialPostsTable.$inferSelect) {
  return {
    id:           r.id,
    clientName:   r.clientName,
    platforms:    JSON.parse(r.platforms || "[]") as string[],
    imageUrl:     r.imageData,
    caption:      r.caption,
    ctaType:      r.ctaType,
    ctaValue:     r.ctaValue,
    scheduledAt:  r.scheduledAt?.toISOString() ?? null,
    status:       r.status,
    publishedAt:  r.publishedAt?.toISOString() ?? null,
    errorMessage: r.errorMessage,
    createdAt:    r.createdAt.toISOString(),
    updatedAt:    r.updatedAt.toISOString(),
  };
}

// ── Image upload ──────────────────────────────────────────────────────────────
router.post("/social-posts/upload-image", (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  upload.single("image")(req, res, (err: any) => {
    if (err) {
      const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      const msg = err.code === "LIMIT_FILE_SIZE"
        ? "Image too large. Maximum size is 10 MB."
        : err.message ?? "Upload failed.";
      res.status(status).json({ error: msg });
      return;
    }
    if (!req.file) { res.status(400).json({ error: "No file received." }); return; }
    const imageUrl = `/api/uploads/social-posts/${req.file.filename}`;
    res.json({ imageUrl });
  });
});

// ── CRUD ─────────────────────────────────────────────────────────────────────
router.get("/social-posts", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const rows = await db.select().from(socialPostsTable)
    .where(eq(socialPostsTable.userId, userId))
    .orderBy(desc(socialPostsTable.createdAt));
  res.json(rows.map(rowToDto));
});

router.post("/social-posts", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const b = req.body as any;
  const [row] = await db.insert(socialPostsTable).values({
    userId,
    clientName:  b.clientName  ?? "Bed Bugs & Beyond",
    platforms:   JSON.stringify(b.platforms ?? []),
    imageData:   b.imageUrl    ?? null,
    caption:     b.caption     ?? "",
    ctaType:     b.ctaType     ?? "none",
    ctaValue:    b.ctaValue    ?? null,
    scheduledAt: b.scheduledAt ? new Date(b.scheduledAt) : null,
    status:      b.status      ?? "draft",
  }).returning();
  res.status(201).json(rowToDto(row));
});

router.patch("/social-posts/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const b = req.body as any;
  const [row] = await db.update(socialPostsTable).set({
    ...(b.clientName  !== undefined && { clientName:  b.clientName }),
    ...(b.platforms   !== undefined && { platforms:   JSON.stringify(b.platforms) }),
    ...(b.imageUrl    !== undefined && { imageData:   b.imageUrl }),
    ...(b.caption     !== undefined && { caption:     b.caption }),
    ...(b.ctaType     !== undefined && { ctaType:     b.ctaType }),
    ...(b.ctaValue    !== undefined && { ctaValue:    b.ctaValue }),
    ...(b.scheduledAt !== undefined && { scheduledAt: b.scheduledAt ? new Date(b.scheduledAt) : null }),
    ...(b.status      !== undefined && { status:      b.status }),
    updatedAt: new Date(),
  }).where(and(eq(socialPostsTable.id, req.params.id), eq(socialPostsTable.userId, userId))).returning();
  if (!row) { res.status(404).send(); return; }
  res.json(rowToDto(row));
});

router.delete("/social-posts/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [deleted] = await db.delete(socialPostsTable)
    .where(and(eq(socialPostsTable.id, req.params.id), eq(socialPostsTable.userId, userId)))
    .returning();
  if (deleted?.imageData && deleted.imageData.startsWith("/api/uploads/")) {
    const filePath = path.join(process.cwd(), deleted.imageData.replace("/api/", ""));
    fs.unlink(filePath, () => {});
  }
  res.status(204).send();
});

// ── Publish ───────────────────────────────────────────────────────────────────
router.post("/social-posts/:id/publish", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const post = await db.select().from(socialPostsTable)
    .where(and(eq(socialPostsTable.id, req.params.id), eq(socialPostsTable.userId, userId)))
    .then(r => r[0]);
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }

  const platforms: string[] = JSON.parse(post.platforms || "[]");
  const results: Record<string, { ok: boolean; error?: string; postId?: string }> = {};
  const errors: string[] = [];

  const getConnection = async (provider: string) => {
    const [conn] = await db.select().from(socialConnectionsTable)
      .where(and(eq(socialConnectionsTable.userId, userId), eq(socialConnectionsTable.provider, provider)));
    return conn;
  };

  const getFbPages = async (userToken: string) => {
    const r = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${userToken}`);
    if (!r.ok) throw new Error(`Failed to get pages: ${await r.text()}`);
    const data = await r.json() as { data: { id: string; name: string; access_token: string }[] };
    return data.data;
  };

  const buildImageForm = async (imageData: string | null): Promise<{ blob: Blob; filename: string } | null> => {
    if (!imageData) return null;
    if (imageData.startsWith("/api/uploads/")) {
      const filePath = path.join(process.cwd(), imageData.replace("/api/", ""));
      const buf = await fs.promises.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".gif" ? "image/gif" : "image/jpeg";
      return { blob: new Blob([buf], { type: mime }), filename: path.basename(filePath) };
    }
    if (imageData.startsWith("data:")) {
      const base64 = imageData.replace(/^data:image\/[a-z+]+;base64,/, "");
      const buf = Buffer.from(base64, "base64");
      return { blob: new Blob([buf], { type: "image/jpeg" }), filename: "photo.jpg" };
    }
    return null;
  };

  const uploadPhotoToFacebook = async (
    pageId: string, pageToken: string, caption: string, imageData: string | null
  ) => {
    const imgFile = await buildImageForm(imageData);
    if (imgFile) {
      const form = new FormData();
      form.append("caption", caption);
      form.append("access_token", pageToken);
      form.append("source", imgFile.blob, imgFile.filename);
      const r = await fetch(`https://graph.facebook.com/v19.0/${pageId}/photos`, { method: "POST", body: form });
      const data = await r.json() as any;
      if (!r.ok) throw new Error(data.error?.message ?? "Photo upload failed");
      return data as { id: string; post_id?: string };
    }
    if (imageData?.startsWith("http")) {
      const r = await fetch(`https://graph.facebook.com/v19.0/${pageId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption, url: imageData, access_token: pageToken }),
      });
      const data = await r.json() as any;
      if (!r.ok) throw new Error(data.error?.message ?? "Photo URL post failed");
      return data as { id: string; post_id?: string };
    }
    const r = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: caption, access_token: pageToken }),
    });
    const data = await r.json() as any;
    if (!r.ok) throw new Error(data.error?.message ?? "Feed post failed");
    return { id: data.id as string };
  };

  const getPhotoUrl = async (photoId: string, pageToken: string): Promise<string | null> => {
    const r = await fetch(`https://graph.facebook.com/v19.0/${photoId}?fields=images&access_token=${pageToken}`);
    if (!r.ok) return null;
    const data = await r.json() as any;
    return data.images?.[0]?.source ?? null;
  };

  let fbPhotoUrl: string | null = null;
  let fbPages: { id: string; name: string; access_token: string }[] = [];

  if (platforms.includes("facebook") || platforms.includes("instagram")) {
    const fbConn = await getConnection("facebook");
    if (!fbConn?.accessToken) {
      errors.push("Facebook not connected");
    } else {
      try {
        fbPages = await getFbPages(fbConn.accessToken);
        if (!fbPages.length) throw new Error("No Facebook Pages found. Make sure a Page is linked to your account.");
      } catch (e: any) {
        errors.push(`Facebook: ${e.message}`);
      }
    }
  }

  if (platforms.includes("facebook") && fbPages.length) {
    const page = fbPages[0];
    try {
      const fullCaption = buildCaption(post.caption, post.ctaType, post.ctaValue);
      const photoResult = await uploadPhotoToFacebook(page.id, page.access_token, fullCaption, post.imageData ?? null);
      results.facebook = { ok: true, postId: photoResult.post_id ?? photoResult.id };
      fbPhotoUrl = await getPhotoUrl(photoResult.id, page.access_token);
    } catch (e: any) {
      results.facebook = { ok: false, error: e.message };
      errors.push(`Facebook: ${e.message}`);
    }
  }

  if (platforms.includes("instagram") && fbPages.length) {
    const page = fbPages[0];
    try {
      const igRes = await fetch(`https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`);
      const igData = await igRes.json() as any;
      const igAccountId = igData.instagram_business_account?.id;
      if (!igAccountId) throw new Error("No Instagram Business Account linked to this Facebook Page.");

      const imageUrl = fbPhotoUrl ?? (post.imageData?.startsWith("http") ? post.imageData : null);
      if (!imageUrl) throw new Error("Instagram requires a public image URL. Select both Facebook and Instagram together — the Facebook upload will provide the hosted URL.");

      const fullCaption = buildCaption(post.caption, post.ctaType, post.ctaValue);
      const containerRes = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption: fullCaption, image_url: imageUrl, access_token: page.access_token }),
      });
      const containerData = await containerRes.json() as any;
      if (!containerRes.ok) throw new Error(containerData.error?.message ?? "Failed to create IG media container");

      const publishRes = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: containerData.id, access_token: page.access_token }),
      });
      const publishData = await publishRes.json() as any;
      if (!publishRes.ok) throw new Error(publishData.error?.message ?? "Failed to publish IG media");

      results.instagram = { ok: true, postId: publishData.id };
    } catch (e: any) {
      results.instagram = { ok: false, error: e.message };
      errors.push(`Instagram: ${e.message}`);
    }
  }

  const allOk = platforms.every(p => results[p]?.ok === true);
  const anyOk = platforms.some(p => results[p]?.ok === true);
  const newStatus = allOk ? "published" : anyOk ? "partial" : "failed";

  const [updated] = await db.update(socialPostsTable).set({
    status:       newStatus,
    publishedAt:  anyOk ? new Date() : null,
    errorMessage: errors.length ? errors.join("; ") : null,
    updatedAt:    new Date(),
  }).where(eq(socialPostsTable.id, post.id)).returning();

  res.json({ ok: allOk, results, status: newStatus, post: rowToDto(updated) });
});

function buildCaption(caption: string, ctaType: string, ctaValue: string | null): string {
  const ctaLabels: Record<string, string> = {
    call_now:   "📞 Call Now",
    learn_more: "🔗 Learn More",
    book_now:   "📅 Book Now",
    contact_us: "✉️ Contact Us",
  };
  if (ctaType === "none" || !ctaType) return caption;
  const label = ctaLabels[ctaType] ?? ctaType;
  return ctaValue ? `${caption}\n\n${label}: ${ctaValue}` : `${caption}\n\n${label}`;
}

export default router;

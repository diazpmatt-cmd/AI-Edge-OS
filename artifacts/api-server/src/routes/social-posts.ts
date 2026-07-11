import { Router } from "express";
import { db } from "@workspace/db";
import { socialPostsTable, socialConnectionsTable, imageAssetsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { SCHEDULER_SECRET } from "../lib/scheduler-secret";
import {
  readGbpCooldown, buildGbpCooldownRecord,
  stripLegacyCooldownFields,
} from "../lib/gbp-cooldown.js";
import type { GbpEndpointCategory } from "../lib/gbp-cooldown.js";
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
    id:              r.id,
    clientName:      r.clientName,
    platforms:       JSON.parse(r.platforms || "[]") as string[],
    imageUrl:        r.imageData,
    videoUrl:        r.videoUrl ?? null,
    youtubeTitle:    r.youtubeTitle   ?? null,
    youtubePrivacy:  r.youtubePrivacy ?? null,
    youtubeVideoId:  r.youtubeVideoId ?? null,
    youtubeTags:     r.youtubeTags    ? (JSON.parse(r.youtubeTags) as string[]) : null,
    caption:         r.caption,
    captionFacebook: r.captionFacebook ?? null,
    captionGoogle:   r.captionGoogle ?? null,
    ctaType:         r.ctaType,
    ctaValue:        r.ctaValue,
    scheduledAt:     r.scheduledAt?.toISOString() ?? null,
    status:          r.status,
    publishedAt:     r.publishedAt?.toISOString() ?? null,
    errorMessage:    r.errorMessage,
    aiCity:          r.aiCity ?? null,
    aiTopic:         r.aiTopic ?? null,
    aiAngle:         r.aiAngle ?? null,
    contentScore:    r.contentScore ? parseInt(r.contentScore, 10) : null,
    bestPlatform:    r.bestPlatform ?? null,
    matchedImageId:    r.matchedImageId ?? null,
    matchedImageUrl:   r.matchedImageUrl ?? null,
    matchedImageScore: r.matchedImageScore ? parseInt(r.matchedImageScore, 10) : null,
    impressions:     r.impressions ? parseInt(r.impressions, 10) : null,
    reach:           r.reach      ? parseInt(r.reach,       10) : null,
    clicks:          r.clicks     ? parseInt(r.clicks,      10) : null,
    likes:           r.likes      ? parseInt(r.likes,       10) : null,
    comments:        r.comments   ? parseInt(r.comments,    10) : null,
    shares:          r.shares     ? parseInt(r.shares,      10) : null,
    engagementScore: r.engagementScore ? parseFloat(r.engagementScore) : null,
    createdAt:       r.createdAt.toISOString(),
    updatedAt:       r.updatedAt.toISOString(),
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
    videoUrl:       b.videoUrl       ?? null,
    youtubeTitle:   b.youtubeTitle   ?? null,
    youtubePrivacy: b.youtubePrivacy ?? null,
    youtubeTags:    Array.isArray(b.youtubeTags) ? JSON.stringify(b.youtubeTags) : (b.youtubeTags ?? null),
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
    ...(b.clientName      !== undefined && { clientName:      b.clientName }),
    ...(b.platforms       !== undefined && { platforms:       JSON.stringify(b.platforms) }),
    ...(b.imageUrl        !== undefined && { imageData:       b.imageUrl }),
    ...(b.videoUrl        !== undefined && { videoUrl:        b.videoUrl }),
    ...(b.youtubeTitle    !== undefined && { youtubeTitle:    b.youtubeTitle }),
    ...(b.youtubePrivacy  !== undefined && { youtubePrivacy:  b.youtubePrivacy }),
    ...(b.youtubeTags     !== undefined && { youtubeTags:     Array.isArray(b.youtubeTags) ? JSON.stringify(b.youtubeTags) : b.youtubeTags }),
    ...(b.caption         !== undefined && { caption:         b.caption }),
    ...(b.captionFacebook !== undefined && { captionFacebook: b.captionFacebook }),
    ...(b.captionGoogle   !== undefined && { captionGoogle:   b.captionGoogle }),
    ...(b.ctaType         !== undefined && { ctaType:         b.ctaType }),
    ...(b.ctaValue        !== undefined && { ctaValue:        b.ctaValue }),
    ...(b.scheduledAt     !== undefined && { scheduledAt:     b.scheduledAt ? new Date(b.scheduledAt) : null }),
    ...(b.status          !== undefined && { status:          b.status }),
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
  // Internal scheduler bypass — lets the scheduler call this route without a
  // Clerk session. Validated via the shared in-process SCHEDULER_SECRET.
  const isScheduler =
    !!SCHEDULER_SECRET && req.headers["x-scheduler-secret"] === SCHEDULER_SECRET;

  let userId: string;
  if (isScheduler) {
    const [p] = await db
      .select({ userId: socialPostsTable.userId })
      .from(socialPostsTable)
      .where(eq(socialPostsTable.id, req.params.id));
    if (!p) { res.status(404).json({ error: "Post not found" }); return; }
    userId = p.userId;
  } else {
    const auth = getAuth(req);
    if (!auth.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    userId = auth.userId;
  }

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

  // Converts any stored image path to a public HTTPS URL usable by Facebook/Instagram/GBP.
  // /objects/{id}  → https://aiedgesolutions.online/api/storage/objects/{id}
  // http(s)://...  → returned as-is
  // anything else  → null (e.g. local /api/uploads/ paths are handled by buildImageForm, not here)
  function resolveImageUrl(val: string | null | undefined): string | null {
    if (!val) return null;
    if (val.startsWith("http")) return val;
    if (val.startsWith("/objects/")) return `https://aiedgesolutions.online/api/storage${val}`;
    return null;
  }

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
      const fbCaption = post.captionFacebook ?? post.caption;
      const fullCaption = buildCaption(fbCaption, post.ctaType, post.ctaValue);
      const fbImageSource = post.imageData ?? resolveImageUrl(post.matchedImageUrl) ?? null;
      const photoResult = await uploadPhotoToFacebook(page.id, page.access_token, fullCaption, fbImageSource);
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

      const imageUrl =
        fbPhotoUrl ??
        (post.imageData?.startsWith("http") ? post.imageData : null) ??
        resolveImageUrl(post.matchedImageUrl);
      if (!imageUrl) throw new Error("Instagram requires a public image URL. Upload an image to the post or add images to the Image Assets library.");

      const igCaption = post.captionFacebook ?? post.caption;
      const fullCaption = buildCaption(igCaption, post.ctaType, post.ctaValue);
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

  // ── Google Business Profile ──
  if (platforms.includes("google")) {
    const gbpConn = await getConnection("google_business");
    console.log("[GBP-PUBLISH]", JSON.stringify({
      provider: "google_business",
      hasAccessToken: !!gbpConn?.accessToken,
      hasRefreshToken: !!gbpConn?.refreshToken,
      accessTokenLength: gbpConn?.accessToken?.length ?? 0,
      refreshTokenLength: gbpConn?.refreshToken?.length ?? 0,
      expiresAt: gbpConn?.expiresAt ?? null,
      tokenExpired: gbpConn?.expiresAt ? new Date(gbpConn.expiresAt) < new Date() : null,
    }));
    if (!gbpConn?.accessToken) {
      errors.push("Google Business Profile not connected");
      results.google = { ok: false, error: "Not connected — link your account in Connected Accounts." };
    } else {
      try {
        const token = await getGoogleAccessToken({ ...gbpConn, accessToken: gbpConn.accessToken! });
        const googleCaption = post.captionGoogle ?? post.caption;
        const gbpImageSource = post.imageData ?? resolveImageUrl(post.matchedImageUrl) ?? null;
        const gbpResult = await publishToGBP(token, gbpConn, googleCaption, post.ctaType, post.ctaValue, gbpImageSource);
        results.google = { ok: true, postId: gbpResult.id };
      } catch (e: any) {
        results.google = { ok: false, error: e.message };
        errors.push(`Google: ${e.message}`);
      }
    }
  }

  // ── TikTok ────────────────────────────────────────────────────────────────
  // TikTok Content Posting API only accepts video content.
  // Posts with no videoUrl are skipped with a clear message rather than failing
  // silently. When video support is added to the schema, remove the skip guard.
  if (platforms.includes("tiktok")) {
    const ttConn = await getConnection("tiktok");
    console.log("[TIKTOK-PUBLISH]", JSON.stringify({
      hasConnection: !!ttConn,
      hasAccessToken: !!ttConn?.accessToken,
      expiresAt: ttConn?.expiresAt ?? null,
      tokenExpired: ttConn?.expiresAt ? new Date(ttConn.expiresAt) < new Date() : null,
    }));

    if (!ttConn?.accessToken) {
      results.tiktok = { ok: false, error: "TikTok not connected — link your account in Connected Accounts." };
      errors.push("TikTok: Not connected");
    } else {
      // Current post schema has no videoUrl field — all posts are text/image only.
      const videoUrl: string | null = (post as any).videoUrl ?? null;

      if (!videoUrl) {
        // Skip gracefully — this is not a connection error, just an unsupported post type.
        console.log("[TIKTOK-PUBLISH] Skipped — post has no video content (TikTok requires video)");
        results.tiktok = {
          ok: false,
          error: "TikTok publishing requires video content. This post was skipped for TikTok.",
        };
        errors.push("TikTok: Video required — post has no video content");
      } else {
        // ── Video posting via TikTok Content Posting API ──────────────────
        // Uses PULL_FROM_URL source: TikTok fetches the video from our URL.
        // Requires video.publish scope approved in TikTok Developer Portal.
        // Sandbox mode: token exchange succeeds but Content Posting API returns
        // error_code 2061 (permission denied) until app review is approved.
        try {
          const titleText = (post.caption ?? "").slice(0, 150).replace(/\n/g, " ").trim();
          const initRes = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${ttConn.accessToken}`,
              "Content-Type": "application/json; charset=UTF-8",
            },
            body: JSON.stringify({
              post_info: {
                title: titleText || "New post",
                privacy_level: "PUBLIC_TO_EVERYONE",
                disable_duet: false,
                disable_comment: false,
                disable_stitch: false,
                video_cover_timestamp_ms: 1000,
              },
              source_info: {
                source: "PULL_FROM_URL",
                video_url: videoUrl,
              },
            }),
          });

          const initData = await initRes.json() as any;
          console.log("[TIKTOK-PUBLISH] API response:", JSON.stringify(initData));

          // TikTok wraps success in { data: {...}, error: { code: "ok" } }
          if (!initRes.ok || (initData.error?.code && initData.error.code !== "ok")) {
            const code    = initData.error?.code ?? initRes.status;
            const message = initData.error?.message ?? `TikTok API error ${initRes.status}`;
            // Translate common error codes to actionable messages
            const hint =
              code === 2061 ? " (App lacks video.publish permission — request approval in TikTok Developer Portal)" :
              code === 2200 ? " (Invalid access token — reconnect TikTok)" :
              code === 2100 ? " (Video URL unreachable — must be a public HTTPS URL)" :
              "";
            throw new Error(`${message}${hint} [code: ${code}]`);
          }

          const publishId = initData.data?.publish_id ?? null;
          results.tiktok = { ok: true, postId: publishId ?? undefined };
        } catch (e: any) {
          console.error("[TIKTOK-PUBLISH] Error:", e.message);
          results.tiktok = { ok: false, error: e.message };
          errors.push(`TikTok: ${e.message}`);
        }
      }
    }
  }

  // ── YouTube ────────────────────────────────────────────────────────────────
  // YouTube Data API v3 requires video content — image posts are skipped.
  // When a videoUrl is present the upload uses the resumable upload protocol.
  // Capture provider video ID for persistence after the platforms block
  let capturedYoutubeVideoId: string | null = null;

  if (platforms.includes("youtube")) {
    const ytConn = await getConnection("youtube");
    console.log("[YOUTUBE-PUBLISH]", JSON.stringify({
      hasConnection: !!ytConn,
      hasAccessToken: !!ytConn?.accessToken,
      expiresAt: ytConn?.expiresAt ?? null,
      tokenExpired: ytConn?.expiresAt ? new Date(ytConn.expiresAt) < new Date() : null,
    }));

    if (!ytConn?.accessToken) {
      results.youtube = { ok: false, error: "YouTube not connected — link your channel in Connected Accounts." };
      errors.push("YouTube: Not connected");
    } else {
      const videoUrl: string | null = (post as any).videoUrl ?? null;

      if (!videoUrl) {
        console.log("[YOUTUBE-PUBLISH] Skipped — post has no video content (YouTube requires video)");
        results.youtube = {
          ok: false,
          error: "YouTube publishing requires video content. This post was skipped for YouTube — add a video URL to publish.",
        };
        errors.push("YouTube: Video required — post has no video content");
      } else {
        try {
          let accessToken = ytConn.accessToken;

          // Refresh if: refresh token present AND (expiresAt unknown/null OR confirmed expired).
          // expiresAt is NULL when synced via dev-sync — must not gate refresh on it being set.
          if (ytConn.refreshToken && (!ytConn.expiresAt || ytConn.expiresAt < new Date())) {
            const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                client_id:     process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
                client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
                refresh_token: ytConn.refreshToken,
                grant_type:    "refresh_token",
              }),
            });
            if (refreshRes.ok) {
              const refreshData = await refreshRes.json() as { access_token: string; expires_in?: number };
              accessToken = refreshData.access_token;
              await db.update(socialConnectionsTable).set({
                accessToken,
                expiresAt: refreshData.expires_in ? new Date(Date.now() + refreshData.expires_in * 1000) : null,
                updatedAt: new Date(),
              }).where(and(eq(socialConnectionsTable.userId, userId), eq(socialConnectionsTable.provider, "youtube")));
            }
          }

          const title   = (post.youtubeTitle?.trim()) ||
                          (post.caption ?? "").slice(0, 100).replace(/\n/g, " ").trim() ||
                          "New video";
          const desc    = post.caption ?? "";
          const privacy = post.youtubePrivacy === "private" || post.youtubePrivacy === "unlisted"
                          ? post.youtubePrivacy : "public";
          console.log("[YOUTUBE-PUBLISH] metadata", JSON.stringify({ title, privacy, descLen: desc.length }));
          const rawTags: string[] = (() => {
            try { return JSON.parse(post.youtubeTags ?? "[]") as string[]; } catch { return []; }
          })();
          const tags = rawTags.length ? rawTags : undefined;
          const metaBody = {
            snippet: { title, description: desc, categoryId: "22", ...(tags ? { tags } : {}) },
            status:  { privacyStatus: privacy },
          };

          // Step 1: Initiate resumable upload session
          const initRes = await fetch(
            "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
            {
              method: "POST",
              headers: {
                Authorization:             `Bearer ${accessToken}`,
                "Content-Type":            "application/json",
                "X-Upload-Content-Type":   "video/mp4",
              },
              body: JSON.stringify(metaBody),
            }
          );

          if (!initRes.ok) {
            const body = await initRes.text().catch(() => "");
            let errMsg = `YouTube upload initiation failed (${initRes.status})`;
            try {
              const json = JSON.parse(body);
              errMsg = json?.error?.message ?? errMsg;
            } catch { /* use default */ }
            const hint =
              initRes.status === 403 ? " — upload permission denied. Reconnect YouTube to grant youtube.upload scope." :
              initRes.status === 401 ? " — token expired or invalid. Reconnect YouTube in Connected Accounts." :
              "";
            throw new Error(`${errMsg}${hint}`);
          }

          const uploadUrl = initRes.headers.get("location");
          if (!uploadUrl) throw new Error("YouTube did not return an upload URL — check YouTube Data API v3 is enabled.");

          // Step 2: Stream video from URL → YouTube
          const videoRes = await fetch(videoUrl, { signal: AbortSignal.timeout(60000) });
          if (!videoRes.ok) throw new Error(`Cannot fetch video source (${videoRes.status}): ${videoUrl.slice(0, 80)}`);
          const videoBlob = await videoRes.blob();
          const contentType = videoRes.headers.get("content-type") ?? "video/mp4";

          const uploadRes = await fetch(uploadUrl, {
            method:  "PUT",
            headers: { "Content-Type": contentType, "Content-Length": String(videoBlob.size) },
            body:    videoBlob,
            signal:  AbortSignal.timeout(120000),
          });

          if (!uploadRes.ok && uploadRes.status !== 200 && uploadRes.status !== 201) {
            const body = await uploadRes.text().catch(() => "");
            throw new Error(`YouTube upload failed (${uploadRes.status}): ${body.slice(0, 200)}`);
          }

          const uploadData = await uploadRes.json() as { id?: string };
          const videoId = uploadData.id ?? null;
          console.log("[YOUTUBE-PUBLISH] ✓ uploaded:", JSON.stringify({ videoId, title, privacy }));
          // Store provider video ID for immediate retrieval — persisted to DB below
          capturedYoutubeVideoId = videoId;
          results.youtube = { ok: true, postId: videoId ?? undefined };
        } catch (e: any) {
          console.error("[YOUTUBE-PUBLISH] Error:", e.message);
          results.youtube = { ok: false, error: e.message };
          errors.push(`YouTube: ${e.message}`);
        }
      }
    }
  }

  const allOk = platforms.every(p => results[p]?.ok === true);
  const anyOk = platforms.some(p => results[p]?.ok === true);
  const newStatus = allOk ? "published" : anyOk ? "partial" : "failed";

  const [updated] = await db.update(socialPostsTable).set({
    status:       newStatus,
    publishedAt:  anyOk ? new Date() : null,
    errorMessage: errors.length ? errors.join("; ") : null,
    ...(capturedYoutubeVideoId ? { youtubeVideoId: capturedYoutubeVideoId } : {}),
    updatedAt:    new Date(),
  }).where(eq(socialPostsTable.id, post.id)).returning();

  res.json({ ok: allOk, results, status: newStatus, post: rowToDto(updated) });
});

// ── Google Business Profile ───────────────────────────────────────────────────


/** Extract diagnostically useful headers from a Google API error response. */
function captureGbpResponseHeaders(res: Response): Record<string, string> {
  const names = [
    "retry-after", "x-ratelimit-limit", "x-ratelimit-remaining",
    "x-quota-limit", "x-quota-remaining", "content-type", "date",
  ];
  const out: Record<string, string> = {};
  for (const name of names) {
    const val = res.headers.get(name);
    if (val) out[name] = val;
  }
  return out;
}

async function getGoogleAccessToken(conn: { id?: any; userId: string; provider: string; accessToken: string; refreshToken: string | null; expiresAt: Date | null }): Promise<string> {
  const isExpired = conn.expiresAt ? new Date(conn.expiresAt) < new Date() : false;
  const needsRefresh = isExpired && !!conn.refreshToken;
  console.log("[GOOGLE-REFRESH]", JSON.stringify({
    attempt: needsRefresh,
    reason: !conn.expiresAt ? "no_expiry_stored" : isExpired ? "token_expired" : "token_still_valid",
    expiresAt: conn.expiresAt ?? null,
    hasRefreshToken: !!conn.refreshToken,
  }));
  if (!conn.expiresAt || conn.expiresAt > new Date()) return conn.accessToken;
  if (!conn.refreshToken) {
    console.warn("[GOOGLE-REFRESH] skipping — no refresh token stored");
    return conn.accessToken;
  }
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
        refresh_token: conn.refreshToken,
        grant_type:    "refresh_token",
      }),
    });
    const refreshBody = await r.text();
    if (!r.ok) {
      console.error("[GOOGLE-REFRESH]", JSON.stringify({ success: false, status: r.status, error: refreshBody.slice(0, 300) }));
      return conn.accessToken;
    }
    const data = JSON.parse(refreshBody) as { access_token: string; expires_in?: number; scope?: string };
    const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;
    console.log("[GOOGLE-REFRESH]", JSON.stringify({
      success: true,
      newAccessTokenLength: data.access_token?.length ?? 0,
      scope: data.scope ?? "(not returned)",
      expiresAt,
    }));
    await db.update(socialConnectionsTable).set({ accessToken: data.access_token, expiresAt, updatedAt: new Date() })
      .where(and(eq(socialConnectionsTable.userId, conn.userId), eq(socialConnectionsTable.provider, conn.provider)));
    return data.access_token;
  } catch (e: any) {
    console.error("[GOOGLE-REFRESH]", JSON.stringify({ success: false, error: e?.message }));
    return conn.accessToken;
  }
}

async function publishToGBP(
  token: string,
  conn: { userId: string; provider: string },
  caption: string,
  ctaType: string,
  ctaValue: string | null,
  imageData: string | null,
): Promise<{ id: string }> {
  // 0 — verify token via tokeninfo
  try {
    const tiR = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`, { signal: AbortSignal.timeout(5000) });
    const tiBody = await tiR.text();
    const ti = tiR.ok ? JSON.parse(tiBody) as { scope?: string; email?: string; expires_in?: number; error?: string } : null;
    console.log("[TOKENINFO]", JSON.stringify({
      status: tiR.status,
      scope: ti?.scope ?? null,
      hasBusinessManage: ti?.scope ? ti.scope.includes("business.manage") : false,
      expiresIn: ti?.expires_in ?? null,
      email: ti?.email ?? null,
      tokenError: ti?.error ?? null,
    }));
  } catch (tiErr: any) {
    console.warn("[TOKENINFO] fetch failed:", tiErr?.message);
  }

  // 1 — resolve account + location (use DB cache if verified; run discovery otherwise)
  let metadata: Record<string, unknown> = {};
  try {
    const [row] = await db.select().from(socialConnectionsTable)
      .where(and(eq(socialConnectionsTable.userId, conn.userId), eq(socialConnectionsTable.provider, conn.provider)));
    if (row?.metadata) metadata = JSON.parse(row.metadata);
  } catch {}

  // Auto-clear expired cooldown on read
  const activeCooldown = readGbpCooldown(metadata);

  let locationResourceName: string | null = (metadata.locationName as string) ?? null;
  let accountResourceName: string | null  = (metadata.accountName  as string) ?? null;
  let locationTitle: string | null        = (metadata.locationTitle as string) ?? (metadata.primaryLocationTitle as string) ?? null;

  // Only trust cache entries that were written by a successful API response
  if ((accountResourceName || locationResourceName) && !metadata.verifiedByApi) {
    console.warn("[GBP-PUBLISH] cached account/location missing verifiedByApi flag — clearing for safe rediscovery");
    accountResourceName = null;
    locationResourceName = null;
    locationTitle = null;
  }

  if (!locationResourceName || !accountResourceName) {
    if (activeCooldown) {
      const minsLeft = Math.ceil((new Date(activeCooldown.expiresAt).getTime() - Date.now()) / 60000);
      throw new Error(
        `GBP ${activeCooldown.errorType.replace(/_/g, " ")} cooldown active` +
        ` (${minsLeft}m remaining, attempt ${activeCooldown.attemptCount})` +
        ` — ${activeCooldown.endpoint}.`,
      );
    }

    // Save structured cooldown and throw — honors Retry-After, preserves existing deadline
    const saveCooldownAndThrow = async (
      res: Response,
      body: string,
      endpoint: GbpEndpointCategory,
      service: string,
    ): Promise<never> => {
      const record = buildGbpCooldownRecord({
        existing:         activeCooldown,
        responseBody:     body,
        retryAfterHeader: res.headers.get("retry-after"),
        httpStatus:       res.status,
        endpoint,
        service,
      });
      const cleanMeta = stripLegacyCooldownFields(metadata);
      try {
        await db.update(socialConnectionsTable)
          .set({ metadata: JSON.stringify({ ...cleanMeta, gbpCooldown: record }), updatedAt: new Date() })
          .where(and(eq(socialConnectionsTable.userId, conn.userId), eq(socialConnectionsTable.provider, conn.provider)));
      } catch {}
      const minsLeft = Math.ceil((new Date(record.expiresAt).getTime() - Date.now()) / 60000);
      throw new Error(
        `GBP ${record.errorType.replace(/_/g, " ")} (${res.status}) on ${record.endpoint}` +
        ` — cooldown ${minsLeft}m, attempt ${record.attemptCount}.`,
      );
    };

    // Account discovery — skip if a verified cache entry exists
    if (!accountResourceName) {
      console.log("[GBP-PUBLISH] no verified account cached — calling Account Management API");
      const acctRes  = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
        headers: { Authorization: `Bearer ${token}` },
        signal:  AbortSignal.timeout(10000),
      });
      const acctBody = await acctRes.text();
      if (!acctRes.ok) {
        console.error("[GBP-PUBLISH] Account Management API error", JSON.stringify({
          status:  acctRes.status,
          headers: captureGbpResponseHeaders(acctRes),
          body:    acctBody.slice(0, 1000),
        }));
        await saveCooldownAndThrow(acctRes, acctBody, "Account Management API", "mybusinessaccountmanagement.googleapis.com");
      }
      const acctData = JSON.parse(acctBody) as { accounts?: { name: string; accountName: string }[] };
      const account  = acctData.accounts?.[0];
      if (!account) throw new Error("No GBP account found — verify the connected Google account manages a Business Profile.");
      accountResourceName = account.name;
      console.log("[GBP-PUBLISH] account resolved:", accountResourceName);
    } else {
      console.log("[GBP-PUBLISH] using verified cached account:", accountResourceName);
    }

    // Location discovery
    console.log("[GBP-PUBLISH] calling Business Information API for account:", accountResourceName);
    const locRes  = await fetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${accountResourceName}/locations?readMask=name,title`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) },
    );
    const locBody = await locRes.text();
    if (!locRes.ok) {
      console.error("[GBP-PUBLISH] Business Information API error", JSON.stringify({
        status:  locRes.status,
        headers: captureGbpResponseHeaders(locRes),
        body:    locBody.slice(0, 1000),
      }));
      await saveCooldownAndThrow(locRes, locBody, "Business Information API", "mybusinessbusinessinformation.googleapis.com");
    }
    const locData  = JSON.parse(locBody) as { locations?: { name: string; title: string }[] };
    const location = locData.locations?.[0];
    if (!location) throw new Error("No GBP location found — verify the account has at least one verified location.");

    // Verify location title matches the expected business before caching
    const EXPECTED_TITLE_RE = /bed\s+bugs.{0,10}beyond/i;
    if (!EXPECTED_TITLE_RE.test(location.title)) {
      throw new Error(
        `GBP location title mismatch: got "${location.title}" — ` +
        `expected title matching "Bed Bugs & Beyond". ` +
        `Refusing to cache unverified location (account: ${accountResourceName}).`,
      );
    }
    console.log("[GBP-PUBLISH] location title verified: %s", location.title);
    locationResourceName = location.name;
    locationTitle        = location.title;

    // Persist verified cache — verifiedByApi: true required for future reads
    const accountId  = accountResourceName?.split("/").pop() ?? null;
    const locationId = locationResourceName?.split("/").pop() ?? null;
    const cleanMeta  = stripLegacyCooldownFields(metadata);
    try {
      await db.update(socialConnectionsTable)
        .set({
          metadata: JSON.stringify({
            ...cleanMeta,
            accountName:          accountResourceName,
            accountId,
            locationName:         locationResourceName,
            locationId,
            locationTitle,
            primaryLocationTitle: locationTitle,
            verifiedByApi:        true,
            cachedAt:             new Date().toISOString(),
          }),
          updatedAt: new Date(),
        })
        .where(and(eq(socialConnectionsTable.userId, conn.userId), eq(socialConnectionsTable.provider, conn.provider)));
      console.log("[GBP-PUBLISH] cached accountName=%s locationName=%s locationTitle=%s verifiedByApi=true",
        accountResourceName, locationResourceName, locationTitle);
    } catch (cacheErr: any) {
      console.warn("[GBP-PUBLISH] cache save failed:", cacheErr?.message);
    }
  } else {
    const cachedAt = metadata.cachedAt ? new Date(metadata.cachedAt as string).toLocaleString() : "unknown";
    console.log("[GBP-PUBLISH] using verified cached location: %s (%s) — cached %s",
      locationResourceName, locationTitle, cachedAt);
  }

  // 2 — build post body
  const GBP_CTA: Record<string, string> = {
    call_now:   "CALL",
    learn_more: "LEARN_MORE",
    book_now:   "BOOK",
    sign_up:    "SIGN_UP",
    contact_us: "LEARN_MORE",
  };

  const body: Record<string, any> = {
    languageCode: "en-US",
    summary: caption,
    topicType: "STANDARD",
  };

  const gbpAction = ctaType && ctaType !== "none" ? GBP_CTA[ctaType] : null;
  if (gbpAction) {
    body.callToAction = { actionType: gbpAction };
    if (gbpAction !== "CALL" && ctaValue) body.callToAction.url = ctaValue;
  }

  if (imageData) {
    const appBase = process.env.PUBLIC_APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN}`;
    const imageUrl = imageData.startsWith("http") ? imageData : `${appBase}${imageData}`;
    body.media = [{ mediaFormat: "PHOTO", sourceUrl: imageUrl }];
  }

  // 3 — create local post (direct fetch — no silent retry on 429)
  const postUrl = `https://mybusinessposts.googleapis.com/v1/${locationResourceName}/localPosts`;
  console.log("[GBP-PUBLISH] posting to", postUrl, "body=", JSON.stringify(body).slice(0, 300));
  const postRes = await fetch(postUrl, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(15000),
  });
  const postBody = await postRes.text();
  if (!postRes.ok) {
    console.error("[GBP-PUBLISH] post failed", JSON.stringify({
      status:  postRes.status,
      headers: captureGbpResponseHeaders(postRes),
      body:    postBody.slice(0, 1000),
    }));
    if (postRes.status === 429) {
      const record = buildGbpCooldownRecord({
        existing:         readGbpCooldown(metadata),
        responseBody:     postBody,
        retryAfterHeader: postRes.headers.get("retry-after"),
        httpStatus:       postRes.status,
        endpoint:         "Local Posts API",
        service:          "mybusinessposts.googleapis.com",
      });
      const cleanMeta = stripLegacyCooldownFields(metadata);
      try {
        await db.update(socialConnectionsTable)
          .set({ metadata: JSON.stringify({ ...cleanMeta, gbpCooldown: record }), updatedAt: new Date() })
          .where(and(eq(socialConnectionsTable.userId, conn.userId), eq(socialConnectionsTable.provider, conn.provider)));
      } catch {}
      const minsLeft = Math.ceil((new Date(record.expiresAt).getTime() - Date.now()) / 60000);
      throw new Error(`GBP ${record.errorType.replace(/_/g, " ")} (429) on Local Posts API — cooldown ${minsLeft}m.`);
    }
    // 404 = stale cached location — clear for safe rediscovery
    if (postRes.status === 404) {
      const cleanMeta = stripLegacyCooldownFields(metadata);
      const {
        accountName, accountId, locationName, locationId,
        locationTitle: _lt, address, cachedAt, verifiedByApi, primaryLocationTitle,
        ...keepMeta
      } = cleanMeta as Record<string, unknown>;
      void accountName; void accountId; void locationName; void locationId;
      void _lt; void address; void cachedAt; void verifiedByApi; void primaryLocationTitle;
      try {
        await db.update(socialConnectionsTable)
          .set({ metadata: JSON.stringify(keepMeta), updatedAt: new Date() })
          .where(and(eq(socialConnectionsTable.userId, conn.userId), eq(socialConnectionsTable.provider, conn.provider)));
        console.log("[GBP-PUBLISH] invalidated stale location cache after 404 — next publish will re-fetch");
      } catch {}
    }
    throw new Error(`GBP post error (${postRes.status}): ${postBody.slice(0, 300)}`);
  }
  const postData = JSON.parse(postBody) as { name: string };
  console.log("[GBP-PUBLISH] success name=", postData.name);
  return { id: postData.name };
}

// ── POST /social-posts/:id/image-match ───────────────────────────────────────
router.post("/social-posts/:id/image-match", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const post = await db.select().from(socialPostsTable)
    .where(and(eq(socialPostsTable.id, req.params.id), eq(socialPostsTable.userId, userId)))
    .then(r => r[0]);
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }

  const assets = await db.select().from(imageAssetsTable)
    .where(eq(imageAssetsTable.userId, userId));
  if (!assets.length) { res.json({ matched: false, message: "No images in library" }); return; }

  const cityLow  = (post.aiCity  ?? "").split(",")[0].trim().toLowerCase();
  const topicLow = (post.aiTopic ?? "").toLowerCase();
  const angle    = post.aiAngle ?? "";
  const ANGLE_TO_CAT: Record<string, string> = {
    educational: "educational", warning: "warning", promotional: "treatment",
    seasonal: "seasonal", faq: "educational", testimonial: "branding",
    prevention: "prevention", emergency: "warning",
  };
  const wantedCat = ANGLE_TO_CAT[angle] ?? "";

  let bestAsset: typeof assets[0] | null = null;
  let bestScore = 0;
  for (const asset of assets) {
    const tArr = (JSON.parse(asset.topicTags || "[]") as string[]).map(t => t.toLowerCase());
    const cArr = (JSON.parse(asset.cityTags  || "[]") as string[]).map(c => c.toLowerCase());
    let s = 0;
    if (topicLow && tArr.includes(topicLow)) s += 50;
    if (wantedCat && asset.category.toLowerCase() === wantedCat) s += 30;
    if (cityLow  && cArr.includes(cityLow))  s += 20;
    if (s > bestScore) { bestScore = s; bestAsset = asset; }
  }

  if (bestAsset) {
    const [updated] = await db.update(socialPostsTable).set({
      matchedImageId:    bestAsset.id,
      matchedImageUrl:   bestAsset.fileUrl,
      matchedImageScore: String(bestScore),
    }).where(and(eq(socialPostsTable.id, req.params.id), eq(socialPostsTable.userId, userId))).returning();
    res.json({ matched: true, score: bestScore, imageUrl: bestAsset.fileUrl, post: rowToDto(updated) });
  } else {
    res.json({ matched: false, message: "No matching image found in library" });
  }
});

// ── POST /social-posts/:id/performance ───────────────────────────────────────
router.post("/social-posts/:id/performance", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { impressions, reach, clicks, likes, comments, shares } = req.body as {
    impressions?: number; reach?: number; clicks?: number;
    likes?: number; comments?: number; shares?: number;
  };

  const r = Math.max(reach ?? impressions ?? 1, 1);
  const engScore = Math.min(100, Math.round(
    ((likes ?? 0) + (comments ?? 0) * 3 + (shares ?? 0) * 5 + (clicks ?? 0) * 2) / r * 100
  ));

  const updates: Partial<typeof socialPostsTable.$inferInsert> = { engagementScore: String(engScore) };
  if (impressions != null) updates.impressions = String(impressions);
  if (reach       != null) updates.reach       = String(reach);
  if (clicks      != null) updates.clicks      = String(clicks);
  if (likes       != null) updates.likes       = String(likes);
  if (comments    != null) updates.comments    = String(comments);
  if (shares      != null) updates.shares      = String(shares);

  const [updated] = await db.update(socialPostsTable).set(updates)
    .where(and(eq(socialPostsTable.id, req.params.id), eq(socialPostsTable.userId, userId))).returning();
  if (!updated) { res.status(404).json({ error: "Post not found" }); return; }
  res.json({ ok: true, engagementScore: engScore, post: rowToDto(updated) });
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

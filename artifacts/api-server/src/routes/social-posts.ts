import { Router } from "express";
import { db } from "@workspace/db";
import { socialPostsTable, socialConnectionsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuth } from "@clerk/express";

const router = Router();

function rowToDto(r: typeof socialPostsTable.$inferSelect) {
  return {
    id:           r.id,
    clientName:   r.clientName,
    platforms:    JSON.parse(r.platforms || "[]") as string[],
    imageData:    r.imageData,
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
    imageData:   b.imageData   ?? null,
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
    ...(b.imageData   !== undefined && { imageData:   b.imageData }),
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
  await db.delete(socialPostsTable)
    .where(and(eq(socialPostsTable.id, req.params.id), eq(socialPostsTable.userId, userId)));
  res.status(204).send();
});

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

  const uploadPhotoToFacebook = async (pageId: string, pageToken: string, caption: string, imageData: string | null) => {
    if (imageData && imageData.startsWith("data:")) {
      const base64 = imageData.replace(/^data:image\/[a-z+]+;base64,/, "");
      const imgBuffer = Buffer.from(base64, "base64");
      const form = new FormData();
      form.append("caption", caption);
      form.append("access_token", pageToken);
      form.append("source", new Blob([imgBuffer], { type: "image/jpeg" }), "photo.jpg");
      const r = await fetch(`https://graph.facebook.com/v19.0/${pageId}/photos`, { method: "POST", body: form });
      const data = await r.json() as any;
      if (!r.ok) throw new Error(data.error?.message ?? "Photo upload failed");
      return data as { id: string; post_id?: string };
    } else if (imageData && imageData.startsWith("http")) {
      const r = await fetch(`https://graph.facebook.com/v19.0/${pageId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption, url: imageData, access_token: pageToken }),
      });
      const data = await r.json() as any;
      if (!r.ok) throw new Error(data.error?.message ?? "Photo URL post failed");
      return data as { id: string; post_id?: string };
    } else {
      const r = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: caption, access_token: pageToken }),
      });
      const data = await r.json() as any;
      if (!r.ok) throw new Error(data.error?.message ?? "Feed post failed");
      return { id: data.id as string };
    }
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
        if (!fbPages.length) throw new Error("No Facebook Pages found. Make sure you have a Page linked to this account.");
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
      if (post.imageData && post.imageData.startsWith("data:")) {
        fbPhotoUrl = await getPhotoUrl(photoResult.id, page.access_token);
      }
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
      if (!imageUrl) throw new Error("Instagram requires a public image URL. Post to Facebook first to get a hosted URL, or provide an image URL.");

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

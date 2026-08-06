/**
 * PublishingService — canonical 12-step publishing pipeline.
 *
 * Orchestrates the full lifecycle from pre-flight validation through
 * confirmed external platform publishing. The platform adapters (FB Graph
 * API, GBP Local Posts API, etc.) live in social-posts.ts and are called
 * via the internal route to preserve backward compatibility without
 * duplicating ~800 lines of adapter logic.
 *
 * ── Guarantees ────────────────────────────────────────────────────────────
 * 1. IDEMPOTENCY: attempt_id (deterministic hash) prevents duplicate posting
 *    even when the user double-clicks Send or the scheduler retries.
 * 2. TENANT ISOLATION: all queries include user_id; cross-tenant access impossible.
 * 3. APPROVAL GATE: posts with approval_status ≠ 'approved' are rejected.
 * 4. NO SECRETS IN RESPONSES: all error messages are sanitized before returning.
 * 5. PLATFORM VALIDATIONS: YouTube requires video; Instagram requires public image.
 *
 * ── Pipeline steps ────────────────────────────────────────────────────────
 * 1.  Resolve post + enforce tenant ownership
 * 2.  Validate approval_status === 'approved'
 * 3.  Validate at least one platform selected
 * 4.  For each platform: check connection exists and is not expired
 * 5.  For each platform: validate media requirements
 * 6.  Create or get platform_delivery records (one per platform)
 * 7.  Enforce idempotency via attempt_id
 * 8.  Mark deliveries as 'publishing' + post as 'publishing'
 * 9.  Call platform adapter via internal route (preserves full adapter logic)
 * 10. Parse per-platform results from adapter response
 * 11. Update delivery records (published / failed / skipped)
 * 12. Update post status (published / published_with_warning / failed)
 * 13. Record audit fields (publishedBy, publishedAt, externalPostId, externalPostUrl)
 * 14. Return sanitized PublishResult
 */

import { createHash } from "node:crypto";
import { db, pool } from "@workspace/db";
import { socialPostsTable, socialConnectionsTable } from "@workspace/db/schema";
import { platformDeliveriesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import type { PlatformDelivery } from "@workspace/db/schema";
import { evaluateContentClaims } from "@workspace/db";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlatformValidation {
  platform:        string;
  connected:       boolean;
  mediaValid:      boolean;
  reason:          string | null;
  canPublish:      boolean;
}

export interface DeliveryAttemptResult {
  platform:        string;
  deliveryId:      string;
  status:          "published" | "published_with_warning" | "failed" | "skipped" | "idempotency_hit";
  externalPostId:  string | null;
  externalPostUrl: string | null;
  errorMessage:    string | null;
  apiResponseStatus: number | null;
}

export interface PublishResult {
  postId:          string;
  postStatus:      string;
  totalPlatforms:  number;
  published:       number;
  failed:          number;
  skipped:         number;
  warnings:        number;
  deliveries:      DeliveryAttemptResult[];
  summary:         string;
}

export interface PreFlightResult {
  approved:        boolean;
  platforms:       PlatformValidation[];
  canProceed:      boolean;
  blockers:        string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Media requirements by platform
const REQUIRES_VIDEO   = new Set(["youtube", "tiktok"]);
const REQUIRES_IMAGE   = new Set(["instagram"]);
const METADATA_ONLY    = new Set(["youtube"]); // when no video → metadata-only, not publishable

export const POST_STATUSES = [
  "draft",
  "generated",
  "awaiting_approval",
  "approved",
  "queued",
  "scheduled",
  "publishing",
  "published",
  "published_with_warning",
  "failed",
  "cancelled",
] as const;
export type PostStatus = typeof POST_STATUSES[number];

// Default slot times (configurable per client in a future phase)
export const DEFAULT_SLOT_TIMES = {
  morning:   "08:00",
  afternoon: "13:00",
  evening:   "19:00",
} as const;

// ── Idempotency ───────────────────────────────────────────────────────────────

export function deriveAttemptId(
  postId:        string,
  platform:      string,
  attemptNumber: number,
): string {
  return createHash("sha256")
    .update(`${postId}::${platform}::${attemptNumber}`)
    .digest("hex")
    .slice(0, 32);
}

// ── Sanitize error messages ────────────────────────────────────────────────────

const SECRET_PATTERNS = [
  /access_token=[^&\s"']*/gi,
  /Bearer\s+[A-Za-z0-9._\-]+/gi,
  /eyJ[A-Za-z0-9._\-]+/g,          // JWT-shaped tokens
  /\b[A-Za-z0-9]{40,}\b/g,          // Long opaque tokens (>40 chars)
];

export function sanitizeError(raw: string): string {
  let s = raw;
  for (const pattern of SECRET_PATTERNS) {
    s = s.replace(pattern, "[REDACTED]");
  }
  // Truncate to reasonable length
  return s.slice(0, 500);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

export async function bootstrapPlatformDeliveries(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_deliveries (
      id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id             UUID        NOT NULL,
      user_id             TEXT        NOT NULL,
      platform            TEXT        NOT NULL,
      status              TEXT        NOT NULL DEFAULT 'pending',
      attempt_number      INTEGER     NOT NULL DEFAULT 1,
      attempt_id          TEXT        UNIQUE,
      external_post_id    TEXT,
      external_post_url   TEXT,
      api_response_status INTEGER,
      published_at        TIMESTAMPTZ,
      failed_at           TIMESTAMPTZ,
      error_message       TEXT,
      error_code          TEXT,
      retry_allowed       BOOLEAN     NOT NULL DEFAULT TRUE,
      retry_count         INTEGER     NOT NULL DEFAULT 0,
      approved_by         TEXT,
      published_by        TEXT,
      metadata            TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_pd_post_id   ON platform_deliveries(post_id);
    CREATE INDEX IF NOT EXISTS idx_pd_user_id   ON platform_deliveries(user_id);
    CREATE INDEX IF NOT EXISTS idx_pd_platform  ON platform_deliveries(platform);
    CREATE INDEX IF NOT EXISTS idx_pd_status    ON platform_deliveries(status);
  `);

  // V6 columns for social_posts (idempotent)
  await pool.query(`
    ALTER TABLE social_posts
      ADD COLUMN IF NOT EXISTS time_slot          TEXT,
      ADD COLUMN IF NOT EXISTS slot_index         TEXT,
      ADD COLUMN IF NOT EXISTS campaign_slot_key  TEXT,
      ADD COLUMN IF NOT EXISTS posts_per_day      TEXT,
      ADD COLUMN IF NOT EXISTS published_by       TEXT,
      ADD COLUMN IF NOT EXISTS cancelled_at       TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS cancelled_by       TEXT,
      ADD COLUMN IF NOT EXISTS cancel_reason      TEXT;
  `);
}

// ── Pre-flight validation ─────────────────────────────────────────────────────

export async function validatePreFlight(
  postId:  string,
  userId:  string,
): Promise<PreFlightResult> {
  const [post] = await db
    .select()
    .from(socialPostsTable)
    .where(and(eq(socialPostsTable.id, postId), eq(socialPostsTable.userId, userId)));

  if (!post) {
    return {
      approved:    false,
      platforms:   [],
      canProceed:  false,
      blockers:    ["Post not found or access denied"],
    };
  }

  const blockers: string[] = [];

  // Approval gate
  const approved = post.approvalStatus === "approved";
  if (!approved) {
    blockers.push(
      post.approvalStatus === "pending_review"
        ? "Post is awaiting approval — approve it before publishing"
        : "Post must be approved before publishing",
    );
  }

  // Platforms
  const platforms: string[] = JSON.parse(post.platforms || "[]");
  if (platforms.length === 0) {
    blockers.push("No platforms selected");
  }

  // Per-platform validation
  const platformValidations: PlatformValidation[] = await Promise.all(
    platforms.map(p => validatePlatform(p, post, userId)),
  );

  const unconnected = platformValidations.filter(v => !v.connected).map(v => v.platform);
  if (unconnected.length === platforms.length && platforms.length > 0) {
    blockers.push(`No platforms are connected: ${unconnected.join(", ")}`);
  }

  return {
    approved,
    platforms:  platformValidations,
    canProceed: blockers.length === 0,
    blockers,
  };
}

async function validatePlatform(
  platform: string,
  post:     typeof socialPostsTable.$inferSelect,
  userId:   string,
): Promise<PlatformValidation> {
  const providerKey = platform === "google" ? "google_business" : platform;

  const [conn] = await db
    .select({ provider: socialConnectionsTable.provider, expiresAt: socialConnectionsTable.expiresAt })
    .from(socialConnectionsTable)
    .where(and(
      eq(socialConnectionsTable.userId, userId),
      eq(socialConnectionsTable.provider, providerKey),
    ));

  const connected = !!conn;
  const expired   = conn?.expiresAt ? conn.expiresAt < new Date() : false;

  if (!connected) {
    return { platform, connected: false, mediaValid: false, reason: "Not connected — link account in Connected Accounts", canPublish: false };
  }
  if (expired) {
    return { platform, connected: true, mediaValid: false, reason: "Token expired — reconnect account", canPublish: false };
  }

  // Media validations
  const hasVideo = !!(post as any).videoUrl;
  const hasImage = !!(post.imageData || (post as any).matchedImageUrl);

  if (platform === "youtube" && !hasVideo) {
    return {
      platform, connected: true, mediaValid: false,
      reason: "YouTube requires video content — add a video URL. Text/metadata only; not publishable.",
      canPublish: false,
    };
  }
  if (platform === "tiktok" && !hasVideo) {
    return { platform, connected: true, mediaValid: false, reason: "TikTok requires video content", canPublish: false };
  }
  if (platform === "instagram" && !hasImage) {
    return { platform, connected: true, mediaValid: false, reason: "Instagram requires an image (public URL)", canPublish: false };
  }

  return { platform, connected: true, mediaValid: true, reason: null, canPublish: true };
}

// ── Main publish orchestration ─────────────────────────────────────────────────

export class PublishingService {
  /**
   * Publish a post to all its selected platforms.
   *
   * @param postId      - social_posts.id
   * @param userId      - Clerk userId (tenant isolation)
   * @param triggeredBy - Clerk userId or "scheduler" (audit trail)
   * @param internalBase - base URL for calling internal publish route (e.g. http://127.0.0.1:8080)
   */
  async publishPost(
    postId:       string,
    userId:       string,
    triggeredBy:  string,
    internalBase: string,
    schedulerSecret?: string,
  ): Promise<PublishResult> {
    // ── Step 1: Resolve post ─────────────────────────────────────────────────
    const [post] = await db
      .select()
      .from(socialPostsTable)
      .where(and(eq(socialPostsTable.id, postId), eq(socialPostsTable.userId, userId)));

    if (!post) {
      return this.errorResult(postId, "Post not found or access denied");
    }

    // ── Step 2: Approval gate ────────────────────────────────────────────────
    if (post.approvalStatus !== "approved") {
      return this.errorResult(postId, `Post must be approved before publishing (current: ${post.approvalStatus ?? "none"})`);
    }

    // ── Step 3: Validate platforms ───────────────────────────────────────────
    const platforms: string[] = JSON.parse(post.platforms || "[]");
    if (platforms.length === 0) {
      return this.errorResult(postId, "No platforms selected on this post");
    }

    // Claims are rechecked at the final delivery boundary so stale, edited,
    // imported, or scheduler-selected content cannot bypass generation-time checks.
    const claimsDecision = evaluateContentClaims([
      post.caption,
      post.captionFacebook,
      post.captionGoogle,
      post.youtubeTitle,
    ].filter(Boolean).join("\n"));
    if (!claimsDecision.allowed) {
      return this.errorResult(postId, `Content blocked by claims policy: ${claimsDecision.violations.join(", ")}`);
    }

    // ── Step 4: Check post isn't already published/publishing (idempotency) ──
    if (post.status === "published") {
      return this.errorResult(postId, "Post is already published");
    }
    if (post.status === "publishing") {
      return this.errorResult(postId, "Post is already being published — wait for the current attempt to complete");
    }

    // ── Step 5: Create platform_delivery records ─────────────────────────────
    const deliveries: PlatformDelivery[] = [];
    for (const platform of platforms) {
      // Find existing delivery for this platform (for retry flow)
      const existing = await this.getLatestDelivery(postId, platform, userId);
      const attemptNumber = existing ? existing.attemptNumber + 1 : 1;
      const attemptId     = deriveAttemptId(postId, platform, attemptNumber);

      // Check for idempotency hit on this exact attempt
      if (existing?.attemptId === attemptId && existing.status === "published") {
        deliveries.push(existing);
        continue;
      }

      const [delivery] = await db.insert(platformDeliveriesTable).values({
        postId,
        userId,
        platform,
        status:        "publishing",
        attemptNumber,
        attemptId,
        approvedBy:    post.approvedBy ?? null,
        publishedBy:   triggeredBy,
      }).returning();

      deliveries.push(delivery);
    }

    // ── Step 6: Mark post as publishing ─────────────────────────────────────
    await db.update(socialPostsTable).set({
      status:      "publishing",
      publishedBy: triggeredBy,
      updatedAt:   new Date(),
    }).where(and(eq(socialPostsTable.id, postId), eq(socialPostsTable.userId, userId)));

    // ── Step 7: Call platform adapters via internal publish route ────────────
    //
    // We delegate to the existing /publish route which contains all the
    // platform adapter logic. This preserves backward compatibility while
    // the service layer adds delivery tracking and idempotency.
    let adapterResults: Record<string, { ok: boolean; error?: string; postId?: string; postUrl?: string }> = {};

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (schedulerSecret) {
        headers["x-scheduler-secret"] = schedulerSecret;
      } else {
        // For user-triggered publishes, the userId is injected via body
        headers["x-internal-user-id"] = userId;
      }

      const res = await fetch(`${internalBase}/api/social-posts/${postId}/publish`, {
        method: "POST",
        headers,
      });

      if (res.ok || res.status < 500) {
        const data = await res.json() as any;
        adapterResults = data.results ?? {};
      }
    } catch (e: unknown) {
      const msg = sanitizeError(e instanceof Error ? e.message : String(e));
      console.error(`[PUBLISHING-SERVICE] adapter call failed for post=${postId}:`, msg);
    }

    // ── Step 8: Map adapter results → delivery records ───────────────────────
    const attemptResults: DeliveryAttemptResult[] = [];
    let publishedCount = 0;
    let failedCount    = 0;
    let skippedCount   = 0;
    let warningCount   = 0;

    for (const delivery of deliveries) {
      const adapterResult = adapterResults[delivery.platform];

      let newStatus: string;
      let externalPostId:  string | null = null;
      let externalPostUrl: string | null = null;
      let errorMessage:    string | null = null;
      let publishedAt:     Date | null   = null;
      let failedAt:        Date | null   = null;

      if (!adapterResult) {
        // Platform was not reached — mark as failed
        newStatus    = "failed";
        errorMessage = "Platform adapter did not return a result";
        failedAt     = new Date();
        failedCount++;
      } else if (
        adapterResult.ok &&
        (adapterResult.postId || adapterResult.postUrl)
      ) {
        newStatus       = "published";
        externalPostId  = adapterResult.postId ?? null;
        externalPostUrl = adapterResult.postUrl ?? null;
        publishedAt     = new Date();
        publishedCount++;
      } else if (adapterResult.ok) {
        newStatus    = "failed";
        errorMessage = "Provider reported success without an external post receipt";
        failedAt     = new Date();
        failedCount++;
      } else {
        const sanitized = sanitizeError(adapterResult.error ?? "Unknown error");
        // Distinguish skipped (media validation) from hard failures
        if (sanitized.includes("requires video") || sanitized.includes("requires image") || sanitized.includes("Skipped")) {
          newStatus    = "skipped";
          errorMessage = sanitized;
          skippedCount++;
        } else {
          newStatus    = "failed";
          errorMessage = sanitized;
          failedAt     = new Date();
          failedCount++;
        }
      }

      await db.update(platformDeliveriesTable).set({
        status:          newStatus,
        externalPostId,
        externalPostUrl,
        errorMessage,
        publishedAt:     publishedAt ?? undefined,
        failedAt:        failedAt ?? undefined,
        updatedAt:       new Date(),
      }).where(eq(platformDeliveriesTable.id, delivery.id));

      attemptResults.push({
        platform:        delivery.platform,
        deliveryId:      delivery.id,
        status:          newStatus as DeliveryAttemptResult["status"],
        externalPostId,
        externalPostUrl,
        errorMessage,
        apiResponseStatus: null,
      });
    }

    // ── Step 9: Compute final post status ────────────────────────────────────
    let finalPostStatus: string;
    if (publishedCount > 0 && failedCount === 0 && skippedCount === 0) {
      finalPostStatus = "published";
    } else if (publishedCount > 0 && (failedCount > 0 || warningCount > 0)) {
      finalPostStatus = "published_with_warning";
    } else if (publishedCount === 0 && skippedCount === platforms.length) {
      finalPostStatus = "failed"; // All skipped = validation failure
    } else if (publishedCount === 0) {
      finalPostStatus = "failed";
    } else {
      finalPostStatus = "published_with_warning";
    }

    const publishedAt = publishedCount > 0 ? new Date() : null;

    await db.update(socialPostsTable).set({
      status:      finalPostStatus,
      publishedAt: publishedAt ?? undefined,
      updatedAt:   new Date(),
    }).where(and(eq(socialPostsTable.id, postId), eq(socialPostsTable.userId, userId)));

    // ── Step 10: Build summary ───────────────────────────────────────────────
    const total = platforms.length;
    const parts: string[] = [];
    if (publishedCount > 0) parts.push(`${publishedCount} of ${total} published successfully`);
    if (failedCount > 0)    parts.push(`${failedCount} failed`);
    if (skippedCount > 0)   parts.push(`${skippedCount} skipped (media requirement not met)`);

    const failedPlatforms = attemptResults.filter(r => r.status === "failed").map(r => r.platform);
    const summary = parts.join(". ") +
      (failedPlatforms.length > 0 ? `. ${failedPlatforms.map(p => formatPlatform(p)).join(", ")} ${failedPlatforms.length === 1 ? "requires" : "require"} attention.` : ".");

    return {
      postId,
      postStatus:     finalPostStatus,
      totalPlatforms: total,
      published:      publishedCount,
      failed:         failedCount,
      skipped:        skippedCount,
      warnings:       warningCount,
      deliveries:     attemptResults,
      summary,
    };
  }

  /**
   * Retry a single failed or skipped delivery.
   * Creates a new delivery record with attempt_number + 1.
   */
  async retryDelivery(
    deliveryId:   string,
    userId:       string,
    triggeredBy:  string,
    internalBase: string,
    schedulerSecret?: string,
  ): Promise<DeliveryAttemptResult> {
    const [existing] = await db
      .select()
      .from(platformDeliveriesTable)
      .where(and(
        eq(platformDeliveriesTable.id, deliveryId),
        eq(platformDeliveriesTable.userId, userId),
      ));

    if (!existing) {
      return { platform: "unknown", deliveryId, status: "failed", externalPostId: null, externalPostUrl: null, errorMessage: "Delivery not found", apiResponseStatus: null };
    }

    if (!existing.retryAllowed) {
      return { platform: existing.platform, deliveryId, status: "failed", externalPostId: null, externalPostUrl: null, errorMessage: "Retry not allowed for this delivery", apiResponseStatus: null };
    }

    if (existing.status === "published") {
      return { platform: existing.platform, deliveryId, status: "idempotency_hit", externalPostId: existing.externalPostId, externalPostUrl: existing.externalPostUrl, errorMessage: null, apiResponseStatus: null };
    }

    // Delegate to publishPost (it handles attempt_number increment)
    const result = await this.publishPost(existing.postId, userId, triggeredBy, internalBase, schedulerSecret);
    const deliveryResult = result.deliveries.find(d => d.platform === existing.platform);
    return deliveryResult ?? { platform: existing.platform, deliveryId, status: "failed", externalPostId: null, externalPostUrl: null, errorMessage: "Retry failed — no result returned", apiResponseStatus: null };
  }

  private async getLatestDelivery(
    postId:   string,
    platform: string,
    userId:   string,
  ): Promise<PlatformDelivery | null> {
    const rows = await db
      .select()
      .from(platformDeliveriesTable)
      .where(and(
        eq(platformDeliveriesTable.postId, postId),
        eq(platformDeliveriesTable.platform, platform),
        eq(platformDeliveriesTable.userId, userId),
      ))
      .orderBy(platformDeliveriesTable.attemptNumber);

    return rows[rows.length - 1] ?? null;
  }

  private errorResult(postId: string, message: string): PublishResult {
    return {
      postId,
      postStatus:     "failed",
      totalPlatforms: 0,
      published:      0,
      failed:         1,
      skipped:        0,
      warnings:       0,
      deliveries:     [],
      summary:        sanitizeError(message),
    };
  }
}

function formatPlatform(p: string): string {
  const names: Record<string, string> = {
    facebook:  "Facebook",
    instagram: "Instagram",
    google:    "Google Business Profile",
    youtube:   "YouTube",
    tiktok:    "TikTok",
  };
  return names[p] ?? p;
}

export const publishingService = new PublishingService();

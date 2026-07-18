/**
 * GBP Audit & Optimization Engine — API Route
 *
 * Endpoints:
 *   POST /api/gbp/audit/run      — trigger a new audit (gathers local + GBP API data, scores)
 *   GET  /api/gbp/audit/latest   — latest snapshot + checks for a client
 *   GET  /api/gbp/audit/history  — paginated list of past snapshots
 *
 * Schema note:
 *   CREATE TABLE DDL lives exclusively in lib/schema-migrate.ts (canonical).
 *   This file holds only ALTER TABLE guards for columns added after the initial
 *   deployment.  If you add a column to lib/db/src/schema/gbp-audit.ts you MUST
 *   update schema-migrate.ts (CREATE TABLE + ALTER TABLE guard) — do NOT add
 *   another CREATE TABLE here.
 *
 * Phase 2: fetches live data from:
 *   - mybusinessbusinessinformation.googleapis.com  (location profile, hours, categories, etc.)
 *   - mybusiness.googleapis.com/v4 (media items, reviews)
 */

import { Router }   from "express";
import { getAuth }  from "@clerk/express";
import { pool, db, eq, and, sql } from "@workspace/db";
import { desc } from "drizzle-orm";
import {
  localPresenceProfilesTable,
  socialConnectionsTable,
  reviewPlatformStatsTable,
  socialPostsTable,
  gbpAuditSnapshotsTable,
  gbpAuditChecksTable,
} from "@workspace/db";
import { evaluateGbpAudit, type GbpAuditInput, type GbpLiveData } from "@workspace/db";
import { fetchGbpLiveData } from "../lib/gbp-live-data";

const router = Router();

// ── Bootstrap: ALTER TABLE guards only ───────────────────────────────────────
// CREATE TABLE DDL lives in lib/schema-migrate.ts (runs before any route fires).
// This function adds only columns that may be absent on tables created by an
// older version of schema-migrate.ts.  Do NOT add CREATE TABLE statements here.
// See also: lib/db/src/schema/gbp-audit.ts for the Drizzle column definitions.

async function bootstrapGbpAuditColumns(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      -- api_score / api_max_score added in Phase 2; guard for pre-Phase-2 deployments.
      ALTER TABLE gbp_audit_snapshots
        ADD COLUMN IF NOT EXISTS api_score     INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS api_max_score INTEGER NOT NULL DEFAULT 0;
    `);
  } finally {
    client.release();
  }
}

// Runs once at startup (fire-and-forget); schema-migrate.ts guarantees tables exist.
bootstrapGbpAuditColumns().catch(err =>
  console.error("[gbp-audit] column bootstrap failed:", err)
);

// ── Data gathering ─────────────────────────────────────────────────────────────

async function gatherAuditInput(
  clientId: string,
  userId:   string,
): Promise<GbpAuditInput> {
  // 1. NAP profile
  const [profile] = await db
    .select()
    .from(localPresenceProfilesTable)
    .where(eq(localPresenceProfilesTable.clientId, clientId));

  // 2. Google Business connection
  const [gbpRow] = await db
    .select()
    .from(socialConnectionsTable)
    .where(
      and(
        eq(socialConnectionsTable.userId, userId),
        eq(socialConnectionsTable.provider, "google_business"),
      )
    );

  let googleConnection: GbpAuditInput["googleConnection"] = null;
  if (gbpRow) {
    let meta: Record<string, unknown> = {};
    try { meta = typeof gbpRow.metadata === "string" ? JSON.parse(gbpRow.metadata) : (gbpRow.metadata ?? {}); }
    catch { /* ignore */ }

    const locationName  = (meta.locationName  as string | null) ?? null;
    const locationTitle = (meta.locationTitle as string | null) ?? (meta.primaryLocationTitle as string | null) ?? null;
    const accountName   = (meta.accountName  as string | null) ?? null;

    googleConnection = {
      connected:    !!(gbpRow.accessToken && locationName),
      locationName,
      locationTitle,
      accountName,
      tokenExists:  !!(gbpRow.accessToken),
    };
  }

  // 3. Review stats (platform = 'google')
  const [reviewRow] = await db
    .select()
    .from(reviewPlatformStatsTable)
    .where(eq(reviewPlatformStatsTable.platform, "google"));

  const reviewStats: GbpAuditInput["reviewStats"] = reviewRow
    ? {
        reviewCount:   reviewRow.reviewCount,
        averageRating: parseFloat(String(reviewRow.averageRating)) || 0,
      }
    : null;

  // 4. Google posts (last 30 days, published)
  const postsResult = await db.execute<{
    total_last_30:  string;
    total_last_14:  string;
    with_image_30:  string;
  }>(sql`
    SELECT
      COUNT(*)                                                 AS total_last_30,
      COUNT(*) FILTER (WHERE published_at > NOW() - INTERVAL '14 days') AS total_last_14,
      COUNT(*) FILTER (
        WHERE (image_data IS NOT NULL OR matched_image_url IS NOT NULL)
          AND published_at > NOW() - INTERVAL '30 days'
      )                                                        AS with_image_30
    FROM social_posts
    WHERE user_id    = ${userId}
      AND status     = 'published'
      AND published_at > NOW() - INTERVAL '30 days'
      AND platforms::jsonb ? 'google'
  `);

  const pr = postsResult.rows[0];
  const googlePosts: GbpAuditInput["googlePosts"] = pr
    ? {
        totalLast30Days:          parseInt(pr.total_last_30, 10)  || 0,
        totalLast14Days:          parseInt(pr.total_last_14, 10)  || 0,
        postsWithImageLast30Days: parseInt(pr.with_image_30, 10)  || 0,
      }
    : { totalLast30Days: 0, totalLast14Days: 0, postsWithImageLast30Days: 0 };

  return {
    profile: profile
      ? {
          businessName: profile.businessName,
          phone:        profile.phone   ?? null,
          website:      profile.website ?? null,
          address:      profile.address ?? null,
          city:         profile.city    ?? null,
          state:        profile.state   ?? null,
          zip:          profile.zip     ?? null,
        }
      : null,
    googleConnection,
    reviewStats,
    googlePosts,
  };
}

// ── POST /api/gbp/audit/run ───────────────────────────────────────────────────

router.post("/gbp/audit/run", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const clientId = (req.body?.clientId as string | undefined) || "default";

  try {
    // Insert snapshot as "running"
    const [snap] = await db
      .insert(gbpAuditSnapshotsTable)
      .values({ clientId, userId, status: "running", startedAt: new Date() })
      .returning();

    // Gather local input
    const input = await gatherAuditInput(clientId, userId);

    // Phase 2: fetch live GBP data when the token + location are available.
    // Failures are non-fatal — the engine degrades affected checks to data_pending.
    let liveData: GbpLiveData | null = null;
    const conn = input.googleConnection;
    if (conn?.connected && conn.locationName && conn.tokenExists) {
      const [gbpRow] = await db
        .select()
        .from(socialConnectionsTable)
        .where(
          and(
            eq(socialConnectionsTable.userId, userId),
            eq(socialConnectionsTable.provider, "google_business"),
          )
        );
      if (gbpRow?.accessToken) {
        try {
          liveData = await fetchGbpLiveData({
            accessToken:  gbpRow.accessToken,
            refreshToken: gbpRow.refreshToken ?? null,
            expiresAt:    gbpRow.expiresAt    ?? null,
            userId,
            locationName: conn.locationName,
            accountName:  (conn.accountName ?? conn.locationName.split("/locations/")[0]),
          });
          console.log(`[gbp-audit] liveData fetched: errors=${JSON.stringify(liveData.errors)}`);
        } catch (liveErr: any) {
          console.warn(`[gbp-audit] liveData fetch error (non-fatal): ${liveErr?.message}`);
        }
      }
    }

    // Evaluate — Phase 1 path when liveData is null (no token / not connected)
    const result = evaluateGbpAudit(input, liveData);

    // Persist checks
    if (result.checks.length > 0) {
      await db.insert(gbpAuditChecksTable).values(
        result.checks.map(c => ({
          snapshotId:     snap.id,
          clientId,
          category:       c.category,
          checkKey:       c.checkKey,
          checkLabel:     c.checkLabel,
          evidenceType:   c.evidenceType,
          status:         c.status,
          score:          c.score,
          maxScore:       c.maxScore,
          priority:       c.priority,
          currentValue:   c.currentValue ?? null,
          recommendation: c.recommendation ?? null,
          rawData:        c.rawData,
        }))
      );
    }

    // Update snapshot as "complete"
    const [updated] = await db
      .update(gbpAuditSnapshotsTable)
      .set({
        status:        "complete",
        localScore:    result.localScore,
        localMaxScore: result.localMaxScore,
        apiScore:      result.apiScore,
        apiMaxScore:   result.apiMaxScore,
        overallScore:  result.overallScore,
        maxScore:      result.maxScore,
        checksPassed:  result.checksPassed,
        checksWarning: result.checksWarning,
        checksFailed:  result.checksFailed,
        checksPending: result.checksPending,
        locationName:  input.googleConnection?.locationName  ?? null,
        locationTitle: input.googleConnection?.locationTitle ?? null,
        gbpConnected:  input.googleConnection?.connected ?? false,
        completedAt:   new Date(),
        updatedAt:     new Date(),
      })
      .where(eq(gbpAuditSnapshotsTable.id, snap.id))
      .returning();

    const apiCallsMade = liveData !== null;
    const apiErrors    = liveData ? Object.values(liveData.errors).filter(Boolean) : [];

    return res.json({
      snapshot:      updated,
      checkCount:    result.checks.length,
      apiCallsMade,
      apiErrors:     apiErrors.length > 0 ? apiErrors : undefined,
    });
  } catch (err) {
    console.error("[gbp-audit] run error:", err);
    return res.status(500).json({ error: "Audit failed" });
  }
});

// ── GET /api/gbp/audit/latest ─────────────────────────────────────────────────

router.get("/gbp/audit/latest", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const clientId = (req.query.clientId as string | undefined) || "default";

  try {
    const [snap] = await db
      .select()
      .from(gbpAuditSnapshotsTable)
      .where(
        and(
          eq(gbpAuditSnapshotsTable.clientId, clientId),
          eq(gbpAuditSnapshotsTable.status, "complete"),
        )
      )
      .orderBy(desc(gbpAuditSnapshotsTable.createdAt))
      .limit(1);

    if (!snap) return res.json({ snapshot: null, checks: [] });

    const checks = await db
      .select()
      .from(gbpAuditChecksTable)
      .where(eq(gbpAuditChecksTable.snapshotId, snap.id))
      .orderBy(gbpAuditChecksTable.createdAt);

    return res.json({ snapshot: snap, checks });
  } catch (err) {
    console.error("[gbp-audit] latest error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/gbp/audit/history ────────────────────────────────────────────────

router.get("/gbp/audit/history", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const clientId = (req.query.clientId as string | undefined) || "default";
  const limit    = Math.min(parseInt((req.query.limit as string) || "10", 10), 50);

  try {
    const snapshots = await db
      .select()
      .from(gbpAuditSnapshotsTable)
      .where(eq(gbpAuditSnapshotsTable.clientId, clientId))
      .orderBy(desc(gbpAuditSnapshotsTable.createdAt))
      .limit(limit);

    return res.json({ snapshots });
  } catch (err) {
    console.error("[gbp-audit] history error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;

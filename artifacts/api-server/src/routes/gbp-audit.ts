/**
 * GBP Audit & Optimization Engine — API Route
 *
 * Endpoints:
 *   POST /api/gbp/audit/run      — trigger a new audit (gathers local data, scores)
 *   GET  /api/gbp/audit/latest   — latest snapshot + checks for a client
 *   GET  /api/gbp/audit/history  — paginated list of past snapshots
 *
 * Tables bootstrapped here via raw SQL (same pattern as call-intelligence and
 * integration-health-history — drizzle-kit push is blocked by pre-existing
 * unique constraint conflicts).
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
import { evaluateGbpAudit, type GbpAuditInput } from "@workspace/db";

const router = Router();

// ── Bootstrap: create tables if they don't exist ─────────────────────────────

async function bootstrapGbpAuditTables(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS gbp_audit_snapshots (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id       TEXT NOT NULL,
        user_id         TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pending',
        local_score     INTEGER NOT NULL DEFAULT 0,
        local_max_score INTEGER NOT NULL DEFAULT 0,
        overall_score   INTEGER NOT NULL DEFAULT 0,
        max_score       INTEGER NOT NULL DEFAULT 100,
        checks_passed   INTEGER NOT NULL DEFAULT 0,
        checks_warning  INTEGER NOT NULL DEFAULT 0,
        checks_failed   INTEGER NOT NULL DEFAULT 0,
        checks_pending  INTEGER NOT NULL DEFAULT 0,
        location_name   TEXT,
        location_title  TEXT,
        gbp_connected   BOOLEAN NOT NULL DEFAULT FALSE,
        error_message   TEXT,
        started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at    TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS gbp_audit_checks (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        snapshot_id     TEXT NOT NULL,
        client_id       TEXT NOT NULL,
        category        TEXT NOT NULL,
        check_key       TEXT NOT NULL,
        check_label     TEXT NOT NULL,
        evidence_type   TEXT NOT NULL DEFAULT 'local',
        status          TEXT NOT NULL DEFAULT 'data_pending',
        score           INTEGER NOT NULL DEFAULT 0,
        max_score       INTEGER NOT NULL DEFAULT 0,
        priority        TEXT NOT NULL DEFAULT 'medium',
        current_value   TEXT,
        recommendation  TEXT,
        raw_data        JSONB NOT NULL DEFAULT '{}',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS gbp_audit_snapshots_client_id_created_at
        ON gbp_audit_snapshots(client_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS gbp_audit_checks_snapshot_id
        ON gbp_audit_checks(snapshot_id);

      CREATE INDEX IF NOT EXISTS gbp_audit_checks_client_id
        ON gbp_audit_checks(client_id);
    `);
  } finally {
    client.release();
  }
}

// Bootstrap runs once at startup (fire-and-forget with error log)
bootstrapGbpAuditTables().catch(err =>
  console.error("[gbp-audit] bootstrap failed:", err)
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

    // Gather and evaluate
    const input  = await gatherAuditInput(clientId, userId);
    const result = evaluateGbpAudit(input);

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

    return res.json({ snapshot: updated, checkCount: result.checks.length });
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

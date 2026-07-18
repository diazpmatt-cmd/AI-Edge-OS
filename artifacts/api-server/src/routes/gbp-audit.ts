/**
 * GBP Audit & Optimization Engine — API Route
 *
 * Endpoints:
 *   POST  /api/gbp/audit/run               — trigger a new audit
 *   GET   /api/gbp/audit/latest            — latest snapshot + checks
 *   GET   /api/gbp/audit/history           — paginated snapshot list
 *   GET   /api/gbp/audit/optimizations     — persisted optimization opportunities
 *   PATCH /api/gbp/audit/optimizations/:id — mark opportunity resolved/unresolved
 *   GET   /api/gbp/audit/trend             — trend summary (last 2 audits)
 *
 * Schema note:
 *   CREATE TABLE DDL lives in artifacts/api-server/src/lib/schema-migrate.ts.
 *   This file holds only ALTER TABLE guards for columns added after initial deployment.
 *
 * Phase 2: fetches live data from the GBP Business Information + Media APIs.
 * Phase 3: generates and persists prioritized optimization opportunities.
 */

import { Router }   from "express";
import { getAuth }  from "@clerk/express";
import { pool, db, eq, and, ne, sql } from "@workspace/db";
import { desc } from "drizzle-orm";
import {
  localPresenceProfilesTable,
  socialConnectionsTable,
  reviewPlatformStatsTable,
  socialPostsTable,
  gbpAuditSnapshotsTable,
  gbpAuditChecksTable,
  gbpOptimizationOpportunitiesTable,
} from "@workspace/db";
import {
  evaluateGbpAudit,
  generateOptimizations,
  type GbpAuditInput,
  type GbpAuditResult,
  type GbpCheckResult,
  type GbpLiveData,
} from "@workspace/db";
import { fetchGbpLiveData } from "../lib/gbp-live-data";

const router = Router();

// ── Bootstrap: ALTER TABLE guards only ───────────────────────────────────────

async function bootstrapGbpAuditColumns(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE gbp_audit_snapshots
        ADD COLUMN IF NOT EXISTS api_score     INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS api_max_score INTEGER NOT NULL DEFAULT 0;
    `);
  } finally {
    client.release();
  }
}

bootstrapGbpAuditColumns().catch(err =>
  console.error("[gbp-audit] column bootstrap failed:", err)
);

// ── Optimization helpers ──────────────────────────────────────────────────────

type PrevOppRow = {
  checkKey:   string;
  resolved:   boolean;
  resolvedAt: Date | null;
};

/**
 * Reconstruct a minimal GbpAuditResult from persisted snapshot + check rows
 * so we can pass it to generateOptimizations() without re-running the audit.
 */
function reconstructAuditResult(
  snap:   typeof gbpAuditSnapshotsTable.$inferSelect,
  checks: (typeof gbpAuditChecksTable.$inferSelect)[],
): GbpAuditResult {
  return {
    localScore:    snap.localScore,
    localMaxScore: snap.localMaxScore,
    apiScore:      snap.apiScore  ?? 0,
    apiMaxScore:   snap.apiMaxScore ?? 0,
    overallScore:  snap.overallScore,
    maxScore:      snap.maxScore,
    checksPassed:  snap.checksPassed,
    checksWarning: snap.checksWarning,
    checksFailed:  snap.checksFailed,
    checksPending: snap.checksPending,
    checks:        checks.map(c => ({
      category:       c.category      as GbpCheckResult["category"],
      checkKey:       c.checkKey,
      checkLabel:     c.checkLabel,
      evidenceType:   c.evidenceType  as GbpCheckResult["evidenceType"],
      status:         c.status        as GbpCheckResult["status"],
      score:          c.score,
      maxScore:       c.maxScore,
      priority:       c.priority      as GbpCheckResult["priority"],
      currentValue:   c.currentValue  ?? null,
      recommendation: c.recommendation ?? null,
      rawData:        (c.rawData as Record<string, unknown>) ?? {},
    })),
  };
}

/**
 * Persist optimization opportunities for a snapshot.
 * Preserves manual "resolved" overrides from the previous snapshot's rows.
 */
async function persistOptimizations(
  snapshotId: string,
  clientId:   string,
  optResult:  ReturnType<typeof generateOptimizations>,
  prevOpps:   PrevOppRow[] | null,
): Promise<void> {
  if (optResult.opportunities.length === 0) return;

  const prevResolved = new Map<string, { resolved: boolean; resolvedAt: Date | null }>(
    (prevOpps ?? [])
      .filter(o => o.resolved)
      .map(o => [o.checkKey, { resolved: o.resolved, resolvedAt: o.resolvedAt }])
  );

  await db.insert(gbpOptimizationOpportunitiesTable).values(
    optResult.opportunities.map(o => {
      const prevState = prevResolved.get(o.id);
      return {
        snapshotId,
        clientId,
        checkKey:                  o.id,
        category:                  o.category,
        title:                     o.title,
        description:               o.description,
        severity:                  o.severity,
        priorityScore:             o.priorityScore,
        estimatedImpact:           o.estimatedImpact,
        implementationDifficulty:  o.implementationDifficulty,
        confidence:                o.confidence,
        evidence:                  o.evidence,
        recommendedAction:         o.recommendedAction,
        supportingGoogleGuideline: o.supportingGoogleGuideline,
        groupName:                 o.group,
        trend:                     o.trend,
        timeEstimate:              o.timeEstimate,
        aiFixAvailable:            o.aiFixAvailable,
        checkStatus:               o.checkStatus,
        resolved:                  prevState?.resolved ?? o.resolved,
        resolvedAt:                prevState?.resolvedAt ?? (o.resolved ? new Date() : null),
      };
    })
  );
}

// ── Data gathering ─────────────────────────────────────────────────────────────

async function gatherAuditInput(
  clientId: string,
  userId:   string,
): Promise<GbpAuditInput> {
  const [profile] = await db
    .select()
    .from(localPresenceProfilesTable)
    .where(eq(localPresenceProfilesTable.clientId, clientId));

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

  const postsResult = await db.execute<{
    total_last_30: string;
    total_last_14: string;
    with_image_30: string;
  }>(sql`
    SELECT
      COUNT(*)                                                                   AS total_last_30,
      COUNT(*) FILTER (WHERE published_at > NOW() - INTERVAL '14 days')        AS total_last_14,
      COUNT(*) FILTER (
        WHERE (image_data IS NOT NULL OR matched_image_url IS NOT NULL)
          AND published_at > NOW() - INTERVAL '30 days'
      )                                                                          AS with_image_30
    FROM social_posts
    WHERE user_id     = ${userId}
      AND status      = 'published'
      AND published_at > NOW() - INTERVAL '30 days'
      AND platforms::jsonb ? 'google'
  `);

  const pr = postsResult.rows[0];
  const googlePosts: GbpAuditInput["googlePosts"] = pr
    ? {
        totalLast30Days:          parseInt(pr.total_last_30, 10) || 0,
        totalLast14Days:          parseInt(pr.total_last_14, 10) || 0,
        postsWithImageLast30Days: parseInt(pr.with_image_30, 10) || 0,
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
    const [snap] = await db
      .insert(gbpAuditSnapshotsTable)
      .values({ clientId, userId, status: "running", startedAt: new Date() })
      .returning();

    const input = await gatherAuditInput(clientId, userId);

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

    const result = evaluateGbpAudit(input, liveData);

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

    // ── Phase 3: generate + persist optimization opportunities ────────────────
    try {
      const [prevSnap] = await db
        .select()
        .from(gbpAuditSnapshotsTable)
        .where(
          and(
            eq(gbpAuditSnapshotsTable.clientId, clientId),
            eq(gbpAuditSnapshotsTable.status, "complete"),
            ne(gbpAuditSnapshotsTable.id, snap.id),
          )
        )
        .orderBy(desc(gbpAuditSnapshotsTable.createdAt))
        .limit(1);

      let prevChecks: GbpCheckResult[] | undefined;
      let prevOpps:   PrevOppRow[] | null = null;

      if (prevSnap) {
        const rawPrevChecks = await db
          .select()
          .from(gbpAuditChecksTable)
          .where(eq(gbpAuditChecksTable.snapshotId, prevSnap.id));

        prevChecks = rawPrevChecks.map(c => ({
          category:       c.category      as GbpCheckResult["category"],
          checkKey:       c.checkKey,
          checkLabel:     c.checkLabel,
          evidenceType:   c.evidenceType  as GbpCheckResult["evidenceType"],
          status:         c.status        as GbpCheckResult["status"],
          score:          c.score,
          maxScore:       c.maxScore,
          priority:       c.priority      as GbpCheckResult["priority"],
          currentValue:   c.currentValue  ?? null,
          recommendation: c.recommendation ?? null,
          rawData:        (c.rawData as Record<string, unknown>) ?? {},
        }));

        prevOpps = await db
          .select({
            checkKey:   gbpOptimizationOpportunitiesTable.checkKey,
            resolved:   gbpOptimizationOpportunitiesTable.resolved,
            resolvedAt: gbpOptimizationOpportunitiesTable.resolvedAt,
          })
          .from(gbpOptimizationOpportunitiesTable)
          .where(eq(gbpOptimizationOpportunitiesTable.snapshotId, prevSnap.id));
      }

      const optResult = generateOptimizations(result, prevChecks);
      await persistOptimizations(snap.id, clientId, optResult, prevOpps);
    } catch (optErr) {
      console.warn("[gbp-audit] optimization persistence failed (non-fatal):", optErr);
    }

    const apiCallsMade = liveData !== null;
    const apiErrors    = liveData ? Object.values(liveData.errors).filter(Boolean) : [];

    return res.json({
      snapshot:   updated,
      checkCount: result.checks.length,
      apiCallsMade,
      apiErrors:  apiErrors.length > 0 ? apiErrors : undefined,
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

// ── GET /api/gbp/audit/optimizations ─────────────────────────────────────────

router.get("/gbp/audit/optimizations", async (req, res) => {
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

    if (!snap) return res.json({ snapshotId: null, snapshotDate: null, opportunities: [] });

    let opps = await db
      .select()
      .from(gbpOptimizationOpportunitiesTable)
      .where(eq(gbpOptimizationOpportunitiesTable.snapshotId, snap.id))
      .orderBy(desc(gbpOptimizationOpportunitiesTable.priorityScore));

    // Pre-Phase-3 snapshot: regenerate + persist on-the-fly
    if (opps.length === 0) {
      const checks = await db
        .select()
        .from(gbpAuditChecksTable)
        .where(eq(gbpAuditChecksTable.snapshotId, snap.id));

      if (checks.length > 0) {
        try {
          const auditResult = reconstructAuditResult(snap, checks);
          const optResult   = generateOptimizations(auditResult);
          await persistOptimizations(snap.id, clientId, optResult, null);
          opps = await db
            .select()
            .from(gbpOptimizationOpportunitiesTable)
            .where(eq(gbpOptimizationOpportunitiesTable.snapshotId, snap.id))
            .orderBy(desc(gbpOptimizationOpportunitiesTable.priorityScore));
        } catch (genErr) {
          console.warn("[gbp-audit] on-the-fly opt generation failed:", genErr);
        }
      }
    }

    return res.json({
      snapshotId:   snap.id,
      snapshotDate: snap.createdAt,
      opportunities: opps,
    });
  } catch (err) {
    console.error("[gbp-audit] optimizations error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── PATCH /api/gbp/audit/optimizations/:id ────────────────────────────────────

router.patch("/gbp/audit/optimizations/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { id }   = req.params;
  const resolved = req.body?.resolved as boolean | undefined;

  if (resolved === undefined) {
    return res.status(400).json({ error: "resolved field required" });
  }

  try {
    const [updated] = await db
      .update(gbpOptimizationOpportunitiesTable)
      .set({
        resolved,
        resolvedAt: resolved ? new Date() : null,
      })
      .where(eq(gbpOptimizationOpportunitiesTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Opportunity not found" });
    return res.json({ opportunity: updated });
  } catch (err) {
    console.error("[gbp-audit] optimizations patch error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/gbp/audit/trend ──────────────────────────────────────────────────

router.get("/gbp/audit/trend", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const clientId = (req.query.clientId as string | undefined) || "default";

  try {
    const snaps = await db
      .select()
      .from(gbpAuditSnapshotsTable)
      .where(
        and(
          eq(gbpAuditSnapshotsTable.clientId, clientId),
          eq(gbpAuditSnapshotsTable.status, "complete"),
        )
      )
      .orderBy(desc(gbpAuditSnapshotsTable.createdAt))
      .limit(2);

    if (snaps.length < 2) return res.json({ trend: null });

    const [curr, prev] = snaps;

    const currOpps = await db
      .select()
      .from(gbpOptimizationOpportunitiesTable)
      .where(eq(gbpOptimizationOpportunitiesTable.snapshotId, curr.id));

    let improved = 0, regressed = 0, newIssues = 0, resolved = 0, unchanged = 0;
    for (const o of currOpps) {
      switch (o.trend) {
        case "improved":   improved++;  break;
        case "regressed":  regressed++; break;
        case "new_issue":  newIssues++; break;
        case "resolved":   resolved++;  break;
        default:           unchanged++; break;
      }
    }

    const currScore = curr.maxScore > 0 ? Math.round((curr.overallScore / curr.maxScore) * 100) : 0;
    const prevScore = prev.maxScore > 0 ? Math.round((prev.overallScore / prev.maxScore) * 100) : 0;

    return res.json({
      trend: {
        improved, regressed, newIssues, resolved, unchanged,
        scoreDelta:    currScore - prevScore,
        currentScore:  currScore,
        previousScore: prevScore,
        currentDate:   curr.createdAt,
        previousDate:  prev.createdAt,
      },
    });
  } catch (err) {
    console.error("[gbp-audit] trend error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;

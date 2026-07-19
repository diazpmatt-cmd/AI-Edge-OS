/**
 * GBP Audit & Optimization Engine — API Route
 *
 * Endpoints:
 *   POST  /api/gbp/audit/run                      — trigger a new audit
 *   GET   /api/gbp/audit/latest                   — latest snapshot + checks
 *   GET   /api/gbp/audit/history                  — paginated snapshot list
 *   GET   /api/gbp/audit/optimizations            — persisted optimization opportunities
 *   PATCH /api/gbp/audit/optimizations/:id        — mark opportunity resolved/unresolved
 *   GET   /api/gbp/audit/trend                    — trend summary (last 2 audits)
 *   GET   /api/gbp/audit/alerts                   — Phase 5: unacknowledged alerts + schedule
 *   PATCH /api/gbp/audit/alerts/:id/acknowledge   — Phase 5: acknowledge an alert
 *   GET   /api/gbp/audit/schedule                 — Phase 5: get schedule settings
 *   PUT   /api/gbp/audit/schedule                 — Phase 5: upsert schedule settings
 *   GET   /api/gbp/audit/competitive              — Phase 6: competitive GBP intelligence
 *   GET   /api/gbp/audit/analytics                — Phase 8: full 90-day trend + category breakdown
 *   GET   /api/gbp/audit/export                   — Phase 8: CSV export of latest audit
 *
 * Schema note:
 *   CREATE TABLE DDL lives in artifacts/api-server/src/lib/schema-migrate.ts.
 *   This file holds only ALTER TABLE guards for columns added after initial deployment.
 *
 * Phase 2: fetches live data from the GBP Business Information + Media APIs.
 * Phase 3: generates and persists prioritized optimization opportunities.
 * Phase 5: automated monitoring, alerts, and scheduling.
 * Phase 6: competitive GBP intelligence via discovery data + benchmarks.
 * Phase 8: enterprise analytics — full trend history + CSV export.
 */

import { Router }           from "express";
import { getAuth }          from "@clerk/express";
import { SCHEDULER_SECRET } from "../lib/scheduler-secret";
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
    .where(and(
      eq(reviewPlatformStatsTable.platform, "google"),
      eq(reviewPlatformStatsTable.clientId, clientId),
    ));

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
    WHERE (client_id = ${clientId} OR (client_id IS NULL AND user_id = ${userId}))
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
  // Scheduler bypass: POST from runGbpAuditMonitor passes scheduler secret + userId
  const schedulerUserId = req.headers["x-scheduler-user-id"] as string | undefined;
  const schedulerAuth   = req.headers["x-scheduler-secret"]  as string | undefined;

  let userId: string;
  if (schedulerAuth === SCHEDULER_SECRET && schedulerUserId) {
    userId = schedulerUserId;
  } else {
    const { userId: clerkUserId } = getAuth(req);
    if (!clerkUserId) return res.status(401).json({ error: "Unauthorized" });
    userId = clerkUserId;
  }

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
    let prevSnap: typeof gbpAuditSnapshotsTable.$inferSelect | undefined;
    try {
      const prevSnaps = await db
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
      prevSnap = prevSnaps[0];

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

    // ── Phase 5: generate alerts (score drop, new critical/high issues) ────────
    try {
      const currPct  = updated.maxScore > 0 ? Math.round((updated.overallScore / updated.maxScore) * 100) : 0;
      const prevPct  = prevSnap && prevSnap.maxScore > 0
        ? Math.round((prevSnap.overallScore / prevSnap.maxScore) * 100)
        : null;
      const critNew  = result.checks.filter(c => c.priority === "critical" && c.status === "fail").length;
      const highNew  = result.checks.filter(c => c.priority === "high" && c.status === "fail").length;
      await generateAndPersistAlerts(clientId, snap.id, currPct, prevPct, critNew, highNew);
    } catch (alertErr) {
      console.warn("[gbp-audit] alert generation failed (non-fatal):", alertErr);
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
  const clientId = (req.body?.clientId as string | undefined) || "default";
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
      .where(and(
        eq(gbpOptimizationOpportunitiesTable.id, id),
        eq(gbpOptimizationOpportunitiesTable.clientId, clientId),
      ))
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

// ── Phase 5: alert generation helper ─────────────────────────────────────────

async function generateAndPersistAlerts(
  clientId:    string,
  snapshotId:  string,
  currScore:   number,
  prevScore:   number | null,
  criticalNew: number,
  highNew:     number,
): Promise<void> {
  const client = await pool.connect();
  try {
    const alerts: Array<{
      alert_type:   string;
      message:      string;
      severity:     string;
      score_before: number | null;
      score_after:  number | null;
    }> = [];

    // Read client-configured alert threshold; default = 10 points.
    const schedRow = await client.query<{ alert_on_drop: number | null }>(
      `SELECT alert_on_drop FROM gbp_audit_schedules WHERE client_id = $1 LIMIT 1`,
      [clientId],
    );
    const rawThreshold = schedRow.rows[0]?.alert_on_drop;
    const alertOnDrop  = (typeof rawThreshold === "number" && rawThreshold > 0) ? rawThreshold : 10;

    if (prevScore !== null && currScore - prevScore <= -alertOnDrop) {
      const dupeCheck = await client.query(
        `SELECT 1 FROM gbp_alert_log WHERE snapshot_id = $1 AND alert_type = 'score_drop' LIMIT 1`,
        [snapshotId],
      );
      if ((dupeCheck.rowCount ?? 0) === 0) {
        alerts.push({
          alert_type:   "score_drop",
          message:      `GBP score dropped ${Math.abs(currScore - prevScore)} points (${prevScore}% → ${currScore}%). Review optimization opportunities to recover.`,
          severity:     currScore < 40 ? "critical" : "warning",
          score_before: prevScore,
          score_after:  currScore,
        });
      }
    }
    if (criticalNew > 0) {
      alerts.push({
        alert_type:   "new_critical",
        message:      `${criticalNew} new critical GBP issue${criticalNew > 1 ? "s" : ""} detected. Immediate attention recommended.`,
        severity:     "critical",
        score_before: null,
        score_after:  null,
      });
    }
    if (highNew > 0 && criticalNew === 0) {
      alerts.push({
        alert_type:   "new_high",
        message:      `${highNew} new high-severity GBP issue${highNew > 1 ? "s" : ""} found. Address these to improve ranking.`,
        severity:     "warning",
        score_before: null,
        score_after:  null,
      });
    }

    for (const alert of alerts) {
      await client.query(
        `INSERT INTO gbp_alert_log (client_id, snapshot_id, alert_type, message, severity, score_before, score_after)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [clientId, snapshotId, alert.alert_type, alert.message, alert.severity, alert.score_before, alert.score_after],
      );
    }

    // Advance next_run_at on the schedule row if it exists
    await client.query(
      `UPDATE gbp_audit_schedules
       SET last_run_at = NOW(),
           next_run_at = NOW() + (cadence_hours || ' hours')::interval,
           updated_at  = NOW()
       WHERE client_id = $1`,
      [clientId],
    );
  } finally {
    client.release();
  }
}

// ── GET /api/gbp/audit/alerts ─────────────────────────────────────────────────

router.get("/gbp/audit/alerts", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const clientId = (req.query.clientId as string | undefined) || "default";

  try {
    const alertsResult = await pool.query<{
      id:           string;
      alert_type:   string;
      message:      string;
      severity:     string;
      score_before: number | null;
      score_after:  number | null;
      acknowledged: boolean;
      created_at:   Date;
    }>(
      `SELECT id, alert_type, message, severity, score_before, score_after, acknowledged, created_at
       FROM gbp_alert_log
       WHERE client_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [clientId],
    );

    const scheduleResult = await pool.query<{
      enabled:       boolean;
      cadence_hours: number;
      next_run_at:   Date | null;
      last_run_at:   Date | null;
    }>(
      `SELECT enabled, cadence_hours, next_run_at, last_run_at
       FROM gbp_audit_schedules
       WHERE client_id = $1`,
      [clientId],
    );

    return res.json({
      alerts:   alertsResult.rows,
      schedule: scheduleResult.rows[0] ?? null,
    });
  } catch (err) {
    console.error("[gbp-audit] alerts error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── PATCH /api/gbp/audit/alerts/:id/acknowledge ───────────────────────────────

router.patch("/gbp/audit/alerts/:id/acknowledge", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { id }   = req.params;
  const clientId = (req.body?.clientId as string | undefined)
    || (req.query.clientId as string | undefined)
    || "default";

  try {
    const result = await pool.query(
      `UPDATE gbp_alert_log SET acknowledged = TRUE WHERE id = $1 AND client_id = $2`,
      [id, clientId],
    );
    if ((result.rowCount ?? 0) === 0) {
      return res.status(404).json({ error: "Alert not found" });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("[gbp-audit] acknowledge error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/gbp/audit/schedule ───────────────────────────────────────────────

router.get("/gbp/audit/schedule", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const clientId = (req.query.clientId as string | undefined) || "default";

  try {
    const result = await pool.query(
      `SELECT * FROM gbp_audit_schedules WHERE client_id = $1`,
      [clientId],
    );
    return res.json({ schedule: result.rows[0] ?? null });
  } catch (err) {
    console.error("[gbp-audit] schedule get error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── PUT /api/gbp/audit/schedule ───────────────────────────────────────────────

router.put("/gbp/audit/schedule", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const {
    clientId     = "default",
    enabled      = false,
    cadenceHours = 168,
    alertOnDrop  = 10,
  } = req.body as {
    clientId?:     string;
    enabled?:      boolean;
    cadenceHours?: number;
    alertOnDrop?:  number;
  };

  try {
    await pool.query(
      `INSERT INTO gbp_audit_schedules (client_id, user_id, enabled, cadence_hours, alert_on_drop, next_run_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $3 THEN NOW() + ($4 || ' hours')::interval ELSE NULL END, NOW())
       ON CONFLICT (client_id) DO UPDATE SET
         enabled       = EXCLUDED.enabled,
         cadence_hours = EXCLUDED.cadence_hours,
         alert_on_drop = EXCLUDED.alert_on_drop,
         next_run_at   = CASE WHEN EXCLUDED.enabled THEN NOW() + (EXCLUDED.cadence_hours || ' hours')::interval ELSE NULL END,
         updated_at    = NOW()`,
      [clientId, userId, enabled, cadenceHours, alertOnDrop],
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("[gbp-audit] schedule put error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/gbp/audit/competitive ────────────────────────────────────────────
// Phase 6: Competitive GBP intelligence.
// Compares your GBP metrics against local competitors surfaced from discovery
// data and industry benchmarks.

router.get("/gbp/audit/competitive", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const clientId = (req.query.clientId as string | undefined) || "default";

  try {
    // Your review metrics
    const [reviewRow] = await db
      .select()
      .from(reviewPlatformStatsTable)
      .where(eq(reviewPlatformStatsTable.platform, "google"));

    // Your post frequency (last 30 days)
    const postResult = await db.execute<{ post_count: string }>(sql`
      SELECT COUNT(*)::text AS post_count
      FROM social_posts
      WHERE user_id    = ${userId}
        AND status     = 'published'
        AND platforms::jsonb ? 'google'
        AND published_at > NOW() - INTERVAL '30 days'
    `);

    const yourReviewCount   = reviewRow?.reviewCount   ?? 0;
    const yourRating        = parseFloat(String(reviewRow?.averageRating ?? 0)) || 0;
    const yourPostsLast30   = parseInt(postResult.rows[0]?.post_count ?? "0", 10);

    // Latest snapshot GBP connection status
    const [snap] = await db
      .select({
        gbpConnected:  gbpAuditSnapshotsTable.gbpConnected,
        overallScore:  gbpAuditSnapshotsTable.overallScore,
        maxScore:      gbpAuditSnapshotsTable.maxScore,
      })
      .from(gbpAuditSnapshotsTable)
      .where(
        and(
          eq(gbpAuditSnapshotsTable.clientId, clientId),
          eq(gbpAuditSnapshotsTable.status, "complete"),
        )
      )
      .orderBy(desc(gbpAuditSnapshotsTable.createdAt))
      .limit(1);

    // Competitor data from discovery engine (graceful degradation)
    let competitors: Array<{ name: string; keywordCount: number }> = [];
    try {
      const compResult = await pool.query<{ competitor_name: string; kw_count: string }>(
        `SELECT
           competitor_name,
           COUNT(*)::text AS kw_count
         FROM discovery_clusters
         WHERE client_id = $1
           AND competitor_name IS NOT NULL
           AND competitor_name != ''
         GROUP BY competitor_name
         ORDER BY kw_count DESC
         LIMIT 8`,
        [clientId],
      );
      competitors = compResult.rows.map(r => ({
        name:         r.competitor_name,
        keywordCount: parseInt(r.kw_count, 10) || 0,
      }));
    } catch {
      // discovery_clusters may not exist or have data yet — that's OK
    }

    // Industry benchmarks (pest control / home services)
    const benchmarks = {
      reviewCountTop10Pct:      100,
      reviewCountMedian:         35,
      averageRatingTarget:      4.5,
      monthlyPostsRecommended:   8,
      monthlyPostsMedian:        3,
    };

    const reviewGap   = Math.max(0, benchmarks.reviewCountMedian - yourReviewCount);
    const postGap     = Math.max(0, benchmarks.monthlyPostsRecommended - yourPostsLast30);
    const ratingGap   = Math.max(0, benchmarks.averageRatingTarget - yourRating);

    const yourGbpScore = snap && snap.maxScore > 0
      ? Math.round((snap.overallScore / snap.maxScore) * 100)
      : 0;

    const competitiveScore = Math.round(
      (yourReviewCount  / benchmarks.reviewCountTop10Pct * 30) +
      (Math.min(yourRating, 5) / 5 * 25) +
      (yourGbpScore / 100 * 25) +
      (Math.min(yourPostsLast30, benchmarks.monthlyPostsRecommended) / benchmarks.monthlyPostsRecommended * 20)
    );

    return res.json({
      yourMetrics: {
        reviewCount:    yourReviewCount,
        averageRating:  yourRating,
        postsLast30:    yourPostsLast30,
        gbpConnected:   snap?.gbpConnected ?? false,
        gbpScore:       yourGbpScore,
      },
      benchmarks,
      competitors,
      gaps: {
        reviewGap,
        postGap,
        ratingGap: parseFloat(ratingGap.toFixed(2)),
        keywordGapCount: competitors.reduce((s, c) => s + c.keywordCount, 0),
      },
      competitiveScore: Math.min(100, Math.max(0, competitiveScore)),
    });
  } catch (err) {
    console.error("[gbp-audit] competitive error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/gbp/audit/analytics ──────────────────────────────────────────────
// Phase 8: Returns up to 90 days of snapshot history for the full trend chart.

router.get("/gbp/audit/analytics", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const clientId = (req.query.clientId as string | undefined) || "default";
  const days     = Math.min(parseInt((req.query.days as string) || "90", 10), 365);

  try {
    const snapshots = await db
      .select()
      .from(gbpAuditSnapshotsTable)
      .where(
        and(
          eq(gbpAuditSnapshotsTable.clientId, clientId),
          eq(gbpAuditSnapshotsTable.status, "complete"),
          sql`${gbpAuditSnapshotsTable.createdAt} > NOW() - (${days} || ' days')::interval`,
        )
      )
      .orderBy(gbpAuditSnapshotsTable.createdAt)
      .limit(365);

    const points = snapshots.map(s => ({
      id:          s.id,
      date:        s.createdAt,
      localScore:  s.localScore,
      localMax:    s.localMaxScore,
      apiScore:    s.apiScore ?? 0,
      apiMax:      s.apiMaxScore ?? 0,
      overallPct:  s.maxScore > 0 ? Math.round((s.overallScore / s.maxScore) * 100) : 0,
      passed:      s.checksPassed,
      failed:      s.checksFailed,
      warning:     s.checksWarning,
      pending:     s.checksPending,
    }));

    // Category breakdown from latest snapshot
    let categoryBreakdown: Array<{ category: string; score: number; maxScore: number; pct: number }> = [];
    if (snapshots.length > 0) {
      const latest = snapshots[snapshots.length - 1];
      const catResult = await pool.query<{
        category:  string;
        score:     string;
        max_score: string;
      }>(
        `SELECT category, SUM(score)::text AS score, SUM(max_score)::text AS max_score
         FROM gbp_audit_checks
         WHERE snapshot_id = $1
           AND status != 'data_pending'
         GROUP BY category`,
        [latest.id],
      );
      categoryBreakdown = catResult.rows.map(r => {
        const score    = parseInt(r.score, 10) || 0;
        const maxScore = parseInt(r.max_score, 10) || 0;
        return {
          category: r.category,
          score,
          maxScore,
          pct: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
        };
      });
    }

    return res.json({ points, categoryBreakdown, totalSnapshots: snapshots.length });
  } catch (err) {
    console.error("[gbp-audit] analytics error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/gbp/audit/export ─────────────────────────────────────────────────
// Phase 8: Export latest audit checks as CSV.

router.get("/gbp/audit/export", async (req, res) => {
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

    if (!snap) return res.status(404).json({ error: "No audit found" });

    const checks = await db
      .select()
      .from(gbpAuditChecksTable)
      .where(eq(gbpAuditChecksTable.snapshotId, snap.id))
      .orderBy(gbpAuditChecksTable.category, gbpAuditChecksTable.checkKey);

    const header = "Category,Check,Status,Priority,Score,Max Score,Evidence Type,Current Value,Recommendation\n";
    const rows = checks.map(c => {
      const esc = (v: string | null | undefined) =>
        `"${String(v ?? "").replace(/"/g, '""')}"`;
      return [
        esc(c.category),
        esc(c.checkLabel),
        esc(c.status),
        esc(c.priority),
        c.score,
        c.maxScore,
        esc(c.evidenceType),
        esc(c.currentValue),
        esc(c.recommendation),
      ].join(",");
    });

    const csv      = header + rows.join("\n");
    const filename = `gbp-audit-${clientId}-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err) {
    console.error("[gbp-audit] export error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;

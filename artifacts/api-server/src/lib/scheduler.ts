import { db, pool as dbPool } from "@workspace/db";
import {
  socialPostsTable,
  leadsTable,
  autoContentSettingsTable,
  clientsTable,
  platformDeliveriesTable,
} from "@workspace/db/schema";
import { createWeeklyPlanId, evaluateClientEligibility, isValidIanaTimezone } from "@workspace/db";
import { eq, and, gte, sql, inArray } from "drizzle-orm";
import { logger } from "./logger";
import { SCHEDULER_SECRET } from "./scheduler-secret";
import { sendSms } from "./sms";
import { runBacklinkSchedulerMonitor } from "./backlink-scheduler-monitor.js";
import { runAiVisibilitySchedulerMonitor } from "./ai-visibility-scheduler-monitor.js";
import { publishingService, sanitizeError } from "./publishing-service.js";
import { reconcileSchedulerPublishException } from "./scheduler-publish-recovery.js";

export type { SkipReason, EligibilityInput, EligibilityResult } from "@workspace/db";
export type { SchedulerCycleSummary };

const POLL_INTERVAL_MS      = 60_000;       // post-publish tick: every 60s
const AUTOPILOT_INTERVAL_MS = 30 * 60_000;  // autonomous generation check: every 30min
const GBP_MONITOR_INTERVAL  = 6 * 60 * 60_000; // GBP audit monitor: every 6h

// Tracks posts currently being published — prevents duplicate publishes if a
// tick fires while a previous publish is still in flight (e.g. slow GBP upload).
export const inFlight = new Set<string>();

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try { return JSON.parse(raw ?? "") as T; } catch { return fallback; }
}

// ── Scheduler cycle summary ────────────────────────────────────────────────────

interface SchedulerCycleSummary {
  clientsEvaluated: number;
  clientsEligible:  number;
  clientsSucceeded: number;
  clientsSkipped:   number;
  clientsFailed:    number;
  postsCreated:     number;
  postsSkipped:     number;
}

// ── Post publishing ───────────────────────────────────────────────────────────

export async function publishDuePosts(): Promise<void> {
  // Query for posts whose scheduled time has passed and are still "scheduled"
  // T6 approval gate: only publish posts that have been explicitly approved.
  // Posts with approvalStatus='pending' or null are held until a human (or
  // auto-approve rule) sets approvalStatus to 'approved' or 'auto_approved'.
  const duePosts = await db
    .select({
      id:        socialPostsTable.id,
      userId:    socialPostsTable.userId,
      platforms: socialPostsTable.platforms,
    })
    .from(socialPostsTable)
    .where(
      and(
        eq(socialPostsTable.status, "scheduled"),
        sql`${socialPostsTable.scheduledAt} IS NOT NULL AND ${socialPostsTable.scheduledAt} <= now()`,
        inArray(socialPostsTable.approvalStatus, ["approved", "auto_approved"]),
      )
    );

  if (!duePosts.length) return;

  logger.info(
    { count: duePosts.length, at: new Date().toISOString() },
    "[scheduler] due posts found",
  );

  const port = parseInt(process.env.PORT ?? "8080", 10);
  const base = `http://127.0.0.1:${port}`;

  for (const { id, userId, platforms } of duePosts) {
    if (inFlight.has(id)) {
      logger.info({ postId: id }, "[scheduler] skipping — already in flight");
      continue;
    }

    inFlight.add(id);

    try {
      logger.info({ postId: id, userId }, "[scheduler] publishing post");

      const result = await publishingService.publishPost(
        id,
        userId,
        "scheduler",
        base,
        SCHEDULER_SECRET,
      );

      if (
        result.published > 0 &&
        result.failed === 0 &&
        result.skipped === 0
      ) {
        logger.info(
          {
            postId: id,
            publishStatus: result.postStatus,
            deliveries: result.published,
          },
          "[scheduler] post published with verified delivery receipts",
        );
      } else {
        logger.error(
          {
            postId: id,
            publishStatus: result.postStatus,
            published: result.published,
            failed: result.failed,
            skipped: result.skipped,
            summary: result.summary,
          },
          "[scheduler] canonical publish incomplete — delivery ledger preserved",
        );
      }
    } catch (err: unknown) {
      const msg = sanitizeError(err instanceof Error ? err.message : String(err));
      logger.error({ postId: id, err: msg }, "[scheduler] publish request error");

      // Reconcile from durable tenant-scoped platform receipts instead of
      // blindly overwriting a partial or completed external delivery as failed.
      // If reconciliation itself cannot read/write the DB, leave the existing
      // ledger/post state untouched and continue with the next due post.
      try {
        const deliveryRows = await db
          .select({
            platform:        platformDeliveriesTable.platform,
            status:          platformDeliveriesTable.status,
            attemptNumber:   platformDeliveriesTable.attemptNumber,
            externalPostId:  platformDeliveriesTable.externalPostId,
            externalPostUrl: platformDeliveriesTable.externalPostUrl,
            publishedAt:     platformDeliveriesTable.publishedAt,
            updatedAt:       platformDeliveriesTable.updatedAt,
          })
          .from(platformDeliveriesTable)
          .where(
            and(
              eq(platformDeliveriesTable.postId, id),
              eq(platformDeliveriesTable.userId, userId),
            ),
          );

        const expectedPlatforms = parseJson<string[]>(platforms, []);
        const recovery = reconcileSchedulerPublishException({
          expectedPlatforms,
          deliveries: deliveryRows,
          error: msg,
        });

        await db
          .update(socialPostsTable)
          .set({
            status:       recovery.status,
            publishedAt:  recovery.publishedAt ?? undefined,
            errorMessage: recovery.errorMessage,
            updatedAt:    new Date(),
          })
          .where(
            and(
              eq(socialPostsTable.id, id),
              eq(socialPostsTable.userId, userId),
            ),
          );

        logger.error(
          {
            postId: id,
            publishStatus: recovery.status,
            verifiedPublished: recovery.verifiedPublished,
            terminalFailures: recovery.terminalFailures,
            unresolved: recovery.unresolved,
            expectedPlatforms: recovery.expectedPlatforms,
          },
          "[scheduler] publish exception reconciled from delivery ledger",
        );
      } catch (recoveryError: unknown) {
        const recoveryMessage = sanitizeError(
          recoveryError instanceof Error
            ? recoveryError.message
            : String(recoveryError),
        );
        logger.error(
          { postId: id, err: msg, recoveryErr: recoveryMessage },
          "[scheduler] delivery-ledger reconciliation failed — existing state preserved",
        );
      }
    } finally {
      inFlight.delete(id);
    }
  }
}

// ── Timezone-aware next-generation timestamp ───────────────────────────────────
// Calculates the next scheduled run for a tenant using their configured
// generationDay (e.g. 'monday') and generationTime ('HH:MM') in the client's
// own timezone (from clients.timezone). Defaults to America/Chicago if the
// client timezone is absent or invalid (validated upstream by eligibility check).
// Accounts for DST by computing the UTC offset from the Intl API at generation time.
// Falls back to now + 7 days if the tenant has no day/time configured.
export function calculateNextGenerationAt(
  settings: { generationDay?: string | null; generationTime?: string | null },
  from: Date,
  timezone?: string | null,
): Date {
  const TZ = (timezone && isValidIanaTimezone(timezone)) ? timezone : "America/Chicago";
  const DAY_MS = 24 * 60 * 60 * 1000;
  const DAY_MAP: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  };

  const targetDayNum = settings.generationDay
    ? (DAY_MAP[settings.generationDay.toLowerCase()] ?? null)
    : null;
  const [targetH, targetM] = settings.generationTime?.split(":").map(Number) ?? [8, 0];

  if (targetDayNum === null) {
    // No specific day configured — advance by 7 wall-clock days.
    return new Date(from.getTime() + 7 * DAY_MS);
  }

  // Get the current weekday in the tenant's timezone
  const currentDowName = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, weekday: "long",
  }).format(from).toLowerCase();
  const currentDayNum = DAY_MAP[currentDowName] ?? 0;

  let daysAhead = (targetDayNum - currentDayNum + 7) % 7;
  if (daysAhead === 0) daysAhead = 7; // always at least one full cycle ahead

  // Build the candidate date (target calendar day in the tenant's timezone)
  const candidate = new Date(from.getTime() + daysAhead * DAY_MS);

  // Determine the UTC offset in the tenant's timezone on that future date (handles DST)
  const hourFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour: "numeric", hour12: false,
  });
  const candidateUtcH = candidate.getUTCHours();
  const candidateLocalH = parseInt(hourFmt.format(candidate), 10);
  const offsetHrs = candidateLocalH - candidateUtcH;

  // Compute UTC time for targetH:targetM local wall clock on that date
  const utcTargetH = targetH - offsetHrs;
  candidate.setUTCHours(utcTargetH, targetM, 0, 0);
  return candidate;
}

// ── Autonomous Content Generation ─────────────────────────────────────────────
// Runs on its own tick (every 30min). Finds clients where ALL of:
//   - clients.is_active = true
//   - autopilot_enabled = 'true'
//   - engine_paused IS DISTINCT FROM 'true'
//   - next_generation_at IS NOT NULL AND <= now()
//
// Per-client pre-flight validates:
//   - clients.timezone is a valid IANA identifier
//   - service_areas parses to a non-empty array
//   - topics parses to a non-empty array
//
// For each eligible tenant:
//   1. Creates a deterministic weeklyPlanId (userId + ISO week).
//   2. Checks idempotency — if posts with that planId exist for this user, skips.
//   3. Calls POST /api/auto-content/generate via internal HTTP (scheduler auth).
//   4. Advances nextGenerationAt by one cycle.
//
// Context (clientName, serviceAreas, topics, ctaText) is NOT sent in the body —
// the generate route derives all context from the canonical DB-backed resolver.
// This prevents stale scheduler-side data from overriding the tenant's current config.
//
// Trust boundary: the scheduler passes x-scheduler-settings-id (the UUID of the
// settings row), NOT a userId. The generate route looks up the userId from the DB
// after verifying autopilotEnabled='true', preventing user-ID impersonation attacks.
//
// Failure isolation: a try/catch wraps each tenant's generate call. One client
// failure never blocks other clients in the same cycle.
//
// BB&B PILOT DEFAULT: autopilot_enabled = 'false' for all settings rows.
// This function finds zero eligible tenants during the pilot and does nothing.
// Enable per-tenant by setting autopilot_enabled = 'true' and nextGenerationAt.

async function getEligibleClients(now: Date) {
  return db
    .select({
      settings: autoContentSettingsTable,
      client: {
        id:         clientsTable.id,
        userId:     clientsTable.userId,
        clientName: clientsTable.clientName,
        slug:       clientsTable.slug,
        timezone:   clientsTable.timezone,
        isActive:   clientsTable.isActive,
      },
    })
    .from(autoContentSettingsTable)
    .innerJoin(clientsTable, eq(autoContentSettingsTable.userId, clientsTable.userId))
    .where(
      and(
        eq(clientsTable.isActive, true),
        eq(autoContentSettingsTable.autopilotEnabled, "true"),
        sql`(${autoContentSettingsTable.enginePaused} IS NULL OR ${autoContentSettingsTable.enginePaused} != 'true')`,
        sql`${autoContentSettingsTable.nextGenerationAt} IS NOT NULL AND ${autoContentSettingsTable.nextGenerationAt} <= ${now}`,
      )
    );
}

async function runAutonomousContentGeneration(): Promise<SchedulerCycleSummary> {
  const now = new Date();

  const eligible = await getEligibleClients(now);

  const summary: SchedulerCycleSummary = {
    clientsEvaluated: eligible.length,
    clientsEligible:  0,
    clientsSucceeded: 0,
    clientsSkipped:   0,
    clientsFailed:    0,
    postsCreated:     0,
    postsSkipped:     0,
  };

  if (!eligible.length) return summary;

  logger.info({ count: eligible.length }, "[autopilot] autonomous generation tenants found");

  const port = parseInt(process.env.PORT ?? "8080", 10);
  const base  = `http://127.0.0.1:${port}`;

  for (const { settings, client } of eligible) {
    // Use only the first 8 chars of userId in logs — never log the full Clerk user ID.
    const logCtx = {
      userId:     settings.userId.slice(0, 8),
      clientName: client.clientName,
      slug:       client.slug,
    };

    // ── Per-client eligibility pre-flight ──────────────────────────────────
    // The DB query already filtered is_active, autopilot_enabled, engine_paused,
    // and next_generation_at. Remaining checks: timezone validity and non-empty
    // content config (service_areas and topics).
    const eligibilityResult = evaluateClientEligibility({ settings, client, now });
    if (!eligibilityResult.eligible) {
      logger.warn(
        { ...logCtx, skipReason: eligibilityResult.skipReason },
        "[autopilot] tenant skipped",
      );
      summary.clientsSkipped++;
      continue;
    }

    const weeklyPlanId = createWeeklyPlanId(settings.userId, now);
    const runCtx = { ...logCtx, weeklyPlanId };

    // ── Idempotency check — userId-scoped ─────────────────────────────────
    // Guards against repeated scheduler ticks within the same ISO week.
    // The query is scoped by BOTH userId and weeklyPlanId for explicit isolation.
    const [existing] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(socialPostsTable)
      .where(and(
        eq(socialPostsTable.userId, settings.userId),
        eq(socialPostsTable.weeklyPlanId, weeklyPlanId),
      ));

    if ((existing?.cnt ?? 0) > 0) {
      logger.info(
        { ...runCtx, cnt: existing?.cnt },
        "[autopilot] weekly plan already exists — skipping (idempotent)",
      );
      // Advance nextGenerationAt so the tenant doesn't stay stuck in the past.
      const nextAt = calculateNextGenerationAt(settings, now, client.timezone);
      await db.update(autoContentSettingsTable)
        .set({ nextGenerationAt: nextAt, updatedAt: new Date() })
        .where(eq(autoContentSettingsTable.userId, settings.userId));
      summary.clientsSkipped++;
      summary.postsSkipped += existing?.cnt ?? 0;
      continue;
    }

    summary.clientsEligible++;
    logger.info(runCtx, "[autopilot] tenant run started");

    try {
      // SECURITY — scheduler trust boundary:
      //   x-scheduler-settings-id: UUID of the settings row (DB-verified identity).
      //   x-scheduler-secret: constant-time compared on the generate route.
      // The generate route derives ALL tenant context (clientName, serviceAreas,
      // topics, ctaText, approvalMode, etc.) from its own DB-backed resolver.
      // We do NOT send these in the body — avoids stale-data contamination and
      // ensures the generate route's canonical resolver is always authoritative.
      const res = await fetch(`${base}/api/auto-content/generate`, {
        method:  "POST",
        headers: {
          "Content-Type":            "application/json",
          "x-scheduler-secret":      SCHEDULER_SECRET,
          "x-scheduler-settings-id": settings.id,
        },
        body: JSON.stringify({
          count:         7,            // 7-post weekly plan
          weeklyPlanId,                // idempotency key — passed through to inserts
          schedulerMode: "weekly_plan", // triggers category-aware selectWeeklySlots()
        }),
      });

      const body = await res.json() as Record<string, unknown>;

      if (res.ok) {
        const created = typeof body.created === "number" ? body.created : 0;
        logger.info({ ...runCtx, created }, "[autopilot] tenant run completed");

        // Optional autonomous media pass. One square image is attached to each
        // generated draft and can be reused by Facebook, Instagram, and GBP.
        // Failures are isolated per post and never discard the text campaign.
        if (settings.autoMediaEnabled === "true" && Array.isArray(body.posts)) {
          for (const candidate of body.posts as Array<Record<string, unknown>>) {
            const postId = typeof candidate.id === "string" ? candidate.id : null;
            const prompt = typeof candidate.imagePrompt === "string" ? candidate.imagePrompt : null;
            if (!postId || !prompt) continue;
            try {
              const mediaRes = await fetch(`${base}/api/auto-content/generate-image`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-scheduler-secret": SCHEDULER_SECRET,
                  "x-scheduler-settings-id": settings.id,
                },
                body: JSON.stringify({
                  postId,
                  prompt,
                  size: "1024x1024",
                  idempotencyKey: `${weeklyPlanId}-${postId}-square`,
                }),
              });
              if (!mediaRes.ok) {
                const mediaBody = await mediaRes.json().catch(() => ({}));
                logger.warn({ ...runCtx, postId, httpStatus: mediaRes.status, body: mediaBody }, "[autopilot] media generation failed");
              } else {
                logger.info({ ...runCtx, postId }, "[autopilot] media attached");
              }
            } catch (mediaError: unknown) {
              const mediaMessage = mediaError instanceof Error ? mediaError.message : String(mediaError);
              logger.warn({ ...runCtx, postId, err: mediaMessage }, "[autopilot] media request error");
            }
          }
        }

        summary.clientsSucceeded++;
        summary.postsCreated += created;
        const nextAt = calculateNextGenerationAt(settings, now, client.timezone);
        await db.update(autoContentSettingsTable)
          .set({ lastGeneratedAt: now, nextGenerationAt: nextAt, updatedAt: new Date() })
          .where(eq(autoContentSettingsTable.userId, settings.userId));
      } else {
        logger.error(
          { ...runCtx, httpStatus: res.status, body },
          "[autopilot] tenant run failed",
        );
        summary.clientsFailed++;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ ...runCtx, err: msg }, "[autopilot] tenant run error");
      summary.clientsFailed++;
    }
  }

  if (summary.clientsEvaluated > 0 || summary.clientsEligible > 0) {
    logger.info(summary, "[autopilot] cycle complete");
  }

  return summary;
}

// ── Missed-call recovery ──────────────────────────────────────────────────────

const RECOVERY_LOOKBACK_MS = 2 * 60 * 60 * 1000;  // scan last 2 hours for missed calls
const RECOVERY_DEDUP_MS    = 3 * 60 * 60 * 1000;  // textback dedup window

async function recoverMissedCalls(): Promise<void> {
  const missedSince   = new Date(Date.now() - RECOVERY_LOOKBACK_MS);
  const textbackSince = new Date(Date.now() - RECOVERY_DEDUP_MS);

  // Phones with unrecovered missed calls in the last 2 hours
  const missedRows = await db
    .selectDistinct({ phone: leadsTable.phone })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.eventType, "missed_call"),
        gte(leadsTable.createdAt, missedSince),
        sql`${leadsTable.phone} IS NOT NULL AND ${leadsTable.phone} != ''`,
      )
    );

  if (!missedRows.length) return;

  // Phones that already received a textback (webhook may have already handled it)
  const textedRows = await db
    .selectDistinct({ phone: leadsTable.phone })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.eventType, "telnyx_textback_sent"),
        gte(leadsTable.createdAt, textbackSince),
        sql`${leadsTable.phone} IS NOT NULL`,
      )
    );
  const alreadyTexted = new Set(textedRows.map(r => r.phone));

  const unrecovered = missedRows.filter(r => r.phone && !alreadyTexted.has(r.phone));
  if (!unrecovered.length) return;

  logger.info({ count: unrecovered.length }, "[scheduler] missed-call recovery — sending textbacks");

  const msg =
    process.env.TELNYX_TEXTBACK_MESSAGE ??
    "Hi, this is Bed Bugs & Beyond. Sorry we missed your call! " +
    "We'd love to help with your pest control needs. " +
    "Reply to this text or call us back anytime. — BB&B Team";

  for (const { phone } of unrecovered) {
    if (!phone) continue;
    const result = await sendSms(phone, msg);
    await db.insert(leadsTable).values({
      clientName: "Bed Bugs & Beyond",
      source:     "telnyx_textback",
      phone,
      message:    `Recovery scheduler textback ${result.ok ? "sent" : "failed"}${result.error ? ": " + result.error : ""}`,
      eventType:  result.ok ? "telnyx_textback_sent" : "telnyx_textback_failed",
      status:     "new",
    }).catch(e => logger.error({ phone, err: String(e) }, "[scheduler] recovery lead insert error"));
    logger.info({ phone, ok: result.ok }, "[scheduler] recovery textback");
  }
}

// ── GBP Audit Monitor ──────────────────────────────────────────────────────────
// Runs every 6h. Finds enabled schedules where next_run_at <= NOW() and calls
// POST /api/gbp/audit/run via internal HTTP with the scheduler secret.
// Gracefully skips if gbp_audit_schedules table does not yet exist.

async function runGbpAuditMonitor(): Promise<void> {
  const port = parseInt(process.env.PORT ?? "8080", 10);
  const base = `http://localhost:${port}`;

  let rows: Array<{ client_id: string; user_id: string }>;
  try {
    const result = await dbPool.query<{ client_id: string; user_id: string }>(
      `SELECT client_id, user_id
       FROM gbp_audit_schedules
       WHERE enabled = TRUE
         AND next_run_at IS NOT NULL
         AND next_run_at <= NOW()
       LIMIT 10`,
    );
    rows = result.rows;
  } catch {
    return; // table may not exist yet on first startup
  }

  if (rows.length === 0) return;
  logger.info(`[gbp-monitor] ${rows.length} scheduled audit(s) due`);

  for (const row of rows) {
    try {
      const res = await fetch(`${base}/api/gbp/audit/run`, {
        method:  "POST",
        headers: {
          "Content-Type":        "application/json",
          "x-scheduler-secret":  SCHEDULER_SECRET,
          "x-scheduler-user-id": row.user_id,
        },
        body: JSON.stringify({ clientId: row.client_id }),
      });
      if (!res.ok) {
        const txt = await res.text();
        logger.warn({ clientId: row.client_id, status: res.status, txt }, "[gbp-monitor] audit run failed");
      } else {
        logger.info({ clientId: row.client_id }, "[gbp-monitor] audit completed");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ clientId: row.client_id, msg }, "[gbp-monitor] fetch error");
    }
  }
}

// ── Re-exports for test access ─────────────────────────────────────────────────

export { evaluateClientEligibility } from "@workspace/db";

export function startScheduler(): void {
  logger.info("[scheduler] started — posts every 60s · autonomous-gen every 30min · missed-call recovery every 5m · gbp-monitor every 6h · backlink-scheduler every 15min · ai-visibility-scheduler every 60min");

  // ── Post publishing ──
  publishDuePosts().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, "[scheduler] startup post-publish error");
  });

  setInterval(() => {
    publishDuePosts().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "[scheduler] tick error");
    });
  }, POLL_INTERVAL_MS);

  // ── Autonomous content generation ──
  // BB&B pilot: no rows have autopilot_enabled='true', so this runs but finds nothing.
  // Enable per-tenant by setting autopilot_enabled='true' and nextGenerationAt in the DB.
  runAutonomousContentGeneration().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, "[scheduler] startup autopilot error");
  });

  setInterval(() => {
    runAutonomousContentGeneration().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "[scheduler] autopilot tick error");
    });
  }, AUTOPILOT_INTERVAL_MS);

  // ── Missed-call recovery ──
  recoverMissedCalls().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, "[scheduler] startup recovery error");
  });

  setInterval(() => {
    recoverMissedCalls().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "[scheduler] recovery tick error");
    });
  }, 5 * 60_000);

  // ── GBP Audit Monitor ──
  runGbpAuditMonitor().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, "[scheduler] startup gbp-monitor error");
  });

  setInterval(() => {
    runGbpAuditMonitor().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "[scheduler] gbp-monitor tick error");
    });
  }, GBP_MONITOR_INTERVAL);

  // ── Backlink Scheduler Monitor (C8R-9) ────────────────────────────────────
  // Checks backlink_discovery_schedule for due rows every 15 min.
  // Disabled-by-default: no schedule rows have enabled=true until an admin
  // calls PUT /api/backlinks/schedule.  Safe to run unconditionally.
  const BACKLINK_SCHEDULER_INTERVAL = 15 * 60_000;

  runBacklinkSchedulerMonitor().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, "[scheduler] startup backlink-scheduler error");
  });

  setInterval(() => {
    runBacklinkSchedulerMonitor().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "[scheduler] backlink-scheduler tick error");
    });
  }, BACKLINK_SCHEDULER_INTERVAL);

  // ── AI Visibility Scheduler Monitor (C9R-5) ───────────────────────────────
  // Checks ai_visibility_schedule for due rows every 60 min.
  // Disabled-by-default: AI_VISIBILITY_SCHEDULER_ENABLED must be "true".
  // No rows have enabled=true until an admin calls PUT /api/ai-visibility/schedule/:clientId.
  if (process.env.AI_VISIBILITY_SCHEDULER_ENABLED === "true") {
    const AI_VISIBILITY_SCHEDULER_INTERVAL = 60 * 60_000;

    runAiVisibilitySchedulerMonitor().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "[scheduler] startup ai-visibility-scheduler error");
    });

    setInterval(() => {
      runAiVisibilitySchedulerMonitor().catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err: msg }, "[scheduler] ai-visibility-scheduler tick error");
      });
    }, AI_VISIBILITY_SCHEDULER_INTERVAL);
  }
}

import { db } from "@workspace/db";
import { socialPostsTable, leadsTable, autoContentSettingsTable } from "@workspace/db/schema";
import { createWeeklyPlanId, getDefaultTopics } from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { logger } from "./logger";
import { SCHEDULER_SECRET } from "./scheduler-secret";
import { sendSms } from "./sms";

const POLL_INTERVAL_MS      = 60_000;      // post-publish tick: every 60s
const AUTOPILOT_INTERVAL_MS = 30 * 60_000; // autonomous generation check: every 30min

const DEFAULT_SERVICE_AREAS = [
  "Foley, AL", "Daphne, AL", "Loxley, AL", "Fairhope, AL", "Gulf Shores, AL",
  "Orange Beach, AL", "Summerdale, AL", "Spanish Fort, AL",
];

// Tracks posts currently being published — prevents duplicate publishes if a
// tick fires while a previous publish is still in flight (e.g. slow GBP upload).
const inFlight = new Set<string>();

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try { return JSON.parse(raw ?? "") as T; } catch { return fallback; }
}

async function publishDuePosts(): Promise<void> {
  // Query for posts whose scheduled time has passed and are still "scheduled"
  const duePosts = await db
    .select({
      id:     socialPostsTable.id,
      userId: socialPostsTable.userId,
    })
    .from(socialPostsTable)
    .where(
      and(
        eq(socialPostsTable.status, "scheduled"),
        sql`${socialPostsTable.scheduledAt} IS NOT NULL AND ${socialPostsTable.scheduledAt} <= now()`,
      )
    );

  if (!duePosts.length) return;

  logger.info(
    { count: duePosts.length, at: new Date().toISOString() },
    "[scheduler] due posts found",
  );

  const port = parseInt(process.env.PORT ?? "8080", 10);
  const base = `http://127.0.0.1:${port}`;

  for (const { id, userId } of duePosts) {
    if (inFlight.has(id)) {
      logger.info({ postId: id }, "[scheduler] skipping — already in flight");
      continue;
    }

    inFlight.add(id);

    try {
      logger.info({ postId: id, userId }, "[scheduler] publishing post");

      const res = await fetch(`${base}/api/social-posts/${id}/publish`, {
        method:  "POST",
        headers: {
          "Content-Type":       "application/json",
          "x-scheduler-secret": SCHEDULER_SECRET,
        },
      });

      const body = await res.json() as Record<string, unknown>;

      if (res.ok && body.ok) {
        logger.info(
          { postId: id, publishStatus: body.status },
          "[scheduler] post published successfully",
        );
      } else {
        logger.error(
          { postId: id, httpStatus: res.status, body },
          "[scheduler] post publish failed — route handled status update",
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ postId: id, err: msg }, "[scheduler] publish request error");

      // Network/runtime failure before the route could update status — do it here
      await db
        .update(socialPostsTable)
        .set({
          status:       "failed",
          errorMessage: `Scheduler network error: ${msg}`,
          updatedAt:    new Date(),
        })
        .where(eq(socialPostsTable.id, id));
    } finally {
      inFlight.delete(id);
    }
  }
}

// ── Timezone-aware next-generation timestamp ──────────────────────────────────
// Calculates the next scheduled run for a tenant using their configured
// generationDay (e.g. 'monday') and generationTime ('HH:MM') in America/Chicago.
// Accounts for DST by computing the UTC offset from the Intl API at generation time.
// Falls back to now + 7 days if the tenant has no day/time configured.
function calculateNextGenerationAt(
  settings: { generationDay?: string | null; generationTime?: string | null },
  from: Date,
): Date {
  const TZ = "America/Chicago";
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

  // Get the current weekday in Chicago
  const currentDowName = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, weekday: "long",
  }).format(from).toLowerCase();
  const currentDayNum = DAY_MAP[currentDowName] ?? 0;

  let daysAhead = (targetDayNum - currentDayNum + 7) % 7;
  if (daysAhead === 0) daysAhead = 7; // always at least one full cycle ahead

  // Build the candidate date (target calendar day in Chicago)
  const candidate = new Date(from.getTime() + daysAhead * DAY_MS);

  // Determine the UTC offset in Chicago on that future date (handles DST correctly)
  const hourFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour: "numeric", hour12: false,
  });
  const candidateUtcH = candidate.getUTCHours();
  const candidateChicagoH = parseInt(hourFmt.format(candidate), 10);
  const offsetHrs = candidateChicagoH - candidateUtcH; // e.g. -5 (CDT) or -6 (CST)

  // Compute UTC time for targetH:targetM Chicago wall clock on that date
  const utcTargetH = targetH - offsetHrs;
  candidate.setUTCHours(utcTargetH, targetM, 0, 0);
  return candidate;
}

// ── Autonomous Content Generation ─────────────────────────────────────────────
// Runs on its own tick (every 30min). Finds tenants where:
//   - autopilot_enabled = 'true'
//   - engine_paused IS DISTINCT FROM 'true'
//   - next_generation_at IS NOT NULL AND <= now()
//
// For each due tenant:
//   1. Computes the deterministic weeklyPlanId for the current ISO week.
//   2. Checks idempotency — if posts with that weeklyPlanId already exist, skips.
//   3. Calls POST /api/auto-content/generate via internal HTTP (scheduler auth bypass).
//   4. Advances nextGenerationAt by 7 days.
//
// BB&B PILOT DEFAULT: autopilot_enabled = 'false' for all settings rows.
// This function will find zero due tenants during the pilot and does nothing.
// Enable by setting autopilot_enabled = 'true' in the tenant's settings row after
// the first manually-reviewed weekly plan is approved by the client.

async function runAutonomousContentGeneration(): Promise<void> {
  const now = new Date();

  // Find tenants whose autonomous generation is enabled and due
  const dueTenants = await db
    .select()
    .from(autoContentSettingsTable)
    .where(
      and(
        eq(autoContentSettingsTable.autopilotEnabled, "true"),
        sql`(${autoContentSettingsTable.enginePaused} IS NULL OR ${autoContentSettingsTable.enginePaused} != 'true')`,
        sql`${autoContentSettingsTable.nextGenerationAt} IS NOT NULL AND ${autoContentSettingsTable.nextGenerationAt} <= ${now}`,
      )
    );

  if (!dueTenants.length) return;

  logger.info({ count: dueTenants.length }, "[autopilot] autonomous generation tenants found");

  const port = parseInt(process.env.PORT ?? "8080", 10);
  const base  = `http://127.0.0.1:${port}`;

  for (const settings of dueTenants) {
    const weeklyPlanId = createWeeklyPlanId(settings.userId, now);

    // ── Idempotency check ────────────────────────────────────────────────────
    // Repeated scheduler ticks must not create a second plan for the same week.
    const [existing] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(socialPostsTable)
      .where(eq(socialPostsTable.weeklyPlanId, weeklyPlanId));

    if ((existing?.cnt ?? 0) > 0) {
      logger.info(
        { userId: settings.userId, weeklyPlanId, cnt: existing?.cnt },
        "[autopilot] weekly plan already exists — skipping (idempotent)",
      );
      // Advance nextGenerationAt if it's still stuck in the past after an earlier partial run
      const nextAt = calculateNextGenerationAt(settings, now);
      await db.update(autoContentSettingsTable)
        .set({ nextGenerationAt: nextAt, updatedAt: new Date() })
        .where(eq(autoContentSettingsTable.userId, settings.userId));
      continue;
    }

    // ── Generate weekly plan via internal HTTP call ──────────────────────────
    logger.info({ userId: settings.userId, weeklyPlanId }, "[autopilot] generating weekly plan");

    const serviceAreas = parseJson<string[]>(settings.serviceAreas, DEFAULT_SERVICE_AREAS);
    const topics       = parseJson<string[]>(settings.topics, getDefaultTopics());
    const platforms    = parseJson<string[]>(settings.platforms, ["facebook", "google"]);

    try {
      // SECURITY: Pass the settings row ID (not userId) so the generate route
      // can derive the tenant identity from the DB-verified settings record.
      // Never pass x-scheduler-user-id — that header is an impersonation vector.
      const res = await fetch(`${base}/api/auto-content/generate`, {
        method:  "POST",
        headers: {
          "Content-Type":             "application/json",
          "x-scheduler-secret":       SCHEDULER_SECRET,
          "x-scheduler-settings-id":  settings.id,
        },
        body: JSON.stringify({
          count:        7,            // 7-day weekly plan
          weeklyPlanId,               // idempotency key passed through to inserts
          schedulerMode: "weekly_plan", // signals the route to use selectWeeklyServices
          serviceAreas,
          topics,
          platforms,
          ctaText:    settings.ctaText    ?? "Call Now — (251) 324-9090",
          clientName: settings.clientName ?? "Bed Bugs & Beyond",
        }),
      });

      const body = await res.json() as Record<string, unknown>;

      if (res.ok) {
        logger.info(
          { userId: settings.userId, weeklyPlanId, created: body.created },
          "[autopilot] weekly plan generated successfully",
        );
        const nextAt = calculateNextGenerationAt(settings, now);
        await db.update(autoContentSettingsTable)
          .set({ lastGeneratedAt: now, nextGenerationAt: nextAt, updatedAt: new Date() })
          .where(eq(autoContentSettingsTable.userId, settings.userId));
      } else {
        logger.error(
          { userId: settings.userId, weeklyPlanId, httpStatus: res.status, body },
          "[autopilot] weekly plan generation failed",
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ userId: settings.userId, weeklyPlanId, err: msg }, "[autopilot] generation request error");
    }
  }
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

// ── Exports ────────────────────────────────────────────────────────────────────

export function startScheduler(): void {
  logger.info("[scheduler] started — posts every 60s · autonomous-gen every 30min · missed-call recovery every 5m");

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
}

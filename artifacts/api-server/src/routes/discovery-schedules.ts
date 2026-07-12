/**
 * Phase C7 — Discovery Schedule Management API
 *
 * Tenant-scoped schedule CRUD and lifecycle management.
 * All routes require a valid Clerk session. Client is resolved from DB.
 * Credentials, tokens, and internal IDs are never returned.
 *
 * Routes:
 *   GET    /api/discovery/schedules            — list schedules
 *   GET    /api/discovery/schedules/:id         — get schedule + recent occurrences
 *   POST   /api/discovery/schedules            — create schedule
 *   PATCH  /api/discovery/schedules/:id         — update name/cron/timezone/policies
 *   POST   /api/discovery/schedules/:id/pause  — pause (active → paused)
 *   POST   /api/discovery/schedules/:id/resume — resume (paused → active)
 *   POST   /api/discovery/schedules/:id/disable — disable (active|paused → disabled)
 *   POST   /api/discovery/schedules/:id/archive — archive (paused|disabled → archived)
 *   GET    /api/discovery/schedules/:id/occurrences — occurrence history
 *   GET    /api/discovery/automation/config    — automation health (config summary)
 */

import { Router }    from "express";
import { z }         from "zod";
import { getAuth }   from "@clerk/express";
import { pool }      from "@workspace/db";

import {
  bootstrapC7Tables,
  listSchedules,
  getSchedule,
  insertSchedule,
  updateScheduleStatus,
  listRecentOccurrences,
} from "@workspace/db";

import {
  deriveScheduleId,
  deriveOccurrenceId,
  calculateNextRun,
  validateScheduleInput,
  validateScheduleTransition,
  isScheduleTerminal,
} from "@workspace/db";

import type { DiscoverySchedule } from "@workspace/db";
import { resolveClientContentContextFromDb } from "../lib/client-resolver.js";
import { loadDiscoveryAutomationConfig, describeAutomationConfig } from "../lib/discovery-automation-config.js";

// ── Bootstrap ──────────────────────────────────────────────────────────────────

bootstrapC7Tables(pool).catch(err =>
  console.error("[DISCOVERY-SCHEDULES] C7 table bootstrap failed:", err),
);

const router = Router();

// ── Auth helper ────────────────────────────────────────────────────────────────

function requireUserId(req: Parameters<typeof getAuth>[0]): string | null {
  const { userId } = getAuth(req);
  return userId ?? null;
}

// ── Zod schemas ────────────────────────────────────────────────────────────────

const createScheduleSchema = z.object({
  name:             z.string().min(1).max(200),
  cronExpr:         z.string().min(1),
  timezone:         z.string().min(1).default("UTC"),
  executionMode:    z.enum(["live", "dry"]).default("dry"),
  maxCostPerRunUsd: z.number().min(0).max(100).optional().default(1.0),
  maxRequestsPerRun: z.number().int().min(1).max(10000).optional().default(50),
  catchUpPolicy:    z.enum(["skip_missed", "run_latest", "run_all_bounded"]).optional().default("skip_missed"),
  maxCatchUpCount:  z.number().int().min(1).max(50).optional().default(3),
  overlapPolicy:    z.enum(["skip", "queue_one", "allow"]).optional().default("skip"),
});

const patchScheduleSchema = z.object({
  cronExpr:         z.string().min(1).optional(),
  timezone:         z.string().min(1).optional(),
  executionMode:    z.enum(["live", "dry"]).optional(),
  maxCostPerRunUsd: z.number().min(0).max(100).optional(),
  maxRequestsPerRun: z.number().int().min(1).max(10000).optional(),
  catchUpPolicy:    z.enum(["skip_missed", "run_latest", "run_all_bounded"]).optional(),
  maxCatchUpCount:  z.number().int().min(1).max(50).optional(),
  overlapPolicy:    z.enum(["skip", "queue_one", "allow"]).optional(),
}).refine(obj => Object.keys(obj).length > 0, { message: "At least one field must be provided" });

const pauseBodySchema = z.object({
  reason: z.string().max(500).optional(),
});

// ── GET /api/discovery/schedules ──────────────────────────────────────────────

router.get("/api/discovery/schedules", async (req, res) => {
  const userId = requireUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const ctx = await resolveClientContentContextFromDb(userId);
    if (!ctx) return res.status(403).json({ error: "Client not found" });

    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const limit  = parseInt(String(req.query.limit ?? "50"), 10);
    const offset = parseInt(String(req.query.offset ?? "0"), 10);

    const schedules = await listSchedules(pool, ctx.clientId, {
      status,
      limit:  isNaN(limit)  ? 50  : Math.min(limit, 200),
      offset: isNaN(offset) ? 0   : offset,
    });

    return res.json({ schedules, total: schedules.length });
  } catch (err) {
    console.error("[DISCOVERY-SCHEDULES] list error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/discovery/schedules/:id ─────────────────────────────────────────

router.get("/api/discovery/schedules/:id", async (req, res) => {
  const userId = requireUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const ctx = await resolveClientContentContextFromDb(userId);
    if (!ctx) return res.status(403).json({ error: "Client not found" });

    const schedule = await getSchedule(pool, ctx.clientId, req.params.id!);
    if (!schedule) return res.status(404).json({ error: "Schedule not found" });

    const occurrences = await listRecentOccurrences(pool, ctx.clientId, schedule.id, 20);
    return res.json({ schedule, occurrences });
  } catch (err) {
    console.error("[DISCOVERY-SCHEDULES] get error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/discovery/schedules ─────────────────────────────────────────────

router.post("/api/discovery/schedules", async (req, res) => {
  const userId = requireUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const parsed = createScheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }
  const body = parsed.data;

  const validation = validateScheduleInput(body);
  if (!validation.valid) {
    return res.status(400).json({ error: "Schedule validation failed", details: validation.errors });
  }

  try {
    const ctx = await resolveClientContentContextFromDb(userId);
    if (!ctx) return res.status(403).json({ error: "Client not found" });

    const id        = deriveScheduleId(ctx.clientId, body.name);
    const now       = new Date();
    const nextRunAt = calculateNextRun(body.cronExpr, body.timezone, now);

    const schedule: DiscoverySchedule = {
      id,
      clientId:            ctx.clientId,
      name:                body.name,
      status:              "active",
      executionMode:       body.executionMode,
      cronExpr:            body.cronExpr,
      timezone:            body.timezone,
      nextRunAt,
      lastRunAt:           null,
      lastSuccessAt:       null,
      consecutiveFailures: 0,
      maxCostPerRunUsd:    body.maxCostPerRunUsd,
      maxRequestsPerRun:   body.maxRequestsPerRun,
      catchUpPolicy:       body.catchUpPolicy,
      maxCatchUpCount:     body.maxCatchUpCount,
      overlapPolicy:       body.overlapPolicy,
      pauseReason:         null,
      contextSnapshot:     null,
      providerPolicy:      null,
      createdBy:           userId,
      updatedBy:           userId,
      createdAt:           now,
      updatedAt:           now,
      version:             1,
    };

    await insertSchedule(pool, schedule);

    // Verify it was inserted (or already existed)
    const created = await getSchedule(pool, ctx.clientId, id);
    if (!created) {
      return res.status(409).json({ error: "A schedule with this name already exists", id });
    }
    return res.status(201).json({ schedule: created });
  } catch (err) {
    console.error("[DISCOVERY-SCHEDULES] create error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /api/discovery/schedules/:id ───────────────────────────────────────

router.patch("/api/discovery/schedules/:id", async (req, res) => {
  const userId = requireUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const parsed = patchScheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  try {
    const ctx = await resolveClientContentContextFromDb(userId);
    if (!ctx) return res.status(403).json({ error: "Client not found" });

    const existing = await getSchedule(pool, ctx.clientId, req.params.id!);
    if (!existing) return res.status(404).json({ error: "Schedule not found" });
    if (isScheduleTerminal(existing.status)) {
      return res.status(409).json({ error: "Archived schedules cannot be modified" });
    }

    const body = parsed.data;
    if (body.cronExpr || body.timezone) {
      const validation = validateScheduleInput({
        name:             existing.name,
        cronExpr:         body.cronExpr ?? existing.cronExpr,
        timezone:         body.timezone ?? existing.timezone,
        executionMode:    body.executionMode ?? existing.executionMode,
        maxCostPerRunUsd: body.maxCostPerRunUsd ?? existing.maxCostPerRunUsd,
      });
      if (!validation.valid) {
        return res.status(400).json({ error: "Schedule validation failed", details: validation.errors });
      }
    }

    // Build update via raw SQL to handle partial updates cleanly
    const fields: string[] = [];
    const vals:   unknown[] = [req.params.id, ctx.clientId];
    let   p = 3;

    if (body.cronExpr         !== undefined) { fields.push(`cron_expr = $${p++}`);          vals.push(body.cronExpr); }
    if (body.timezone         !== undefined) { fields.push(`timezone = $${p++}`);            vals.push(body.timezone); }
    if (body.executionMode    !== undefined) { fields.push(`execution_mode = $${p++}`);      vals.push(body.executionMode); }
    if (body.maxCostPerRunUsd !== undefined) { fields.push(`max_cost_per_run_usd = $${p++}`); vals.push(body.maxCostPerRunUsd); }
    if (body.maxRequestsPerRun!== undefined) { fields.push(`max_requests_per_run = $${p++}`); vals.push(body.maxRequestsPerRun); }
    if (body.catchUpPolicy    !== undefined) { fields.push(`catch_up_policy = $${p++}`);     vals.push(body.catchUpPolicy); }
    if (body.maxCatchUpCount  !== undefined) { fields.push(`max_catch_up_count = $${p++}`);  vals.push(body.maxCatchUpCount); }
    if (body.overlapPolicy    !== undefined) { fields.push(`overlap_policy = $${p++}`);      vals.push(body.overlapPolicy); }

    // Recalculate next_run_at if cron or timezone changed
    if (body.cronExpr || body.timezone) {
      const nextRunAt = calculateNextRun(
        body.cronExpr ?? existing.cronExpr,
        body.timezone ?? existing.timezone,
        new Date(),
      );
      fields.push(`next_run_at = $${p++}`);
      vals.push(nextRunAt);
    }

    fields.push(`updated_by = $${p++}`, `updated_at = now()`, `version = version + 1`);
    vals.push(userId);

    if (fields.length > 0) {
      await pool.query(
        `UPDATE discovery_schedules SET ${fields.join(", ")} WHERE id = $1 AND client_id = $2`,
        vals,
      );
    }

    const updated = await getSchedule(pool, ctx.clientId, req.params.id!);
    return res.json({ schedule: updated });
  } catch (err) {
    console.error("[DISCOVERY-SCHEDULES] patch error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Lifecycle transitions ──────────────────────────────────────────────────────

function makeTransitionRoute(
  to:         DiscoverySchedule["status"],
  bodySchema: z.ZodTypeAny = z.object({}),
) {
  return async (req: Parameters<typeof getAuth>[0], res: Parameters<typeof getAuth>[0] extends { res: infer R } ? R : never) => {
    const userId = requireUserId(req as never);
    if (!userId) return (res as never as { status: (n: number) => { json: (v: unknown) => void } }).status(401).json({ error: "Unauthorized" });

    const parsed = bodySchema.safeParse((req as never as { body: unknown }).body ?? {});
    if (!parsed.success) return (res as never as { status: (n: number) => { json: (v: unknown) => void } }).status(400).json({ error: "Validation failed" });

    try {
      const ctx = await resolveClientContentContextFromDb(userId);
      if (!ctx) return (res as never as { status: (n: number) => { json: (v: unknown) => void } }).status(403).json({ error: "Client not found" });

      const existing = await getSchedule(pool, ctx.clientId, (req as never as { params: { id: string } }).params.id);
      if (!existing) return (res as never as { status: (n: number) => { json: (v: unknown) => void } }).status(404).json({ error: "Schedule not found" });

      if (!validateScheduleTransition(existing.status, to)) {
        return (res as never as { status: (n: number) => { json: (v: unknown) => void } }).status(409).json({
          error:   `Cannot transition from ${existing.status} → ${to}`,
          current: existing.status,
        });
      }

      const body      = parsed.data as { reason?: string };
      const pauseReason = to === "paused" ? (body.reason ?? null) : null;
      await updateScheduleStatus(pool, ctx.clientId, existing.id, to, pauseReason);

      const updated = await getSchedule(pool, ctx.clientId, existing.id);
      return (res as never as { json: (v: unknown) => void }).json({ schedule: updated });
    } catch (err) {
      console.error(`[DISCOVERY-SCHEDULES] ${to} transition error:`, err);
      return (res as never as { status: (n: number) => { json: (v: unknown) => void } }).status(500).json({ error: "Internal server error" });
    }
  };
}

router.post("/api/discovery/schedules/:id/pause",   makeTransitionRoute("paused",   pauseBodySchema) as never);
router.post("/api/discovery/schedules/:id/resume",  makeTransitionRoute("active")   as never);
router.post("/api/discovery/schedules/:id/disable", makeTransitionRoute("disabled") as never);
router.post("/api/discovery/schedules/:id/archive", makeTransitionRoute("archived") as never);

// ── GET /api/discovery/schedules/:id/occurrences ──────────────────────────────

router.get("/api/discovery/schedules/:id/occurrences", async (req, res) => {
  const userId = requireUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const ctx = await resolveClientContentContextFromDb(userId);
    if (!ctx) return res.status(403).json({ error: "Client not found" });

    const schedule = await getSchedule(pool, ctx.clientId, req.params.id!);
    if (!schedule) return res.status(404).json({ error: "Schedule not found" });

    const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10) || 20, 100);
    const occurrences = await listRecentOccurrences(pool, ctx.clientId, schedule.id, limit);
    return res.json({ occurrences });
  } catch (err) {
    console.error("[DISCOVERY-SCHEDULES] occurrences error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/discovery/automation/config ──────────────────────────────────────

router.get("/api/discovery/automation/config", async (req, res) => {
  const userId = requireUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const ctx = await resolveClientContentContextFromDb(userId);
    if (!ctx) return res.status(403).json({ error: "Client not found" });

    const cfg     = loadDiscoveryAutomationConfig();
    const summary = describeAutomationConfig(cfg);
    return res.json(summary);
  } catch (err) {
    console.error("[DISCOVERY-SCHEDULES] automation config error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

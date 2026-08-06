import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, pool } from "@workspace/db";
import { autoContentSettingsTable, socialPostsTable, imageAssetsTable, clientsTable, agentTasksTable } from "@workspace/db/schema";
import {
  normalizeTopics,
  validateTopicForGeneration,
  getDefaultTopics,
  getServicePromptRules,
  matchServiceByTopic,
  BBB_DEFAULT_APPROVAL_MODE,
  BBB_SERVICES,
  BBB_AUDIENCES,
  CAMPAIGN_GOALS,
  selectWeeklyServices,
  createWeeklyPlanId,
  type WeeklyServiceSlot,
  type ServiceRegistryProvider,
  buildClientContentContext,
  buildSystemPrompt,
} from "@workspace/db";
import { randomUUID, timingSafeEqual } from "crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, and, inArray, sql } from "drizzle-orm";
import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { SCHEDULER_SECRET } from "../lib/scheduler-secret";
import { resolveClientContentContextFromDb, resolveClientActiveCheck } from "../lib/client-resolver.js";
import { objectStorageClient } from "../lib/objectStorage.js";
import { renderNativeCampaignVideo } from "../lib/native-video-renderer.js";
import { BBB_BRAND, BBB_LOGO_PNG_BASE64 } from "../lib/bbb-brand.js";

// Constant-time scheduler secret validation — prevents timing oracle attacks.
// Both buffers must be the same length before comparison.
function isValidSchedulerSecret(header: string | string[] | undefined): boolean {
  if (!SCHEDULER_SECRET || !header || Array.isArray(header)) return false;
  try {
    const a = Buffer.from(header as string, "utf8");
    const b = Buffer.from(SCHEDULER_SECRET, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const router = Router();

export function resolveOpenAiBaseUrl(): string {
  const configured = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL?.trim()
    || process.env.OPENAI_BASE_URL?.trim()
    || "https://api.openai.com/v1";
  return configured.replace(/\/+$/, "");
}

function getAiModel() {
  // Prefer Replit-managed integration when it has a usable URL; blank Coolify
  // placeholders must fall back to the direct OpenAI endpoint.
  const baseURL = resolveOpenAiBaseUrl();
  const key = process.env.AI_INTEGRATIONS_OPENAI_API_KEY
    ?? process.env.OPENAI_API_KEY;
  if (!key) throw new Error("No OpenAI API key configured. Add OPENAI_API_KEY to Secrets.");
  const gw = createOpenAICompatible({
    name: "openai",
    baseURL,
    headers: { Authorization: `Bearer ${key}` },
  });
  return gw(process.env.OPENAI_MODEL ?? "gpt-4o-mini");
}

/**
 * Canonical OpenAI API-key resolver for direct fetch calls (image generation).
 * Priority: AI_INTEGRATIONS_OPENAI_API_KEY (Replit-managed) → OPENAI_API_KEY (direct).
 * Never log the returned value.
 */
export function resolveOpenAiApiKey(): string {
  return process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
}

const DEFAULT_SERVICE_AREAS = [
  "Foley, AL", "Daphne, AL", "Loxley, AL", "Fairhope, AL", "Gulf Shores, AL",
  "Orange Beach, AL", "Summerdale, AL", "Spanish Fort, AL", "Elberta, AL",
  "Lillian, AL", "Perdido Beach, AL",
];

// Canonical topic list from the BB&B service registry — single source of truth.
// Do NOT maintain a separate pest array here.
const DEFAULT_TOPICS = getDefaultTopics();

const DEFAULT_ANGLES = [
  "educational", "warning", "promotional", "seasonal",
  "faq", "testimonial", "prevention", "emergency",
];

const DEFAULT_TONE = ["professional", "friendly"];

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try { return JSON.parse(raw ?? "") as T; } catch { return fallback; }
}

// ── V3 Scoring Utilities ───────────────────────────────────────────────────────

function calcDuplicateRisk(
  city: string, topic: string, angle: string,
  existing: Array<{ aiCity: string | null; aiTopic: string | null; aiAngle: string | null }>,
): "low" | "medium" | "high" {
  const sameCityTopic = existing.filter(p => p.aiCity === city && p.aiTopic === topic).length;
  const sameAngle = existing.filter(p => p.aiAngle === angle).length;
  if (sameCityTopic >= 2 || sameAngle >= 4) return "high";
  if (sameCityTopic === 1 || sameAngle >= 2) return "medium";
  return "low";
}

function calcBestPlatform(angle: string, captionLen: number): string {
  if (["educational", "faq", "prevention", "testimonial"].includes(angle)) return "Facebook";
  if (["warning", "emergency"].includes(angle)) return "Facebook + Google";
  if (captionLen < 200) return "Google";
  return "Facebook + Google";
}

function calcContentScore(params: {
  city: string; topic: string; angle: string;
  captionFacebook: string; duplicateRisk: "low" | "medium" | "high";
}): number {
  let score = 0;
  if (params.city) score += 15;
  if (params.topic) score += 15;
  const cap = (params.captionFacebook ?? "").toLowerCase();
  if (/call|book|contact|visit|schedule|get a quote|reach out/.test(cap)) score += 15;
  const len = cap.length;
  if (len >= 100 && len <= 400) score += 15;
  else if (len >= 50) score += 8;
  if (params.angle) score += 15;
  score += 10; // platform fit bonus (always relevant for local service)
  if (params.duplicateRisk === "low") score += 15;
  else if (params.duplicateRisk === "medium") score += 7;
  return Math.min(100, Math.max(0, score));
}

function calcImageRecommendation(
  city: string, topic: string, angle: string, clientName: string,
): string {
  const cityShort = city.split(",")[0].trim();
  const angleStyle: Record<string, string> = {
    warning: "bold warning",
    educational: "informative",
    promotional: "promotional offer",
    seasonal: "seasonal-themed",
    emergency: "urgent",
    testimonial: "customer success",
    prevention: "helpful tips",
    faq: "Q&A style",
  };
  const style = angleStyle[angle] ?? "professional";
  return `${topic} pest control photo with ${style} headline, "${cityShort}" city text overlay, ${clientName} branding, and Call Now CTA.`;
}

// ── GET /auto-content/settings ────────────────────────────────────────────────

router.get("/auto-content/settings", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [row] = await db.select().from(autoContentSettingsTable)
    .where(eq(autoContentSettingsTable.userId, userId));

  if (!row) {
    // No settings row — resolve canonical client context.
    // An unrecognised tenant MUST NOT silently receive BB&B defaults.
    const resolved = await resolveClientContentContextFromDb(userId);
    if (!resolved.found) {
      const r = resolved.reason;
      if (r === "registry_unavailable") {
        res.status(503).json({ error: "registry_unavailable", message: "Service registry temporarily unavailable. Please try again shortly." });
      } else if (r === "registry_not_configured" || r === "registry_invalid") {
        res.status(422).json({ error: r, message: "Service registry is not properly configured for this client." });
      } else if (r === "inactive") {
        res.status(403).json({ error: "client_inactive", message: "This client account is currently inactive." });
      } else {
        res.status(404).json({ error: "no_client_configured", reason: r });
      }
      return;
    }
    const ctx = resolved.context;
    res.json({
      clientName:          ctx.clientName,
      industry:            ctx.industry,
      serviceAreas:        ctx.serviceAreas,
      topics:              ctx.topics,
      frequency:           ctx.frequency,
      postingTimes:        ctx.postingTimes,
      platforms:           ctx.platforms,
      approvalMode:        ctx.approvalMode,
      ctaText:             ctx.ctaText,
      ctaPreference:       ctx.ctaPreference,
      toneStyle:           ctx.toneStyle,
      postAngles:          ctx.postAngles,
      autoGenerateEnabled: true,
      autopilotEnabled:    false,
      autoMediaEnabled:    false,
      enginePaused:        false,
      nextGenerationAt:    null,
      usedCombos:          [],
      lastGeneratedAt:     null,
    });
    return;
  }

  // Settings row exists — use it, falling back to resolved client context for
  // empty service area / topic arrays. Never supply BB&B defaults to another tenant.
  const resolved = await resolveClientContentContextFromDb(userId);
  const fallbackAreas  = resolved.found ? resolved.context.serviceAreas : [];
  const fallbackTopics = resolved.found ? resolved.context.topics        : [];

  const parsedAreas  = parseJson<string[]>(row.serviceAreas, []);
  const parsedTopics = parseJson<string[]>(row.topics, []);

  res.json({
    clientName:          row.clientName,
    industry:            row.industry ?? "pest_control",
    serviceAreas:        parsedAreas.length  ? parsedAreas  : fallbackAreas,
    topics:              parsedTopics.length ? parsedTopics : fallbackTopics,
    frequency:           row.frequency,
    postingTimes:        parseJson<string[]>(row.postingTimes, ["08:00", "12:00", "17:00"]),
    platforms:           parseJson<string[]>(row.platforms, ["facebook"]),
    approvalMode:        row.approvalMode,
    ctaText:             row.ctaText,
    ctaPreference:       row.ctaPreference ?? "call_now",
    toneStyle:           parseJson<string[]>(row.toneStyle, DEFAULT_TONE),
    postAngles:          parseJson<string[]>(row.postAngles, DEFAULT_ANGLES),
    autoGenerateEnabled: row.autoGenerateEnabled !== "false",
    autopilotEnabled:    row.autopilotEnabled === "true",
    autoMediaEnabled:    row.autoMediaEnabled === "true",
    enginePaused:        row.enginePaused === "true",
    nextGenerationAt:    row.nextGenerationAt?.toISOString() ?? null,
    usedCombos:          parseJson<string[]>(row.usedCombos, []),
    lastGeneratedAt:     row.lastGeneratedAt?.toISOString() ?? null,
  });
});

// ── PUT /auto-content/settings ────────────────────────────────────────────────

router.put("/auto-content/settings", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Resolve tenant — required for client identity (clientName, industry) and
  // topic validation. Registry must be available so we can validate any topics
  // in the request body against the canonical service registry.
  const resolved = await resolveClientContentContextFromDb(userId);
  if (!resolved.found) {
    const r = resolved.reason;
    if (r === "registry_unavailable") {
      res.status(503).json({ error: "registry_unavailable", message: "Service registry temporarily unavailable. Please try again shortly." });
    } else if (r === "inactive") {
      res.status(403).json({ error: "client_inactive", message: "This client account is currently inactive." });
    } else if (r === "not_found") {
      res.status(404).json({ error: "no_client_configured", message: "No client record found for this account." });
    } else {
      res.status(422).json({ error: r, message: "Service registry is not properly configured for this client." });
    }
    return;
  }

  const ctx = resolved.context;

  const {
    serviceAreas, topics, frequency, postingTimes, platforms,
    approvalMode, ctaText, ctaPreference, toneStyle, postAngles,
    autoGenerateEnabled, autopilotEnabled, autoMediaEnabled, enginePaused, usedCombos,
  } = req.body;

  // Validate and normalize topics when provided in the request body.
  // Rejects prohibited, coming-soon, disabled, and non-generatable services.
  let normalizedTopics: string[] | null = null;
  if (Array.isArray(topics) && topics.length > 0) {
    for (const topic of topics as string[]) {
      const errorCode = ctx.registry.validateTopic(topic);
      if (errorCode === "SERVICE_COMING_SOON") {
        res.status(422).json({ error: errorCode, message: `"${topic}" is a coming-soon service and cannot be configured.` });
        return;
      }
      if (errorCode === "SERVICE_DISABLED") {
        res.status(422).json({ error: errorCode, message: `"${topic}" is not an offered service and cannot be configured.` });
        return;
      }
      if (errorCode === "SERVICE_NOT_GENERATABLE") {
        res.status(422).json({ error: errorCode, message: `"${topic}" is not eligible for content generation.` });
        return;
      }
    }
    normalizedTopics = ctx.registry.normalizeTopics(topics as string[]);
    if (!normalizedTopics.length) {
      res.status(422).json({ error: "SERVICE_NOT_GENERATABLE", message: "None of the provided topics are eligible for content generation." });
      return;
    }
  }

  // Read the existing row so we can preserve fields not included in this request.
  const [existingRow] = await db.select().from(autoContentSettingsTable)
    .where(eq(autoContentSettingsTable.userId, userId));

  // clientName and industry are authoritative from the canonical client record —
  // never from the request body. This prevents a tenant from impersonating another.
  const values = {
    userId,
    clientName: ctx.clientName,
    industry:   ctx.industry,
    serviceAreas: JSON.stringify(
      Array.isArray(serviceAreas) ? serviceAreas
        : parseJson<string[]>(existingRow?.serviceAreas, ctx.serviceAreas),
    ),
    topics: JSON.stringify(
      normalizedTopics ?? parseJson<string[]>(existingRow?.topics, ctx.topics),
    ),
    frequency:    frequency    ?? existingRow?.frequency    ?? "every_other_day",
    postingTimes: JSON.stringify(
      Array.isArray(postingTimes) ? postingTimes
        : parseJson<string[]>(existingRow?.postingTimes, ["08:00", "12:00", "17:00"]),
    ),
    platforms: JSON.stringify(
      Array.isArray(platforms) ? platforms
        : parseJson<string[]>(existingRow?.platforms, ["facebook"]),
    ),
    approvalMode:  approvalMode  ?? existingRow?.approvalMode  ?? "approval_required",
    ctaText:       ctaText       ?? existingRow?.ctaText       ?? "",
    ctaPreference: ctaPreference ?? existingRow?.ctaPreference ?? "call_now",
    toneStyle: JSON.stringify(
      Array.isArray(toneStyle) ? toneStyle
        : parseJson<string[]>(existingRow?.toneStyle, DEFAULT_TONE),
    ),
    postAngles: JSON.stringify(
      Array.isArray(postAngles) ? postAngles
        : parseJson<string[]>(existingRow?.postAngles, DEFAULT_ANGLES),
    ),
    autoGenerateEnabled: String(autoGenerateEnabled !== false),
    autopilotEnabled: String(
      typeof autopilotEnabled === "boolean"
        ? autopilotEnabled
        : existingRow?.autopilotEnabled === "true",
    ),
    autoMediaEnabled: String(
      typeof autoMediaEnabled === "boolean"
        ? autoMediaEnabled
        : existingRow?.autoMediaEnabled === "true",
    ),
    enginePaused: String(
      autopilotEnabled === true
        ? false
        : typeof enginePaused === "boolean"
          ? enginePaused
          : existingRow?.enginePaused === "true",
    ),
    nextGenerationAt:
      autopilotEnabled === true && !existingRow?.nextGenerationAt
        ? new Date()
        : existingRow?.nextGenerationAt ?? null,
    usedCombos: JSON.stringify(
      Array.isArray(usedCombos) ? usedCombos
        : parseJson<string[]>(existingRow?.usedCombos, []),
    ),
  };

  await db.insert(autoContentSettingsTable).values(values)
    .onConflictDoUpdate({
      target: [autoContentSettingsTable.userId],
      set: {
        clientName:          values.clientName,
        industry:            values.industry,
        serviceAreas:        values.serviceAreas,
        topics:              values.topics,
        frequency:           values.frequency,
        postingTimes:        values.postingTimes,
        platforms:           values.platforms,
        approvalMode:        values.approvalMode,
        ctaText:             values.ctaText,
        ctaPreference:       values.ctaPreference,
        toneStyle:           values.toneStyle,
        postAngles:          values.postAngles,
        autoGenerateEnabled: values.autoGenerateEnabled,
        autopilotEnabled:    values.autopilotEnabled,
        autoMediaEnabled:    values.autoMediaEnabled,
        enginePaused:        values.enginePaused,
        nextGenerationAt:    values.nextGenerationAt,
        usedCombos:          values.usedCombos,
        updatedAt:           new Date(),
      },
    });

  console.log(`[auto-content] settings updated for ${ctx.clientName} (${userId.slice(0, 8)}…)`);
  res.json({ ok: true, clientName: ctx.clientName, industry: ctx.industry });
});

// ── Timezone utility ──────────────────────────────────────────────────────────

// Convert a wall-clock hour:minute in America/Chicago to the correct UTC Date.
// Uses Intl.DateTimeFormat.formatToParts to read the real Chicago offset on
// any given calendar date, so CDT (UTC-5) and CST (UTC-6) are both handled
// correctly without adding an external package.
function chicagoHourToUtc(calDate: Date, hour: number, minute: number): Date {
  // Start with a UTC candidate at the nominal time — this will be off by the
  // Chicago UTC offset, but gives us a reference point close enough to read
  // the real offset from Intl.
  const candidate = new Date(
    Date.UTC(calDate.getFullYear(), calDate.getMonth(), calDate.getDate(), hour, minute),
  );

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone:  "America/Chicago",
    year:      "numeric",
    month:     "2-digit",
    day:       "2-digit",
    hour:      "2-digit",
    minute:    "2-digit",
    hour12:    false,
  }).formatToParts(candidate);

  const get = (type: string) =>
    parseInt(parts.find(p => p.type === type)?.value ?? "0", 10);

  // Chicago wall-clock for our UTC candidate
  const chicagoH   = get("hour") % 24; // formatToParts can return 24 at midnight
  const chicagoMin = get("minute");

  // Difference in minutes between desired and actual Chicago wall-clock
  let diffMin = (hour * 60 + minute) - (chicagoH * 60 + chicagoMin);
  if (diffMin >  720) diffMin -= 1440;
  if (diffMin < -720) diffMin += 1440;

  return new Date(candidate.getTime() + diffMin * 60_000);
}

// ── Rotation logic ────────────────────────────────────────────────────────────

function buildScheduleSlots(
  areas: string[], topics: string[], angles: string[],
  frequency: string, postingTimes: string[], count?: number,
): Array<{ date: Date; city: string; topic: string; angle: string }> {
  const times = postingTimes.length ? postingTimes : ["08:00", "12:00", "17:00"];
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(0, 0, 0, 0);

  let dayOffsets: number[];
  if (count != null) {
    const gap = frequency === "every_day" ? 1 : 2;
    dayOffsets = Array.from({ length: count }, (_, i) => i * gap);
  } else if (frequency === "every_day") {
    dayOffsets = Array.from({ length: 14 }, (_, i) => i);
  } else if (frequency === "3x_week") {
    dayOffsets = [];
    for (let w = 0; w < 2; w++) dayOffsets.push(w * 7, w * 7 + 2, w * 7 + 4);
  } else {
    dayOffsets = Array.from({ length: 7 }, (_, i) => i * 2);
  }

  const allCombos = areas.flatMap(city => topics.map(topic => ({ city, topic })));
  const usedKeys = new Set<string>();
  let lastCity: string | null = null;
  let lastTopic: string | null = null;

  return dayOffsets.map((dayOff, idx) => {
    const date = new Date(start);
    date.setDate(date.getDate() + dayOff);
    const [h, m] = times[idx % times.length].split(":").map(Number);
    // Interpret posting times as America/Chicago wall-clock (CDT/CST-aware)
    date.setTime(chicagoHourToUtc(date, h, m).getTime());

    const available = allCombos.filter(c => !usedKeys.has(`${c.city}:${c.topic}`));
    const pool = available.length ? available : (() => { usedKeys.clear(); return allCombos; })();

    const preferred = pool.filter(c => c.city !== lastCity && c.topic !== lastTopic);
    const fallbackCity = pool.filter(c => c.city !== lastCity);
    const fallbackTopic = pool.filter(c => c.topic !== lastTopic);
    const chosen = (preferred.length ? preferred : fallbackCity.length ? fallbackCity : fallbackTopic.length ? fallbackTopic : pool)[0];

    usedKeys.add(`${chosen.city}:${chosen.topic}`);
    lastCity = chosen.city;
    lastTopic = chosen.topic;

    return { date, city: chosen.city, topic: chosen.topic, angle: angles[idx % angles.length] };
  });
}

// ── POST /auto-content/generate ───────────────────────────────────────────────

router.post("/auto-content/generate", async (req, res) => {
  // ── Auth: Clerk (user-triggered) OR scheduler (internal only) ─────────────
  // SECURITY: Never trust an arbitrary x-scheduler-user-id header — this
  // creates a user impersonation vector for anyone who obtains the scheduler
  // secret. Instead, the scheduler passes x-scheduler-settings-id (the UUID
  // of the auto_content_settings row). We look up the userId from the DB,
  // verifying that autopilot is actually enabled for that tenant.
  const isSchedulerCall = isValidSchedulerSecret(req.headers["x-scheduler-secret"]);
  const { userId: clerkUserId } = getAuth(req);
  let userId: string | null = clerkUserId ?? null;

  if (!userId && isSchedulerCall) {
    const approvedTaskId = req.headers["x-apollos-task-id"] as string | undefined;
    if (approvedTaskId) {
      const [approvedTask] = await db
        .select({ userId: agentTasksTable.userId })
        .from(agentTasksTable)
        .where(and(
          eq(agentTasksTable.id, approvedTaskId),
          eq(agentTasksTable.taskType, "weekly_campaign"),
          inArray(agentTasksTable.status, ["approved", "executing"]),
          eq(agentTasksTable.resolution, "approved"),
        ));
      if (!approvedTask) {
        res.status(403).json({
          error: "APOLLOS_WEEKLY_APPROVAL_BINDING_INVALID",
          message: "The weekly campaign task is not approved for execution.",
        });
        return;
      }
      userId = approvedTask.userId;
    } else {
      const settingsId = req.headers["x-scheduler-settings-id"] as string | undefined;
      if (!settingsId) {
        res.status(401).json({ error: "Unauthorized: scheduler call missing x-scheduler-settings-id" });
        return;
      }
      const [settingsRow] = await db
        .select({ userId: autoContentSettingsTable.userId, autopilotEnabled: autoContentSettingsTable.autopilotEnabled })
        .from(autoContentSettingsTable)
        .where(eq(autoContentSettingsTable.id, settingsId));
      if (!settingsRow || settingsRow.autopilotEnabled !== "true") {
        res.status(403).json({ error: "Forbidden: settings not found or autopilot not enabled" });
        return;
      }
      userId = settingsRow.userId;
    }
  }

  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  // ── Phase B2: Resolve client registry from DB (tenant isolation) ───────────
  // Loads the client record and its DB-backed service registry. This enforces
  // that unknown tenants cannot generate content using BB&B services, and that
  // inactive clients are blocked before any AI generation or DB writes begin.
  // Applies to both Clerk-authenticated users and the internal scheduler path
  // (the scheduler's userId is already resolved from the settings row above).
  let resolvedRegistry: import("@workspace/db").ServiceRegistryProvider | undefined;
  let resolvedClientName: string | undefined;
  let resolvedIndustry: string | undefined;
  {
    const clientResult = await resolveClientContentContextFromDb(userId);
    if (!clientResult.found) {
      const r = clientResult.reason;
      if (r === "inactive") {
        res.status(403).json({ error: "client_inactive", message: "This client account is currently inactive." });
      } else if (r === "not_found") {
        res.status(404).json({ error: "no_client_configured", message: "No client record found for this account. Contact support to set up your account." });
      } else if (r === "registry_unavailable") {
        res.status(503).json({ error: "registry_unavailable", message: "Service registry temporarily unavailable. Please try again shortly." });
      } else {
        // registry_not_configured | registry_invalid | unsupported_registry
        res.status(422).json({ error: r, message: "Service registry is not properly configured for this client." });
      }
      return;
    }
    resolvedRegistry  = clientResult.context.registry;
    resolvedClientName = clientResult.context.clientName;
    resolvedIndustry   = clientResult.context.industry;
  }

  // Resolve canonical clientId for tenant-scoped post inserts.
  // Non-fatal: posts insert successfully without clientId (backward compat).
  let resolvedClientId: string | null = null;
  try {
    const [clientRow] = await db
      .select({ id: clientsTable.id })
      .from(clientsTable)
      .where(eq(clientsTable.userId, userId));
    resolvedClientId = clientRow?.id ?? null;
  } catch {
    // non-fatal — backward-compatible, posts insert without clientId
  }

  const {
    clientName: bodyClientName, industry: bodyIndustry,
    serviceAreas: bodyServiceAreas, topics: bodyTopics,
    frequency: bodyFrequency, postingTimes: bodyPostingTimes, platforms: bodyPlatforms,
    approvalMode: bodyApprovalMode, ctaText: bodyCtaText, ctaPreference: bodyCtaPreference,
    toneStyle: bodyToneStyle, postAngles: bodyPostAngles,
    usedCombos: passedUsedCombos, count,
    schedulerMode: bodySchedulerMode,
  } = req.body;

  let serviceAreas = bodyServiceAreas as string[] | undefined;
  let topics = bodyTopics as string[] | undefined;
  let clientName = bodyClientName;
  let industry = bodyIndustry;
  let frequency = bodyFrequency;
  let postingTimes = bodyPostingTimes;
  let platforms = bodyPlatforms;
  let approvalMode = bodyApprovalMode;
  let ctaText = bodyCtaText;
  let ctaPreference = bodyCtaPreference;
  let toneStyle = bodyToneStyle;
  let postAngles = bodyPostAngles;

  if (!serviceAreas?.length || !topics?.length) {
    const [dbRow] = await db.select().from(autoContentSettingsTable)
      .where(eq(autoContentSettingsTable.userId, userId));
    if (!dbRow) {
      // No settings row — cannot infer content context; require explicit configuration.
      // An authenticated client with no settings row is a misconfiguration: they must
      // call PUT /auto-content/settings first to establish their content context.
      res.status(404).json({ error: "settings_not_found", message: "No content settings found. Configure your settings before generating content." });
      return;
    }
    const dbAreas  = parseJson<string[]>(dbRow.serviceAreas, []);
    const dbTopics = parseJson<string[]>(dbRow.topics, []);
    if (!serviceAreas?.length) {
      serviceAreas = dbAreas;
      if (!serviceAreas.length) {
        res.status(422).json({ error: "service_areas_required", message: "Service areas are required. Add at least one service area in settings." });
        return;
      }
    }
    if (!topics?.length) {
      topics = dbTopics;
      if (!topics.length) {
        res.status(422).json({ error: "topics_required", message: "Topics are required. Add at least one topic in settings." });
        return;
      }
    }
    if (!clientName) clientName = dbRow.clientName;
    if (!industry) industry = dbRow.industry ?? "pest_control";
    if (!frequency) frequency = dbRow.frequency;
    if (!postingTimes?.length) postingTimes = parseJson<string[]>(dbRow.postingTimes, ["08:00", "12:00", "17:00"]);
    if (!platforms?.length) platforms = parseJson<string[]>(dbRow.platforms, ["facebook"]);
    if (!approvalMode) approvalMode = dbRow.approvalMode;
    if (!ctaText) ctaText = dbRow.ctaText;
    if (!ctaPreference) ctaPreference = dbRow.ctaPreference ?? "call_now";
    if (!toneStyle?.length) toneStyle = parseJson<string[]>(dbRow.toneStyle, DEFAULT_TONE);
    if (!postAngles?.length) postAngles = parseJson<string[]>(dbRow.postAngles, DEFAULT_ANGLES);
  }

  if (!serviceAreas?.length || !topics?.length) {
    res.status(422).json({ error: "service_areas_or_topics_required", message: "At least one service area and one topic required." });
    return;
  }

  // ── Client context — canonical configuration carrier for this generation run ─
  // Builds from the already-resolved param values (body overrides merged with DB
  // row above). For BB&B, all defaults reproduce pre-Phase-A1 behavior exactly.
  const context = buildClientContentContext({
    clientName:    clientName     ?? null,
    industry:      industry       ?? null,
    serviceAreas:  serviceAreas   as string[],
    topics:        topics         as string[],
    toneStyle:     Array.isArray(toneStyle)     ? toneStyle     as string[] : null,
    postAngles:    Array.isArray(postAngles)    ? postAngles    as string[] : null,
    postingTimes:  Array.isArray(postingTimes)  ? postingTimes  as string[] : null,
    platforms:     Array.isArray(platforms)     ? platforms     as string[] : null,
    approvalMode:  approvalMode  ?? null,
    ctaText:       ctaText       ?? null,
    ctaPreference: ctaPreference ?? null,
    frequency:     frequency     ?? null,
  }, resolvedRegistry);

  // ── Registry enforcement — hard block prohibited services ──────────────────
  // Check each topic against the client's service registry.
  for (const topic of topics as string[]) {
    const errorCode = context.registry.validateTopic(topic);
    if (errorCode === "SERVICE_COMING_SOON") {
      res.status(422).json({
        error: errorCode,
        message: `"${topic}" is a coming-soon service and cannot be used for content generation.`,
      });
      return;
    }
    if (errorCode === "SERVICE_DISABLED") {
      res.status(422).json({
        error: errorCode,
        message: `"${topic}" is not an offered service and cannot be used for content generation.`,
      });
      return;
    }
    if (errorCode === "SERVICE_NOT_GENERATABLE") {
      res.status(422).json({
        error: errorCode,
        message: `"${topic}" is not eligible for content generation.`,
      });
      return;
    }
  }
  // Normalize: silently strip any remaining blocked entries (defence in depth)
  topics = context.registry.normalizeTopics(topics as string[]);
  if (!topics.length) {
    res.status(422).json({ error: "SERVICE_NOT_GENERATABLE", message: "None of the requested topics are eligible for content generation." });
    return;
  }

  const effectiveAngles: string[] = Array.isArray(postAngles) && postAngles.length ? postAngles : DEFAULT_ANGLES;
  const effectiveTone: string[] = Array.isArray(toneStyle) && toneStyle.length ? toneStyle : DEFAULT_TONE;
  const effectiveTimes: string[] = Array.isArray(postingTimes) && postingTimes.length ? postingTimes : ["08:00", "12:00", "17:00"];

  // Weekly plan identifiers — group all posts from this generation run together.
  // weeklyPlanId is deterministic per-user-per-ISO-week (idempotency key).
  // generationRunId is unique per invocation (distinguishes separate runs in the same week).
  const weeklyPlanId    = (req.body.weeklyPlanId as string | undefined) ?? createWeeklyPlanId(userId);
  const generationRunId = randomUUID();

  // ── Idempotency guard ─────────────────────────────────────────────────────
  // If posts already exist for this weeklyPlanId (same user, same ISO week),
  // return immediately — do NOT generate duplicates.
  const existingPlanCheck = await db
    .select({ id: socialPostsTable.id })
    .from(socialPostsTable)
    .where(and(
      eq(socialPostsTable.userId, userId),
      eq(socialPostsTable.weeklyPlanId, weeklyPlanId),
    ))
    .limit(1);

  if (existingPlanCheck.length > 0) {
    const [{ count: existingCount }] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(socialPostsTable)
      .where(and(
        eq(socialPostsTable.userId, userId),
        eq(socialPostsTable.weeklyPlanId, weeklyPlanId),
      ));
    res.status(200).json({
      ok: true,
      created: 0,
      skipped: existingCount ?? 0,
      reason: "weekly_plan_already_exists",
      weeklyPlanId,
    });
    return;
  }

  // 60/25/15 mix position assignments — for count n slots:
  //   first 60% = revenue, next 25% = education, last 15% = trust
  function assignCampaignGoalByPosition(
    idx: number, total: number, topic: string,
    registry: ServiceRegistryProvider,
  ): { campaignGoal: string; audienceId: string } {
    const svc = registry.matchByTopic(topic);
    const revEnd = Math.round(total * 0.60);
    const eduEnd = Math.round(total * 0.85);
    let bucket: "revenue" | "education" | "trust" =
      idx < revEnd ? "revenue" : idx < eduEnd ? "education" : "trust";

    if (svc?.campaignGoals?.length) {
      const rev = ["call_generation","inspection_booking","treatment_booking","vacation_rental_outreach","property_manager_outreach","commercial_outreach"];
      const edu = ["homeowner_education","prevention","seasonal_alert"];
      const tst = ["review_trust","local_visibility"];
      const pool = bucket === "revenue" ? rev : bucket === "education" ? edu : tst;
      const eligible = svc.campaignGoals.filter((g: string) => pool.includes(g));
      const goals = eligible.length ? eligible : svc.campaignGoals;
      const goal = goals[idx % goals.length] as string;
      const aud = svc.supportedAudiences?.[idx % (svc.supportedAudiences.length || 1)] ?? "homeowners";
      return { campaignGoal: goal, audienceId: aud };
    }
    // Fallback when no registry match
    const fallbackGoals: Record<string, string> = {
      revenue: "call_generation", education: "homeowner_education", trust: "local_visibility",
    };
    return { campaignGoal: fallbackGoals[bucket], audienceId: "homeowners" };
  }

  // ── Slot building: weekly-plan mode uses category-first selectWeeklyServices ─
  // When the scheduler sends schedulerMode='weekly_plan', apply the 60/25/15
  // category budget BEFORE service selection — not as a position-based fallback
  // after the fact. selectWeeklyServices() returns category-aware slots with
  // pre-assigned goals and audiences; we then layer schedule dates onto them.
  // User-triggered generation (no schedulerMode) keeps the existing rotation.
  type EnhancedSlot = ReturnType<typeof buildScheduleSlots>[number] & {
    precomputedServiceId?: string | null;
    precomputedCampaignGoal?: string;
    precomputedAudienceId?: string;
    precomputedRevenueWeight?: string;
    precomputedUrgency?: string | null;
  };

  let slots: EnhancedSlot[];
  const useWeeklyServiceSelection =
    bodySchedulerMode === "weekly_plan" && typeof count === "number" && count > 0;

  if (useWeeklyServiceSelection) {
    const svcSlots = context.registry.selectWeeklySlots(count as number);
    const baseDates = buildScheduleSlots(
      serviceAreas as string[],
      svcSlots.map(s => s.service.displayName),
      effectiveAngles,
      frequency ?? "every_other_day",
      effectiveTimes,
      svcSlots.length,
    );
    slots = baseDates.map((dateSlot, idx) => {
      const svc = svcSlots[idx];
      return {
        ...dateSlot,
        topic: svc?.service.displayName ?? dateSlot.topic,
        precomputedServiceId:     svc?.service.serviceId ?? null,
        precomputedCampaignGoal:  svc?.campaignGoal,
        precomputedAudienceId:    svc?.audienceId,
        precomputedRevenueWeight: svc ? String(svc.service.revenueWeight) : undefined,
        precomputedUrgency:       svc?.service.urgency ?? null,
      };
    });
  } else {
    slots = buildScheduleSlots(
      serviceAreas as string[], topics as string[], effectiveAngles,
      frequency ?? "every_other_day", effectiveTimes,
      typeof count === "number" ? count : undefined,
    ) as EnhancedSlot[];
  }

  const model = getAiModel();
  const system = buildSystemPrompt(context);

  const generated = await Promise.all(
    slots.map(async (slot) => {
      const { date, city, topic, angle,
        precomputedServiceId, precomputedCampaignGoal, precomputedAudienceId,
        precomputedRevenueWeight, precomputedUrgency,
      } = slot as EnhancedSlot;
      const serviceRules = context.registry.getPromptRules(topic);
      const prompt = `Business: ${context.clientName}
City: ${city}
Pest/Service: ${topic}
Post Angle: ${angle}
Tone: ${effectiveTone.join(", ")}
CTA: ${ctaText ?? "Call Now \u2014 (251) 324-9090"}
${serviceRules ? `\n${serviceRules}\n` : ""}
Write a ${angle}-angle post about ${topic} for customers in ${city}.`;
      const precomputed = { precomputedServiceId, precomputedCampaignGoal, precomputedAudienceId, precomputedRevenueWeight, precomputedUrgency };
      try {
        const { text } = await generateText({ model, system, prompt });
        const cleaned = text.trim().replace(/^```json\s*|\s*```$/g, "").replace(/^```\s*|\s*```$/g, "");
        const parsed = JSON.parse(cleaned) as { caption: string; hashtags: string[]; imagePrompt: string };
        return { date, city, topic, angle, ...precomputed, ...parsed, error: null };
      } catch (err: any) {
        const cityShort = city.split(",")[0].replace(/\s+/g, "");
        const topicTag = topic.replace(/\s+/g, "");
        return {
          date, city, topic, angle, ...precomputed,
          caption: `${topic} problem in ${city}? ${context.clientName} is your local expert. ${context.ctaText}`,
          hashtags: [`#PestControl`, `#${topicTag}`, `#${cityShort}AL`, `#GulfCoastAL`, `#PestFree`],
          imagePrompt: `A professional pest control technician inspecting a home exterior in a sunny suburban neighborhood.`,
          error: err?.message as string,
        };
      }
    })
  );

  // Fetch existing queue to compute duplicate risk
  const existingPosts = await db.select({
    aiCity: socialPostsTable.aiCity,
    aiTopic: socialPostsTable.aiTopic,
    aiAngle: socialPostsTable.aiAngle,
  }).from(socialPostsTable).where(and(
    eq(socialPostsTable.userId, userId),
    inArray(socialPostsTable.status, ["scheduled", "draft"]),
  ));

  // approval_required and draft_only both produce drafts; auto_schedule produces scheduled.
  const postStatus =
    approvalMode === "approval_required" || approvalMode === "draft_only"
      ? "draft"
      : "scheduled";
  // approval_required marks posts as pending review; other modes leave approvalStatus null.
  const postApprovalStatus = approvalMode === "approval_required" ? "pending_review" : null;
  const insertedIds: string[] = [];
  const effectiveClient = context.clientName;

  for (const post of generated) {
    const captionFull = post.hashtags?.length
      ? `${post.caption}\n\n${post.hashtags.join(" ")}`
      : post.caption;

    const captionGoogle = Array.isArray(platforms) && platforms.includes("google")
      ? `${post.caption}\n\n${effectiveClient} — Serving ${post.city.split(",")[0].trim()} and surrounding areas.`
      : `${effectiveClient} proudly servicing ${post.city}.`;

    // V3: Compute scoring fields
    const dupRisk = calcDuplicateRisk(post.city, post.topic, post.angle, [
      ...existingPosts,
      ...insertedIds.map((_, i) => ({
        aiCity: generated[i]?.city ?? null,
        aiTopic: generated[i]?.topic ?? null,
        aiAngle: generated[i]?.angle ?? null,
      })),
    ]);
    const bestPlat = calcBestPlatform(post.angle, captionFull.length);
    const imgRec = calcImageRecommendation(post.city, post.topic, post.angle, effectiveClient);
    const score = calcContentScore({
      city: post.city, topic: post.topic, angle: post.angle,
      captionFacebook: captionFull, duplicateRisk: dupRisk,
    });

    const [ins] = await db.insert(socialPostsTable).values({
      userId,
      clientId: resolvedClientId,
      clientName: effectiveClient,
      platforms: JSON.stringify(Array.isArray(platforms) && platforms.length ? platforms : ["facebook"]),
      caption: captionFull,
      captionFacebook: captionFull,
      captionGoogle,
      ctaType: ctaPreference ?? "call_now",
      ctaValue: ctaText ?? "Call Now \u2014 (251) 324-9090",
      scheduledAt: post.date,
      status: postStatus,
      aiCity: post.city,
      aiTopic: post.topic,
      aiAngle: post.angle,
      contentScore: String(score),
      bestPlatform: bestPlat,
      imageRecommendation: imgRec,
      duplicateRisk: dupRisk,
      // V5: Campaign metadata — precomputed from selectWeeklyServices (scheduler
      // weekly-plan mode) or position-derived from registry (user-triggered mode).
      serviceId: post.precomputedServiceId ?? context.registry.matchByTopic(post.topic)?.serviceId ?? null,
      approvalStatus: postApprovalStatus,
      // V5.1: Full campaign tracking — stored at generation time
      weeklyPlanId,
      generationRunId,
      ...(post.precomputedCampaignGoal
        ? { campaignGoal: post.precomputedCampaignGoal, audienceId: post.precomputedAudienceId ?? "homeowners" }
        : assignCampaignGoalByPosition(insertedIds.length, slots.length, post.topic, context.registry)),
      revenueWeight: post.precomputedRevenueWeight ?? String(context.registry.matchByTopic(post.topic)?.revenueWeight ?? ""),
      urgency:       post.precomputedUrgency !== undefined ? post.precomputedUrgency : (context.registry.matchByTopic(post.topic)?.urgency ?? null),
    }).returning({ id: socialPostsTable.id });
    insertedIds.push(ins.id);
  }

  // ── V4: Auto Image Attachment ────────────────────────────────────────────────
  try {
    const assets = await db.select().from(imageAssetsTable)
      .where(eq(imageAssetsTable.userId, userId));
    if (assets.length > 0) {
      const ANGLE_TO_CAT: Record<string, string> = {
        educational: "educational", warning: "warning", promotional: "treatment",
        seasonal: "seasonal", faq: "educational", testimonial: "branding",
        prevention: "prevention", emergency: "warning",
      };
      for (let i = 0; i < generated.length; i++) {
        const gp = generated[i];
        const postId = insertedIds[i];
        const cityLow  = gp.city.split(",")[0].trim().toLowerCase();
        const topicLow = gp.topic.toLowerCase();
        const wantedCat = ANGLE_TO_CAT[gp.angle] ?? "";
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
        // Branding fallback: if no specific match, use any branding-category image
        if (bestScore < 70) {
          const brandingAsset = assets.find(a => a.category === "branding");
          if (brandingAsset) { bestAsset = brandingAsset; bestScore = 70; }
        }
        if (bestScore >= 70 && bestAsset) {
          await db.update(socialPostsTable).set({
            matchedImageId:    bestAsset.id,
            matchedImageUrl:   bestAsset.fileUrl,
            matchedImageScore: String(bestScore),
          }).where(eq(socialPostsTable.id, postId));
        }
      }
    }
  } catch (imgErr) {
    console.warn("[auto-content] image matching failed:", imgErr);
  }

  const now = new Date();
  const prevUsed: string[] = Array.isArray(passedUsedCombos) ? passedUsedCombos : [];
  const newKeys = slots.map(s => `${s.city}:${s.topic}`);
  const allUsed = Array.from(new Set([...prevUsed, ...newKeys]));

  // Use the canonical client identity from the resolver (not body/fallback values).
  // resolvedClientName and resolvedIndustry come from the DB-backed clients table
  // via resolveClientContentContextFromDb — they are always the correct tenant identity.
  await db.insert(autoContentSettingsTable).values({
    userId,
    clientName: resolvedClientName ?? context.clientName,
    industry:   resolvedIndustry   ?? context.industry,
    serviceAreas: JSON.stringify(serviceAreas),
    topics: JSON.stringify(topics),
    frequency: frequency ?? "every_other_day",
    postingTimes: JSON.stringify(effectiveTimes),
    platforms: JSON.stringify(Array.isArray(platforms) ? platforms : ["facebook"]),
    approvalMode: context.approvalMode,
    ctaText:      context.ctaText,
    ctaPreference: context.ctaPreference,
    toneStyle: JSON.stringify(effectiveTone),
    postAngles: JSON.stringify(effectiveAngles),
    autoGenerateEnabled: "true",
    enginePaused: "false",
    usedCombos: JSON.stringify(allUsed),
    lastGeneratedAt: now,
  }).onConflictDoUpdate({
    target: [autoContentSettingsTable.userId],
    set: { usedCombos: JSON.stringify(allUsed), lastGeneratedAt: now, updatedAt: now },
  });

  res.json({
    ok: true,
    created: insertedIds.length,
    posts: generated.map((p, i) => ({
      id: insertedIds[i],
      city: p.city,
      topic: p.topic,
      angle: p.angle,
      caption: p.caption,
      captionFacebook: p.hashtags?.length ? `${p.caption}\n\n${p.hashtags.join(" ")}` : p.caption,
      captionGoogle: `${effectiveClient} proudly servicing ${p.city}.`,
      hashtags: p.hashtags,
      imagePrompt: p.imagePrompt,
      scheduledAt: p.date.toISOString(),
      status: postStatus,
      aiError: p.error,
    })),
    updatedUsedCombos: allUsed,
  });
});

// ── GET /auto-content/queue ───────────────────────────────────────────────────

router.get("/auto-content/queue", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10), 50);

  const posts = await db.select().from(socialPostsTable)
    .where(and(
      eq(socialPostsTable.userId, userId),
      inArray(socialPostsTable.status, ["scheduled", "draft"]),
    ))
    .orderBy(socialPostsTable.scheduledAt)
    .limit(limit);

  const total = await db.select().from(socialPostsTable)
    .where(and(
      eq(socialPostsTable.userId, userId),
      inArray(socialPostsTable.status, ["scheduled", "draft"]),
    ));

  res.json({
    posts: posts.map(p => ({
      id: p.id,
      city: p.aiCity ?? null,
      topic: p.aiTopic ?? null,
      angle: p.aiAngle ?? null,
      caption: (p.captionFacebook ?? p.caption ?? "").slice(0, 120),
      captionFacebook: p.captionFacebook ?? null,
      captionGoogle: p.captionGoogle ?? null,
      platforms: parseJson<string[]>(p.platforms, []),
      scheduledAt: p.scheduledAt?.toISOString() ?? null,
      status: p.status,
      contentScore: p.contentScore ? parseInt(p.contentScore, 10) : null,
      bestPlatform: p.bestPlatform ?? null,
      imageRecommendation: p.imageRecommendation ?? null,
      duplicateRisk: p.duplicateRisk ?? null,
      matchedImageId:    p.matchedImageId ?? null,
      matchedImageUrl:   p.matchedImageUrl ?? null,
      matchedImageScore: p.matchedImageScore ? parseInt(p.matchedImageScore, 10) : null,
    })),
    total: total.length,
  });
});

// ── DELETE /auto-content/queue ────────────────────────────────────────────────

router.delete("/auto-content/queue", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  await db.delete(socialPostsTable)
    .where(and(
      eq(socialPostsTable.userId, userId),
      inArray(socialPostsTable.status, ["scheduled", "draft"]),
    ));

  res.json({ ok: true });
});

// ── POST /auto-content/pause ──────────────────────────────────────────────────

router.post("/auto-content/pause", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Lightweight client check — pause does not require registry validation.
  // It is a safety operation: any active client with settings can pause.
  const clientCheck = await resolveClientActiveCheck(userId);
  if (!clientCheck.ok) {
    if (clientCheck.reason === "not_found") {
      res.status(404).json({ error: "no_client_configured", message: "No client record found for this account." });
    } else {
      res.status(403).json({ error: "client_inactive", message: "This client account is currently inactive." });
    }
    return;
  }

  // UPDATE only — do not create a settings row for tenants that have none.
  // Prefer explicit configuration over implicit row creation.
  const updated = await db
    .update(autoContentSettingsTable)
    .set({ enginePaused: "true", updatedAt: new Date() })
    .where(eq(autoContentSettingsTable.userId, userId))
    .returning({ userId: autoContentSettingsTable.userId });

  if (!updated.length) {
    res.status(404).json({ error: "settings_not_found", message: "No auto-content settings exist for this account. Configure settings before pausing." });
    return;
  }

  console.log(`[auto-content] autopilot paused for ${clientCheck.clientName} (${userId.slice(0, 8)}…)`);
  res.json({ ok: true, enginePaused: true });
});

// ── POST /auto-content/resume ─────────────────────────────────────────────────

router.post("/auto-content/resume", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Full resolution — registry must be valid before enabling the autopilot engine.
  // A broken or unconfigured registry must not gate new content generation.
  const resolved = await resolveClientContentContextFromDb(userId);
  if (!resolved.found) {
    const r = resolved.reason;
    if (r === "registry_unavailable") {
      res.status(503).json({ error: "registry_unavailable", message: "Service registry temporarily unavailable. Cannot resume autopilot." });
    } else if (r === "inactive") {
      res.status(403).json({ error: "client_inactive", message: "This client account is currently inactive." });
    } else if (r === "not_found") {
      res.status(404).json({ error: "no_client_configured", message: "No client record found for this account." });
    } else {
      res.status(422).json({ error: r, message: "Service registry is not properly configured. Cannot resume autopilot." });
    }
    return;
  }

  // Validate that a settings row exists — do not create one implicitly.
  const [settingsRow] = await db.select().from(autoContentSettingsTable)
    .where(eq(autoContentSettingsTable.userId, userId));
  if (!settingsRow) {
    res.status(404).json({ error: "settings_not_found", message: "No auto-content settings exist. Configure settings before resuming." });
    return;
  }

  // Validate required scheduling configuration.
  const configuredAreas  = parseJson<string[]>(settingsRow.serviceAreas, []);
  const configuredTopics = parseJson<string[]>(settingsRow.topics, []);
  if (!configuredAreas.length || !configuredTopics.length) {
    const reason = !configuredAreas.length ? "service_areas_required" : "topics_required";
    console.warn(`[auto-content] resume rejected for ${resolved.context.clientName}: ${reason}`);
    res.status(422).json({ error: reason, message: "Service areas and topics must be configured before resuming autopilot." });
    return;
  }

  // Validate approval mode — only known modes are allowed.
  const approvalMode = settingsRow.approvalMode;
  if (!["approval_required", "draft_only", "auto_schedule"].includes(approvalMode)) {
    console.warn(`[auto-content] resume rejected for ${resolved.context.clientName}: invalid approval_mode "${approvalMode}"`);
    res.status(422).json({ error: "invalid_approval_mode", message: "A valid approval mode must be configured before resuming autopilot." });
    return;
  }

  // UPDATE only — do not create a settings row for tenants that have none.
  const updated = await db
    .update(autoContentSettingsTable)
    .set({ enginePaused: "false", updatedAt: new Date() })
    .where(eq(autoContentSettingsTable.userId, userId))
    .returning({ userId: autoContentSettingsTable.userId });

  if (!updated.length) {
    res.status(404).json({ error: "settings_not_found", message: "No auto-content settings exist for this account." });
    return;
  }

  console.log(`[auto-content] autopilot resumed for ${resolved.context.clientName} (${userId.slice(0, 8)}…)`);
  res.json({ ok: true, enginePaused: false, clientName: resolved.context.clientName, approvalMode });
});

// ── GET /auto-content/suggestions ────────────────────────────────────────────

router.get("/auto-content/suggestions", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [settings] = await db.select().from(autoContentSettingsTable)
    .where(eq(autoContentSettingsTable.userId, userId));

  const posts = await db.select().from(socialPostsTable).where(and(
    eq(socialPostsTable.userId, userId),
    inArray(socialPostsTable.status, ["scheduled", "draft"]),
  )).orderBy(socialPostsTable.scheduledAt).limit(50);

  // Resolve client context for fallback values — never supply BB&B defaults to another tenant.
  const suggestResolved = await resolveClientContentContextFromDb(userId);
  const sgFallbackTopics = suggestResolved.found ? suggestResolved.context.topics       : [];
  const sgFallbackAreas  = suggestResolved.found ? suggestResolved.context.serviceAreas : [];

  const suggestions: string[] = [];

  // Topic repetition
  const topicCounts: Record<string, number> = {};
  for (const p of posts) {
    if (p.aiTopic) topicCounts[p.aiTopic] = (topicCounts[p.aiTopic] ?? 0) + 1;
  }
  const freqTopics = Object.entries(topicCounts).filter(([, c]) => c >= 3).map(([t]) => t);
  if (freqTopics.length >= 2) {
    const configTopics = settings
      ? parseJson<string[]>(settings.topics, sgFallbackTopics)
      : sgFallbackTopics;
    const unusedTopics = configTopics.filter(t => !topicCounts[t]);
    if (unusedTopics.length > 0) {
      suggestions.push(
        `"${freqTopics.slice(0, 2).join('" and "')}" are repeating often — add "${unusedTopics.slice(0, 2).join('" or "')}" posts for more variety.`,
      );
    }
  }

  // Duplicate risk
  const highRisk = posts.filter(p => p.duplicateRisk === "high").length;
  if (highRisk >= 2) {
    suggestions.push(
      `${highRisk} posts have high duplicate risk — clear queue and regenerate for better city/topic variety.`,
    );
  }

  // Queue coverage
  if (posts.length >= 14) {
    suggestions.push(`Queue has ${posts.length} posts — engine is well-stocked for the next ${posts.length} days.`);
  } else if (posts.length < 5) {
    suggestions.push(`Queue is low (${posts.length} post${posts.length !== 1 ? "s" : ""}) — generate next 14 days to stay ahead.`);
  }

  // Average content score
  const scores = posts.map(p => parseInt(p.contentScore ?? "0", 10)).filter(s => s > 0);
  if (scores.length > 0) {
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    if (avg >= 85) {
      suggestions.push(`Average content score is ${avg}/100 — excellent queue quality.`);
    } else if (avg < 60) {
      suggestions.push(`Average content score is ${avg}/100 — regenerate with more complete settings for better scores.`);
    }
  }

  // Best next post suggestion
  if (settings) {
    const areas = parseJson<string[]>(settings.serviceAreas, sgFallbackAreas);
    const settingsTopics = parseJson<string[]>(settings.topics, sgFallbackTopics);
    const usedCombos = parseJson<string[]>(settings.usedCombos, []);
    const unusedCombos = areas
      .flatMap(c => settingsTopics.map(t => ({ city: c, topic: t, key: `${c}:${t}` })))
      .filter(({ key }) => !usedCombos.includes(key));
    if (unusedCombos.length > 0) {
      const next = unusedCombos[0];
      const cityShort = next.city.split(",")[0];
      suggestions.push(
        `Best next post: ${cityShort} · ${next.topic}, seasonal angle, Facebook + Google.`,
      );
    }
  }

  if (suggestions.length === 0) {
    suggestions.push("Generate your first batch of posts to start receiving AI strategy suggestions.");
  }

  res.json({ suggestions });
});

// ── GET /auto-content/analytics ──────────────────────────────────────────────

router.get("/auto-content/analytics", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const posts = await db.select().from(socialPostsTable).where(and(
    eq(socialPostsTable.userId, userId),
    inArray(socialPostsTable.status, ["scheduled", "draft"]),
  )).limit(50);

  const scores = posts.map(p => parseInt(p.contentScore ?? "0", 10)).filter(s => s > 0);
  const averageContentScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;

  const highRiskCount = posts.filter(p => p.duplicateRisk === "high").length;
  const medRiskCount = posts.filter(p => p.duplicateRisk === "medium").length;
  const lowRiskCount = posts.filter(p => p.duplicateRisk === "low").length;

  let queueQuality: "excellent" | "good" | "fair" | "poor" | "empty" = "empty";
  if (averageContentScore !== null) {
    if (averageContentScore >= 85) queueQuality = "excellent";
    else if (averageContentScore >= 70) queueQuality = "good";
    else if (averageContentScore >= 50) queueQuality = "fair";
    else queueQuality = "poor";
  }

  // Best next post: find first post sorted by score desc
  const bestPost = posts
    .filter(p => p.contentScore)
    .sort((a, b) => parseInt(b.contentScore ?? "0", 10) - parseInt(a.contentScore ?? "0", 10))[0];

  res.json({
    averageContentScore,
    duplicateRiskCount: { high: highRiskCount, medium: medRiskCount, low: lowRiskCount },
    queueQuality,
    totalPostsInQueue: posts.length,
    bestNextPost: bestPost ? {
      city: bestPost.aiCity,
      topic: bestPost.aiTopic,
      angle: bestPost.aiAngle,
      score: parseInt(bestPost.contentScore ?? "0", 10),
      bestPlatform: bestPost.bestPlatform,
    } : null,
  });
});

// ── GET /auto-content/insights ────────────────────────────────────────────────

router.get("/auto-content/insights", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const posts = await db.select().from(socialPostsTable)
    .where(eq(socialPostsTable.userId, userId));

  const perfPosts = posts.filter(p => p.engagementScore);

  function scoreOf(p: typeof posts[0]): number {
    if (p.engagementScore) return parseFloat(p.engagementScore);
    if (p.contentScore)    return parseFloat(p.contentScore) * 0.5;
    return 0;
  }

  const source = perfPosts.length >= 3 ? perfPosts : posts;

  function topItem(getKey: (p: typeof posts[0]) => string | null): { value: string; score: number } | null {
    const acc: Record<string, { total: number; count: number }> = {};
    for (const p of source) {
      const k = getKey(p);
      if (!k) continue;
      acc[k] = acc[k] ?? { total: 0, count: 0 };
      acc[k].total += scoreOf(p);
      acc[k].count++;
    }
    const sorted = Object.entries(acc)
      .map(([v, d]) => ({ value: v, score: d.count > 0 ? d.total / d.count : 0 }))
      .sort((a, b) => b.score - a.score);
    return sorted[0] ?? null;
  }

  const topTopic    = topItem(p => p.aiTopic);
  const topCity     = topItem(p => p.aiCity);
  const topAngle    = topItem(p => p.aiAngle);
  const topPlatform = topItem(p => p.bestPlatform);

  const hourAcc: Record<number, { total: number; count: number }> = {};
  for (const p of source) {
    const h = p.scheduledAt ? new Date(p.scheduledAt).getHours() : null;
    if (h === null) continue;
    hourAcc[h] = hourAcc[h] ?? { total: 0, count: 0 };
    hourAcc[h].total += scoreOf(p);
    hourAcc[h].count++;
  }
  const bestHourEntry = Object.entries(hourAcc)
    .map(([h, d]) => ({ hour: parseInt(h), score: d.total / d.count }))
    .sort((a, b) => b.score - a.score)[0];

  function fmtHour(h: number): string {
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12} ${ampm}`;
  }

  const bestPostingTime = bestHourEntry ? fmtHour(bestHourEntry.hour) : null;

  const realPerfPosts = posts.filter(p => p.engagementScore);
  const avgEngagement = realPerfPosts.length > 0
    ? Math.round(realPerfPosts.reduce((s, p) => s + parseFloat(p.engagementScore!), 0) / realPerfPosts.length * 10) / 10
    : null;

  const hasRealData = perfPosts.length >= 3;
  const insights: string[] = [];

  if (posts.length === 0) {
    insights.push("Generate and publish posts to unlock AI performance insights.");
  } else if (!hasRealData) {
    insights.push(`${posts.length} post${posts.length !== 1 ? "s" : ""} tracked — log performance on published posts to unlock personalized insights.`);
    if (topTopic) insights.push(`Most generated topic: ${topTopic.value}. Performance data needed to rank it.`);
    if (topAngle) insights.push(`Most used angle: ${topAngle.value}. Log real metrics to see what's resonating.`);
  } else {
    if (topTopic)    insights.push(`${topTopic.value} posts perform best — avg engagement ${Math.round(topTopic.score * 10) / 10}%.`);
    if (topCity)     insights.push(`${topCity.value.split(",")[0]} is your top city — strongest engagement there.`);
    if (topAngle)    insights.push(`${topAngle.value} angle outperforms others — lean into this style.`);
    if (topPlatform) insights.push(`${topPlatform.value} delivers the best results — prioritize it.`);
    if (bestPostingTime) insights.push(`Posts at ${bestPostingTime} outperform other times.`);
  }

  res.json({
    hasRealData,
    avgEngagementScore: avgEngagement,
    topTopic:       topTopic?.value   ?? null,
    topCity:        topCity?.value?.split(",")[0] ?? null,
    topAngle:       topAngle?.value   ?? null,
    topPlatform:    topPlatform?.value ?? null,
    bestPostingTime,
    totalPosts:     posts.length,
    postsWithPerf:  perfPosts.length,
    insights,
  });
});

// ── GET /auto-content/recommendations ────────────────────────────────────────

router.get("/auto-content/recommendations", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [posts, settingsRow] = await Promise.all([
    db.select().from(socialPostsTable).where(eq(socialPostsTable.userId, userId)),
    db.select().from(autoContentSettingsTable).where(eq(autoContentSettingsTable.userId, userId)).then(r => r[0] ?? null),
  ]);

  const perfPosts = posts.filter(p => p.engagementScore);
  const hasData   = perfPosts.length >= 3;

  type Rec = { type: string; label: string; value: string; reason: string };
  const recs: Rec[] = [];

  if (!hasData) {
    const areas      = settingsRow ? parseJson<string[]>(settingsRow.serviceAreas, []) : [];
    const topics     = settingsRow ? parseJson<string[]>(settingsRow.topics, []) : [];
    const usedCombos = settingsRow ? parseJson<string[]>(settingsRow.usedCombos, []) : [];
    const unused = areas
      .flatMap(c => topics.map(t => ({ city: c, topic: t, key: `${c}:${t}` })))
      .filter(x => !usedCombos.includes(x.key));
    if (unused.length > 0) {
      const next = unused[0];
      recs.push({ type: "topic", label: "Recommended Next Topic", value: next.topic, reason: `${next.city.split(",")[0]} hasn't been covered yet` });
    }
    recs.push({ type: "angle",    label: "Best Angle to Try",     value: "Warning",    reason: "Warning posts typically generate high urgency engagement" });
    recs.push({ type: "time",     label: "Optimal Posting Time",  value: "8 AM",       reason: "Morning posts before commute typically see the highest reach" });
    recs.push({ type: "platform", label: "Priority Platform",     value: "Facebook",   reason: "Local pest control posts perform best on Facebook for Gulf Coast audiences" });
  } else {
    function computeTop(getKey: (p: typeof posts[0]) => string | null): { value: string; avg: number } | null {
      const acc: Record<string, { total: number; count: number }> = {};
      for (const p of perfPosts) {
        const k = getKey(p); if (!k) continue;
        acc[k] = acc[k] ?? { total: 0, count: 0 };
        acc[k].total += parseFloat(p.engagementScore!); acc[k].count++;
      }
      const e = Object.entries(acc).map(([v, d]) => ({ value: v, avg: d.total / d.count })).sort((a, b) => b.avg - a.avg);
      return e[0] ?? null;
    }
    const tAngle    = computeTop(p => p.aiAngle);
    const tTopic    = computeTop(p => p.aiTopic);
    const tCity     = computeTop(p => p.aiCity);
    const hourAcc: Record<number, { total: number; count: number }> = {};
    for (const p of perfPosts) {
      const h = p.scheduledAt ? new Date(p.scheduledAt).getHours() : null;
      if (h === null) continue;
      hourAcc[h] = hourAcc[h] ?? { total: 0, count: 0 };
      hourAcc[h].total += parseFloat(p.engagementScore!); hourAcc[h].count++;
    }
    const bestH = Object.entries(hourAcc).map(([h, d]) => ({ h: parseInt(h), avg: d.total / d.count })).sort((a, b) => b.avg - a.avg)[0];
    const fmtH = (h: number) => { const ap = h >= 12 ? "PM" : "AM"; return `${h === 0 ? 12 : h > 12 ? h - 12 : h} ${ap}`; };
    if (tAngle) recs.push({ type: "angle",  label: "Best Next Post Angle",  value: tAngle.value,                    reason: `${tAngle.value} posts have your highest avg engagement` });
    if (tTopic) recs.push({ type: "topic",  label: "Best Topic This Week",  value: tTopic.value,                    reason: `${tTopic.value} content drives the most engagement` });
    if (tCity)  recs.push({ type: "city",   label: "Best City to Target",   value: tCity.value.split(",")[0],        reason: `${tCity.value.split(",")[0]} sees the strongest response rates` });
    recs.push({            type: "time",   label: "Best Posting Time",     value: bestH ? fmtH(bestH.h) : "8 AM", reason: "Based on your top-performing post schedule" });
  }

  res.json({ recommendations: recs, hasData });
});

// ── POST /auto-content/approve/:id ────────────────────────────────────────────
// Approve a single post that is in pending_review state.
// Records the approver's Clerk userId and timestamp, then advances to "scheduled".

router.post("/auto-content/approve/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { id } = req.params;

  const [post] = await db.select().from(socialPostsTable)
    .where(and(eq(socialPostsTable.id, id), eq(socialPostsTable.userId, userId)));

  if (!post) {
    res.status(404).json({ error: "Post not found." });
    return;
  }
  if (post.status !== "draft") {
    res.status(409).json({ error: "Post is not in draft state and cannot be approved." });
    return;
  }

  await db.update(socialPostsTable).set({
    approvalStatus: "approved",
    approvedBy:     userId,
    approvedAt:     new Date(),
    status:         "scheduled",
    updatedAt:      new Date(),
  }).where(eq(socialPostsTable.id, id));

  res.json({ ok: true, id, status: "scheduled", approvedBy: userId });
});

// ── POST /auto-content/reject/:id ─────────────────────────────────────────────
// Reject a post from the approval queue.

router.post("/auto-content/reject/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { id } = req.params;

  const [post] = await db.select().from(socialPostsTable)
    .where(and(eq(socialPostsTable.id, id), eq(socialPostsTable.userId, userId)));

  if (!post) {
    res.status(404).json({ error: "Post not found." });
    return;
  }

  await db.update(socialPostsTable).set({
    approvalStatus: "rejected",
    approvedBy:     userId,
    approvedAt:     new Date(),
    updatedAt:      new Date(),
  }).where(eq(socialPostsTable.id, id));

  res.json({ ok: true, id, status: post.status, approvalStatus: "rejected" });
});

// ── GET /auto-content/pending-approval ────────────────────────────────────────
// Returns all posts awaiting approval (status=draft, approvalStatus=pending_review).

router.get("/auto-content/pending-approval", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const posts = await db.select().from(socialPostsTable).where(and(
    eq(socialPostsTable.userId, userId),
    eq(socialPostsTable.status, "draft"),
    eq(socialPostsTable.approvalStatus, "pending_review"),
  )).orderBy(socialPostsTable.scheduledAt).limit(50);

  res.json({
    posts: posts.map(p => ({
      id:              p.id,
      serviceId:       p.serviceId ?? null,
      campaignGoal:    p.campaignGoal ?? null,
      city:            p.aiCity ?? null,
      topic:           p.aiTopic ?? null,
      angle:           p.aiAngle ?? null,
      caption:         p.captionFacebook ?? p.caption ?? "",
      platforms:       parseJson<string[]>(p.platforms, []),
      scheduledAt:     p.scheduledAt?.toISOString() ?? null,
      contentScore:    p.contentScore ? parseInt(p.contentScore, 10) : null,
      matchedImageUrl: p.matchedImageUrl ?? null,
      approvalStatus:  p.approvalStatus ?? "pending_review",
      weeklyPlanId:    p.weeklyPlanId ?? null,
    })),
    total: posts.length,
  });
});

// ── GET /auto-content/registry ────────────────────────────────────────────────
// Returns the canonical BB&B service and audience registry for UI consumption.

router.get("/auto-content/registry", (_req, res) => {
  res.json({
    services:  BBB_SERVICES,
    audiences: BBB_AUDIENCES,
    campaignGoals: CAMPAIGN_GOALS,
  });
});

// ── Phase 2: AI Image Generation — Tenant-Safe V1 ────────────────────────────
//
// POST /auto-content/generate-image
//   Resolves tenant, enforces idempotency + rate-limit, persists a 'pending'
//   record BEFORE the provider call, then completes or fails in-place.
//   Returns { ok, generationId, storageKey }.
//
// GET /auto-content/generate-image/:id/signed-url
//   Returns a short-lived signed URL for an approved asset.
//   Used by the Instagram publishing adapter; requires ownership verification.
//
// Security controls:
//   [S1]  Authentication gate (Clerk; 401 on missing session)
//   [S2]  API key fail-fast (503 if not configured; empty Bearer never sent)
//   [S3]  Prompt length limit (≤500 chars; 400 on excess)
//   [S4]  Prohibited-claim block (termites / whole-home heat-treatment; 400)
//   [S5]  Valid size allow-list (400 on unknown)
//   [S6]  Request timeout (30 s AbortController; 504 on breach)
//   [S7]  Response-body size cap (12 MB JSON; 502 on excess)
//   [S8]  Decoded-buffer size cap (8 MB; 502 on excess)
//   [S9]  PNG magic-bytes validation (502 on mismatch)
//   [S10] Failure cleanup: GCS object deleted if DB commit fails (orphan-safe)
//   [S11] API key never logged, never in response, never in migrations
//   [S12] Model hardcoded to gpt-image-1; provider URL from env var only
//   [S13] Objects stored as private (no public ACL set)
//   [S14] Provenance first: pending record written before any provider call
//   [T1]  Tenant isolation: resolveClientContentContextFromDb on every request
//   [I1]  Idempotency: client_id + idempotency_key → return existing record
//   [R1]  Rate-limit: 10 completed/pending generations per hour per client

// PNG magic bytes: 137 80 78 71 13 10 26 10
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Prompt keywords prohibited by the BB&B service registry contract.
const PROHIBITED_IMAGE_PROMPT_KEYWORDS = [
  "termite",
  "whole-home heat",
  "whole home heat",
  "heat treatment",
];

export function isProhibitedImagePrompt(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return PROHIBITED_IMAGE_PROMPT_KEYWORDS.some(kw => lower.includes(kw));
}

// Landscape image generation regularly exceeds 30 seconds under provider load.
// Keep this below the frontend/proxy ceiling while allowing a realistic render.
const IMAGE_GENERATION_TIMEOUT_MS  = 120_000;
const IMAGE_RESPONSE_MAX_BYTES      = 12 * 1024 * 1024;
const IMAGE_BUFFER_MAX_BYTES        = 8  * 1024 * 1024;
const PROMPT_MAX_LENGTH             = 500;
const IMAGE_RATE_LIMIT_PER_HOUR     = Number(process.env.IMAGE_RATE_LIMIT_PER_HOUR ?? "10");
const SIGNED_URL_EXPIRY_SECONDS     = 15 * 60; // 15 minutes

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a server-side structured image prompt from authorized inputs.
 * User-supplied creative brief is supplemental and never overrides the
 * authorized service name or geography.
 */
export function buildImagePrompt(opts: {
  serviceDisplayName: string;
  city?: string;
  creativeBrief?: string;
}): string {
  const parts: string[] = [
    `Professional pest control marketing image for ${opts.serviceDisplayName}`,
  ];
  if (opts.city?.trim()) parts.push(`serving ${opts.city.trim()}`);
  if (opts.creativeBrief?.trim()) parts.push(`Creative brief: ${opts.creativeBrief.trim()}`);
  return parts.join(". ");
}

function parseBucketPath(privateDir: string): { bucketName: string; bucketPrefix: string } {
  const withoutScheme = privateDir.replace(/^gs:\/\//, "");
  const firstSlash    = withoutScheme.indexOf("/");
  return {
    bucketName:   firstSlash === -1 ? withoutScheme : withoutScheme.slice(0, firstSlash),
    bucketPrefix: firstSlash === -1 ? "" : withoutScheme.slice(firstSlash + 1),
  };
}

function makeObjectPath(bucketPrefix: string, imageId: string): string {
  return `${bucketPrefix ? bucketPrefix + "/" : ""}generated-images/${imageId}.png`;
}


function runBrandingFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("brand_overlay_timeout"));
    }, 30_000);
    child.stderr.on("data", chunk => {
      if (stderr.length < 8_000) stderr += String(chunk);
    });
    child.once("error", error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", code => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`brand_overlay_failed:${code}:${stderr.slice(-600)}`));
    });
  });
}

/**
 * Deterministic BB&B branding gate. The provider creates only the campaign
 * artwork; the exact client-supplied logo is composited afterward.
 */
export async function applyBbbBranding(image: Buffer, size: string): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), "bbb-brand-"));
  const sourcePath = join(workDir, "source.png");
  const logoPath = join(workDir, "official-logo.png");
  const outputPath = join(workDir, "branded.png");
  const square = size === "1024x1024";
  const logoWidth = square ? 220 : 300;
  const margin = square ? 28 : 36;
  try {
    await Promise.all([
      writeFile(sourcePath, image),
      writeFile(logoPath, Buffer.from(BBB_LOGO_PNG_BASE64, "base64")),
    ]);
    // Crop the supplied 16:9 white canvas to its centered vertical logo lockup,
    // retain the exact logo pixels, and place it on a clean white brand plaque.
    const filter = [
      `[1:v]crop=440:510:292:32,scale=${logoWidth}:-1[logo]`,
      `[0:v][logo]overlay=W-w-${margin}:H-h-${margin}:format=auto`,
    ].join(";");
    await runBrandingFfmpeg([
      "-y", "-i", sourcePath, "-i", logoPath,
      "-filter_complex", filter,
      "-frames:v", "1",
      outputPath,
    ]);
    const branded = await readFile(outputPath);
    if (!branded.length || branded.length > IMAGE_BUFFER_MAX_BYTES) {
      throw new Error("invalid_branded_image");
    }
    return branded;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

type ImageProviderFailure = {
  code: string;
  message: string;
};

function sanitizeProviderDiagnostic(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  return raw
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted-api-key]")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 300);
}

export function parseImageProviderFailure(status: number, rawBody: string): ImageProviderFailure {
  let code = `provider_http_${status}`;
  let message = "";
  try {
    const parsed = JSON.parse(rawBody) as {
      error?: { code?: unknown; type?: unknown; message?: unknown };
      code?: unknown;
      message?: unknown;
    };
    const providerError = parsed.error;
    const rawCode = providerError?.code ?? providerError?.type ?? parsed.code;
    if (typeof rawCode === "string" && rawCode.trim()) {
      code = sanitizeProviderDiagnostic(rawCode).replace(/[^a-zA-Z0-9_.-]/g, "_");
    }
    message = sanitizeProviderDiagnostic(providerError?.message ?? parsed.message);
  } catch {
    message = sanitizeProviderDiagnostic(rawBody);
  }
  if (!message) message = `Image provider rejected the request (HTTP ${status})`;
  return { code, message };
}

// ── POST /auto-content/generate-image ────────────────────────────────────────
// Security controls (preflight order — provider is never called on any rejection):
//   [S1]  Authentication
//   [T1]  Tenant resolution
//   [S2]  API key fail-fast
//   [T2]  Post/draft ownership — postId must belong to authenticated user
//   [SVC] Service authorization — serviceKey validated against active registry
//   [S3]  Prompt / effectivePrompt validation
//   [S4]  Prohibited-claim enforcement
//   [S5]  Size allow-list
//   [I1]  Idempotency: completed→200, pending→202, failed→atomic UPDATE then retry
//   [R1]  Rate-limit: counts pending + completed + failed (all provider-boundary attempts)
//   [P1]  Pending record INSERT (or reuse of I1 failed-row)
//   [S6]  Provider call with AbortController timeout
//   [S7–S10] Response / buffer / format guards
//   [S13] Private object storage
//   [S14] DB commit

router.post("/auto-content/generate-image", async (req, res): Promise<void> => {
  // [S1] Authentication — Clerk for interactive generation, or the same
  // DB-verified scheduler settings boundary used by autonomous text generation.
  const isSchedulerCall = isValidSchedulerSecret(req.headers["x-scheduler-secret"]);
  const { userId: clerkUserId } = getAuth(req);
  let userId: string | null = clerkUserId ?? null;
  if (!userId && isSchedulerCall) {
    const approvedTaskId = req.headers["x-apollos-task-id"] as string | undefined;
    if (approvedTaskId) {
      const [approvedTask] = await db
        .select({ userId: agentTasksTable.userId })
        .from(agentTasksTable)
        .where(and(
          eq(agentTasksTable.id, approvedTaskId),
          eq(agentTasksTable.taskType, "weekly_campaign"),
          inArray(agentTasksTable.status, ["approved", "executing"]),
          eq(agentTasksTable.resolution, "approved"),
        ));
      if (!approvedTask) {
        res.status(403).json({ error: "APOLLOS_WEEKLY_APPROVAL_BINDING_INVALID" });
        return;
      }
      userId = approvedTask.userId;
    } else {
      const settingsId = req.headers["x-scheduler-settings-id"] as string | undefined;
      if (!settingsId) {
        res.status(401).json({ error: "Unauthorized: scheduler call missing x-scheduler-settings-id" });
        return;
      }
      const [settingsRow] = await db
        .select({
          userId: autoContentSettingsTable.userId,
          autopilotEnabled: autoContentSettingsTable.autopilotEnabled,
          autoMediaEnabled: autoContentSettingsTable.autoMediaEnabled,
        })
        .from(autoContentSettingsTable)
        .where(eq(autoContentSettingsTable.id, settingsId));
      if (!settingsRow || settingsRow.autopilotEnabled !== "true" || settingsRow.autoMediaEnabled !== "true") {
        res.status(403).json({ error: "Forbidden: autonomous media is not enabled" });
        return;
      }
      userId = settingsRow.userId;
    }
  }
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  // [T1] Tenant resolution — every call must resolve to a known active client
  const resolved = await resolveClientContentContextFromDb(userId);
  if (!resolved.found) {
    const r    = resolved.reason;
    const code = r === "not_found" ? 404 : r === "inactive" ? 403 : 503;
    res.status(code).json({ error: "client_resolve_failed", reason: r });
    return;
  }
  const clientId = resolved.client.id;

  // [S2] API key fail-fast — canonical resolver (AI_INTEGRATIONS_OPENAI_API_KEY → OPENAI_API_KEY)
  const baseURL = resolveOpenAiBaseUrl();
  const apiKey  = resolveOpenAiApiKey();
  if (!apiKey) {
    res.status(503).json({ error: "Image generation not available (provider not configured)" });
    return;
  }

  const {
    prompt, postId, size = "1024x1024",
    idempotencyKey, serviceKey, city,
  } = req.body as {
    prompt?: string; postId?: string; size?: string;
    idempotencyKey?: string; serviceKey?: string; city?: string;
  };

  // [T2] Post/draft ownership — if a postId is provided, verify it belongs to this user.
  // Must run BEFORE any provider interaction; provider is never called on 404/403.
  if (postId) {
    const postRow = await pool.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM social_posts WHERE id = $1 LIMIT 1`,
      [postId],
    );
    if (postRow.rows.length === 0) {
      res.status(404).json({ error: "Post not found" });
      return;
    }
    if (postRow.rows[0]!.user_id !== userId) {
      res.status(403).json({ error: "Forbidden: post does not belong to this user" });
      return;
    }
  }

  // [SVC] Service authorization — validate serviceKey against tenant's active registry.
  // Unknown keys (not in registry) are also rejected (not-generatable by convention).
  let resolvedServiceDisplayName: string | undefined;
  if (serviceKey) {
    const svcError = resolved.context.registry.validateTopic(serviceKey);
    if (svcError !== null) {
      const errorCode = svcError === "SERVICE_COMING_SOON" ? "service_coming_soon"
                      : svcError === "SERVICE_DISABLED"    ? "service_disabled"
                      : "service_not_generatable";
      res.status(422).json({
        error: errorCode,
        message: `Service "${serviceKey}" is not available for image generation`,
      });
      return;
    }
    // Also reject keys not present in the registry at all —
    // validateTopic allows unknown topics by design (forward-compat), but
    // image generation must be explicitly authorized via a known serviceId.
    const svcRecord = matchServiceByTopic(serviceKey);
    if (!svcRecord) {
      res.status(422).json({
        error: "unknown_service",
        message: `Service "${serviceKey}" is not recognized`,
      });
      return;
    }
    resolvedServiceDisplayName = svcRecord.displayName;
  }

  // [S3] Build effective prompt — server-side when serviceKey is provided; user prompt
  // is treated as supplemental creative direction only and never overrides the service.
  let effectivePrompt: string;
  if (serviceKey && resolvedServiceDisplayName) {
    effectivePrompt = buildImagePrompt({
      serviceDisplayName: resolvedServiceDisplayName,
      city: city?.trim(),
      creativeBrief: prompt?.trim(),
    });
  } else {
    effectivePrompt = prompt?.trim() ?? "";
  }

  if (!effectivePrompt) {
    res.status(400).json({ error: "prompt or serviceKey is required" });
    return;
  }
  if (effectivePrompt.length > PROMPT_MAX_LENGTH) {
    res.status(400).json({ error: `prompt must be ≤${PROMPT_MAX_LENGTH} characters` });
    return;
  }

  // [S4] Prohibited-claim enforcement on the effective (server-built) prompt
  if (isProhibitedImagePrompt(effectivePrompt)) {
    res.status(400).json({ error: "prompt contains a prohibited service or claim" });
    return;
  }

  // [S5] Size allow-list
  const validSizes = ["1024x1024", "1536x1024", "1024x1536"];
  if (!validSizes.includes(size)) {
    res.status(400).json({ error: `size must be one of: ${validSizes.join(", ")}` });
    return;
  }

  // [I1] Idempotency — resolve or claim existing record.
  // completed → 200 (no provider call); pending → 202 (in-flight);
  // failed → atomic UPDATE to 'pending' so the same row/id is reused (avoids unique-
  //   constraint collision on re-INSERT) and the rate-limit row count remains accurate.
  let reuseImageId: string | null = null;
  if (idempotencyKey) {
    const existing = await pool.query<{ id: string; status: string; storage_key: string | null }>(
      `SELECT id, status, storage_key
         FROM content_image_generations
        WHERE client_id = $1 AND idempotency_key = $2
        LIMIT 1`,
      [clientId, idempotencyKey],
    );
    if (existing.rows.length > 0) {
      const row = existing.rows[0]!;
      if (row.status === "completed") {
        res.json({ ok: true, generationId: row.id, storageKey: row.storage_key, idempotent: true });
        return;
      }
      if (row.status === "pending") {
        res.status(202).json({ ok: false, generationId: row.id, status: "pending", idempotent: true });
        return;
      }
      // status === "failed" — atomically reset to 'pending' for retry.
      // Using WHERE id=$1 AND status='failed' prevents a race where two threads
      // both try to claim the same failed row.
      const updated = await pool.query<{ id: string }>(
        `UPDATE content_image_generations
            SET status = 'pending', failure_reason = NULL, updated_at = NOW()
          WHERE id = $1 AND status = 'failed'
          RETURNING id`,
        [row.id],
      );
      if (updated.rows.length > 0) {
        reuseImageId = updated.rows[0]!.id;
      } else {
        // Another concurrent thread already claimed this row — re-read current status
        const recheck = await pool.query<{ id: string; status: string; storage_key: string | null }>(
          `SELECT id, status, storage_key FROM content_image_generations WHERE id = $1`,
          [row.id],
        );
        const recheckRow = recheck.rows[0];
        if (recheckRow?.status === "completed") {
          res.json({ ok: true, generationId: recheckRow.id, storageKey: recheckRow.storage_key, idempotent: true });
          return;
        }
        if (recheckRow?.status === "pending") {
          res.status(202).json({ ok: false, generationId: recheckRow.id, status: "pending", idempotent: true });
          return;
        }
        res.status(409).json({ error: "Concurrent retry conflict — please use a new idempotency key" });
        return;
      }
    }
  }

  // [R1] Rate-limit — count ALL provider-boundary attempts (pending + completed + failed)
  // in the past hour. Failed retries via the same idempotency key reuse the same row
  // (from [I1] above) so they do not inflate the count beyond 1 per key.
  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const rateRow     = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM content_image_generations
      WHERE client_id = $1 AND created_at > $2 AND status IN ('pending', 'completed', 'failed')`,
    [clientId, windowStart],
  );
  const recentCount = Number(rateRow.rows[0]?.count ?? 0);
  if (recentCount >= IMAGE_RATE_LIMIT_PER_HOUR) {
    res.status(429).json({
      error: "rate_limit_exceeded",
      message: `Maximum ${IMAGE_RATE_LIMIT_PER_HOUR} image generations per hour`,
      limit: IMAGE_RATE_LIMIT_PER_HOUR,
      windowSeconds: 3600,
      retryAfter: 3600,
    });
    return;
  }

  // [P1] Insert 'pending' record BEFORE calling the provider.
  // If we are retrying a failed row ([I1] above), the row already exists as 'pending' —
  // skip the INSERT and reuse reuseImageId.
  const imageId = reuseImageId ?? randomUUID();
  if (!reuseImageId) {
    try {
      await pool.query(
        `INSERT INTO content_image_generations
           (id, client_id, user_id, post_id, service_key, provider, model,
            prompt, size, status, idempotency_key, image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, '')`,
        [imageId, clientId, userId, postId ?? null, serviceKey ?? null,
         "openai", "gpt-image-1", effectivePrompt, size, idempotencyKey ?? null],
      );
    } catch (insertErr: any) {
      // Concurrent duplicate hit the unique index — return the existing record
      if (insertErr?.code === "23505" && idempotencyKey) {
        const dup = await pool.query<{ id: string; status: string }>(
          `SELECT id, status FROM content_image_generations
            WHERE client_id = $1 AND idempotency_key = $2 LIMIT 1`,
          [clientId, idempotencyKey],
        );
        if (dup.rows.length > 0) {
          res.status(202).json({ ok: false, generationId: dup.rows[0]!.id, status: dup.rows[0]!.status, idempotent: true });
          return;
        }
      }
      console.error("[auto-content/generate-image] pending insert error:", insertErr?.message);
      res.status(500).json({ error: "Failed to initialize generation record" });
      return;
    }
  }

  // Helper: mark record as failed (fire-and-forget safe)
  const markFailed = async (reason: string): Promise<void> => {
    await pool.query(
      `UPDATE content_image_generations
          SET status = 'failed', failure_reason = $1, updated_at = NOW(), completed_at = NOW()
        WHERE id = $2`,
      [reason.slice(0, 500), imageId],
    ).catch(() => {});
  };

  // [S6] Timeout via AbortController
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), IMAGE_GENERATION_TIMEOUT_MS);

  let aiRes: Response;
  try {
    // [S12] Model hardcoded; URL from trusted env var only
    aiRes = await fetch(`${baseURL}/images/generations`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,  // [S11] key never logged
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: `${effectivePrompt}. Use this exact brand palette throughout the artwork: deep navy ${BBB_BRAND.navy}, ocean blue ${BBB_BRAND.oceanBlue}, aqua ${BBB_BRAND.aqua}, coral orange ${BBB_BRAND.coralOrange}, and white. Leave the lower-right safe area visually clean for the official logo overlay. Do not generate, imitate, spell, or approximate any logo or business name.`,
        size,
        n: 1,
      }),
      signal: controller.signal,
    });
  } catch (fetchErr: any) {
    clearTimeout(timeoutId);
    if (fetchErr?.name === "AbortError") {
      await markFailed("provider_timeout");
      res.status(504).json({ error: "image_generation_timeout", message: "The image provider did not finish within two minutes. Please retry." });
    } else {
      const reason = sanitizeProviderDiagnostic(fetchErr?.message ?? "unknown");
      console.error("[auto-content/generate-image] provider connection error:", reason);
      await markFailed(`provider_connection_failed:${reason || "unknown"}`);
      res.status(502).json({
        error: "Image provider connection failed",
        code: "provider_connection_failed",
        message: reason
          ? `Could not reach the image provider: ${reason}`
          : "Could not reach the image provider. Check the API base URL and outbound network access.",
      });
    }
    return;
  }
  clearTimeout(timeoutId);

  if (!aiRes.ok) {
    const rawError = (await aiRes.text()).slice(0, 16 * 1024);
    const providerFailure = parseImageProviderFailure(aiRes.status, rawError);
    console.error(
      "[auto-content/generate-image] provider HTTP error:",
      aiRes.status,
      providerFailure.code,
    );
    await markFailed(`provider_http_${aiRes.status}:${providerFailure.code}:${providerFailure.message}`);
    res.status(502).json({
      error: providerFailure.message,
      code: providerFailure.code,
      providerStatus: aiRes.status,
      message: providerFailure.message,
    });
    return;
  }

  // [S7] Response-body size cap
  const rawText = await aiRes.text();
  if (Buffer.byteLength(rawText, "utf8") > IMAGE_RESPONSE_MAX_BYTES) {
    await markFailed("provider_response_too_large");
    res.status(502).json({ error: "Provider response too large" });
    return;
  }

  const aiJson = JSON.parse(rawText) as { data?: Array<{ b64_json?: string }> };
  const b64    = aiJson.data?.[0]?.b64_json;
  if (!b64) {
    await markFailed("no_image_data");
    res.status(502).json({ error: "No image data returned from AI" });
    return;
  }

  // [S8] Decoded-buffer size cap
  const imageBuffer = Buffer.from(b64, "base64");
  if (imageBuffer.length > IMAGE_BUFFER_MAX_BYTES) {
    await markFailed("image_too_large");
    res.status(502).json({ error: "Generated image exceeds maximum allowed size" });
    return;
  }

  // [S9] PNG magic-bytes validation
  if (imageBuffer.length < PNG_MAGIC.length || !imageBuffer.subarray(0, 8).equals(PNG_MAGIC)) {
    await markFailed("invalid_image_format");
    res.status(502).json({ error: "Provider returned unexpected image format" });
    return;
  }

  // Exact brand asset is mandatory. Never save or publish unbranded provider art.
  let brandedImageBuffer: Buffer;
  try {
    brandedImageBuffer = await applyBbbBranding(imageBuffer, size);
  } catch (brandErr: any) {
    console.error("[auto-content/generate-image] branding error:", sanitizeProviderDiagnostic(brandErr?.message ?? "unknown"));
    await markFailed("brand_overlay_failed");
    res.status(500).json({
      error: "Official branding could not be applied",
      message: "The artwork was generated, but the official Bed Bugs & Beyond logo could not be embedded. Nothing was saved or queued.",
    });
    return;
  }

  // ── Persist generated image ───────────────────────────────────────────────
  // Coolify uses the same named durable volume as manual uploads. Other
  // environments continue to use the configured private object store.
  const localMediaDir = process.env.LOCAL_MEDIA_DIR?.trim();
  const privateDir = process.env.PRIVATE_OBJECT_DIR?.trim() ?? "";
  let storageKey: string;
  let localDataPath: string | null = null;
  let localMetadataPath: string | null = null;
  let gcsLocation: { bucketName: string; objectPath: string } | null = null;

  try {
    if (localMediaDir) {
      const uploadsDir = join(localMediaDir, "uploads");
      await mkdir(uploadsDir, { recursive: true });
      localDataPath = join(uploadsDir, imageId);
      localMetadataPath = `${localDataPath}.json`;
      await writeFile(localDataPath, brandedImageBuffer, { flag: "wx" });
      await writeFile(
        localMetadataPath,
        JSON.stringify({ contentType: "image/png", byteSize: brandedImageBuffer.length, brand: "bed-bugs-and-beyond-v1" }),
        { encoding: "utf8", flag: "wx" },
      );
      storageKey = `uploads/${imageId}`;
    } else {
      if (!privateDir) throw new Error("Neither LOCAL_MEDIA_DIR nor PRIVATE_OBJECT_DIR is configured");
      const { bucketName, bucketPrefix } = parseBucketPath(privateDir);
      const objectPath = makeObjectPath(bucketPrefix, imageId);
      await objectStorageClient.bucket(bucketName).file(objectPath)
        .save(brandedImageBuffer, { contentType: "image/png", resumable: false });
      gcsLocation = { bucketName, objectPath };
      storageKey = `generated-images/${imageId}.png`;
    }
  } catch (storageErr: any) {
    if (localDataPath) await unlink(localDataPath).catch(() => {});
    if (localMetadataPath) await unlink(localMetadataPath).catch(() => {});
    console.error("[auto-content/generate-image] storage error:", storageErr?.message);
    await markFailed(`storage_failure:${sanitizeProviderDiagnostic(storageErr?.message ?? "unknown")}`);
    res.status(500).json({
      error: "Failed to store generated image",
      message: "The image was generated, but durable media storage could not save it.",
    });
    return;
  }

  // [S14] Update record to 'completed' with canonical storageKey
  try {
    await pool.query(
      `UPDATE content_image_generations
          SET status = 'completed', storage_key = $1, updated_at = NOW(), completed_at = NOW()
        WHERE id = $2`,
      [storageKey, imageId],
    );
  } catch (dbErr: any) {
    // [S10] DB commit failed — delete the orphaned durable object.
    if (localDataPath) await unlink(localDataPath).catch(() => {});
    if (localMetadataPath) await unlink(localMetadataPath).catch(() => {});
    if (gcsLocation) {
      objectStorageClient.bucket(gcsLocation.bucketName).file(gcsLocation.objectPath)
        .delete({ ignoreNotFound: true }).catch(() => {});
    }
    await markFailed("db_commit_failure");
    console.error("[auto-content/generate-image] DB update error:", dbErr?.message);
    res.status(500).json({ error: "Failed to record image generation" });
    return;
  }

  // Autonomous generations are immediately attached to their owning draft.
  // The object path stays private; publishing adapters resolve it through the
  // existing authenticated/public media URL boundary when delivery is approved.
  if (postId) {
    const mediaPath = `/objects/${storageKey}`;
    await pool.query(
      `UPDATE social_posts
          SET image_data = $1,
              matched_image_url = $1,
              matched_image_score = '100',
              media_filename = $2,
              media_mime_type = 'image/png',
              updated_at = NOW()
        WHERE id = $3 AND user_id = $4`,
      [mediaPath, `campaign-${imageId}.png`, postId, userId],
    );
  }

  res.json({ ok: true, generationId: imageId, storageKey });
});

// ── GET /auto-content/generate-image/:id/signed-url ──────────────────────────
// Returns a short-lived (15-min) signed access URL for an approved asset.
// The Instagram publishing adapter calls this before posting; the URL is never
// persisted — each adapter invocation gets a fresh expiry window.
//
// IDOR guard: the requesting user's client_id MUST match the record's client_id.

router.get("/auto-content/generate-image/:id/signed-url", async (req, res): Promise<void> => {
  // [S1] Authentication
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  // [T1] Tenant resolution
  const resolved = await resolveClientContentContextFromDb(userId);
  if (!resolved.found) {
    const code = resolved.reason === "not_found" ? 404 : 403;
    res.status(code).json({ error: "client_resolve_failed" });
    return;
  }
  const clientId = resolved.client.id;

  const { id } = req.params as { id: string };
  const genRow  = await pool.query<{ id: string; client_id: string; storage_key: string | null; status: string }>(
    `SELECT id, client_id, storage_key, status FROM content_image_generations WHERE id = $1`,
    [id],
  );

  if (genRow.rows.length === 0) {
    res.status(404).json({ error: "Generation not found" });
    return;
  }
  const gen = genRow.rows[0]!;

  // [IDOR] Tenant ownership — never expose one client's asset to another
  if (gen.client_id !== clientId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (gen.status !== "completed" || !gen.storage_key) {
    res.status(409).json({ error: "Image not yet available", status: gen.status });
    return;
  }

  if (gen.storage_key.startsWith("uploads/")) {
    const objectPath = `/objects/${gen.storage_key}`;
    const origin = `${req.protocol}://${req.get("host")}`;
    res.json({
      ok: true,
      signedUrl: `${origin}/api/storage/objects${objectPath}`,
      expiresIn: SIGNED_URL_EXPIRY_SECONDS,
    });
    return;
  }

  const privateDir = process.env.PRIVATE_OBJECT_DIR ?? "";
  if (!privateDir) {
    res.status(500).json({ error: "Object storage not configured" });
    return;
  }

  const { bucketName, bucketPrefix } = parseBucketPath(privateDir);
  const objectPath = `${bucketPrefix ? bucketPrefix + "/" : ""}${gen.storage_key}`;

  try {
    const [signedUrl] = await objectStorageClient.bucket(bucketName).file(objectPath).getSignedUrl({
      version: "v4",
      action:  "read",
      expires: Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000,
    });
    res.json({ ok: true, signedUrl, expiresIn: SIGNED_URL_EXPIRY_SECONDS });
  } catch (signErr: any) {
    console.error("[auto-content/signed-url] error:", signErr?.message);
    res.status(500).json({ error: "Failed to generate signed URL" });
  }
});

const VIDEO_NARRATION_BLOCKLIST = [
  /\btermite(?:s)?\b/i,
  /\bwhole[- ]home heat\b/i,
  /\bheat treatment\b/i,
  /\bwildlife removal\b/i,
];

export function buildSafeVideoNarration(opts: {
  topic?: string | null;
  clientName: string;
  cta: string;
}): string {
  const topic = (opts.topic?.trim() || "local pest prevention")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/#\w+/g, "")
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, "")
    .replace(/[^a-zA-Z0-9&'(),.!? -]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  const cta = opts.cta
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/#\w+/g, "")
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
  const narration = [
    `Here is a quick local pest control update from ${opts.clientName}.`,
    `Today's topic is ${topic}.`,
    "Noticing a pest concern early can help you understand the situation and choose the right next step.",
    `${opts.clientName} proudly serves homeowners and businesses throughout Baldwin County, Alabama, with discreet and professional pest control.`,
    cta || "Contact us today to discuss your pest control needs.",
  ].join(" ");
  const blocked = VIDEO_NARRATION_BLOCKLIST.find(pattern => pattern.test(narration));
  if (blocked) throw new Error("narration_contains_blocked_service");
  return narration.slice(0, 900);
}

// ── Native slideshow video rendering ────────────────────────────────────────
// Creates a branded 16:9 MP4 from an existing campaign image plus AI narration.
// Interactive only for V1: autonomous video cadence remains a separate control.
router.post("/auto-content/generate-video", async (req, res): Promise<void> => {
  const isSchedulerCall = isValidSchedulerSecret(req.headers["x-scheduler-secret"]);
  const { userId: clerkUserId } = getAuth(req);
  let userId: string | null = clerkUserId ?? null;
  if (!userId && isSchedulerCall) {
    const approvedTaskId = req.headers["x-apollos-task-id"] as string | undefined;
    if (!approvedTaskId) {
      res.status(401).json({ error: "Unauthorized: approved Apollos task is required" });
      return;
    }
    const [approvedTask] = await db
      .select({ userId: agentTasksTable.userId })
      .from(agentTasksTable)
      .where(and(
        eq(agentTasksTable.id, approvedTaskId),
        eq(agentTasksTable.taskType, "weekly_campaign"),
        inArray(agentTasksTable.status, ["approved", "executing"]),
        eq(agentTasksTable.resolution, "approved"),
      ));
    if (!approvedTask) {
      res.status(403).json({ error: "APOLLOS_WEEKLY_APPROVAL_BINDING_INVALID" });
      return;
    }
    userId = approvedTask.userId;
  }
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const resolved = await resolveClientContentContextFromDb(userId);
  if (!resolved.found) {
    const code = resolved.reason === "not_found" ? 404 : resolved.reason === "inactive" ? 403 : 503;
    res.status(code).json({ error: "client_resolve_failed", reason: resolved.reason });
    return;
  }

  const postId = typeof req.body?.postId === "string" ? req.body.postId : "";
  if (!postId) { res.status(400).json({ error: "postId is required" }); return; }

  const postResult = await pool.query<{
    id: string; user_id: string; image_data: string | null; matched_image_url: string | null;
    caption: string; caption_facebook: string | null; ai_topic: string | null;
    cta_value: string | null; youtube_title: string | null;
  }>(
    `SELECT id, user_id, image_data, matched_image_url, caption, caption_facebook,
            ai_topic, cta_value, youtube_title
       FROM social_posts WHERE id = $1 LIMIT 1`,
    [postId],
  );
  const post = postResult.rows[0];
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  if (post.user_id !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const imagePath = post.image_data ?? post.matched_image_url;
  if (!imagePath) {
    res.status(422).json({ error: "campaign_image_required", message: "Generate or attach a campaign image before rendering video." });
    return;
  }

  const idempotencyKey = typeof req.body?.idempotencyKey === "string" && req.body.idempotencyKey.trim()
    ? req.body.idempotencyKey.trim().slice(0, 180)
    : `${postId}-youtube-v2`;
  const existing = await pool.query<{ id: string; status: string; storage_key: string | null; duration_seconds: number | null; updated_at: Date }>(
    `SELECT id, status, storage_key, duration_seconds, updated_at
       FROM content_video_generations
      WHERE client_id = $1 AND idempotency_key = $2 LIMIT 1`,
    [resolved.client.id, idempotencyKey],
  );
  if (existing.rows[0]?.status === "completed" && existing.rows[0].storage_key) {
    res.json({
      ok: true,
      generationId: existing.rows[0].id,
      videoPath: `/objects/${existing.rows[0].storage_key}`,
      durationSeconds: existing.rows[0].duration_seconds,
      idempotent: true,
    });
    return;
  }
  const pendingIsFresh = existing.rows[0]?.status === "pending"
    && Date.now() - new Date(existing.rows[0].updated_at).getTime() < 5 * 60_000;
  if (pendingIsFresh) {
    res.status(202).json({ ok: false, generationId: existing.rows[0].id, status: "pending", idempotent: true });
    return;
  }

  const generationId = existing.rows[0]?.id ?? randomUUID();
  const title = (post.youtube_title?.trim() || `${post.ai_topic ?? "Local Pest Control"} | ${resolved.context.clientName}`).slice(0, 100);
  const cta = (post.cta_value?.trim() || resolved.context.ctaText).slice(0, 160);
  let narration: string;
  try {
    narration = buildSafeVideoNarration({
      topic: post.ai_topic ?? title.split("|")[0],
      clientName: resolved.context.clientName,
      cta,
    });
  } catch {
    res.status(422).json({
      error: "narration_safety_block",
      message: "The video script referenced a service Bed Bugs & Beyond does not offer. The video was not generated.",
    });
    return;
  }

  if (existing.rows[0]) {
    await pool.query(
      `UPDATE content_video_generations
          SET status='pending', failure_reason=NULL, narration=$1, source_images=$2, updated_at=NOW()
        WHERE id=$3`,
      [narration, JSON.stringify([imagePath]), generationId],
    );
  } else {
    await pool.query(
      `INSERT INTO content_video_generations
        (id, client_id, user_id, post_id, narration, source_images, status, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,'pending',$7)`,
      [generationId, resolved.client.id, userId, postId, narration, JSON.stringify([imagePath]), idempotencyKey],
    );
  }

  try {
    const requestedVideoMode = req.body?.videoMode === "pest-story" ? "pest-story" : "professional";
    const rendered = await renderNativeCampaignVideo({
      generationId,
      imagePath,
      narration,
      title,
      clientName: resolved.context.clientName,
      cta,
      phoneNumber: "(251) 324-9090",
      videoMode: requestedVideoMode,
      openAiBaseUrl: resolveOpenAiBaseUrl(),
      openAiApiKey: resolveOpenAiApiKey(),
    });

    await pool.query(
      `UPDATE content_video_generations
          SET status='completed', storage_key=$1, duration_seconds=$2,
              completed_at=NOW(), updated_at=NOW()
        WHERE id=$3`,
      [rendered.storageKey, rendered.durationSeconds, generationId],
    );
    await pool.query(
      `UPDATE social_posts
          SET video_url=$1, youtube_title=$2, youtube_privacy='private',
              media_filename=$3, media_mime_type='video/mp4', media_file_size=$4,
              updated_at=NOW()
        WHERE id=$5 AND user_id=$6`,
      [rendered.videoPath, title, `youtube-${generationId}.mp4`, rendered.byteSize, postId, userId],
    );

    res.json({ ok: true, generationId, ...rendered });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    await pool.query(
      `UPDATE content_video_generations
          SET status='failed', failure_reason=$1, completed_at=NOW(), updated_at=NOW()
        WHERE id=$2`,
      [reason.slice(0, 500), generationId],
    ).catch(() => {});
    console.error("[auto-content/generate-video] render failed:", reason);
    res.status(502).json({ error: "video_render_failed", message: "The native video could not be rendered. The draft and image were preserved." });
  }
});

router.get("/auto-content/generate-video/:id/signed-url", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const resolved = await resolveClientContentContextFromDb(userId);
  if (!resolved.found) { res.status(403).json({ error: "client_resolve_failed" }); return; }

  const row = await pool.query<{ client_id: string; status: string; storage_key: string | null }>(
    `SELECT client_id, status, storage_key FROM content_video_generations WHERE id=$1 LIMIT 1`,
    [req.params.id],
  );
  const video = row.rows[0];
  if (!video) { res.status(404).json({ error: "Generation not found" }); return; }
  if (video.client_id !== resolved.client.id) { res.status(403).json({ error: "Forbidden" }); return; }
  if (video.status !== "completed" || !video.storage_key) {
    res.status(409).json({ error: "Video not yet available", status: video.status });
    return;
  }

  if (video.storage_key.startsWith("uploads/")) {
    const origin = `${req.protocol}://${req.get("host")}`;
    res.json({
      ok: true,
      signedUrl: `${origin}/api/storage/objects/objects/${video.storage_key}`,
      expiresIn: SIGNED_URL_EXPIRY_SECONDS,
    });
    return;
  }

  const privateDir = process.env.PRIVATE_OBJECT_DIR ?? "";
  if (!privateDir) { res.status(500).json({ error: "Object storage not configured" }); return; }
  const { bucketName, bucketPrefix } = parseBucketPath(privateDir);
  const objectPath = `${bucketPrefix ? `${bucketPrefix}/` : ""}${video.storage_key}`;
  const [signedUrl] = await objectStorageClient.bucket(bucketName).file(objectPath).getSignedUrl({
    version: "v4", action: "read", expires: Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000,
  });
  res.json({ ok: true, signedUrl, expiresIn: SIGNED_URL_EXPIRY_SECONDS });
});

export default router;

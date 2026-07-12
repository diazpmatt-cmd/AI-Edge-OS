import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { autoContentSettingsTable, socialPostsTable, imageAssetsTable } from "@workspace/db/schema";
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
import { eq, and, inArray, sql } from "drizzle-orm";
import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { SCHEDULER_SECRET } from "../lib/scheduler-secret";
import { resolveClientContentContextFromDb, resolveClientActiveCheck } from "../lib/client-resolver.js";

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

function getAiModel() {
  // Prefer Replit-managed integration (no billing quota); fall back to direct key
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
    ?? process.env.OPENAI_BASE_URL
    ?? "https://api.openai.com/v1";
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
      enginePaused:        false,
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
    enginePaused:        row.enginePaused === "true",
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
    autoGenerateEnabled, enginePaused, usedCombos,
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
    enginePaused:        String(enginePaused === true),
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
        enginePaused:        values.enginePaused,
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

    const captionGoogle = `${effectiveClient} proudly servicing ${post.city}.`;

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

export default router;

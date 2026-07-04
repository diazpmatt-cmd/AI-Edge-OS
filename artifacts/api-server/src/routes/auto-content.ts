import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { autoContentSettingsTable, socialPostsTable, imageAssetsTable } from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const router = Router();

function getAiModel() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set. Add it in Secrets.");
  const gw = createOpenAICompatible({
    name: "openai",
    baseURL: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    headers: { Authorization: `Bearer ${key}` },
  });
  return gw(process.env.OPENAI_MODEL ?? "gpt-4o-mini");
}

const DEFAULT_SERVICE_AREAS = [
  "Foley, AL", "Daphne, AL", "Loxley, AL", "Fairhope, AL", "Gulf Shores, AL",
  "Orange Beach, AL", "Summerdale, AL", "Spanish Fort, AL", "Elberta, AL",
  "Lillian, AL", "Perdido Beach, AL",
];

const DEFAULT_TOPICS = [
  "Bed bugs", "Roaches", "Ants", "Fleas", "Ticks",
  "Mice", "Rats", "Wasps", "Spiders", "Mosquitoes", "Moles",
];

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
    res.json({
      clientName: "Bed Bugs & Beyond",
      industry: "pest_control",
      serviceAreas: DEFAULT_SERVICE_AREAS,
      topics: DEFAULT_TOPICS,
      frequency: "every_other_day",
      postingTimes: ["08:00", "12:00", "17:00"],
      platforms: ["facebook", "google"],
      approvalMode: "auto_schedule",
      ctaText: "Call Now \u2014 (251) 324-9090",
      ctaPreference: "call_now",
      toneStyle: DEFAULT_TONE,
      postAngles: DEFAULT_ANGLES,
      autoGenerateEnabled: true,
      enginePaused: false,
      usedCombos: [],
      lastGeneratedAt: null,
    });
    return;
  }

  const parsedAreas = parseJson<string[]>(row.serviceAreas, []);
  const parsedTopics = parseJson<string[]>(row.topics, []);

  res.json({
    clientName: row.clientName,
    industry: row.industry ?? "pest_control",
    serviceAreas: parsedAreas.length ? parsedAreas : DEFAULT_SERVICE_AREAS,
    topics: parsedTopics.length ? parsedTopics : DEFAULT_TOPICS,
    frequency: row.frequency,
    postingTimes: parseJson<string[]>(row.postingTimes, ["08:00", "12:00", "17:00"]),
    platforms: parseJson<string[]>(row.platforms, ["facebook"]),
    approvalMode: row.approvalMode,
    ctaText: row.ctaText,
    ctaPreference: row.ctaPreference ?? "call_now",
    toneStyle: parseJson<string[]>(row.toneStyle, DEFAULT_TONE),
    postAngles: parseJson<string[]>(row.postAngles, DEFAULT_ANGLES),
    autoGenerateEnabled: row.autoGenerateEnabled !== "false",
    enginePaused: row.enginePaused === "true",
    usedCombos: parseJson<string[]>(row.usedCombos, []),
    lastGeneratedAt: row.lastGeneratedAt?.toISOString() ?? null,
  });
});

// ── PUT /auto-content/settings ────────────────────────────────────────────────

router.put("/auto-content/settings", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const {
    clientName, industry, serviceAreas, topics, frequency, postingTimes, platforms,
    approvalMode, ctaText, ctaPreference, toneStyle, postAngles,
    autoGenerateEnabled, enginePaused, usedCombos,
  } = req.body;

  const values = {
    userId,
    clientName: clientName ?? "Bed Bugs & Beyond",
    industry: industry ?? "pest_control",
    serviceAreas: JSON.stringify(serviceAreas ?? []),
    topics: JSON.stringify(topics ?? []),
    frequency: frequency ?? "every_other_day",
    postingTimes: JSON.stringify(postingTimes ?? ["08:00", "12:00", "17:00"]),
    platforms: JSON.stringify(platforms ?? ["facebook"]),
    approvalMode: approvalMode ?? "auto_schedule",
    ctaText: ctaText ?? "Call Now \u2014 (251) 324-9090",
    ctaPreference: ctaPreference ?? "call_now",
    toneStyle: JSON.stringify(Array.isArray(toneStyle) ? toneStyle : DEFAULT_TONE),
    postAngles: JSON.stringify(Array.isArray(postAngles) ? postAngles : DEFAULT_ANGLES),
    autoGenerateEnabled: String(autoGenerateEnabled !== false),
    enginePaused: String(enginePaused === true),
    usedCombos: JSON.stringify(usedCombos ?? []),
  };

  await db.insert(autoContentSettingsTable).values(values)
    .onConflictDoUpdate({
      target: [autoContentSettingsTable.userId],
      set: {
        clientName: values.clientName,
        industry: values.industry,
        serviceAreas: values.serviceAreas,
        topics: values.topics,
        frequency: values.frequency,
        postingTimes: values.postingTimes,
        platforms: values.platforms,
        approvalMode: values.approvalMode,
        ctaText: values.ctaText,
        ctaPreference: values.ctaPreference,
        toneStyle: values.toneStyle,
        postAngles: values.postAngles,
        autoGenerateEnabled: values.autoGenerateEnabled,
        enginePaused: values.enginePaused,
        usedCombos: values.usedCombos,
        updatedAt: new Date(),
      },
    });

  res.json({ ok: true });
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
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const {
    clientName: bodyClientName, industry: bodyIndustry,
    serviceAreas: bodyServiceAreas, topics: bodyTopics,
    frequency: bodyFrequency, postingTimes: bodyPostingTimes, platforms: bodyPlatforms,
    approvalMode: bodyApprovalMode, ctaText: bodyCtaText, ctaPreference: bodyCtaPreference,
    toneStyle: bodyToneStyle, postAngles: bodyPostAngles,
    usedCombos: passedUsedCombos, count,
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
    if (dbRow) {
      const dbAreas = parseJson<string[]>(dbRow.serviceAreas, []);
      const dbTopics = parseJson<string[]>(dbRow.topics, []);
      if (!serviceAreas?.length) serviceAreas = dbAreas.length ? dbAreas : DEFAULT_SERVICE_AREAS;
      if (!topics?.length) topics = dbTopics.length ? dbTopics : DEFAULT_TOPICS;
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
    } else {
      if (!serviceAreas?.length) serviceAreas = DEFAULT_SERVICE_AREAS;
      if (!topics?.length) topics = DEFAULT_TOPICS;
    }
  }

  if (!serviceAreas?.length || !topics?.length) {
    res.status(400).json({ error: "At least one service area and one topic required." });
    return;
  }

  const effectiveAngles: string[] = Array.isArray(postAngles) && postAngles.length ? postAngles : DEFAULT_ANGLES;
  const effectiveTone: string[] = Array.isArray(toneStyle) && toneStyle.length ? toneStyle : DEFAULT_TONE;
  const effectiveTimes: string[] = Array.isArray(postingTimes) && postingTimes.length ? postingTimes : ["08:00", "12:00", "17:00"];

  const slots = buildScheduleSlots(
    serviceAreas as string[], topics as string[], effectiveAngles,
    frequency ?? "every_other_day", effectiveTimes,
    typeof count === "number" ? count : undefined,
  );

  const model = getAiModel();
  const system = `You are a local pest control social media copywriter for the Gulf Coast of Alabama. Write authentic, local posts that feel genuine. Return ONLY valid JSON:
{"caption":string,"hashtags":string[],"imagePrompt":string}
Rules: caption is 2-3 sentences, mentions the specific city by name, names the pest/service naturally, matches the post angle (educational=informative, warning=urgent risk, promotional=offer/deal, seasonal=time-relevant, faq=question+answer, testimonial=social proof voice, prevention=tips, emergency=urgent call), ends with the CTA. No markdown, no code fences. hashtags: 5-8 tags mixing local and service tags. imagePrompt: 1 sentence describing a realistic photo. JSON only.`;

  const generated = await Promise.all(
    slots.map(async ({ date, city, topic, angle }) => {
      const prompt = `Business: ${clientName || "Bed Bugs & Beyond"}
City: ${city}
Pest/Service: ${topic}
Post Angle: ${angle}
Tone: ${effectiveTone.join(", ")}
CTA: ${ctaText ?? "Call Now \u2014 (251) 324-9090"}

Write a ${angle}-angle post about ${topic} for customers in ${city}.`;
      try {
        const { text } = await generateText({ model, system, prompt });
        const cleaned = text.trim().replace(/^```json\s*|\s*```$/g, "").replace(/^```\s*|\s*```$/g, "");
        const parsed = JSON.parse(cleaned) as { caption: string; hashtags: string[]; imagePrompt: string };
        return { date, city, topic, angle, ...parsed, error: null };
      } catch (err: any) {
        const cityShort = city.split(",")[0].replace(/\s+/g, "");
        const topicTag = topic.replace(/\s+/g, "");
        return {
          date, city, topic, angle,
          caption: `${topic} problem in ${city}? ${clientName || "Bed Bugs & Beyond"} is your local expert. ${ctaText ?? "Call Now"}`,
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

  const postStatus = approvalMode === "draft_only" ? "draft" : "scheduled";
  const insertedIds: string[] = [];
  const effectiveClient = clientName || "Bed Bugs & Beyond";

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

  await db.insert(autoContentSettingsTable).values({
    userId,
    clientName: clientName ?? "Bed Bugs & Beyond",
    industry: industry ?? "pest_control",
    serviceAreas: JSON.stringify(serviceAreas),
    topics: JSON.stringify(topics),
    frequency: frequency ?? "every_other_day",
    postingTimes: JSON.stringify(effectiveTimes),
    platforms: JSON.stringify(Array.isArray(platforms) ? platforms : ["facebook"]),
    approvalMode: approvalMode ?? "auto_schedule",
    ctaText: ctaText ?? "Call Now \u2014 (251) 324-9090",
    ctaPreference: ctaPreference ?? "call_now",
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

  await db.insert(autoContentSettingsTable).values({
    userId, clientName: "Bed Bugs & Beyond",
    serviceAreas: JSON.stringify(DEFAULT_SERVICE_AREAS),
    topics: JSON.stringify(DEFAULT_TOPICS),
    frequency: "every_other_day", postingTimes: '["08:00","12:00","17:00"]',
    platforms: '["facebook","google"]', approvalMode: "auto_schedule",
    ctaText: "Call Now \u2014 (251) 324-9090", usedCombos: "[]", enginePaused: "true",
  }).onConflictDoUpdate({
    target: [autoContentSettingsTable.userId],
    set: { enginePaused: "true", updatedAt: new Date() },
  });

  res.json({ ok: true, enginePaused: true });
});

// ── POST /auto-content/resume ─────────────────────────────────────────────────

router.post("/auto-content/resume", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  await db.insert(autoContentSettingsTable).values({
    userId, clientName: "Bed Bugs & Beyond",
    serviceAreas: JSON.stringify(DEFAULT_SERVICE_AREAS),
    topics: JSON.stringify(DEFAULT_TOPICS),
    frequency: "every_other_day", postingTimes: '["08:00","12:00","17:00"]',
    platforms: '["facebook","google"]', approvalMode: "auto_schedule",
    ctaText: "Call Now \u2014 (251) 324-9090", usedCombos: "[]", enginePaused: "false",
  }).onConflictDoUpdate({
    target: [autoContentSettingsTable.userId],
    set: { enginePaused: "false", updatedAt: new Date() },
  });

  res.json({ ok: true, enginePaused: false });
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

  const suggestions: string[] = [];

  // Topic repetition
  const topicCounts: Record<string, number> = {};
  for (const p of posts) {
    if (p.aiTopic) topicCounts[p.aiTopic] = (topicCounts[p.aiTopic] ?? 0) + 1;
  }
  const freqTopics = Object.entries(topicCounts).filter(([, c]) => c >= 3).map(([t]) => t);
  if (freqTopics.length >= 2) {
    const configTopics = settings
      ? parseJson<string[]>(settings.topics, DEFAULT_TOPICS)
      : DEFAULT_TOPICS;
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
    const areas = parseJson<string[]>(settings.serviceAreas, DEFAULT_SERVICE_AREAS);
    const settingsTopics = parseJson<string[]>(settings.topics, DEFAULT_TOPICS);
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
    const areas      = settingsRow ? parseJson<string[]>(settingsRow.serviceAreas, DEFAULT_SERVICE_AREAS) : DEFAULT_SERVICE_AREAS;
    const topics     = settingsRow ? parseJson<string[]>(settingsRow.topics, DEFAULT_TOPICS) : DEFAULT_TOPICS;
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

export default router;

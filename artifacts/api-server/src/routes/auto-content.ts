import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { autoContentSettingsTable, socialPostsTable } from "@workspace/db/schema";
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

  res.json({
    clientName: row.clientName,
    industry: row.industry ?? "pest_control",
    serviceAreas: parseJson<string[]>(row.serviceAreas, []),
    topics: parseJson<string[]>(row.topics, []),
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
    date.setHours(h, m, 0, 0);

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
    clientName, industry, serviceAreas, topics, frequency, postingTimes, platforms,
    approvalMode, ctaText, ctaPreference, toneStyle, postAngles,
    usedCombos: passedUsedCombos, count,
  } = req.body;

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
      const prompt = `Business: ${clientName ?? "Bed Bugs & Beyond"}
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
          caption: `${topic} problem in ${city}? ${clientName ?? "Bed Bugs & Beyond"} is your local expert. ${ctaText ?? "Call Now"}`,
          hashtags: [`#PestControl`, `#${topicTag}`, `#${cityShort}AL`, `#GulfCoastAL`, `#PestFree`],
          imagePrompt: `A professional pest control technician inspecting a home exterior in a sunny suburban neighborhood.`,
          error: err?.message as string,
        };
      }
    })
  );

  const postStatus = approvalMode === "draft_only" ? "draft" : "scheduled";
  const insertedIds: string[] = [];
  const effectiveClient = clientName ?? "Bed Bugs & Beyond";

  for (const post of generated) {
    const captionFull = post.hashtags?.length
      ? `${post.caption}\n\n${post.hashtags.join(" ")}`
      : post.caption;

    const captionGoogle = `${effectiveClient} proudly servicing ${post.city}.`;

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
    }).returning({ id: socialPostsTable.id });
    insertedIds.push(ins.id);
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
      captionFacebook: p.captionFacebook ? p.captionFacebook.slice(0, 120) : null,
      captionGoogle: p.captionGoogle ?? null,
      platforms: parseJson<string[]>(p.platforms, []),
      scheduledAt: p.scheduledAt?.toISOString() ?? null,
      status: p.status,
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
    userId, clientName: "Bed Bugs & Beyond", serviceAreas: "[]", topics: "[]",
    frequency: "every_other_day", postingTimes: '["08:00","12:00","17:00"]',
    platforms: '["facebook"]', approvalMode: "auto_schedule",
    ctaText: "Call Now", usedCombos: "[]", enginePaused: "true",
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
    userId, clientName: "Bed Bugs & Beyond", serviceAreas: "[]", topics: "[]",
    frequency: "every_other_day", postingTimes: '["08:00","12:00","17:00"]',
    platforms: '["facebook"]', approvalMode: "auto_schedule",
    ctaText: "Call Now", usedCombos: "[]", enginePaused: "false",
  }).onConflictDoUpdate({
    target: [autoContentSettingsTable.userId],
    set: { enginePaused: "false", updatedAt: new Date() },
  });

  res.json({ ok: true, enginePaused: false });
});

export default router;

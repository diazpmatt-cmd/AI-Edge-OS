import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { autoContentSettingsTable, socialPostsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
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
  "Rats", "Wasps", "Spiders", "Mosquitoes", "Moles",
];

function parseJson<T>(raw: string, fallback: T): T {
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

router.get("/auto-content/settings", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [row] = await db.select().from(autoContentSettingsTable)
    .where(eq(autoContentSettingsTable.userId, userId));

  if (!row) {
    res.json({
      clientName: "Bed Bugs & Beyond",
      serviceAreas: DEFAULT_SERVICE_AREAS,
      topics: DEFAULT_TOPICS,
      frequency: "every_other_day",
      postingTimes: ["08:00", "12:00", "17:00"],
      platforms: ["facebook"],
      approvalMode: "auto_schedule",
      ctaText: "Call Now \u2014 (251) 324-9090",
      usedCombos: [],
    });
    return;
  }

  res.json({
    clientName: row.clientName,
    serviceAreas: parseJson<string[]>(row.serviceAreas, []),
    topics: parseJson<string[]>(row.topics, []),
    frequency: row.frequency,
    postingTimes: parseJson<string[]>(row.postingTimes, ["08:00", "12:00", "17:00"]),
    platforms: parseJson<string[]>(row.platforms, ["facebook"]),
    approvalMode: row.approvalMode,
    ctaText: row.ctaText,
    usedCombos: parseJson<string[]>(row.usedCombos, []),
  });
});

router.put("/auto-content/settings", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { clientName, serviceAreas, topics, frequency, postingTimes, platforms, approvalMode, ctaText, usedCombos } = req.body;

  const values = {
    userId,
    clientName: clientName ?? "Bed Bugs & Beyond",
    serviceAreas: JSON.stringify(serviceAreas ?? []),
    topics: JSON.stringify(topics ?? []),
    frequency: frequency ?? "every_other_day",
    postingTimes: JSON.stringify(postingTimes ?? ["08:00", "12:00", "17:00"]),
    platforms: JSON.stringify(platforms ?? ["facebook"]),
    approvalMode: approvalMode ?? "auto_schedule",
    ctaText: ctaText ?? "Call Now \u2014 (251) 324-9090",
    usedCombos: JSON.stringify(usedCombos ?? []),
  };

  await db.insert(autoContentSettingsTable).values(values)
    .onConflictDoUpdate({
      target: [autoContentSettingsTable.userId],
      set: {
        clientName: values.clientName,
        serviceAreas: values.serviceAreas,
        topics: values.topics,
        frequency: values.frequency,
        postingTimes: values.postingTimes,
        platforms: values.platforms,
        approvalMode: values.approvalMode,
        ctaText: values.ctaText,
        usedCombos: values.usedCombos,
        updatedAt: new Date(),
      },
    });

  res.json({ ok: true });
});

router.post("/auto-content/generate", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const {
    clientName,
    serviceAreas,
    topics,
    frequency,
    postingTimes,
    platforms,
    approvalMode,
    ctaText,
    usedCombos: passedUsedCombos,
  } = req.body;

  if (!serviceAreas?.length || !topics?.length) {
    res.status(400).json({ error: "At least one service area and one topic required." });
    return;
  }

  const allCombos: { city: string; topic: string }[] = [];
  for (const city of serviceAreas as string[]) {
    for (const topic of topics as string[]) {
      allCombos.push({ city, topic });
    }
  }

  let usedCombos: string[] = Array.isArray(passedUsedCombos) ? passedUsedCombos : [];

  function getNextCombo(used: string[]): { city: string; topic: string; updatedUsed: string[] } {
    const remaining = allCombos.filter(c => !used.includes(`${c.city}:${c.topic}`));
    const pool = remaining.length > 0 ? remaining : allCombos;
    const next = pool[0];
    const key = `${next.city}:${next.topic}`;
    const newUsed = remaining.length > 0 ? [...used, key] : [key];
    return { city: next.city, topic: next.topic, updatedUsed: newUsed };
  }

  const times: string[] = Array.isArray(postingTimes) && postingTimes.length > 0
    ? postingTimes
    : ["08:00", "12:00", "17:00"];

  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 1);
  startDate.setHours(0, 0, 0, 0);

  const postDayOffsets: number[] = [];
  if (frequency === "every_day") {
    for (let d = 0; d < 14; d++) postDayOffsets.push(d);
  } else if (frequency === "3x_week") {
    for (let w = 0; w < 2; w++) {
      postDayOffsets.push(w * 7 + 0, w * 7 + 2, w * 7 + 4);
    }
  } else {
    for (let d = 0; d < 14; d += 2) postDayOffsets.push(d);
  }

  const postSlots: Date[] = postDayOffsets.map((dayOffset, idx) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + dayOffset);
    const timeStr = times[idx % times.length];
    const [h, m] = timeStr.split(":").map(Number);
    d.setHours(h, m, 0, 0);
    return d;
  });

  let currentUsed = [...usedCombos];
  const postsToGenerate = postSlots.map(date => {
    const { city, topic, updatedUsed } = getNextCombo(currentUsed);
    currentUsed = updatedUsed;
    return { date, city, topic };
  });

  const model = getAiModel();
  const system = `You are a local pest control social media copywriter for the Gulf Coast of Alabama. Write friendly, direct, local posts that feel authentic. Return ONLY valid JSON matching exactly:
{"caption":string,"hashtags":string[],"imagePrompt":string}
Rules: caption is 2-3 sentences, mentions the specific city by name, names the pest/service naturally, and ends with the CTA. No markdown, no code fences. hashtags: 5-8 tags mixing local (e.g. #GulfCoastAL) and service tags. imagePrompt: 1 sentence describing a realistic hero photo. JSON only.`;

  const generated = await Promise.all(
    postsToGenerate.map(async ({ date, city, topic }) => {
      const prompt = `Business: ${clientName}\nCity: ${city}\nPest/Service: ${topic}\nCTA: ${ctaText}`;
      try {
        const { text } = await generateText({ model, system, prompt });
        const cleaned = text.trim().replace(/^```json\s*|\s*```$/g, "").replace(/^```\s*|\s*```$/g, "");
        const parsed = JSON.parse(cleaned) as { caption: string; hashtags: string[]; imagePrompt: string };
        return { date, city, topic, ...parsed, error: null };
      } catch (err: any) {
        const cityShort = city.split(",")[0].replace(/\s+/g, "");
        const topicTag = topic.replace(/\s+/g, "");
        return {
          date, city, topic,
          caption: `${topic} problem in ${city}? ${clientName} is your local expert. ${ctaText}`,
          hashtags: [`#PestControl`, `#${topicTag}`, `#${cityShort}AL`, `#GulfCoastAL`, `#PestFree`],
          imagePrompt: `A professional pest control technician inspecting a home exterior in a sunny suburban neighborhood.`,
          error: err?.message as string,
        };
      }
    })
  );

  const postStatus = approvalMode === "draft_only" ? "draft" : "scheduled";
  const insertedIds: string[] = [];

  for (const post of generated) {
    const captionFull = post.hashtags?.length
      ? `${post.caption}\n\n${post.hashtags.join(" ")}`
      : post.caption;

    const [ins] = await db.insert(socialPostsTable).values({
      userId,
      clientName: clientName ?? "Bed Bugs & Beyond",
      platforms: JSON.stringify(Array.isArray(platforms) && platforms.length ? platforms : ["facebook"]),
      caption: captionFull,
      ctaType: "call_now",
      ctaValue: ctaText ?? "Call Now \u2014 (251) 324-9090",
      scheduledAt: post.date,
      status: postStatus,
    }).returning({ id: socialPostsTable.id });
    insertedIds.push(ins.id);
  }

  await db.insert(autoContentSettingsTable).values({
    userId,
    clientName: clientName ?? "Bed Bugs & Beyond",
    serviceAreas: JSON.stringify(serviceAreas),
    topics: JSON.stringify(topics),
    frequency: frequency ?? "every_other_day",
    postingTimes: JSON.stringify(times),
    platforms: JSON.stringify(Array.isArray(platforms) ? platforms : ["facebook"]),
    approvalMode: approvalMode ?? "auto_schedule",
    ctaText: ctaText ?? "Call Now \u2014 (251) 324-9090",
    usedCombos: JSON.stringify(currentUsed),
  }).onConflictDoUpdate({
    target: [autoContentSettingsTable.userId],
    set: { usedCombos: JSON.stringify(currentUsed), updatedAt: new Date() },
  });

  res.json({
    ok: true,
    created: insertedIds.length,
    posts: generated.map((p, i) => ({
      id: insertedIds[i],
      city: p.city,
      topic: p.topic,
      caption: p.caption,
      hashtags: p.hashtags,
      imagePrompt: p.imagePrompt,
      scheduledAt: p.date.toISOString(),
      status: postStatus,
      aiError: p.error,
    })),
    updatedUsedCombos: currentUsed,
  });
});

export default router;

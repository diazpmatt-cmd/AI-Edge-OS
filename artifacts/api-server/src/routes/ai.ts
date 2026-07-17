import { Router } from "express";
import { getAuth } from "@clerk/express";
import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

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
  return gw(process.env.OPENAI_MODEL ?? "gpt-5-mini");
}

router.post("/ai/keywords", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { businessName, industry, city, state, mainServices, targetCustomers = "" } = req.body;
  const model = getAiModel();
  const system = `You are a local SEO keyword research expert. Return ONLY valid JSON matching:
{"keywords":[{"keyword":string,"volume":integer,"difficulty":"Low"|"Medium"|"High","intent":"Local"|"Commercial"|"Informational"|"Transactional","service":string}]}
Rules: 10 keywords total, all distinct. Mix of local geo-modified terms, informational, and commercial intents. Tie each keyword to ONE specific service. volume = realistic monthly US search estimate (50-15000). No markdown, JSON only.`;
  const prompt = `Business: ${businessName}\nIndustry: ${industry}\nLocation: ${city}, ${state}\nServices: ${mainServices}\nTarget customers: ${targetCustomers}`;
  try {
    const { text } = await generateText({ model, system, prompt });
    const cleaned = text.trim().replace(/^```json\s*|\s*```$/g, "").replace(/^```\s*|\s*```$/g, "");
    const parsed = JSON.parse(cleaned);
    res.json(parsed);
  } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

router.post("/ai/article", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { title, keyword, service, businessName, industry, city, state, mainServices = "", targetCustomers = "" } = req.body;
  const model = getAiModel();
  const system = `You are an expert local-SEO content writer. Write a publish-ready article in clean Markdown. Rules: Use the exact target keyword in the H1 (#) and at least 2 H2s (##). 800-1100 words. Conversational, helpful, US English. Mention the city and state naturally. Include intro, why it matters locally, what to expect, signs to call a pro, why choose ${businessName}, and a clear CTA. Numbered or bulleted lists where useful. Markdown body only.`;
  const prompt = `Business: ${businessName}\nIndustry: ${industry}\nLocation: ${city}, ${state}\nServices: ${mainServices}\nTarget customers: ${targetCustomers}\n\nArticle title: ${title}\nTarget keyword: ${keyword}\nService focus: ${service}`;
  try {
    const { text } = await generateText({ model, system, prompt });
    res.json({ body: text.trim() });
  } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

const ASSET_CHANNELS = [
  { id: "google_business", label: "Google Business Profile Post", instruction: "Write a Google Business Profile update post, max 1500 characters. Friendly, helpful, with a clear call-to-action. Plain text only." },
  { id: "facebook", label: "Facebook Post", instruction: "Write a Facebook post, 80–120 words. Conversational, ending with a question or CTA. Include 1–2 relevant emojis. Plain text only." },
  { id: "instagram", label: "Instagram Caption", instruction: "Write an Instagram caption (3–5 short paragraphs) followed by a blank line and 12–18 relevant hashtags on one line. Plain text only." },
  { id: "linkedin", label: "LinkedIn Post", instruction: "Write a professional LinkedIn post, ~150 words. Hook, insight tied to the topic and local market, CTA. Plain text only." },
  { id: "youtube_short", label: "YouTube Short Script", instruction: "Write a 30–45 second YouTube Short script. Format as timestamped lines like `[0:00] Hook ...`. Hook in first 3 seconds, value, CTA at end. Plain text only." },
];

router.post("/ai/article-assets", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { title, keyword, service = "", businessName = "", city = "", state = "", body = "" } = req.body;
  const model = getAiModel();
  const context = `Article title: ${title}\nTarget keyword: ${keyword}\nService: ${service}\nBusiness: ${businessName}\nLocation: ${city}${state ? `, ${state}` : ""}\n\nSource article:\n${(body as string).slice(0, 4000)}`;
  const system = `You are a multi-channel social and SEO content writer. Output only the requested asset — no preface, no commentary. Use US English.`;
  const results = await Promise.all(ASSET_CHANNELS.map(async (c) => {
    try {
      const { text } = await generateText({ model, system, prompt: `${context}\n\nTask: ${c.instruction}` });
      return { channel: c.id, body: text.trim(), status: "draft", errorMessage: null };
    } catch (err: unknown) {
      return { channel: c.id, body: "", status: "failed", errorMessage: err instanceof Error ? err.message : String(err) };
    }
  }));
  res.json({ assets: results });
});

const REPURPOSE_CHANNELS = [
  { id: "seo_article", label: "SEO Article", instruction: "Write a publish-ready Markdown article, 800–1100 words. Use the target keyword in the H1 and at least two H2s. Localize naturally. Include intro, why it matters locally, what to expect, why choose the business, and a clear CTA. Markdown only." },
  { id: "google_business", label: "Google Business Post", instruction: "Write a Google Business Profile update post, max 1500 characters. Helpful, friendly, with a clear CTA. Plain text only." },
  { id: "facebook", label: "Facebook Post", instruction: "Write a Facebook post, 80–120 words, conversational, ending with a question or CTA. Include 1–2 relevant emojis. Plain text only." },
  { id: "instagram", label: "Instagram Post", instruction: "Write an Instagram caption (3–5 short paragraphs) followed by a blank line and 12–18 relevant hashtags. Plain text only." },
  { id: "linkedin", label: "LinkedIn Post", instruction: "Write a professional LinkedIn post, ~150 words. Hook, insight tied to the topic, CTA. Plain text only." },
  { id: "x", label: "X Post", instruction: "Write a single X (Twitter) post, strictly under 280 characters total. Punchy, max 2 hashtags. Plain text only." },
  { id: "email", label: "Email Newsletter", instruction: "Write a short email newsletter. First line: `Subject: <subject line>`. Then 120–200 word body with a clear CTA. Plain text only." },
  { id: "youtube_short", label: "YouTube Short Script", instruction: "Write a 30–45 second YouTube Short script. Format as timestamped lines. Hook in first 3 seconds, value, CTA. Plain text only." },
  { id: "tiktok", label: "TikTok Script", instruction: "Write a 15–30 second TikTok script. Format as `[Scene 1] visual — voiceover`. Strong hook, fast pace, CTA. Plain text only." },
  { id: "image_prompt", label: "Image Prompt", instruction: "Write ONE detailed image-generation prompt (2–4 sentences) for a hero image for this content. Describe subject, setting, mood, lighting, style. Just the prompt." },
];

router.post("/ai/repurpose", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { businessName, service, city, state = "", keyword } = req.body;
  const model = getAiModel();
  const context = `Business: ${businessName}\nService: ${service}\nCity: ${city}${state ? `, ${state}` : ""}\nTarget keyword: ${keyword}`;
  const system = `You are a multi-channel content writer. Produce ONLY the requested asset. US English. No disclaimers.`;
  const results = await Promise.all(REPURPOSE_CHANNELS.map(async (c) => {
    try {
      const { text } = await generateText({ model, system, prompt: `${context}\n\nTask: ${c.instruction}` });
      return { channel: c.id, label: c.label, body: text.trim() };
    } catch (err: unknown) {
      return { channel: c.id, label: c.label, body: `[Error: ${err instanceof Error ? err.message : String(err)}]` };
    }
  }));
  res.json({ assets: results });
});

export default router;

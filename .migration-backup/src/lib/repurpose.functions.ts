import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { getAiModel } from "./ai-gateway.server";

const Input = z.object({
  businessName: z.string().min(1),
  service: z.string().min(1),
  city: z.string().min(1),
  state: z.string().default(""),
  keyword: z.string().min(1),
});

const CHANNEL_PROMPTS: { id: string; label: string; instruction: string }[] = [
  {
    id: "seo_article",
    label: "SEO Article",
    instruction:
      "Write a publish-ready Markdown article, 800–1100 words. Use the target keyword in the H1 and at least two H2s. Localize naturally to the city/state. Include intro, why it matters locally, what to expect, signs to call a pro, why choose the business, and a clear CTA. Markdown only.",
  },
  {
    id: "google_business",
    label: "Google Business Post",
    instruction:
      "Write a Google Business Profile update post, max 1500 characters. Helpful, friendly, with a clear call-to-action at the end. Plain text only.",
  },
  {
    id: "facebook",
    label: "Facebook Post",
    instruction:
      "Write a Facebook post, 80–120 words, conversational, ending with a question or CTA. Include 1–2 relevant emojis. Plain text only.",
  },
  {
    id: "instagram",
    label: "Instagram Post",
    instruction:
      "Write an Instagram caption (3–5 short paragraphs) followed by a line break and 12–18 relevant hashtags on one line. Plain text only.",
  },
  {
    id: "linkedin",
    label: "LinkedIn Post",
    instruction:
      "Write a professional LinkedIn post, ~150 words. Lead with a hook, share an insight tied to the keyword and local market, end with a CTA. Plain text only.",
  },
  {
    id: "x",
    label: "X Post",
    instruction:
      "Write a single X (Twitter) post, strictly under 280 characters total. Punchy, no hashtags spam (max 2). Plain text only.",
  },
  {
    id: "email",
    label: "Email Newsletter",
    instruction:
      "Write a short email newsletter. First line: `Subject: <subject line>`. Then a blank line, then 120–200 word body with a clear CTA. Plain text only.",
  },
  {
    id: "youtube_short",
    label: "YouTube Short Script",
    instruction:
      "Write a 30–45 second YouTube Short script. Format as timestamped lines like `[0:00] Hook ...`. Hook in first 3 seconds, value, CTA at end. Plain text only.",
  },
  {
    id: "tiktok",
    label: "TikTok Script",
    instruction:
      "Write a 15–30 second TikTok script. Format as `[Scene 1] visual — voiceover`. Strong hook, fast pace, CTA. Plain text only.",
  },
  {
    id: "image_prompt",
    label: "Image Prompt",
    instruction:
      "Write ONE detailed image-generation prompt (2–4 sentences) suitable for an AI image generator to create a hero image for this content. Describe subject, setting, mood, lighting, style. No commentary, just the prompt.",
  },
];

export const generateContentPackage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const model = getAiModel();

    const context = `Business: ${data.businessName}
Service: ${data.service}
Location: ${data.city}${data.state ? `, ${data.state}` : ""}
Target keyword: ${data.keyword}`;

    const system = `You are an expert local-SEO and social content writer. Output only the requested asset — no preface, no commentary, no code fences. Do NOT mention termites. Use US English.`;

    const results = await Promise.all(
      CHANNEL_PROMPTS.map(async (c) => {
        try {
          const { text } = await generateText({
            model,
            system,
            prompt: `${context}\n\nTask: ${c.instruction}`,
          });
          return { channel: c.id, title: c.label, body: text.trim() };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          const lower = msg.toLowerCase();
          if (lower.includes("429") || lower.includes("rate")) {
            throw new Error("Rate limit reached. Please try again in a moment.");
          }
          if (lower.includes("402") || lower.includes("credit")) {
            throw new Error("AI credits exhausted. Add credits in Workspace Settings.");
          }
          throw new Error(`${c.label} generation failed: ${msg}`);
        }
      }),
    );

    return { assets: results };
  });

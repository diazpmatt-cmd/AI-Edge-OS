import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { getAiModel } from "./ai-gateway.server";

const Input = z.object({
  title: z.string().min(1),
  keyword: z.string().min(1),
  service: z.string().default(""),
  businessName: z.string().default(""),
  city: z.string().default(""),
  state: z.string().default(""),
  body: z.string().default(""),
});

const CHANNELS: { id: string; label: string; instruction: string }[] = [
  {
    id: "google_business",
    label: "Google Business Profile Post",
    instruction:
      "Write a Google Business Profile update post, max 1500 characters. Friendly, helpful, with a clear call-to-action at the end. Plain text only.",
  },
  {
    id: "facebook",
    label: "Facebook Post",
    instruction:
      "Write a Facebook post, 80–120 words. Conversational, ending with a question or CTA. Include 1–2 relevant emojis. Plain text only.",
  },
  {
    id: "instagram",
    label: "Instagram Caption",
    instruction:
      "Write an Instagram caption (3–5 short paragraphs). After a blank line, add 12–18 relevant hashtags on one line. Plain text only.",
  },
  {
    id: "linkedin",
    label: "LinkedIn Post",
    instruction:
      "Write a professional LinkedIn post, ~150 words. Hook, insight tied to the topic and local market, CTA. Plain text only.",
  },
  {
    id: "youtube_short",
    label: "YouTube Short Script",
    instruction:
      "Write a 30–45 second YouTube Short script. Format as timestamped lines like `[0:00] Hook ...`. Hook in first 3 seconds, value, CTA at end. Plain text only.",
  },
];

export const generateArticleAssets = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const model = getAiModel();

    const context = `Source article title: ${data.title}
Target keyword: ${data.keyword}
Service: ${data.service}
Business: ${data.businessName}
Location: ${data.city}${data.state ? `, ${data.state}` : ""}

Source article (for reference; condense, don't quote):
${data.body.slice(0, 4000)}`;

    const system = `You are a multi-channel social and SEO content writer. Output only the requested asset — no preface, no commentary, no code fences. Do NOT mention termites. Use US English.`;

    const results = await Promise.all(
      CHANNELS.map(async (c) => {
        try {
          const { text } = await generateText({
            model,
            system,
            prompt: `${context}\n\nTask: ${c.instruction}`,
          });
          return { channel: c.id, body: text.trim(), status: "draft" as const, errorMessage: null as string | null };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return { channel: c.id, body: "", status: "failed" as const, errorMessage: msg };
        }
      }),
    );

    return { assets: results };
  });

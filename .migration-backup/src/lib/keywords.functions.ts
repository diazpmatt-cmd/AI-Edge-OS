import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { getAiModel } from "./ai-gateway.server";

const Input = z.object({
  businessName: z.string().min(1),
  industry: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  mainServices: z.string().min(1),
  targetCustomers: z.string().default(""),
});

const KeywordSchema = z.object({
  keyword: z.string().min(2),
  volume: z.number().int().nonnegative(),
  difficulty: z.enum(["Low", "Medium", "High"]),
  intent: z.enum(["Local", "Commercial", "Informational", "Transactional"]),
  service: z.string().min(1),
});

const Output = z.object({ keywords: z.array(KeywordSchema).min(6).max(14) });

export const generateKeywordIdeas = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const model = getAiModel();

    const system = `You are a local SEO keyword research expert. Return ONLY valid JSON matching:
{"keywords":[{"keyword":string,"volume":integer,"difficulty":"Low"|"Medium"|"High","intent":"Local"|"Commercial"|"Informational"|"Transactional","service":string}]}
Rules:
- 10 keywords total, all distinct.
- Mix of local geo-modified terms (include city or "near me"), informational ("how to", "signs of"), and commercial ("best", "cost") intents.
- Tie each keyword to ONE specific service from the business's services list (use exact service phrasing from the list).
- volume = realistic monthly US search volume estimate (50-15000).
- Do NOT include any keywords about termites or termite control.
- No markdown, no commentary, JSON only.`;

    const prompt = `Generate keyword ideas.

Business: ${data.businessName}
Industry: ${data.industry}
Location: ${data.city}, ${data.state}
Services: ${data.mainServices}
Target customers: ${data.targetCustomers}`;

    try {
      const { text } = await generateText({ model, system, prompt });
      const cleaned = text.trim().replace(/^```json\s*|\s*```$/g, "").replace(/^```\s*|\s*```$/g, "");
      const parsed = Output.parse(JSON.parse(cleaned));
      // Filter out any termite mentions defensively
      const filtered = parsed.keywords.filter((k) => !/termite/i.test(k.keyword));
      return { keywords: filtered };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const lower = msg.toLowerCase();
      if (lower.includes("429") || lower.includes("rate")) {
        throw new Error("Rate limit reached. Please try again in a moment.");
      }
      if (lower.includes("402") || lower.includes("credit")) {
        throw new Error("AI credits exhausted. Add credits in Workspace Settings.");
      }
      throw new Error(`Keyword generation failed: ${msg}`);
    }
  });

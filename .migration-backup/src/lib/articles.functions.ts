import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { getAiModel } from "./ai-gateway.server";

const Input = z.object({
  title: z.string().min(1),
  keyword: z.string().min(1),
  service: z.string().min(1),
  businessName: z.string().min(1),
  industry: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  mainServices: z.string().default(""),
  targetCustomers: z.string().default(""),
});

export const generateArticleContent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const model = getAiModel();

    const system = `You are an expert local-SEO content writer. Write a publish-ready article in clean Markdown.
Rules:
- Use the exact target keyword in the H1 (#) and at least 2 H2s (##).
- 800-1100 words. Conversational, helpful, US English.
- Mention the city and state naturally several times; localize examples.
- Include sections like: intro, why it matters locally, what to expect / how it works, signs to call a pro, why choose ${data.businessName}, and a clear CTA.
- Numbered or bulleted lists where useful.
- No HTML, no front matter, no commentary — Markdown body only.
- Do NOT mention termites.`;

    const prompt = `Write the article.

Business: ${data.businessName}
Industry: ${data.industry}
Location: ${data.city}, ${data.state}
Services: ${data.mainServices}
Target customers: ${data.targetCustomers}

Article title: ${data.title}
Target keyword: ${data.keyword}
Service focus: ${data.service}`;

    try {
      const { text } = await generateText({
        model,
        system,
        prompt,
      });
      return { body: text.trim() };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const lower = msg.toLowerCase();
      if (lower.includes("429") || lower.includes("rate")) {
        throw new Error("Rate limit reached. Please try again in a moment.");
      }
      if (lower.includes("402") || lower.includes("credit")) {
        throw new Error("AI credits exhausted. Add credits in Workspace Settings.");
      }
      throw new Error(`Article generation failed: ${msg}`);
    }
  });

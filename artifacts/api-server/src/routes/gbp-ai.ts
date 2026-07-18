/**
 * GBP AI Generation — Phase 4
 *
 * POST /api/gbp/ai/generate
 *   Generates AI content for a specific GBP check key using the business profile
 *   as context. Supported checkKeys: business_description, google_post,
 *   review_response, services_list, faq_answers, cover_photo_brief,
 *   logo_brief, products_list.
 */

import { Router }  from "express";
import { getAuth } from "@clerk/express";
import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { db, eq } from "@workspace/db";
import { localPresenceProfilesTable } from "@workspace/db";

const router = Router();

function getAiModel() {
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

interface BusinessCtx {
  businessName: string;
  city:         string;
  state:        string;
  phone:        string;
  website:      string;
}

type GeneratorDef = {
  system:  string;
  prompt:  (ctx: BusinessCtx) => string;
  isJson?: boolean;
};

const GENERATORS: Record<string, GeneratorDef> = {
  business_description: {
    system: `You are an expert Google Business Profile copywriter specializing in local SEO. Write a compelling, keyword-rich GBP business description. Requirements: 700-750 characters total, include the business name naturally, mention the primary service area/city, use relevant local service keywords throughout, close with a call-to-action that mentions the phone number or website. Return plain text only — no markdown, no quotes, no label.`,
    prompt: (c) => `Business: ${c.businessName}\nLocation: ${c.city}${c.state ? `, ${c.state}` : ""}\nPhone: ${c.phone}\nWebsite: ${c.website}\n\nWrite the optimized GBP business description (700-750 chars):`,
  },
  google_post: {
    system: `You are a Google Business Profile post writer for local businesses. Write an engaging "What's New" GBP post that drives calls and visits. Requirements: 900-1100 characters, open with a hook about a relevant seasonal topic or service benefit, mention the city name once naturally, include a direct call-to-action with the phone number or website at the end. Return plain text only.`,
    prompt: (c) => `Business: ${c.businessName}\nLocation: ${c.city}${c.state ? `, ${c.state}` : ""}\nPhone: ${c.phone}\nWebsite: ${c.website}\n\nWrite the Google Business Profile post:`,
  },
  review_response: {
    system: `You are an expert at writing review responses that build trust and improve GBP engagement. Write exactly 3 response templates:\n\nTemplate 1 — 5-Star Review: Warm, personal, thank the reviewer by role not name, mention a specific service detail, invite them to refer friends.\n\nTemplate 2 — 4-Star with Minor Issue: Acknowledge the positive, address the minor issue professionally, invite them to reach out directly.\n\nTemplate 3 — 3-Star Mixed: Empathize, apologize for any shortfall, offer to resolve it offline, provide contact info.\n\nEach response: 3-4 sentences, mention the business name, professional and warm tone. Label each template clearly. Plain text only.`,
    prompt: (c) => `Business: ${c.businessName}\nLocation: ${c.city}${c.state ? `, ${c.state}` : ""}\nPhone: ${c.phone}\n\nGenerate the 3 review response templates:`,
  },
  services_list: {
    system: `You are a local business SEO specialist creating a GBP services list. Return ONLY a valid JSON array. Each object: {"name": string (2-5 words, capitalized), "description": string (under 100 chars, keyword-rich, no period at end)}. Generate 10-12 service entries relevant to the business. No markdown, no commentary, JSON array only.`,
    prompt: (c) => `Business: ${c.businessName}\nLocation: ${c.city}${c.state ? `, ${c.state}` : ""}\n\nGenerate the GBP services JSON array:`,
    isJson: true,
  },
  faq_answers: {
    system: `You are a local business SEO expert optimizing Google Q&A. Generate 6 high-value Q&A pairs. Return ONLY valid JSON: [{"question": string, "answer": string}]. Rules: questions must match real customer searches (e.g. "Do you serve [city]?", "How much does X cost?", "Are you licensed and insured?"), answers are 2-3 sentences, include the business name in at least 2 answers. No markdown, JSON array only.`,
    prompt: (c) => `Business: ${c.businessName}\nLocation: ${c.city}${c.state ? `, ${c.state}` : ""}\nPhone: ${c.phone}\n\nGenerate the Q&A JSON array:`,
    isJson: true,
  },
  cover_photo_brief: {
    system: `You are a visual branding expert for local businesses. Write a creative brief for a Google Business Profile cover photo (1332x750px) optimized for search visibility and trust. Structure your response with these labeled sections:\n\n1. HERO SUBJECT — what to feature prominently\n2. BACKGROUND & SETTING — scene, environment, atmosphere\n3. COLOR PALETTE — specific colors that reinforce brand trust\n4. TEXT OVERLAY — whether to include text, and if so what\n5. PHOTOGRAPHY STYLE — lighting, composition, mood\n6. WHY THIS WORKS — how it increases click-through and trust\n\nBe specific and actionable. Plain text only.`,
    prompt: (c) => `Business: ${c.businessName}\nLocation: ${c.city}${c.state ? `, ${c.state}` : ""}\n\nWrite the cover photo creative brief:`,
  },
  logo_brief: {
    system: `You are a brand identity designer specializing in local service businesses. Write a design brief for a Google Business Profile logo that looks excellent at small sizes (it appears as a circle thumbnail). Structure with labeled sections:\n\n1. STYLE DIRECTION — modern/traditional/illustrated/etc\n2. ICON CONCEPT — specific symbol or mark idea\n3. COLOR PALETTE — 2-3 colors with hex codes\n4. TYPOGRAPHY — font style recommendation\n5. WHAT TO AVOID — common mistakes for this type of business\n6. INSPIRATION REFERENCES — describe 2 brands with similar successful logos\n\nPlain text only, practical and specific.`,
    prompt: (c) => `Business: ${c.businessName}\nLocation: ${c.city}${c.state ? `, ${c.state}` : ""}\n\nWrite the logo design brief:`,
  },
  products_list: {
    system: `You are a local business catalog specialist. Generate a GBP products/services catalog. Return ONLY valid JSON: [{"name": string (marketable package name), "description": string (under 150 chars, outcome-focused), "price": string (e.g. "From $149", "Call for pricing", "$49–$199")}]. Generate 7-9 entries representing service tiers or packages. No markdown, JSON array only.`,
    prompt: (c) => `Business: ${c.businessName}\nLocation: ${c.city}${c.state ? `, ${c.state}` : ""}\nPhone: ${c.phone}\n\nGenerate the products/packages JSON array:`,
    isJson: true,
  },
};

export const GBP_AI_GENERATORS = GENERATORS;

// ── POST /api/gbp/ai/generate ─────────────────────────────────────────────────

router.post("/gbp/ai/generate", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { clientId = "default", checkKey } = req.body as {
    clientId?: string;
    checkKey:  string;
  };

  if (!checkKey) return res.status(400).json({ error: "checkKey required" });

  const gen = GENERATORS[checkKey];
  if (!gen) {
    return res.status(400).json({
      error:         `No AI generator for checkKey: ${checkKey}`,
      availableKeys: Object.keys(GENERATORS),
    });
  }

  try {
    const [profile] = await db
      .select()
      .from(localPresenceProfilesTable)
      .where(eq(localPresenceProfilesTable.clientId, clientId));

    const ctx: BusinessCtx = {
      businessName: profile?.businessName || "Local Business",
      city:         profile?.city         || "your city",
      state:        profile?.state        || "",
      phone:        profile?.phone        || "call us",
      website:      profile?.website      || "our website",
    };

    const model   = getAiModel();
    const { text } = await generateText({
      model,
      system: gen.system,
      prompt: gen.prompt(ctx),
    });

    let content: unknown = text.trim();
    if (gen.isJson) {
      try {
        const cleaned = text.trim()
          .replace(/^```json\s*|\s*```$/g, "")
          .replace(/^```\s*|\s*```$/g, "");
        content = JSON.parse(cleaned);
      } catch {
        // return raw text on parse failure
      }
    }

    return res.json({
      checkKey,
      content,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[gbp-ai] generate error:", msg);
    return res.status(500).json({ error: msg });
  }
});

export default router;

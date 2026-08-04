import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { db } from "@workspace/db";
import { leadsTable, type Lead } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

export const leadUrgencySchema = z.preprocess((value) => {
  if (typeof value !== "string") return "normal";
  const normalized = value.trim().toLowerCase();
  if (["emergency", "critical", "immediate"].includes(normalized)) return "emergency";
  if (["high", "urgent", "soon"].includes(normalized)) return "high";
  if (["low", "routine", "non-urgent", "nonurgent"].includes(normalized)) return "low";
  return "normal";
}, z.enum(["low", "normal", "high", "emergency"]));

const optionalAnalysisText = z.preprocess(
  (value) => typeof value === "string" && value.trim().length === 0 ? null : value,
  z.string().trim().min(1).max(160).nullable(),
);

const unsafeLanguage = [
  /\btermite(?:s)?\b/i,
  /\bguarantee(?:d|s)?\b/i,
  /\bappointment\s+(?:is|has been)\s+(?:confirmed|booked|scheduled)\b/i,
  /\b(?:we|technician|team)\s+will\s+arrive\s+(?:at|by|within)\b/i,
  /\bprice\s+(?:is|will be)\s+\$?\d/i,
  /\b(?:complete|total|permanent)\s+elimination\b/i,
];

export const leadAnalysisOutputSchema = z.object({
  service: optionalAnalysisText,
  location: optionalAnalysisText,
  urgency: leadUrgencySchema,
  summary: z.string().trim().min(1).max(500),
  missingInformation: z.array(z.string().trim().min(1).max(200)).max(5),
  draftResponse: z.string().trim().min(1).max(800),
}).strict().superRefine((value, context) => {
  const completeOutput = JSON.stringify(value);
  for (const pattern of unsafeLanguage) {
    if (pattern.test(completeOutput)) {
      context.addIssue({
        code: "custom",
        message: "AI output contains prohibited or unverified language",
        path: ["draftResponse"],
      });
      break;
    }
  }
});

export type LeadAnalysisOutput = z.infer<typeof leadAnalysisOutputSchema>;

export interface LeadAnalysisProvider {
  readonly name: string;
  readonly model: string;
  generate(lead: Lead, options?: { timeoutMs?: number }): Promise<unknown>;
}

export interface LeadAnalysisRepository {
  findById(leadId: string): Promise<Lead | null>;
  saveAnalysis(
    leadId: string,
    analysis: Pick<Lead, "service" | "location" | "urgency" | "draftResponse" | "responseStatus">,
  ): Promise<Lead | null>;
  setResponsePending(leadId: string): Promise<Lead | null>;
}

export type AnalyzeLeadOptions = {
  timeoutMs?: number;
};

export type LeadAnalysisResult =
  | { status: "ready_for_review"; lead: Lead; analysis: LeadAnalysisOutput }
  | { status: "not_found"; lead: null; error: "lead_not_found" }
  | {
      status: "failed";
      lead: Lead;
      error: "provider_failure" | "invalid_ai_output" | "persistence_failure";
    };

function parseProviderOutput(output: unknown): unknown {
  if (typeof output !== "string") return output;
  const cleaned = output
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    return output;
  }
}

function buildPrompt(lead: Lead): string {
  return [
    `Business: ${lead.clientName}`,
    `Source: ${lead.source}`,
    `Event type: ${lead.eventType}`,
    `Existing service: ${lead.service ?? "not provided"}`,
    `Existing location: ${lead.location ?? "not provided"}`,
    `Customer name provided: ${lead.customerName ? "yes" : "no"}`,
    `Phone provided: ${lead.phone.trim() ? "yes" : "no"}`,
    `Customer inquiry: ${lead.message ?? "not provided"}`,
  ].join("\n");
}

const systemPrompt = `You analyze an existing local-service lead and draft a concise reply for human review.
Return only JSON with exactly these fields:
{"service":string|null,"location":string|null,"urgency":"low"|"normal"|"high"|"emergency","summary":string,"missingInformation":string[],"draftResponse":string}

Rules:
- Extract only details supported by the inquiry. Use null when service or location cannot be determined.
- Ask only for information genuinely missing from the inquiry. Do not ask again for facts already supplied.
- The draft is never sent automatically and must be suitable for human review.
- Never claim an appointment is confirmed or booked.
- Never guarantee elimination, arrival time, pricing, or availability.
- Do not mention termites.
- Keep the draft helpful and under 800 characters.
- Do not include markdown, commentary, or additional JSON fields.`;

function buildOpenAiModel() {
  const baseURL =
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??
    process.env.OPENAI_BASE_URL ??
    "https://api.openai.com/v1";
  const key =
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY ??
    process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Lead analysis AI provider is not configured");
  const gateway = createOpenAICompatible({
    name: "openai",
    baseURL,
    headers: { Authorization: `Bearer ${key}` },
  });
  return gateway(process.env.OPENAI_MODEL ?? "gpt-4o-mini");
}

export class OpenAiLeadAnalysisProvider implements LeadAnalysisProvider {
  readonly name = "openai";
  readonly model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  async generate(lead: Lead, options: { timeoutMs?: number } = {}): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
    try {
      const result = await generateText({
        model: buildOpenAiModel(),
        system: systemPrompt,
        prompt: buildPrompt(lead),
        abortSignal: controller.signal,
      });
      return result.text;
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createDrizzleLeadAnalysisRepository(
  database: typeof db = db,
): LeadAnalysisRepository {
  return {
    async findById(leadId) {
      const [lead] = await database
        .select()
        .from(leadsTable)
        .where(eq(leadsTable.id, leadId))
        .limit(1);
      return lead ?? null;
    },

    async saveAnalysis(leadId, analysis) {
      const [lead] = await database
        .update(leadsTable)
        .set({ ...analysis, updatedAt: new Date() })
        .where(eq(leadsTable.id, leadId))
        .returning();
      return lead ?? null;
    },

    async setResponsePending(leadId) {
      const [lead] = await database
        .update(leadsTable)
        .set({ responseStatus: "pending", updatedAt: new Date() })
        .where(eq(leadsTable.id, leadId))
        .returning();
      return lead ?? null;
    },
  };
}

export class LeadAnalysisService {
  constructor(
    private readonly repository: LeadAnalysisRepository = createDrizzleLeadAnalysisRepository(),
    private readonly provider: LeadAnalysisProvider = new OpenAiLeadAnalysisProvider(),
  ) {}

  async analyzeLead(
    leadId: string,
    options: AnalyzeLeadOptions = {},
  ): Promise<LeadAnalysisResult> {
    const lead = await this.repository.findById(leadId);
    if (!lead) return { status: "not_found", lead: null, error: "lead_not_found" };

    let providerOutput: unknown;
    try {
      providerOutput = await this.provider.generate(lead, options);
    } catch {
      const pendingLead = await this.keepPending(lead);
      return { status: "failed", lead: pendingLead, error: "provider_failure" };
    }

    const parsed = leadAnalysisOutputSchema.safeParse(parseProviderOutput(providerOutput));
    if (!parsed.success) {
      const pendingLead = await this.keepPending(lead);
      return { status: "failed", lead: pendingLead, error: "invalid_ai_output" };
    }

    const updatedLead = await this.repository.saveAnalysis(lead.id, {
      service: parsed.data.service,
      location: parsed.data.location,
      urgency: parsed.data.urgency,
      draftResponse: parsed.data.draftResponse,
      responseStatus: "ready_for_review",
    });
    if (!updatedLead) {
      const pendingLead = await this.keepPending(lead);
      return { status: "failed", lead: pendingLead, error: "persistence_failure" };
    }

    return {
      status: "ready_for_review",
      lead: updatedLead,
      analysis: parsed.data,
    };
  }

  private async keepPending(lead: Lead): Promise<Lead> {
    if (lead.responseStatus === "pending") return lead;
    return await this.repository.setResponsePending(lead.id) ?? {
      ...lead,
      responseStatus: "pending",
    };
  }
}

const defaultLeadAnalysisService = new LeadAnalysisService();

export async function analyzeLead(
  leadId: string,
  options?: AnalyzeLeadOptions,
): Promise<LeadAnalysisResult> {
  return defaultLeadAnalysisService.analyzeLead(leadId, options);
}

import { db } from "@workspace/db";
import { leadsTable, type Lead } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

const unsafeDraftLanguage = [
  /\btermite(?:s)?\b/i,
  /\bguarantee(?:d|s)?\b/i,
  /\bappointment\s+(?:is|has been)\s+(?:confirmed|booked|scheduled)\b/i,
  /\b(?:we|technician|team)\s+will\s+arrive\s+(?:at|by|within)\b/i,
  /\bprice\s+(?:is|will be)\s+\$?\d/i,
  /\b(?:complete|total|permanent)\s+elimination\b/i,
];

const safeDraftSchema = z.string().trim().min(1).max(800).superRefine((value, context) => {
  if (unsafeDraftLanguage.some((pattern) => pattern.test(value))) {
    context.addIssue({ code: "custom", message: "Draft contains prohibited or unverified language" });
  }
});

export const leadReviewInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }).strict(),
  z.object({ action: z.literal("edit"), draftResponse: safeDraftSchema }).strict(),
  z.object({ action: z.literal("reject") }).strict(),
]);

export type LeadReviewInput = z.infer<typeof leadReviewInputSchema>;

export interface LeadReviewRepository {
  findById(clientId: string, leadId: string): Promise<Lead | null>;
  saveReview(clientId: string, leadId: string, update: Pick<Lead, "draftResponse" | "responseStatus">): Promise<Lead | null>;
}

export type LeadReviewResult =
  | { status: "approved" | "edited" | "rejected"; lead: Lead }
  | { status: "not_found"; error: "lead_not_found" }
  | { status: "invalid"; error: "invalid_review_request" | "draft_not_ready" | "unsafe_draft" }
  | { status: "failed"; error: "persistence_failure" };

export function createDrizzleLeadReviewRepository(database: typeof db = db): LeadReviewRepository {
  return {
    async findById(clientId, leadId) {
      const [lead] = await database.select().from(leadsTable)
        .where(and(eq(leadsTable.id, leadId), eq(leadsTable.clientId, clientId))).limit(1);
      return lead ?? null;
    },
    async saveReview(clientId, leadId, update) {
      const [lead] = await database.update(leadsTable).set({ ...update, updatedAt: new Date() })
        .where(and(eq(leadsTable.id, leadId), eq(leadsTable.clientId, clientId))).returning();
      return lead ?? null;
    },
  };
}

export class LeadReviewService {
  constructor(private readonly repository: LeadReviewRepository = createDrizzleLeadReviewRepository()) {}

  async reviewLead(clientId: string, leadId: string, input: unknown): Promise<LeadReviewResult> {
    const parsed = leadReviewInputSchema.safeParse(input);
    if (!parsed.success) {
      const unsafeEdit = typeof input === "object" && input !== null
        && "action" in input && input.action === "edit"
        && "draftResponse" in input && typeof input.draftResponse === "string"
        && unsafeDraftLanguage.some((pattern) => pattern.test(input.draftResponse as string));
      return { status: "invalid", error: unsafeEdit ? "unsafe_draft" : "invalid_review_request" };
    }

    const lead = await this.repository.findById(clientId, leadId);
    if (!lead) return { status: "not_found", error: "lead_not_found" };

    if (parsed.data.action === "approve") {
      if (lead.responseStatus !== "ready_for_review" || !lead.draftResponse?.trim()) return { status: "invalid", error: "draft_not_ready" };
      const updated = await this.repository.saveReview(clientId, leadId, { draftResponse: lead.draftResponse, responseStatus: "approved" });
      return updated ? { status: "approved", lead: updated } : { status: "failed", error: "persistence_failure" };
    }

    if (parsed.data.action === "edit") {
      if (!["ready_for_review", "approved"].includes(lead.responseStatus)) return { status: "invalid", error: "draft_not_ready" };
      const updated = await this.repository.saveReview(clientId, leadId, { draftResponse: parsed.data.draftResponse, responseStatus: "ready_for_review" });
      return updated ? { status: "edited", lead: updated } : { status: "failed", error: "persistence_failure" };
    }

    if (!["ready_for_review", "approved"].includes(lead.responseStatus)) return { status: "invalid", error: "draft_not_ready" };
    const updated = await this.repository.saveReview(clientId, leadId, { draftResponse: lead.draftResponse, responseStatus: "rejected" });
    return updated ? { status: "rejected", lead: updated } : { status: "failed", error: "persistence_failure" };
  }
}

const defaultLeadReviewService = new LeadReviewService();
export async function reviewLead(clientId: string, leadId: string, input: unknown): Promise<LeadReviewResult> {
  return defaultLeadReviewService.reviewLead(clientId, leadId, input);
}

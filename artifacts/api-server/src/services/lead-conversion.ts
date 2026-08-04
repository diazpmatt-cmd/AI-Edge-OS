import { db } from "@workspace/db";
import { leadsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export const CONVERSION_STAGES = [
  "appointment_requested",
  "scheduling",
  "booked",
  "completed",
  "won",
  "lost",
] as const;

export type ConversionStage = typeof CONVERSION_STAGES[number];

const CLOSED_STAGES = new Set<ConversionStage>(["completed", "won", "lost"]);

export function isConversionStage(value: unknown): value is ConversionStage {
  return typeof value === "string" && (CONVERSION_STAGES as readonly string[]).includes(value);
}

export function suppressFollowUpForStage(stage: string | null | undefined): boolean {
  return stage === "booked" || CLOSED_STAGES.has(stage as ConversionStage);
}

export async function updateLeadConversionStage(
  leadId: string,
  stage: unknown,
  note?: unknown,
) {
  if (!isConversionStage(stage)) {
    return { status: "invalid" as const, error: "invalid_conversion_stage" as const };
  }

  const existing = await db.select().from(leadsTable).where(eq(leadsTable.id, leadId)).limit(1);
  if (!existing[0]) return { status: "not_found" as const, error: "lead_not_found" as const };

  const now = new Date();
  const previousNote = existing[0].notes?.trim();
  const cleanNote = typeof note === "string" ? note.trim() : "";
  const stageNote = cleanNote ? `[${stage}] ${cleanNote}` : `[${stage}]`;

  const updated = await db.update(leadsTable).set({
    status: stage,
    outcome: `conversion_${stage}`,
    notes: previousNote ? `${previousNote}\n${stageNote}` : stageNote,
    ...(suppressFollowUpForStage(stage) ? { lastFollowUpAt: now } : {}),
    updatedAt: now,
  }).where(eq(leadsTable.id, leadId)).returning();

  return { status: "updated" as const, lead: updated[0] };
}

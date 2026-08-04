import { db } from "@workspace/db";
import { leadAuditEventsTable } from "@workspace/db/schema";

export async function recordLeadAuditEvent(input: {
  leadId: string;
  action: string;
  actorType: "user" | "system" | "webhook";
  actorId?: string | null;
  previousState?: unknown;
  nextState?: unknown;
  metadata?: unknown;
}): Promise<void> {
  await db.insert(leadAuditEventsTable).values({
    leadId: input.leadId,
    action: input.action,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    previousState: input.previousState ?? null,
    nextState: input.nextState ?? null,
    metadata: input.metadata ?? null,
  });
}

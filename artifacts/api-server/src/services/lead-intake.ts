import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { leadsTable, type Lead } from "@workspace/db/schema";

export type LeadIntakeInput = {
  clientName: string;
  source: string;
  phone?: string | null;
  customerName?: string | null;
  message?: string | null;
  eventType?: string | null;
  service?: string | null;
  location?: string | null;
  urgency?: string | null;
  sourceMessageId?: string | null;
  receivedAt?: Date | string | null;
};

export type NormalizedLeadIntake = {
  clientName: string;
  source: string;
  phone: string;
  customerName: string | null;
  message: string | null;
  eventType: string;
  service: string | null;
  location: string | null;
  urgency: string;
  sourceMessageId: string | null;
  responseStatus: "pending";
  status: "new";
  receivedAt: Date;
};

export type LeadIntakeResult = {
  lead: Lead;
  created: boolean;
};

export interface LeadIntakeStore {
  createOrGet(input: NormalizedLeadIntake): Promise<LeadIntakeResult>;
}

export class LeadIntakeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadIntakeValidationError";
  }
}

function optionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function requiredText(value: string, field: "clientName" | "source"): string {
  const normalized = optionalText(value);
  if (!normalized) throw new LeadIntakeValidationError(`${field} is required`);
  return normalized;
}

function normalizeReceivedAt(value: Date | string | null | undefined): Date {
  if (value == null || value === "") return new Date();
  const receivedAt = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(receivedAt.getTime())) {
    throw new LeadIntakeValidationError("receivedAt must be a valid date");
  }
  return receivedAt;
}

export function normalizeLeadIntake(input: LeadIntakeInput): NormalizedLeadIntake {
  return {
    clientName: requiredText(input.clientName, "clientName"),
    source: requiredText(input.source, "source"),
    phone: optionalText(input.phone) ?? "",
    customerName: optionalText(input.customerName),
    message: optionalText(input.message),
    eventType: optionalText(input.eventType) ?? "sms",
    service: optionalText(input.service),
    location: optionalText(input.location),
    urgency: optionalText(input.urgency) ?? "normal",
    sourceMessageId: optionalText(input.sourceMessageId),
    responseStatus: "pending",
    status: "new",
    receivedAt: normalizeReceivedAt(input.receivedAt),
  };
}

export function createLeadIntakeService(store: LeadIntakeStore) {
  return async (input: LeadIntakeInput): Promise<LeadIntakeResult> =>
    store.createOrGet(normalizeLeadIntake(input));
}

export function createDrizzleLeadIntakeStore(database: typeof db = db): LeadIntakeStore {
  return {
    async createOrGet(input) {
      return database.transaction(async (tx) => {
        if (input.sourceMessageId) {
          const duplicateKey = JSON.stringify([
            input.clientName,
            input.source,
            input.sourceMessageId,
          ]);

          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtextextended(${duplicateKey}, 0))`,
          );

          const [existing] = await tx
            .select()
            .from(leadsTable)
            .where(and(
              eq(leadsTable.clientName, input.clientName),
              eq(leadsTable.source, input.source),
              eq(leadsTable.sourceMessageId, input.sourceMessageId),
            ))
            .orderBy(desc(leadsTable.createdAt))
            .limit(1);

          if (existing) return { lead: existing, created: false };
        }

        const [lead] = await tx
          .insert(leadsTable)
          .values(input)
          .returning();

        if (!lead) throw new Error("Lead intake insert did not return a record");
        return { lead, created: true };
      });
    },
  };
}

export const intakeLead = createLeadIntakeService(createDrizzleLeadIntakeStore());

import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { leadsTable, type Lead } from "@workspace/db/schema";
import { resolveClientContentContextFromDb } from "../lib/client-resolver.js";

export type LeadTenantResolution =
  | { readonly ok: true; readonly clientId: string; readonly clientName: string }
  | { readonly ok: false; readonly reason: string };

export type LeadTenantResolver = (userId: string) => Promise<LeadTenantResolution>;

/** Resolve the authenticated operator to one canonical active tenant. */
export async function resolveLeadTenant(userId: string): Promise<LeadTenantResolution> {
  const resolved = await resolveClientContentContextFromDb(userId);
  if (!resolved.found) return { ok: false, reason: resolved.reason };
  return {
    ok: true,
    clientId: resolved.client.id,
    clientName: resolved.client.clientName,
  };
}

export interface LeadOwnershipStore {
  findOwnedLead(clientId: string, leadId: string): Promise<Lead | null>;
}

export function createDrizzleLeadOwnershipStore(database: typeof db = db): LeadOwnershipStore {
  return {
    async findOwnedLead(clientId, leadId) {
      const [lead] = await database
        .select()
        .from(leadsTable)
        .where(and(
          eq(leadsTable.id, leadId),
          eq(leadsTable.clientId, clientId),
        ))
        .limit(1);
      return lead ?? null;
    },
  };
}

const defaultOwnershipStore = createDrizzleLeadOwnershipStore();

export async function findOwnedLead(clientId: string, leadId: string): Promise<Lead | null> {
  return defaultOwnershipStore.findOwnedLead(clientId, leadId);
}

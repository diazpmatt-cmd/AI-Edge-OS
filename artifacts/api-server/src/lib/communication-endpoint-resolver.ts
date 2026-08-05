import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { communicationEndpointsTable } from "@workspace/db/schema";
import { normalizeE164 } from "./communication-endpoint-identity.js";

export async function resolveCommunicationEndpoint(provider: string, destination: string | null | undefined) {
  const e164Number = normalizeE164(destination);
  if (!provider.trim() || !e164Number) return null;
  const [endpoint] = await db.select().from(communicationEndpointsTable).where(and(
    eq(communicationEndpointsTable.provider, provider),
    eq(communicationEndpointsTable.e164Number, e164Number),
    eq(communicationEndpointsTable.active, true),
    eq(communicationEndpointsTable.verified, true),
  )).limit(1);
  return endpoint ?? null;
}

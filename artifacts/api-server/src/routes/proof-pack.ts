import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  callsTable, customerJourneyEventsTable, gorilladeskJobsTable, gorilladeskPaymentsTable, leadsTable,
  referralCrmAttributionsTable, referralsTable, revenueAttributionTable,
  socialPostsTable, tenantSafeReviewSummariesTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { resolveClientActiveCheck } from "../lib/client-resolver.js";
import { buildProofPackReadModel, type ProofPackEvidence } from "../lib/proof-pack-read-model.js";

const router = Router();
type EvidenceLoader = (clientId: string, slug: string) => Promise<ProofPackEvidence>;

export async function loadProofPackEvidence(clientId: string, slug: string): Promise<ProofPackEvidence> {
  const [leads, calls, attributions, jobs, payments, reviews, referrals, referralAttributions, posts, journeyEvents] = await Promise.all([
    db.select().from(leadsTable).where(eq(leadsTable.clientId, clientId)),
    db.select().from(callsTable).where(eq(callsTable.clientId, clientId)),
    db.select().from(revenueAttributionTable).where(eq(revenueAttributionTable.clientId, clientId)),
    db.select().from(gorilladeskJobsTable).where(eq(gorilladeskJobsTable.projectId, slug)),
    db.select().from(gorilladeskPaymentsTable).where(eq(gorilladeskPaymentsTable.projectId, slug)),
    db.select().from(tenantSafeReviewSummariesTable).where(eq(tenantSafeReviewSummariesTable.clientId, clientId)),
    db.select().from(referralsTable).where(eq(referralsTable.clientId, clientId)),
    db.select().from(referralCrmAttributionsTable).where(eq(referralCrmAttributionsTable.clientId, clientId)),
    db.select().from(socialPostsTable).where(eq(socialPostsTable.clientId, clientId)),
    db.select().from(customerJourneyEventsTable).where(eq(customerJourneyEventsTable.clientId, clientId)),
  ]);
  return { leads, calls, attributions, jobs, payments, reviews, referrals, referralAttributions, posts, journeyEvents };
}

function period(query: Record<string, unknown>, now: Date): { from: Date; to: Date } | null {
  if (query.from || query.to) {
    if (typeof query.from !== "string" || typeof query.to !== "string") return null;
    const from = new Date(`${query.from}T00:00:00.000Z`);
    const to = new Date(`${query.to}T00:00:00.000Z`);
    return Number.isFinite(from.getTime()) && Number.isFinite(to.getTime()) && from < to ? { from, to } : null;
  }
  return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) };
}

export function createProofPackHandler(getAuthFn = getAuth, resolveClientFn = resolveClientActiveCheck, loadEvidenceFn: EvidenceLoader = loadProofPackEvidence, nowFn = () => new Date()) {
  return async (req: any, res: any) => {
    const { userId } = getAuthFn(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    try {
      const tenant = await resolveClientFn(userId);
      if (!tenant.ok) return res.status(tenant.reason === "inactive" ? 403 : 404).json({ error: tenant.reason === "inactive" ? "client_inactive" : "client_not_found" });
      const dates = period(req.query ?? {}, nowFn());
      if (!dates) return res.status(422).json({ error: "invalid_proof_pack_period" });
      const evidence = await loadEvidenceFn(tenant.clientId, tenant.slug);
      return res.json(buildProofPackReadModel(evidence, tenant.clientId, dates.from, dates.to, nowFn()));
    } catch {
      return res.status(500).json({ error: "proof_pack_unavailable" });
    }
  };
}

router.get("/proof-pack", createProofPackHandler() as any);
export default router;

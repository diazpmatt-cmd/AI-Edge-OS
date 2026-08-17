import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { leadsTable, revenueAttributionTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { resolveClientActiveCheck } from "../lib/client-resolver.js";
import { buildRevenueLeakReadModel } from "../lib/revenue-leak-read-model.js";

const router = Router();

type AuthFn = typeof getAuth;
type ResolverFn = typeof resolveClientActiveCheck;
type EvidenceLoader = (clientId: string) => Promise<{
  leads: Array<typeof leadsTable.$inferSelect>;
  attributions: Array<typeof revenueAttributionTable.$inferSelect>;
}>;

export async function loadRevenueLeakEvidence(clientId: string) {
  const [leads, attributions] = await Promise.all([
    db.select().from(leadsTable).where(eq(leadsTable.clientId, clientId)),
    db.select().from(revenueAttributionTable).where(eq(revenueAttributionTable.clientId, clientId)),
  ]);
  return { leads, attributions };
}

export function createRevenueLeaksHandler(
  getAuthFn: AuthFn = getAuth,
  resolveClientFn: ResolverFn = resolveClientActiveCheck,
  loadEvidenceFn: EvidenceLoader = loadRevenueLeakEvidence,
  nowFn: () => Date = () => new Date(),
) {
  return async (req: any, res: any) => {
    const { userId } = getAuthFn(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const tenant = await resolveClientFn(userId);
      if (!tenant.ok) {
        res.status(tenant.reason === "inactive" ? 403 : 404).json({
          error: tenant.reason === "inactive" ? "client_inactive" : "client_not_found",
        });
        return;
      }

      const evidence = await loadEvidenceFn(tenant.clientId);
      res.json(buildRevenueLeakReadModel(evidence.leads, evidence.attributions, nowFn()));
    } catch {
      res.status(500).json({ error: "revenue_leak_detector_unavailable" });
    }
  };
}

router.get("/revenue-leaks", createRevenueLeaksHandler() as any);

export default router;

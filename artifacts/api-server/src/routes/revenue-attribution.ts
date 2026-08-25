import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, eq, and, sql } from "@workspace/db";
import {
  revenueAttributionTable,
  gorilladeskCustomersTable,
  gorilladeskJobsTable,
} from "@workspace/db";
import { resolveClientActiveCheck } from "../lib/client-resolver.js";
import { selectRevenueAttributionCandidate } from "../lib/revenue-attribution-matcher.js";
import { buildVerifiedRevenueTransition } from "../lib/revenue-attribution-verification.js";

const router = Router();

type SyncStats = {
  gdJobsAvailable: boolean;
  gdJobCount: number;
  gdCustomerCount: number;
  leadsChecked: number;
  leadsMatched: number;
  revenueMatched: number;
  apiMessage: string;
};

const syncStateByClient = new Map<
  string,
  { lastSyncAt: string | null; lastSyncStats: SyncStats | null }
>();

function rowToDto(row: typeof revenueAttributionTable.$inferSelect) {
  return {
    id: row.id,
    leadId: row.leadId,
    clientId: row.clientId,
    customerName: row.customerName,
    phone: row.phone,
    leadSource: row.leadSource,
    status: row.status,
    revenue: row.revenue ? parseFloat(row.revenue) : null,
    serviceType: row.serviceType,
    notes: row.notes,
    gorilladeskJobId: row.gorilladeskJobId,
    matchedAt: row.matchedAt?.toISOString() ?? null,
    matchMethod: row.matchMethod,
    matchConfidence: row.matchConfidence,
    evidenceSource: row.evidenceSource,
    evidenceObservedAt: row.evidenceObservedAt?.toISOString() ?? null,
    evidenceCustomerId: row.evidenceCustomerId,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt?.toISOString(),
    updatedAt: row.updatedAt?.toISOString(),
  };
}

async function resolveTenant(req: any, res: any) {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const resolved = await resolveClientActiveCheck(userId);
  if (!resolved.ok) {
    res.status(404).json({ error: "Client not found" });
    return null;
  }
  return { ...resolved, actorUserId: userId };
}

const mutableStatuses = new Set(["pending", "unmatched", "matched", "lost"]);

router.get("/revenue-attribution", async (req, res) => {
  try {
    const tenant = await resolveTenant(req, res);
    if (!tenant) return;
    const rows = await db
      .select()
      .from(revenueAttributionTable)
      .where(eq(revenueAttributionTable.clientId, tenant.clientId))
      .orderBy(sql`${revenueAttributionTable.createdAt} desc`);
    return res.json(rows.map(rowToDto));
  } catch (err) {
    console.error("[revenue-attribution] GET error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/revenue-attribution", async (req, res) => {
  try {
    const tenant = await resolveTenant(req, res);
    if (!tenant) return;
    const {
      leadId,
      customerName,
      phone,
      leadSource,
      status,
      revenue,
      serviceType,
      notes,
      gorilladeskJobId,
    } = req.body;

    if (!customerName || !leadSource) {
      return res.status(400).json({ error: "customerName and leadSource are required" });
    }
    if (status === "won") {
      return res.status(422).json({ error: "verified_revenue_transition_required" });
    }
    if (status !== undefined && !mutableStatuses.has(status)) {
      return res.status(422).json({ error: "invalid_revenue_attribution_status" });
    }

    const [row] = await db
      .insert(revenueAttributionTable)
      .values({
        leadId,
        clientId: tenant.clientId,
        customerName,
        phone,
        leadSource,
        status: status ?? "pending",
        revenue: revenue != null ? String(revenue) : null,
        serviceType,
        notes,
        gorilladeskJobId,
      })
      .returning();
    return res.status(201).json(rowToDto(row));
  } catch (err) {
    console.error("[revenue-attribution] POST error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.put("/revenue-attribution/:id", async (req, res) => {
  try {
    const tenant = await resolveTenant(req, res);
    if (!tenant) return;
    const { id } = req.params;
    const { status, revenue, serviceType, notes, gorilladeskJobId } = req.body;

    if (status === "won") {
      return res.status(422).json({ error: "verified_revenue_transition_required" });
    }
    if (status !== undefined && !mutableStatuses.has(status)) {
      return res.status(422).json({ error: "invalid_revenue_attribution_status" });
    }

    const [current] = await db
      .select()
      .from(revenueAttributionTable)
      .where(and(
        eq(revenueAttributionTable.id, id),
        eq(revenueAttributionTable.clientId, tenant.clientId),
      ));
    if (!current) return res.status(404).json({ error: "Not found" });
    if (current.verifiedAt && [status, revenue, serviceType, gorilladeskJobId].some(value => value !== undefined)) {
      return res.status(409).json({ error: "verified_revenue_evidence_is_immutable" });
    }

    const [row] = await db
      .update(revenueAttributionTable)
      .set({
        ...(status !== undefined && { status }),
        ...(revenue !== undefined && {
          revenue: revenue != null ? String(revenue) : null,
        }),
        ...(serviceType !== undefined && { serviceType }),
        ...(notes !== undefined && { notes }),
        ...(gorilladeskJobId !== undefined && { gorilladeskJobId }),
      })
      .where(
        and(
          eq(revenueAttributionTable.id, id),
          eq(revenueAttributionTable.clientId, tenant.clientId),
        ),
      )
      .returning();

    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(rowToDto(row));
  } catch (err) {
    console.error("[revenue-attribution] PUT error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/revenue-attribution/:id/verify", async (req, res) => {
  try {
    const tenant = await resolveTenant(req, res);
    if (!tenant) return;
    const { id } = req.params;
    const jobExternalId = typeof req.body?.gorilladeskJobId === "string"
      ? req.body.gorilladeskJobId.trim()
      : "";
    if (!jobExternalId) return res.status(422).json({ error: "gorilladesk_job_id_required" });

    const [current] = await db
      .select()
      .from(revenueAttributionTable)
      .where(and(
        eq(revenueAttributionTable.id, id),
        eq(revenueAttributionTable.clientId, tenant.clientId),
      ));
    if (!current) return res.status(404).json({ error: "Not found" });
    if (current.verifiedAt) return res.status(409).json({ error: "verified_revenue_evidence_is_immutable" });

    const [job] = await db
      .select()
      .from(gorilladeskJobsTable)
      .where(and(
        eq(gorilladeskJobsTable.projectId, tenant.slug),
        eq(gorilladeskJobsTable.externalId, jobExternalId),
      ));
    if (!job) return res.status(422).json({ error: "tenant_scoped_job_evidence_not_found" });
    const now = new Date();
    const transition = buildVerifiedRevenueTransition({
      current,
      job,
      actorUserId: tenant.actorUserId,
      now,
    });
    if (!transition.ok) return res.status(422).json({ error: transition.error });
    const [row] = await db
      .update(revenueAttributionTable)
      .set({
        ...transition.updates,
        ...(typeof req.body?.notes === "string" && { notes: req.body.notes }),
      })
      .where(and(
        eq(revenueAttributionTable.id, id),
        eq(revenueAttributionTable.clientId, tenant.clientId),
      ))
      .returning();
    return res.json(rowToDto(row));
  } catch (err) {
    console.error("[revenue-attribution] verify error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/revenue-attribution/sync-status", async (req, res) => {
  try {
    const tenant = await resolveTenant(req, res);
    if (!tenant) return;

    const [leads, gdCustomerCountRows, gdJobCountRows] = await Promise.all([
      db
        .select()
        .from(revenueAttributionTable)
        .where(eq(revenueAttributionTable.clientId, tenant.clientId)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(gorilladeskCustomersTable)
        .where(eq(gorilladeskCustomersTable.projectId, tenant.slug)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(gorilladeskJobsTable)
        .where(eq(gorilladeskJobsTable.projectId, tenant.slug)),
    ]);

    const matched = leads.filter((l) => l.status === "matched" || (l.status === "won" && l.verifiedAt != null));
    const won = leads.filter((l) => l.status === "won" && l.verifiedAt != null);
    const revenueTotal = won.reduce(
      (sum, lead) => sum + (lead.revenue ? parseFloat(lead.revenue) : 0),
      0,
    );
    const unmatched = leads.filter((l) => l.status === "unmatched");
    const syncState = syncStateByClient.get(tenant.clientId) ?? {
      lastSyncAt: null,
      lastSyncStats: null,
    };

    return res.json({
      ...syncState,
      realtimeStats: {
        totalLeads: leads.length,
        matchedLeads: matched.length,
        wonLeads: won.length,
        unmatchedLeads: unmatched.length,
        revenueMatched: revenueTotal,
        gdCustomerCount: Number(gdCustomerCountRows[0]?.count ?? 0),
        gdJobCount: Number(gdJobCountRows[0]?.count ?? 0),
      },
      gdApiStatus: {
        jobsEndpoint: "not_configured_per_tenant",
        customersEndpoint: "project_scoped_local_snapshot",
        note: "Revenue matching uses tenant-scoped GorillaDesk data already stored in AI Edge. Direct job-provider sync remains disabled until provider credentials are tenant-bound.",
      },
    });
  } catch (err) {
    console.error("[revenue-attribution] sync-status error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/revenue-attribution/match-gorilladesk", async (req, res) => {
  try {
    const tenant = await resolveTenant(req, res);
    if (!tenant) return;

    const leads = await db
      .select()
      .from(revenueAttributionTable)
      .where(
        and(
          eq(revenueAttributionTable.clientId, tenant.clientId),
          eq(revenueAttributionTable.status, "unmatched"),
        ),
      );

    if (leads.length === 0) {
      return res.json({ matched: 0, ids: [], message: "No unmatched leads to process" });
    }

    let gdCustomers: Array<{
      phone: string | null;
      name: string;
      externalId: string | null;
    }> = [];
    try {
      gdCustomers = await db
        .select({
          phone: gorilladeskCustomersTable.phone,
          name: gorilladeskCustomersTable.name,
          externalId: gorilladeskCustomersTable.externalId,
        })
        .from(gorilladeskCustomersTable)
        .where(eq(gorilladeskCustomersTable.projectId, tenant.slug));
    } catch {
      // Tenant snapshot may not exist yet.
    }

    const matched: string[] = [];
    const now = new Date();
    for (const lead of leads) {
      const decision = selectRevenueAttributionCandidate(
        { customerName: lead.customerName, phone: lead.phone },
        gdCustomers.map(customer => ({
          customerExternalId: customer.externalId,
          customerName: customer.name,
          customerPhone: customer.phone,
        })),
      );
      if (!decision) continue;

      if (!decision.automaticMatchAllowed) {
        await db.update(revenueAttributionTable).set({
          matchMethod: decision.method,
          matchConfidence: decision.confidence,
          evidenceSource: "gorilladesk_tenant_snapshot",
          evidenceObservedAt: now,
          evidenceCustomerId: decision.candidate.customerExternalId,
        }).where(and(
          eq(revenueAttributionTable.id, lead.id),
          eq(revenueAttributionTable.clientId, tenant.clientId),
        ));
        continue;
      }

      const updated = await db
        .update(revenueAttributionTable)
        .set({
          status: "matched",
          matchedAt: now,
          matchMethod: decision.method,
          matchConfidence: decision.confidence,
          evidenceSource: "gorilladesk_tenant_snapshot",
          evidenceObservedAt: now,
          evidenceCustomerId: decision.candidate.customerExternalId,
        })
        .where(
          and(
            eq(revenueAttributionTable.id, lead.id),
            eq(revenueAttributionTable.clientId, tenant.clientId),
          ),
        )
        .returning({ id: revenueAttributionTable.id });
      if (updated.length === 1) matched.push(lead.id);
    }

    return res.json({
      matched: matched.length,
      ids: matched,
      totalChecked: leads.length,
      gdCustomers: gdCustomers.length,
      message: `Matched ${matched.length} of ${leads.length} unmatched leads against ${gdCustomers.length} tenant-scoped GorillaDesk customers`,
    });
  } catch (err) {
    console.error("[revenue-attribution] match-gorilladesk error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/revenue-attribution/sync-gorilladesk-jobs", async (req, res) => {
  try {
    const tenant = await resolveTenant(req, res);
    if (!tenant) return;
    const now = new Date();

    const [gdJobs, gdCustomers, allLeads] = await Promise.all([
      db
        .select()
        .from(gorilladeskJobsTable)
        .where(eq(gorilladeskJobsTable.projectId, tenant.slug)),
      db
        .select({
          externalId: gorilladeskCustomersTable.externalId,
          name: gorilladeskCustomersTable.name,
          phone: gorilladeskCustomersTable.phone,
        })
        .from(gorilladeskCustomersTable)
        .where(eq(gorilladeskCustomersTable.projectId, tenant.slug)),
      db
        .select()
        .from(revenueAttributionTable)
        .where(eq(revenueAttributionTable.clientId, tenant.clientId)),
    ]);

    const jobByCustomerId = new Map<string, (typeof gdJobs)[number]>();
    for (const job of gdJobs) {
      if (!job.customerId) continue;
      const existing = jobByCustomerId.get(job.customerId);
      if (!existing || (job.amountCents ?? 0) > (existing.amountCents ?? 0)) {
        jobByCustomerId.set(job.customerId, job);
      }
    }

    let matchedCount = 0;
    let revenueTotal = 0;
    const matchedIds: string[] = [];

    for (const lead of allLeads) {
      if (["won", "lost"].includes(lead.status)) continue;

      const decision = selectRevenueAttributionCandidate(
        { customerName: lead.customerName, phone: lead.phone },
        gdCustomers.map(customer => ({
          customerExternalId: customer.externalId,
          customerName: customer.name,
          customerPhone: customer.phone,
        })),
      );
      if (!decision) continue;
      const matchedCustomer = decision.candidate;

      if (!decision.automaticMatchAllowed) {
        await db.update(revenueAttributionTable).set({
          matchMethod: decision.method,
          matchConfidence: decision.confidence,
          evidenceSource: "gorilladesk_tenant_snapshot",
          evidenceObservedAt: now,
          evidenceCustomerId: matchedCustomer.customerExternalId,
        }).where(and(
          eq(revenueAttributionTable.id, lead.id),
          eq(revenueAttributionTable.clientId, tenant.clientId),
        ));
        continue;
      }

      const matchedJob = matchedCustomer.customerExternalId
        ? jobByCustomerId.get(matchedCustomer.customerExternalId)
        : undefined;
      const updates: Partial<typeof revenueAttributionTable.$inferInsert> & {
        status: string;
        matchedAt: Date;
      } = {
        status: "matched",
        matchedAt: now,
        matchMethod: decision.method,
        matchConfidence: decision.confidence,
        evidenceSource: "gorilladesk_tenant_snapshot",
        evidenceObservedAt: matchedJob?.completedAt ?? matchedJob?.createdAt ?? now,
        evidenceCustomerId: matchedCustomer.customerExternalId,
      };

      if (matchedJob) {
        if (matchedJob.amountCents && matchedJob.amountCents > 0) {
          updates.revenue = String(matchedJob.amountCents / 100);
          revenueTotal += matchedJob.amountCents / 100;
        }
        if (matchedJob.serviceType) updates.serviceType = matchedJob.serviceType;
        if (matchedJob.externalId) updates.gorilladeskJobId = matchedJob.externalId;
      }

      const updated = await db
        .update(revenueAttributionTable)
        .set(updates as any)
        .where(
          and(
            eq(revenueAttributionTable.id, lead.id),
            eq(revenueAttributionTable.clientId, tenant.clientId),
          ),
        )
        .returning({ id: revenueAttributionTable.id });
      if (updated.length === 1) {
        matchedCount++;
        matchedIds.push(lead.id);
      }
    }

    const apiMessage =
      "Direct GorillaDesk job-provider sync is disabled until provider credentials are bound per tenant. Matching used tenant-scoped local GorillaDesk snapshots.";
    const lastSyncAt = now.toISOString();
    const lastSyncStats: SyncStats = {
      gdJobsAvailable: gdJobs.length > 0,
      gdJobCount: gdJobs.length,
      gdCustomerCount: gdCustomers.length,
      leadsChecked: allLeads.length,
      leadsMatched: matchedCount,
      revenueMatched: revenueTotal,
      apiMessage,
    };
    syncStateByClient.set(tenant.clientId, { lastSyncAt, lastSyncStats });

    return res.json({
      ok: true,
      syncedAt: lastSyncAt,
      gdApiJobsAvailable: false,
      gdApiMessage: apiMessage,
      gdJobCount: gdJobs.length,
      gdCustomerCount: gdCustomers.length,
      leadsChecked: allLeads.length,
      leadsMatched: matchedCount,
      revenueMatched: revenueTotal,
      matchedIds,
      message: `Matched ${matchedCount} leads using ${gdCustomers.length} tenant-scoped GorillaDesk customers${gdJobs.length > 0 ? ` and ${gdJobs.length} locally stored jobs` : ""}.`,
    });
  } catch (err) {
    console.error("[revenue-attribution] sync-gorilladesk-jobs error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;

import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, eq, and, sql } from "@workspace/db";
import {
  revenueAttributionTable,
  gorilladeskCustomersTable,
  gorilladeskJobsTable,
} from "@workspace/db";
import { resolveClientActiveCheck } from "../lib/client-resolver.js";

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
    createdAt: row.createdAt?.toISOString(),
    updatedAt: row.updatedAt?.toISOString(),
  };
}

function normalizePhone(p: string | null | undefined): string {
  return (p ?? "").replace(/\D/g, "");
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
  return resolved;
}

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
    const { status, revenue, serviceType, notes, gorilladeskJobId, matchedAt } = req.body;

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
        ...(matchedAt !== undefined && {
          matchedAt: matchedAt ? new Date(matchedAt) : null,
        }),
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

    const matched = leads.filter((l) => ["matched", "won"].includes(l.status));
    const won = leads.filter((l) => l.status === "won");
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
      const leadPhone = normalizePhone(lead.phone);
      const leadName = lead.customerName.toLowerCase();
      const gdMatch = gdCustomers.find((customer) => {
        if (leadPhone && normalizePhone(customer.phone) === leadPhone) return true;
        const firstName = (customer.name ?? "").toLowerCase().split(" ")[0];
        return firstName.length > 2 && leadName.startsWith(firstName);
      });
      if (!gdMatch) continue;

      const updated = await db
        .update(revenueAttributionTable)
        .set({ status: "matched", matchedAt: now })
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

    const customerByPhone = new Map<string, (typeof gdCustomers)[number]>();
    for (const customer of gdCustomers) {
      const phone = normalizePhone(customer.phone);
      if (phone) customerByPhone.set(phone, customer);
    }

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

      const leadPhone = normalizePhone(lead.phone);
      const leadName = lead.customerName.toLowerCase();
      let matchedCustomer = leadPhone ? customerByPhone.get(leadPhone) : undefined;
      if (!matchedCustomer) {
        matchedCustomer = gdCustomers.find((customer) => {
          const firstName = customer.name.toLowerCase().split(" ")[0];
          return firstName.length > 2 && leadName.startsWith(firstName);
        });
      }
      if (!matchedCustomer) continue;

      const matchedJob = matchedCustomer.externalId
        ? jobByCustomerId.get(matchedCustomer.externalId)
        : undefined;
      const updates: Partial<typeof revenueAttributionTable.$inferInsert> & {
        status: string;
        matchedAt: Date;
      } = {
        status:
          matchedJob?.status === "completed"
            ? "won"
            : "matched",
        matchedAt: now,
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

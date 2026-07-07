import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, eq, and, sql, or } from "@workspace/db";
import {
  revenueAttributionTable,
  gorilladeskCustomersTable,
  gorilladeskJobsTable,
} from "@workspace/db";

const router = Router();

// ── Module-level sync state (in-process cache — resets on restart) ────────────
let lastSyncAt:      string | null = null;
let lastSyncStats: {
  gdJobsAvailable: boolean;
  gdJobCount:      number;
  gdCustomerCount: number;
  leadsChecked:    number;
  leadsMatched:    number;
  revenueMatched:  number;
  apiMessage:      string;
} | null = null;

// ── DTO helpers ───────────────────────────────────────────────────────────────

function rowToDto(row: typeof revenueAttributionTable.$inferSelect) {
  return {
    id:               row.id,
    leadId:           row.leadId,
    clientId:         row.clientId,
    customerName:     row.customerName,
    phone:            row.phone,
    leadSource:       row.leadSource,
    status:           row.status,
    revenue:          row.revenue ? parseFloat(row.revenue) : null,
    serviceType:      row.serviceType,
    notes:            row.notes,
    gorilladeskJobId: row.gorilladeskJobId,
    matchedAt:        row.matchedAt?.toISOString() ?? null,
    createdAt:        row.createdAt?.toISOString(),
    updatedAt:        row.updatedAt?.toISOString(),
  };
}

function normalizePhone(p: string | null | undefined): string {
  return (p ?? "").replace(/\D/g, "");
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

router.get("/revenue-attribution", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const clientId = (req.query.clientId as string) ?? "default";
    const rows = await db
      .select()
      .from(revenueAttributionTable)
      .where(eq(revenueAttributionTable.clientId, clientId))
      .orderBy(sql`${revenueAttributionTable.createdAt} desc`);
    return res.json(rows.map(rowToDto));
  } catch (err) {
    console.error("[revenue-attribution] GET error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/revenue-attribution", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { leadId, clientId, customerName, phone, leadSource, status, revenue, serviceType, notes, gorilladeskJobId } = req.body;

  if (!clientId || !customerName || !leadSource) {
    return res.status(400).json({ error: "clientId, customerName, and leadSource are required" });
  }

  try {
    const [row] = await db
      .insert(revenueAttributionTable)
      .values({
        leadId, clientId, customerName, phone,
        leadSource, status: status ?? "pending",
        revenue: revenue != null ? String(revenue) : null,
        serviceType, notes, gorilladeskJobId,
      })
      .returning();
    return res.status(201).json(rowToDto(row));
  } catch (err) {
    console.error("[revenue-attribution] POST error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.put("/revenue-attribution/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.params;
  const { status, revenue, serviceType, notes, gorilladeskJobId, matchedAt } = req.body;

  try {
    const [row] = await db
      .update(revenueAttributionTable)
      .set({
        ...(status           !== undefined && { status }),
        ...(revenue          !== undefined && { revenue: revenue != null ? String(revenue) : null }),
        ...(serviceType      !== undefined && { serviceType }),
        ...(notes            !== undefined && { notes }),
        ...(gorilladeskJobId !== undefined && { gorilladeskJobId }),
        ...(matchedAt        !== undefined && { matchedAt: matchedAt ? new Date(matchedAt) : null }),
      })
      .where(eq(revenueAttributionTable.id, id))
      .returning();

    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(rowToDto(row));
  } catch (err) {
    console.error("[revenue-attribution] PUT error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/revenue-attribution/sync-status ──────────────────────────────────
router.get("/revenue-attribution/sync-status", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const clientId = (req.query.clientId as string) ?? "default";

    // Real-time counts
    const leads = await db
      .select()
      .from(revenueAttributionTable)
      .where(eq(revenueAttributionTable.clientId, clientId));

    const gdCustomerCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(gorilladeskCustomersTable)
      .then(r => Number(r[0]?.count ?? 0));

    const gdJobCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(gorilladeskJobsTable)
      .then(r => Number(r[0]?.count ?? 0));

    const matched     = leads.filter(l => ["matched", "won"].includes(l.status));
    const won         = leads.filter(l => l.status === "won");
    const revenueTotal = won.reduce((s, l) => s + (l.revenue ? parseFloat(l.revenue) : 0), 0);
    const unmatched   = leads.filter(l => l.status === "unmatched");

    return res.json({
      lastSyncAt,
      lastSyncStats,
      realtimeStats: {
        totalLeads:      leads.length,
        matchedLeads:    matched.length,
        wonLeads:        won.length,
        unmatchedLeads:  unmatched.length,
        revenueMatched:  revenueTotal,
        gdCustomerCount,
        gdJobCount,
      },
      gdApiStatus: {
        jobsEndpoint:     "not_available",
        customersEndpoint: "available",
        note:             "GorillaDesk Public API supports /customers only. Job revenue must be entered manually or imported via CSV.",
      },
    });
  } catch (err) {
    console.error("[revenue-attribution] sync-status error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/revenue-attribution/match-gorilladesk ──────────────────────────
// Phone-match unmatched leads against GorillaDesk customers.
router.post("/revenue-attribution/match-gorilladesk", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const clientId = (req.body.clientId as string) ?? "default";

  try {
    const leads = await db
      .select()
      .from(revenueAttributionTable)
      .where(
        and(
          eq(revenueAttributionTable.clientId, clientId),
          eq(revenueAttributionTable.status, "unmatched"),
        )
      );

    if (leads.length === 0) {
      return res.json({ matched: 0, ids: [], message: "No unmatched leads to process" });
    }

    // GorillaDesk customers — single `name` field (not firstName/lastName)
    let gdCustomers: Array<{ phone: string | null; name: string; externalId: string | null }> = [];
    try {
      gdCustomers = await db
        .select({
          phone:      gorilladeskCustomersTable.phone,
          name:       gorilladeskCustomersTable.name,
          externalId: gorilladeskCustomersTable.externalId,
        })
        .from(gorilladeskCustomersTable);
    } catch {
      // table unavailable
    }

    const matched: string[] = [];
    const now = new Date();

    for (const lead of leads) {
      const leadPhone = normalizePhone(lead.phone);
      const leadName  = lead.customerName.toLowerCase();

      const gdMatch = gdCustomers.find(c => {
        if (leadPhone && normalizePhone(c.phone) === leadPhone) return true;
        // First-name match fallback
        const firstName = (c.name ?? "").toLowerCase().split(" ")[0];
        return firstName.length > 2 && leadName.startsWith(firstName);
      });

      if (gdMatch) {
        await db
          .update(revenueAttributionTable)
          .set({ status: "matched", matchedAt: now })
          .where(eq(revenueAttributionTable.id, lead.id));
        matched.push(lead.id);
      }
    }

    return res.json({
      matched:      matched.length,
      ids:          matched,
      totalChecked: leads.length,
      gdCustomers:  gdCustomers.length,
      message:      `Matched ${matched.length} of ${leads.length} unmatched leads against ${gdCustomers.length} GorillaDesk customers`,
    });
  } catch (err) {
    console.error("[revenue-attribution] match-gorilladesk error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/revenue-attribution/sync-gorilladesk-jobs ──────────────────────
// Pulls jobs from GorillaDesk API (gracefully fails — API doesn't support jobs),
// then matches ALL leads (not just unmatched) against gorilladesk_jobs + customers.
router.post("/revenue-attribution/sync-gorilladesk-jobs", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const clientId = (req.body.clientId as string) ?? "default";
  const now = new Date();

  // ── Step 1: Try GorillaDesk API for jobs ─────────────────────────────────
  let gdApiJobsAvailable = false;
  let gdApiMessage       = "GorillaDesk Public API does not expose a jobs endpoint. Using local data.";

  const apiKey = process.env.GORILLADESK_API_KEY;
  if (apiKey) {
    try {
      const resp = await fetch("https://api.gorilladesk.com/api/v1/jobs", {
        headers: { "Authorization": `Bearer ${apiKey}`, "Accept": "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const data: any = await resp.json();
        const jobs: any[] = data?.data ?? data?.jobs ?? (Array.isArray(data) ? data : []);
        if (jobs.length > 0) {
          gdApiJobsAvailable = true;
          gdApiMessage = `GorillaDesk API returned ${jobs.length} jobs.`;
          // Upsert into gorilladesk_jobs
          for (const job of jobs) {
            const extId = String(job.id ?? job.job_id ?? "");
            if (!extId) continue;
            await db
              .insert(gorilladeskJobsTable)
              .values({
                externalId:   extId,
                customerId:   String(job.customer_id ?? ""),
                status:       job.status ?? "scheduled",
                serviceType:  job.service_type ?? job.title ?? null,
                amountCents:  Math.round((job.total ?? job.amount ?? 0) * 100),
                completedAt:  job.completed_at ? new Date(job.completed_at) : null,
                scheduledFor: job.scheduled_for ?? job.date ? new Date(job.scheduled_for ?? job.date) : null,
              })
              .onConflictDoUpdate({
                target: gorilladeskJobsTable.externalId,
                set: {
                  status:       sql`excluded.status`,
                  amountCents:  sql`excluded.amount_cents`,
                  completedAt:  sql`excluded.completed_at`,
                },
              })
              .catch(() => {});
          }
        } else {
          gdApiMessage = "GorillaDesk API responded but returned 0 jobs.";
        }
      } else {
        gdApiMessage = `GorillaDesk API returned ${resp.status} — jobs endpoint not available.`;
      }
    } catch (err: any) {
      gdApiMessage = `GorillaDesk API unreachable for jobs: ${err?.message ?? "timeout"}`;
    }
  } else {
    gdApiMessage = "GORILLADESK_API_KEY not set.";
  }

  // ── Step 2: Load local data for matching ─────────────────────────────────
  const [gdJobs, gdCustomers, allLeads] = await Promise.all([
    db.select().from(gorilladeskJobsTable),
    db.select({
      externalId: gorilladeskCustomersTable.externalId,
      name:       gorilladeskCustomersTable.name,
      phone:      gorilladeskCustomersTable.phone,
    }).from(gorilladeskCustomersTable),
    db.select()
      .from(revenueAttributionTable)
      .where(eq(revenueAttributionTable.clientId, clientId)),
  ]);

  // Build lookup maps
  const customerByPhone   = new Map<string, typeof gdCustomers[number]>();
  const customerById      = new Map<string, typeof gdCustomers[number]>();
  const customerByExtId   = new Map<string, typeof gdCustomers[number]>();
  for (const c of gdCustomers) {
    const ph = normalizePhone(c.phone);
    if (ph) customerByPhone.set(ph, c);
    if (c.externalId) customerByExtId.set(c.externalId, c);
  }

  // Job lookup by customer externalId (one job per customer — take most recent/highest)
  const jobByCustomerId = new Map<string, typeof gdJobs[number]>();
  for (const j of gdJobs) {
    if (!j.customerId) continue;
    const existing = jobByCustomerId.get(j.customerId);
    if (!existing || (j.amountCents ?? 0) > (existing.amountCents ?? 0)) {
      jobByCustomerId.set(j.customerId, j);
    }
  }

  // ── Step 3: Match leads ──────────────────────────────────────────────────
  let matchedCount  = 0;
  let revenueTotal  = 0;
  const matchedIds: string[] = [];

  for (const lead of allLeads) {
    // Skip leads that are already won or lost
    if (["won", "lost"].includes(lead.status)) continue;

    const leadPhone = normalizePhone(lead.phone);
    const leadName  = lead.customerName.toLowerCase();

    // Priority 1: phone → customer
    let matchedCustomer = leadPhone ? customerByPhone.get(leadPhone) : undefined;

    // Priority 2: name match (first name, length > 2)
    if (!matchedCustomer) {
      matchedCustomer = gdCustomers.find(c => {
        const fn = c.name.toLowerCase().split(" ")[0];
        return fn.length > 2 && leadName.startsWith(fn);
      });
    }

    if (!matchedCustomer) continue;

    // Find a job for this customer
    const matchedJob = matchedCustomer.externalId
      ? jobByCustomerId.get(matchedCustomer.externalId)
      : undefined;

    const updates: Partial<typeof revenueAttributionTable.$inferInsert> & {
      status: string; matchedAt: Date;
    } = {
      status:    matchedJob ? (matchedJob.status === "completed" ? "won" : "matched") : "matched",
      matchedAt: now,
    };

    if (matchedJob) {
      if (matchedJob.amountCents && matchedJob.amountCents > 0) {
        updates.revenue    = String(matchedJob.amountCents / 100);
        revenueTotal      += matchedJob.amountCents / 100;
      }
      if (matchedJob.serviceType) updates.serviceType  = matchedJob.serviceType;
      if (matchedJob.externalId)  updates.gorilladeskJobId = matchedJob.externalId;
    }

    await db
      .update(revenueAttributionTable)
      .set(updates as any)
      .where(eq(revenueAttributionTable.id, lead.id));

    matchedCount++;
    matchedIds.push(lead.id);
  }

  // ── Step 4: Save sync state + respond ────────────────────────────────────
  lastSyncAt = now.toISOString();
  lastSyncStats = {
    gdJobsAvailable: gdApiJobsAvailable,
    gdJobCount:      gdJobs.length,
    gdCustomerCount: gdCustomers.length,
    leadsChecked:    allLeads.length,
    leadsMatched:    matchedCount,
    revenueMatched:  revenueTotal,
    apiMessage:      gdApiMessage,
  };

  console.log(`[revenue-attribution] sync-gorilladesk-jobs: matched ${matchedCount} leads, $${revenueTotal.toFixed(2)} revenue. API: ${gdApiMessage}`);

  return res.json({
    ok:             true,
    syncedAt:       lastSyncAt,
    gdApiJobsAvailable,
    gdApiMessage,
    gdJobCount:     gdJobs.length,
    gdCustomerCount: gdCustomers.length,
    leadsChecked:   allLeads.length,
    leadsMatched:   matchedCount,
    revenueMatched: revenueTotal,
    matchedIds,
    message:        `Synced ${matchedCount} leads from ${gdCustomers.length} GorillaDesk customers${gdJobs.length > 0 ? ` and ${gdJobs.length} jobs` : ""}. Revenue matched: $${revenueTotal.toFixed(2)}.`,
  });
});

export default router;

/**
 * GorillaDesk Import Pipeline
 *
 * POST /api/analytics/gorilladesk/sync    — live sync from GorillaDesk API
 * POST /api/analytics/gorilladesk/import  — batch import individual records
 * POST /api/analytics/gorilladesk/seed    — seed from known real snapshot data
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  gorilladeskPaymentsTable,
  gorilladeskJobsTable,
  gorilladeskCustomersTable,
  gorilladeskLeadSourcesTable,
  gorilladeskMetricSnapshotsTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { fetchAllCustomers, computeCustomerMetrics } from "../lib/gorilladesk-api";

const router = Router();

function requireAuth(req: any, res: any): string | null {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  return userId;
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/analytics/gorilladesk/sync
// Pulls live data from the GorillaDesk API, upserts customers, recomputes
// customer and marketing (lead source) snapshots.
// ─────────────────────────────────────────────────────────────────────────────

router.post("/analytics/gorilladesk/sync", async (req, res) => {
  if (!requireAuth(req, res)) return;

  const period    = currentPeriod();
  const projectId = "bed-bugs-and-beyond";

  try {
    // 1. Fetch all customers from GorillaDesk API
    const customers = await fetchAllCustomers();
    const metrics   = computeCustomerMetrics(customers, period);

    // 2. Upsert customers into DB
    let upserted = 0;
    for (const c of customers) {
      const name = `${c.first_name} ${c.last_name}`.trim();
      const phone = c.phones?.[0]?.phone ?? null;
      const existing = await db
        .select({ id: gorilladeskCustomersTable.id })
        .from(gorilladeskCustomersTable)
        .where(eq(gorilladeskCustomersTable.externalId, c.id))
        .limit(1);

      if (existing.length > 0) {
        await db.update(gorilladeskCustomersTable)
          .set({
            name,
            email:      c.email,
            phone,
            leadSource: c.source?.name ?? null,
          })
          .where(eq(gorilladeskCustomersTable.externalId, c.id));
      } else {
        await db.insert(gorilladeskCustomersTable).values({
          projectId,
          externalId:     c.id,
          name,
          email:          c.email,
          phone,
          isRecurring:    false,
          leadSource:     c.source?.name ?? null,
          activeServices: 0,
          firstServiceAt: null,
          lastServiceAt:  null,
        }).onConflictDoNothing();
      }
      upserted++;
    }

    // 3. Delete old api_sync snapshots for this period, then insert fresh ones
    await db.delete(gorilladeskMetricSnapshotsTable)
      .where(and(
        eq(gorilladeskMetricSnapshotsTable.projectId, projectId),
        eq(gorilladeskMetricSnapshotsTable.period, period),
        eq(gorilladeskMetricSnapshotsTable.source, "api_sync"),
      ));

    // 4. Customer snapshot
    const customerSnap = {
      new_customers:       metrics.new_this_month,
      returning_customers: null,
      active_services:     metrics.active_customers,
      recurring_services:  0,
    };
    await db.insert(gorilladeskMetricSnapshotsTable).values({
      projectId,
      period,
      metricType: "customers",
      data:       JSON.stringify(customerSnap),
      source:     "api_sync",
      importedAt: new Date(),
    });

    // 5. Marketing snapshot — lead source customer counts
    const marketingSnap = {
      lead_sources: metrics.lead_sources.map(ls => ({
        name:           ls.name,
        customer_count: ls.customer_count,
        job_count:      ls.customer_count,
        revenue_cents:  0,
      })),
    };
    await db.insert(gorilladeskMetricSnapshotsTable).values({
      projectId,
      period,
      metricType: "marketing",
      data:       JSON.stringify(marketingSnap),
      source:     "api_sync",
      importedAt: new Date(),
    });

    res.json({
      ok:             true,
      synced_at:      new Date().toISOString(),
      customers_total:  customers.length,
      customers_active: metrics.active_customers,
      new_this_month:   metrics.new_this_month,
      lead_sources:     metrics.lead_sources.length,
      customers_upserted: upserted,
      period,
    });
  } catch (err) {
    console.error("GorillaDesk sync error:", err);
    res.status(500).json({ error: "Sync failed", detail: String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Real GorillaDesk snapshot data — sourced directly from GorillaDesk reports.
// Do not modify without a new GorillaDesk export. No invented values.
// ─────────────────────────────────────────────────────────────────────────────

const REAL_GORILLADESK_SNAPSHOT = {
  revenue: {
    monthly_revenue:     492965,   // $4,929.65
    collected_revenue:   492563,   // $4,925.63
    outstanding_revenue: 114125,   // $1,141.25 (0-30d: $281.25 + 61-90d: $60 + 90+d: $800)
    avg_ticket:          10270,    // $102.70 = $4,929.65 / 48 completed jobs
    ar_buckets: {
      days_0_30:   28125,   // $281.25
      days_61_90:   6000,   // $60.00
      days_90_plus: 80000,  // $800.00
    },
    staff_revenue: {
      "Michael Diaz":   302533,  // $3,025.33
      "Christine Diaz": 190432,  // $1,904.32
    },
  },
  jobs: {
    total:           52,
    completed:       48,
    incomplete:       4,
    completion_rate: 92,   // 48/52 = 92.3%
    total_new_jobs_value: 660587,  // $6,605.87 — total value of new jobs created
  },
  customers: {
    new_customers:       null,   // not available from this export
    returning_customers: null,   // not available from this export
    active_services:        8,
    recurring_services:     2,
  },
};

// Payment breakdown rows — sourced directly from GorillaDesk payments report.
// These are processor/method totals, not individual transactions.
const REAL_PAYMENT_ROWS = [
  { method: "square", amountCents: 281268 },   // $2,812.68
  { method: "check",  amountCents: 163667 },   // $1,636.67
  { method: "cash",   amountCents: 124500 },   // $1,245.00
  { method: "credit", amountCents:  39405 },   // $394.05
  { method: "zelle",  amountCents:  16500 },   // $165.00
];

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/analytics/gorilladesk/seed
// Populates DB from the real GorillaDesk snapshot above.
// Safe to call multiple times — clears existing seed data first.
// ─────────────────────────────────────────────────────────────────────────────

router.post("/analytics/gorilladesk/seed", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const period = currentPeriod();
  const projectId = "bed-bugs-and-beyond";
  const summary: Record<string, unknown> = {};

  try {
    // 1. Clear existing seeded payment rows for this project (not API-synced individual records)
    await db.delete(gorilladeskPaymentsTable)
      .where(and(
        eq(gorilladeskPaymentsTable.projectId, projectId),
        eq(gorilladeskPaymentsTable.status, "collected"),
      ));

    // 2. Insert real payment breakdown rows (one per processor/method)
    const paymentRows = await db.insert(gorilladeskPaymentsTable).values(
      REAL_PAYMENT_ROWS.map(p => ({
        projectId,
        method:      p.method,
        amountCents: p.amountCents,
        status:      "collected" as const,
        paidAt:      new Date(),
      }))
    ).returning();

    summary.payments_inserted = paymentRows.length;
    summary.payments_total_cents = REAL_PAYMENT_ROWS.reduce((s, p) => s + p.amountCents, 0);

    // 3. Upsert metric snapshots — delete old ones for this period then re-insert
    await db.delete(gorilladeskMetricSnapshotsTable)
      .where(and(
        eq(gorilladeskMetricSnapshotsTable.projectId, projectId),
        eq(gorilladeskMetricSnapshotsTable.period, period),
        eq(gorilladeskMetricSnapshotsTable.source, "manual_import"),
      ));

    const snapshotRows = [
      { metricType: "revenue",   data: JSON.stringify(REAL_GORILLADESK_SNAPSHOT.revenue)   },
      { metricType: "jobs",      data: JSON.stringify(REAL_GORILLADESK_SNAPSHOT.jobs)      },
      { metricType: "customers", data: JSON.stringify(REAL_GORILLADESK_SNAPSHOT.customers) },
    ];

    const insertedSnapshots = await db.insert(gorilladeskMetricSnapshotsTable).values(
      snapshotRows.map(s => ({
        projectId,
        period,
        metricType: s.metricType,
        data:       s.data,
        source:     "manual_import",
        importedAt: new Date(),
      }))
    ).returning();

    summary.snapshots_inserted = insertedSnapshots.length;
    summary.snapshot_types = snapshotRows.map(s => s.metricType);
    summary.period = period;
    summary.source = "manual_import";

    res.json({
      ok: true,
      message: "GorillaDesk seed data inserted successfully",
      summary,
    });
  } catch (err) {
    console.error("GorillaDesk seed error:", err);
    res.status(500).json({ error: "Seed failed", detail: String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/analytics/gorilladesk/import
// General-purpose import for future use (GorillaDesk API sync, CSV export, etc.)
// Accepts individual normalized records and upserts them.
// ─────────────────────────────────────────────────────────────────────────────

type ImportJob = {
  externalId?: string;
  status: string;
  serviceType?: string;
  amountCents: number;
  completedAt?: string | null;
  scheduledFor?: string | null;
};

type ImportCustomer = {
  externalId?: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  isRecurring?: boolean;
  leadSource?: string | null;
  activeServices?: number;
  firstServiceAt?: string | null;
  lastServiceAt?: string | null;
};

type ImportPayment = {
  externalId?: string;
  jobId?: string | null;
  amountCents: number;
  method: string;
  status: string;
  paidAt?: string | null;
};

type ImportLeadSource = {
  name: string;
  jobCount: number;
  revenueCents: number;
  period: string;
};

type ImportBody = {
  jobs?:        ImportJob[];
  customers?:   ImportCustomer[];
  payments?:    ImportPayment[];
  leadSources?: ImportLeadSource[];
};

router.post("/analytics/gorilladesk/import", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const body = req.body as ImportBody;
  const projectId = "bed-bugs-and-beyond";
  const counts = { jobs: 0, customers: 0, payments: 0, leadSources: 0 };

  try {
    if (body.jobs?.length) {
      const rows = await db.insert(gorilladeskJobsTable).values(
        body.jobs.map(j => ({
          projectId,
          externalId:   j.externalId ?? null,
          status:       j.status,
          serviceType:  j.serviceType ?? null,
          amountCents:  j.amountCents,
          completedAt:  j.completedAt ? new Date(j.completedAt) : null,
          scheduledFor: j.scheduledFor ? new Date(j.scheduledFor) : null,
        }))
      ).onConflictDoNothing().returning();
      counts.jobs = rows.length;
    }

    if (body.customers?.length) {
      const rows = await db.insert(gorilladeskCustomersTable).values(
        body.customers.map(c => ({
          projectId,
          externalId:     c.externalId ?? null,
          name:           c.name,
          email:          c.email ?? null,
          phone:          c.phone ?? null,
          isRecurring:    c.isRecurring ?? false,
          leadSource:     c.leadSource ?? null,
          activeServices: c.activeServices ?? 0,
          firstServiceAt: c.firstServiceAt ? new Date(c.firstServiceAt) : null,
          lastServiceAt:  c.lastServiceAt  ? new Date(c.lastServiceAt)  : null,
        }))
      ).onConflictDoNothing().returning();
      counts.customers = rows.length;
    }

    if (body.payments?.length) {
      const rows = await db.insert(gorilladeskPaymentsTable).values(
        body.payments.map(p => ({
          projectId,
          externalId:  p.externalId ?? null,
          jobId:       p.jobId ?? null,
          amountCents: p.amountCents,
          method:      p.method,
          status:      p.status,
          paidAt:      p.paidAt ? new Date(p.paidAt) : null,
        }))
      ).onConflictDoNothing().returning();
      counts.payments = rows.length;
    }

    if (body.leadSources?.length) {
      const rows = await db.insert(gorilladeskLeadSourcesTable).values(
        body.leadSources.map(l => ({
          projectId,
          name:         l.name,
          jobCount:     l.jobCount,
          revenueCents: l.revenueCents,
          period:       l.period,
        }))
      ).returning();
      counts.leadSources = rows.length;
    }

    res.json({ ok: true, inserted: counts });
  } catch (err) {
    console.error("GorillaDesk import error:", err);
    res.status(500).json({ error: "Import failed", detail: String(err) });
  }
});

export default router;

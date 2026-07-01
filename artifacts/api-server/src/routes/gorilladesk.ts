import { Router } from "express";
import { db } from "@workspace/db";
import {
  gorilladeskJobsTable,
  gorilladeskCustomersTable,
  gorilladeskPaymentsTable,
  gorilladeskLeadSourcesTable,
  gorilladeskMetricSnapshotsTable,
} from "@workspace/db/schema";
import { eq, sql, and, gte, lt, desc } from "drizzle-orm";
import { getAuth } from "@clerk/express";

const router = Router();

function requireAuth(req: any, res: any): string | null {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  return userId;
}

function centsToDisplay(cents: number): string {
  if (cents === 0) return "$0";
  if (cents >= 100_000) return `$${(cents / 100_000).toFixed(1)}k`.replace(".0k", "k");
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function startOfNextMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

/** Fetch the latest metric snapshot for a given type. Returns parsed data or null. */
async function getSnapshot(metricType: string, projectId: string): Promise<Record<string, unknown> | null> {
  const rows = await db
    .select()
    .from(gorilladeskMetricSnapshotsTable)
    .where(and(
      eq(gorilladeskMetricSnapshotsTable.projectId, projectId),
      eq(gorilladeskMetricSnapshotsTable.metricType, metricType),
    ))
    .orderBy(desc(gorilladeskMetricSnapshotsTable.importedAt))
    .limit(1);

  if (!rows[0]) return null;
  try { return JSON.parse(rows[0].data); } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/gorilladesk/revenue
// Falls back to snapshot when no individual payment records exist.
// ─────────────────────────────────────────────────────────────────────────────

router.get("/analytics/gorilladesk/revenue", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const projectId = "bed-bugs-and-beyond";

  try {
    const snapshot = await getSnapshot("revenue", projectId);

    if (snapshot) {
      const monthly     = Number(snapshot.monthly_revenue     ?? 0);
      const collected   = Number(snapshot.collected_revenue   ?? 0);
      const outstanding = Number(snapshot.outstanding_revenue ?? 0);
      const avg         = Number(snapshot.avg_ticket          ?? 0);
      res.json({
        monthly_revenue:         monthly,
        collected_revenue:       collected,
        outstanding_revenue:     outstanding,
        avg_ticket:              avg,
        monthly_revenue_fmt:     centsToDisplay(monthly),
        collected_revenue_fmt:   centsToDisplay(collected),
        outstanding_revenue_fmt: centsToDisplay(outstanding),
        avg_ticket_fmt:          centsToDisplay(avg),
        period:                  currentPeriod(),
        data_source:             "snapshot",
      });
      return;
    }

    // No snapshot — try to compute from individual payment records
    const monthStart = startOfMonth();
    const monthEnd   = startOfNextMonth();

    const [monthly, collected, outstanding, avgResult] = await Promise.all([
      db.select({ total: sql<number>`coalesce(sum(amount_cents),0)` })
        .from(gorilladeskPaymentsTable)
        .where(and(
          eq(gorilladeskPaymentsTable.projectId, projectId),
          gte(gorilladeskPaymentsTable.createdAt, monthStart),
          lt(gorilladeskPaymentsTable.createdAt, monthEnd),
        )),
      db.select({ total: sql<number>`coalesce(sum(amount_cents),0)` })
        .from(gorilladeskPaymentsTable)
        .where(and(
          eq(gorilladeskPaymentsTable.projectId, projectId),
          eq(gorilladeskPaymentsTable.status, "collected"),
        )),
      db.select({ total: sql<number>`coalesce(sum(amount_cents),0)` })
        .from(gorilladeskPaymentsTable)
        .where(and(
          eq(gorilladeskPaymentsTable.projectId, projectId),
          eq(gorilladeskPaymentsTable.status, "outstanding"),
        )),
      db.select({ avg: sql<number>`coalesce(avg(amount_cents),0)` })
        .from(gorilladeskJobsTable)
        .where(and(
          eq(gorilladeskJobsTable.projectId, projectId),
          eq(gorilladeskJobsTable.status, "completed"),
        )),
    ]);

    const monthlyCents     = Number(monthly[0]?.total   ?? 0);
    const collectedCents   = Number(collected[0]?.total ?? 0);
    const outstandingCents = Number(outstanding[0]?.total ?? 0);
    const avgCents         = Math.round(Number(avgResult[0]?.avg ?? 0));

    res.json({
      monthly_revenue:         monthlyCents,
      collected_revenue:       collectedCents,
      outstanding_revenue:     outstandingCents,
      avg_ticket:              avgCents,
      monthly_revenue_fmt:     centsToDisplay(monthlyCents),
      collected_revenue_fmt:   centsToDisplay(collectedCents),
      outstanding_revenue_fmt: centsToDisplay(outstandingCents),
      avg_ticket_fmt:          centsToDisplay(avgCents),
      period:                  currentPeriod(),
      data_source:             "live",
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch revenue analytics" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/gorilladesk/jobs
// Falls back to snapshot when no individual job records exist.
// ─────────────────────────────────────────────────────────────────────────────

router.get("/analytics/gorilladesk/jobs", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const projectId = "bed-bugs-and-beyond";

  try {
    const snapshot = await getSnapshot("jobs", projectId);

    if (snapshot) {
      res.json({
        total:           Number(snapshot.total           ?? 0),
        completed:       Number(snapshot.completed       ?? 0),
        incomplete:      Number(snapshot.incomplete      ?? 0),
        completion_rate: Number(snapshot.completion_rate ?? 0),
        by_status:       {},
        data_source:     "snapshot",
      });
      return;
    }

    // No snapshot — compute from individual records
    const rows = await db
      .select({ status: gorilladeskJobsTable.status, count: sql<number>`count(*)` })
      .from(gorilladeskJobsTable)
      .where(eq(gorilladeskJobsTable.projectId, projectId))
      .groupBy(gorilladeskJobsTable.status);

    const byStatus: Record<string, number> = {};
    for (const r of rows) byStatus[r.status] = Number(r.count);

    const total      = rows.reduce((s, r) => s + Number(r.count), 0);
    const completed  = byStatus["completed"]  ?? 0;
    const incomplete = byStatus["incomplete"] ?? 0;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    res.json({ total, completed, incomplete, completion_rate: completionRate, by_status: byStatus, data_source: "live" });
  } catch {
    res.status(500).json({ error: "Failed to fetch jobs analytics" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/gorilladesk/customers
// Falls back to snapshot when no individual customer records exist.
// ─────────────────────────────────────────────────────────────────────────────

router.get("/analytics/gorilladesk/customers", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const projectId = "bed-bugs-and-beyond";

  try {
    const snapshot = await getSnapshot("customers", projectId);

    if (snapshot) {
      res.json({
        new_customers:       snapshot.new_customers       ?? null,
        returning_customers: snapshot.returning_customers ?? null,
        active_services:     Number(snapshot.active_services     ?? 0),
        recurring_services:  Number(snapshot.recurring_services  ?? 0),
        period:              currentPeriod(),
        data_source:         "snapshot",
      });
      return;
    }

    // No snapshot — compute from individual records
    const monthStart = startOfMonth();
    const monthEnd   = startOfNextMonth();

    const [newCount, returningCount, activeResult, recurringCount] = await Promise.all([
      db.select({ count: sql<number>`count(*)` })
        .from(gorilladeskCustomersTable)
        .where(and(
          eq(gorilladeskCustomersTable.projectId, projectId),
          gte(gorilladeskCustomersTable.firstServiceAt, monthStart),
          lt(gorilladeskCustomersTable.firstServiceAt, monthEnd),
        )),
      db.select({ count: sql<number>`count(*)` })
        .from(gorilladeskCustomersTable)
        .where(and(
          eq(gorilladeskCustomersTable.projectId, projectId),
          gte(gorilladeskCustomersTable.lastServiceAt, monthStart),
          lt(gorilladeskCustomersTable.lastServiceAt, monthEnd),
          lt(gorilladeskCustomersTable.firstServiceAt, monthStart),
        )),
      db.select({ total: sql<number>`coalesce(sum(active_services),0)` })
        .from(gorilladeskCustomersTable)
        .where(eq(gorilladeskCustomersTable.projectId, projectId)),
      db.select({ count: sql<number>`count(*)` })
        .from(gorilladeskCustomersTable)
        .where(and(
          eq(gorilladeskCustomersTable.projectId, projectId),
          eq(gorilladeskCustomersTable.isRecurring, true),
        )),
    ]);

    res.json({
      new_customers:       Number(newCount[0]?.count      ?? 0),
      returning_customers: Number(returningCount[0]?.count ?? 0),
      active_services:     Number(activeResult[0]?.total  ?? 0),
      recurring_services:  Number(recurringCount[0]?.count ?? 0),
      period:              currentPeriod(),
      data_source:         "live",
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch customers analytics" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/gorilladesk/marketing
// ─────────────────────────────────────────────────────────────────────────────

router.get("/analytics/gorilladesk/marketing", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const projectId = "bed-bugs-and-beyond";

  try {
    const period = currentPeriod();
    const rows = await db
      .select()
      .from(gorilladeskLeadSourcesTable)
      .where(and(
        eq(gorilladeskLeadSourcesTable.projectId, projectId),
        eq(gorilladeskLeadSourcesTable.period, period),
      ));

    const leadSources = rows
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .map(r => ({
        name:        r.name,
        job_count:   r.jobCount,
        revenue:     r.revenueCents,
        revenue_fmt: centsToDisplay(r.revenueCents),
      }));

    res.json({ lead_sources: leadSources, period, data_source: "live" });
  } catch {
    res.status(500).json({ error: "Failed to fetch marketing analytics" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/gorilladesk/payments
// Queries individual payment records (seeded from real GorillaDesk payment report).
// ─────────────────────────────────────────────────────────────────────────────

router.get("/analytics/gorilladesk/payments", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const projectId = "bed-bugs-and-beyond";

  try {
    const rows = await db
      .select({
        method: gorilladeskPaymentsTable.method,
        count:  sql<number>`count(*)`,
        amount: sql<number>`coalesce(sum(amount_cents),0)`,
      })
      .from(gorilladeskPaymentsTable)
      .where(eq(gorilladeskPaymentsTable.projectId, projectId))
      .groupBy(gorilladeskPaymentsTable.method);

    const breakdown = rows
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .map(r => ({
        method:     r.method,
        count:      Number(r.count),
        amount:     Number(r.amount),
        amount_fmt: centsToDisplay(Number(r.amount)),
      }));

    const totalCents = rows.reduce((s, r) => s + Number(r.amount), 0);

    res.json({
      breakdown,
      total:       totalCents,
      total_fmt:   centsToDisplay(totalCents),
      data_source: "live",
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch payments analytics" });
  }
});

export default router;

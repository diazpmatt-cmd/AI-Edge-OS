import { Router } from "express";
import { db } from "@workspace/db";
import {
  gorilladeskJobsTable,
  gorilladeskCustomersTable,
  gorilladeskPaymentsTable,
  gorilladeskLeadSourcesTable,
} from "@workspace/db/schema";
import { eq, sql, and, gte, lt } from "drizzle-orm";
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

router.get("/analytics/gorilladesk/revenue", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const monthStart = startOfMonth();
    const monthEnd   = startOfNextMonth();

    const [monthly, collected, outstanding, avgResult] = await Promise.all([
      db.select({ total: sql<number>`coalesce(sum(amount_cents),0)` })
        .from(gorilladeskPaymentsTable)
        .where(and(
          eq(gorilladeskPaymentsTable.projectId, "bed-bugs-and-beyond"),
          gte(gorilladeskPaymentsTable.createdAt, monthStart),
          lt(gorilladeskPaymentsTable.createdAt, monthEnd),
        )),
      db.select({ total: sql<number>`coalesce(sum(amount_cents),0)` })
        .from(gorilladeskPaymentsTable)
        .where(and(
          eq(gorilladeskPaymentsTable.projectId, "bed-bugs-and-beyond"),
          eq(gorilladeskPaymentsTable.status, "collected"),
        )),
      db.select({ total: sql<number>`coalesce(sum(amount_cents),0)` })
        .from(gorilladeskPaymentsTable)
        .where(and(
          eq(gorilladeskPaymentsTable.projectId, "bed-bugs-and-beyond"),
          eq(gorilladeskPaymentsTable.status, "outstanding"),
        )),
      db.select({ avg: sql<number>`coalesce(avg(amount_cents),0)` })
        .from(gorilladeskJobsTable)
        .where(and(
          eq(gorilladeskJobsTable.projectId, "bed-bugs-and-beyond"),
          eq(gorilladeskJobsTable.status, "completed"),
        )),
    ]);

    const monthlyCents     = Number(monthly[0]?.total ?? 0);
    const collectedCents   = Number(collected[0]?.total ?? 0);
    const outstandingCents = Number(outstanding[0]?.total ?? 0);
    const avgCents         = Math.round(Number(avgResult[0]?.avg ?? 0));

    res.json({
      monthly_revenue:      monthlyCents,
      collected_revenue:    collectedCents,
      outstanding_revenue:  outstandingCents,
      avg_ticket:           avgCents,
      monthly_revenue_fmt:     centsToDisplay(monthlyCents),
      collected_revenue_fmt:   centsToDisplay(collectedCents),
      outstanding_revenue_fmt: centsToDisplay(outstandingCents),
      avg_ticket_fmt:          centsToDisplay(avgCents),
      period: currentPeriod(),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch revenue analytics" });
  }
});

router.get("/analytics/gorilladesk/jobs", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const rows = await db
      .select({
        status: gorilladeskJobsTable.status,
        count:  sql<number>`count(*)`,
      })
      .from(gorilladeskJobsTable)
      .where(eq(gorilladeskJobsTable.projectId, "bed-bugs-and-beyond"))
      .groupBy(gorilladeskJobsTable.status);

    const byStatus: Record<string, number> = {};
    for (const r of rows) byStatus[r.status] = Number(r.count);

    const total      = rows.reduce((s, r) => s + Number(r.count), 0);
    const completed  = byStatus["completed"]  ?? 0;
    const incomplete = byStatus["incomplete"] ?? 0;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    res.json({ total, completed, incomplete, completion_rate: completionRate, by_status: byStatus });
  } catch {
    res.status(500).json({ error: "Failed to fetch jobs analytics" });
  }
});

router.get("/analytics/gorilladesk/customers", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const monthStart = startOfMonth();
    const monthEnd   = startOfNextMonth();

    const [newCount, returningCount, activeResult, recurringCount] = await Promise.all([
      db.select({ count: sql<number>`count(*)` })
        .from(gorilladeskCustomersTable)
        .where(and(
          eq(gorilladeskCustomersTable.projectId, "bed-bugs-and-beyond"),
          gte(gorilladeskCustomersTable.firstServiceAt, monthStart),
          lt(gorilladeskCustomersTable.firstServiceAt, monthEnd),
        )),
      db.select({ count: sql<number>`count(*)` })
        .from(gorilladeskCustomersTable)
        .where(and(
          eq(gorilladeskCustomersTable.projectId, "bed-bugs-and-beyond"),
          gte(gorilladeskCustomersTable.lastServiceAt, monthStart),
          lt(gorilladeskCustomersTable.lastServiceAt, monthEnd),
          lt(gorilladeskCustomersTable.firstServiceAt, monthStart),
        )),
      db.select({ total: sql<number>`coalesce(sum(active_services),0)` })
        .from(gorilladeskCustomersTable)
        .where(eq(gorilladeskCustomersTable.projectId, "bed-bugs-and-beyond")),
      db.select({ count: sql<number>`count(*)` })
        .from(gorilladeskCustomersTable)
        .where(and(
          eq(gorilladeskCustomersTable.projectId, "bed-bugs-and-beyond"),
          eq(gorilladeskCustomersTable.isRecurring, true),
        )),
    ]);

    res.json({
      new_customers:      Number(newCount[0]?.count ?? 0),
      returning_customers: Number(returningCount[0]?.count ?? 0),
      active_services:    Number(activeResult[0]?.total ?? 0),
      recurring_services: Number(recurringCount[0]?.count ?? 0),
      period: currentPeriod(),
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch customers analytics" });
  }
});

router.get("/analytics/gorilladesk/marketing", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const period = currentPeriod();
    const rows = await db
      .select()
      .from(gorilladeskLeadSourcesTable)
      .where(and(
        eq(gorilladeskLeadSourcesTable.projectId, "bed-bugs-and-beyond"),
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

    res.json({ lead_sources: leadSources, period });
  } catch {
    res.status(500).json({ error: "Failed to fetch marketing analytics" });
  }
});

router.get("/analytics/gorilladesk/payments", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const rows = await db
      .select({
        method: gorilladeskPaymentsTable.method,
        count:  sql<number>`count(*)`,
        amount: sql<number>`coalesce(sum(amount_cents),0)`,
      })
      .from(gorilladeskPaymentsTable)
      .where(eq(gorilladeskPaymentsTable.projectId, "bed-bugs-and-beyond"))
      .groupBy(gorilladeskPaymentsTable.method);

    const breakdown = rows
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .map(r => ({
        method:      r.method,
        count:       Number(r.count),
        amount:      Number(r.amount),
        amount_fmt:  centsToDisplay(Number(r.amount)),
      }));

    const totalCents = rows.reduce((s, r) => s + Number(r.amount), 0);

    res.json({ breakdown, total: totalCents, total_fmt: centsToDisplay(totalCents) });
  } catch {
    res.status(500).json({ error: "Failed to fetch payments analytics" });
  }
});

export default router;

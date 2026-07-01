/**
 * CLI seed script — populates GorillaDesk tables from real export data.
 * Run with: pnpm --filter @workspace/api-server exec tsx src/scripts/seed-gorilladesk.ts
 *
 * Safe to re-run: clears existing seeded data then reinserts.
 * No authentication required — runs directly against the DB.
 */
import { db } from "@workspace/db";
import {
  gorilladeskPaymentsTable,
  gorilladeskMetricSnapshotsTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const PROJECT_ID = "bed-bugs-and-beyond";

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Real GorillaDesk data — sourced from actual GorillaDesk reports.
// ─────────────────────────────────────────────────────────────────────────────

const PAYMENT_ROWS = [
  { method: "square", amountCents: 281268 },   // $2,812.68
  { method: "check",  amountCents: 163667 },   // $1,636.67
  { method: "cash",   amountCents: 124500 },   // $1,245.00
  { method: "credit", amountCents:  39405 },   // $394.05
  { method: "zelle",  amountCents:  16500 },   // $165.00
];

const REVENUE_SNAPSHOT = {
  monthly_revenue:     492965,   // $4,929.65
  collected_revenue:   492563,   // $4,925.63
  outstanding_revenue: 114125,   // $1,141.25 total A/R
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
};

const JOBS_SNAPSHOT = {
  total:           52,
  completed:       48,
  incomplete:       4,
  completion_rate: 92,
  total_new_jobs_value: 660587,  // $6,605.87
};

const CUSTOMERS_SNAPSHOT = {
  new_customers:       null,
  returning_customers: null,
  active_services:        8,
  recurring_services:     2,
};

async function main() {
  const period = currentPeriod();
  console.log(`\nGorillaDesk seed — project: ${PROJECT_ID} | period: ${period}\n`);

  // 1. Clear existing seeded payment rows
  const deleted = await db.delete(gorilladeskPaymentsTable)
    .where(and(
      eq(gorilladeskPaymentsTable.projectId, PROJECT_ID),
      eq(gorilladeskPaymentsTable.status, "collected"),
    ))
    .returning();
  console.log(`Cleared ${deleted.length} existing payment row(s)`);

  // 2. Insert real payment breakdown rows
  const payments = await db.insert(gorilladeskPaymentsTable).values(
    PAYMENT_ROWS.map(p => ({
      projectId:   PROJECT_ID,
      method:      p.method,
      amountCents: p.amountCents,
      status:      "collected" as const,
      paidAt:      new Date(),
    }))
  ).returning();
  console.log(`Inserted ${payments.length} payment row(s):`);
  for (const p of payments) {
    console.log(`  ${p.method.padEnd(8)} $${(p.amountCents / 100).toFixed(2)}`);
  }

  // 3. Clear existing manual snapshots for this period
  const deletedSnaps = await db.delete(gorilladeskMetricSnapshotsTable)
    .where(and(
      eq(gorilladeskMetricSnapshotsTable.projectId, PROJECT_ID),
      eq(gorilladeskMetricSnapshotsTable.period, period),
      eq(gorilladeskMetricSnapshotsTable.source, "manual_import"),
    ))
    .returning();
  console.log(`\nCleared ${deletedSnaps.length} existing snapshot(s)`);

  // 4. Insert metric snapshots
  const snapshotRows = [
    { metricType: "revenue",   data: JSON.stringify(REVENUE_SNAPSHOT)   },
    { metricType: "jobs",      data: JSON.stringify(JOBS_SNAPSHOT)      },
    { metricType: "customers", data: JSON.stringify(CUSTOMERS_SNAPSHOT) },
  ];

  const snapshots = await db.insert(gorilladeskMetricSnapshotsTable).values(
    snapshotRows.map(s => ({
      projectId:  PROJECT_ID,
      period,
      metricType: s.metricType,
      data:       s.data,
      source:     "manual_import",
      importedAt: new Date(),
    }))
  ).returning();

  console.log(`Inserted ${snapshots.length} snapshot(s):`);
  for (const s of snapshots) {
    console.log(`  ${s.metricType}`);
  }

  console.log("\n✓ Seed complete. GorillaDesk analytics tables are now populated.\n");
  process.exit(0);
}

main().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});

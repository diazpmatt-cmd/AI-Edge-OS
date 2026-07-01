/**
 * GorillaDesk Import Pipeline
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ Endpoint                               │ Purpose                         │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │ POST /api/analytics/gorilladesk/sync   │ Live API sync (customers +      │
 * │                                        │ lead sources only)              │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │ POST /api/analytics/gorilladesk/csv    │ CSV file upload for jobs and/or │
 * │                                        │ payments (multipart form-data)  │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │ POST /api/analytics/gorilladesk/import │ JSON body import for any table  │
 * │                                        │ (jobs, payments, customers,     │
 * │                                        │ leadSources)                    │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │ POST /api/analytics/gorilladesk/seed   │ Insert hardcoded real snapshot  │
 * │                                        │ data (payment method totals +   │
 * │                                        │ metric snapshots)               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Why jobs and payments cannot be live-synced:
 *   GorillaDesk's public REST API (as of 2026-07) only exposes /company,
 *   /users, and /customers. Calls to /jobs, /invoices, /payments, and
 *   /transactions all return HTTP 404. These must be imported manually from
 *   GorillaDesk → Reports → Jobs / Payments CSV exports.
 */
import { Router } from "express";
import multer from "multer";
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
import { syncAllGorillaDeskData } from "../lib/gorilladesk-sync";
import {
  importJobsFromCSV,
  importPaymentsFromCSV,
  upsertJobs,
  upsertPayments,
  type NormalizedJob,
  type NormalizedPayment,
  type ImportSummary,
} from "../lib/gorilladesk-csv-import";

const router = Router();

// Multer — memory storage for CSV uploads (files are small, no disk needed)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max per file
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error(`Only CSV files are accepted; got "${file.originalname}"`));
    }
  },
});

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
// Only customers and lead_sources are available via the public API.
// ─────────────────────────────────────────────────────────────────────────────

router.post("/analytics/gorilladesk/sync", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const projectId = "bed-bugs-and-beyond";

  try {
    const result = await syncAllGorillaDeskData(projectId);
    const statusCode = result.ok ? 200 : 207; // 207 Multi-Status when some endpoints unavailable
    res.status(statusCode).json(result);
  } catch (err) {
    console.error("GorillaDesk sync error:", err);
    res.status(500).json({ error: "Sync failed", detail: String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/analytics/gorilladesk/csv
//
// Accepts multipart/form-data with CSV file fields:
//   jobs     — CSV exported from GorillaDesk → Reports → Jobs
//   payments — CSV exported from GorillaDesk → Reports → Payments
//
// Both fields are optional; supply one or both in the same request.
//
// How to export from GorillaDesk:
//   1. Log in → Reports → Jobs (or Payments)
//   2. Select date range
//   3. Click "Export" → CSV
//   4. POST the file to this endpoint as multipart/form-data
//
// Response:
//   {
//     ok: true,
//     jobs?:     { rows_processed, rows_inserted, rows_updated, rows_skipped, validation_errors },
//     payments?: { rows_processed, rows_inserted, rows_updated, rows_skipped, validation_errors }
//   }
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/analytics/gorilladesk/csv",
  (req, res, next) => {
    if (!requireAuth(req, res)) return;
    next();
  },
  upload.fields([
    { name: "jobs",     maxCount: 1 },
    { name: "payments", maxCount: 1 },
  ]),
  async (req: any, res: any) => {
    const projectId = "bed-bugs-and-beyond";
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;

    if (!files || (!files.jobs && !files.payments)) {
      return res.status(400).json({
        error: "No CSV files provided. Include a 'jobs' and/or 'payments' file field.",
      });
    }

    const result: { ok: boolean; jobs?: ImportSummary; payments?: ImportSummary } = { ok: true };

    try {
      if (files.jobs?.[0]) {
        const csv = files.jobs[0].buffer.toString("utf-8");
        result.jobs = await importJobsFromCSV(csv, projectId);
      }

      if (files.payments?.[0]) {
        const csv = files.payments[0].buffer.toString("utf-8");
        result.payments = await importPaymentsFromCSV(csv, projectId);
      }

      // If any file had validation errors on every row, still return 200 with the summary
      res.json(result);
    } catch (err) {
      console.error("GorillaDesk CSV import error:", err);
      res.status(500).json({ error: "CSV import failed", detail: String(err) });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/analytics/gorilladesk/import
//
// JSON body import for programmatic use. Accepts normalized records directly.
// All fields are optional — send only the arrays you want to import.
//
// Body shape:
//   {
//     jobs?:        NormalizedJob[],
//     payments?:    NormalizedPayment[],
//     customers?:   ImportCustomer[],
//     leadSources?: ImportLeadSource[]
//   }
//
// Response:
//   {
//     ok: true,
//     jobs?:        ImportSummary,
//     payments?:    ImportSummary,
//     customers?:   { rows_inserted: number },
//     leadSources?: { rows_inserted: number }
//   }
// ─────────────────────────────────────────────────────────────────────────────

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

type ImportLeadSource = {
  name: string;
  jobCount: number;
  revenueCents: number;
  period: string;
};

type ImportBody = {
  jobs?:        NormalizedJob[];
  payments?:    NormalizedPayment[];
  customers?:   ImportCustomer[];
  leadSources?: ImportLeadSource[];
};

router.post("/analytics/gorilladesk/import", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const body = req.body as ImportBody;
  const projectId = "bed-bugs-and-beyond";

  const result: Record<string, unknown> = { ok: true };

  try {
    if (body.jobs?.length) {
      result.jobs = await upsertJobs(body.jobs, projectId);
    }

    if (body.payments?.length) {
      result.payments = await upsertPayments(body.payments, projectId);
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
      result.customers = { rows_inserted: rows.length };
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
      result.leadSources = { rows_inserted: rows.length };
    }

    res.json(result);
  } catch (err) {
    console.error("GorillaDesk import error:", err);
    res.status(500).json({ error: "Import failed", detail: String(err) });
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

export default router;

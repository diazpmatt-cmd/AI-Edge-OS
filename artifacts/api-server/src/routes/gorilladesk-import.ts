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
 * │ POST /api/analytics/gorilladesk/seed   │ Retired legacy write endpoint   │
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
  gorilladeskJobsTable,
  gorilladeskCustomersTable,
  gorilladeskLeadSourcesTable,
} from "@workspace/db/schema";
import { getAuth } from "@clerk/express";
import { syncAllGorillaDeskData } from "../lib/gorilladesk-sync";
import { resolveClientActiveCheck } from "../lib/client-resolver";
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

async function resolveTenant(req: any, res: any) {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  try {
    const resolved = await resolveClientActiveCheck(userId);
    if (!resolved.ok) {
      res.status(404).json({ error: "Client not found" });
      return null;
    }
    return resolved;
  } catch {
    console.error("GorillaDesk tenant resolution failed");
    res.status(503).json({ error: "Tenant resolution unavailable" });
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/analytics/gorilladesk/sync
// Pulls live data from the GorillaDesk API, upserts customers, recomputes
// customer and marketing (lead source) snapshots.
// Only customers and lead_sources are available via the public API.
// ─────────────────────────────────────────────────────────────────────────────

router.post("/analytics/gorilladesk/sync", async (req, res) => {
  const tenant = await resolveTenant(req, res);
  if (!tenant) return;
  if (tenant.slug !== "bed-bugs-and-beyond") {
    return res.status(409).json({ error: "Direct GorillaDesk sync is unavailable until provider credentials are tenant-bound" });
  }

  try {
    const result = await syncAllGorillaDeskData(tenant.slug);
    const statusCode = result.ok ? 200 : 207; // 207 Multi-Status when some endpoints unavailable
    res.status(statusCode).json(result);
  } catch {
    console.error("GorillaDesk sync failed");
    res.status(500).json({ error: "Sync failed" });
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
  async (req, res, next) => {
    const tenant = await resolveTenant(req, res);
    if (!tenant) return;
    res.locals.gorilladeskProjectId = tenant.slug;
    next();
  },
  upload.fields([
    { name: "jobs",     maxCount: 1 },
    { name: "payments", maxCount: 1 },
  ]),
  async (req: any, res: any) => {
    const projectId = res.locals.gorilladeskProjectId as string;
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
    } catch {
      console.error("GorillaDesk CSV import failed");
      res.status(500).json({ error: "CSV import failed" });
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
  const tenant = await resolveTenant(req, res);
  if (!tenant) return;
  const body = req.body as ImportBody;
  const projectId = tenant.slug;

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
  } catch {
    console.error("GorillaDesk import failed");
    res.status(500).json({ error: "Import failed" });
  }
});

router.post("/analytics/gorilladesk/seed", async (req, res) => {
  const tenant = await resolveTenant(req, res);
  if (!tenant) return;
  return res.status(410).json({ error: "Legacy GorillaDesk seed writes are retired; import canonical tenant evidence instead" });
});

export default router;

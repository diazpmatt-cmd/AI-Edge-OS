/**
 * GorillaDesk CSV / JSON Import Library
 *
 * ┌──────────────────┬──────────────────────────────────────────────────────────┐
 * │ Data source      │ Sync method                                              │
 * ├──────────────────┼──────────────────────────────────────────────────────────┤
 * │ customers        │ LIVE API SYNC  — GET /v1/customers (gorilladesk-sync.ts) │
 * │ lead_sources     │ LIVE API SYNC  — derived from customers.source field     │
 * │ jobs             │ MANUAL IMPORT  — GorillaDesk does not expose /jobs in    │
 * │                  │ its public API. Export from GorillaDesk → Reports →      │
 * │                  │ Jobs, then POST to /api/analytics/gorilladesk/csv or     │
 * │                  │ /api/analytics/gorilladesk/import (JSON).                │
 * │ payments         │ MANUAL IMPORT  — GorillaDesk does not expose /payments,  │
 * │                  │ /invoices, or /transactions in its public API. Export     │
 * │                  │ from GorillaDesk → Reports → Payments.                   │
 * └──────────────────┴──────────────────────────────────────────────────────────┘
 *
 * CSV column name mapping handles common GorillaDesk export variations
 * (case-insensitive, leading/trailing whitespace stripped).
 */

import { db } from "@workspace/db";
import {
  gorilladeskJobsTable,
  gorilladeskPaymentsTable,
} from "@workspace/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { classifyProviderIds } from "./gorilladesk-tenant-id-integrity.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type ValidationError = {
  row: number;
  field: string;
  message: string;
};

export type ImportSummary = {
  rows_processed: number;
  rows_inserted: number;
  rows_updated: number;
  rows_skipped: number;
  validation_errors: ValidationError[];
};

export type CsvImportResult = {
  ok: boolean;
  jobs?: ImportSummary;
  payments?: ImportSummary;
};

// ─────────────────────────────────────────────────────────────────────────────
// Lightweight CSV parser
// Handles quoted fields, embedded commas, and CRLF/LF line endings.
// Does NOT support multi-line quoted values (GorillaDesk exports don't use them).
// ─────────────────────────────────────────────────────────────────────────────

export function parseCSV(content: string): Record<string, string>[] {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  // Find first non-empty line as header
  const headerLineIdx = lines.findIndex(l => l.trim().length > 0);
  if (headerLineIdx < 0) return [];

  const headers = splitCSVLine(lines[headerLineIdx]).map(h => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = headerLineIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = splitCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? "").trim();
    });
    rows.push(row);
  }

  return rows;
}

function splitCSVLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

// ─────────────────────────────────────────────────────────────────────────────
// Column name resolver — tries multiple aliases (case-insensitive)
// ─────────────────────────────────────────────────────────────────────────────

function col(row: Record<string, string>, ...aliases: string[]): string {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), v])
  );
  for (const alias of aliases) {
    const val = normalized[alias.toLowerCase()];
    if (val !== undefined) return val.trim();
  }
  return "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Value parsers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a currency string into integer cents.
 * Handles: "$102.70", "102.70", "1,234.56", "10270" (already cents if no dot).
 */
export function parseAmountCents(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  // If the value has no decimal and looks like it might already be cents
  // (very large integer), keep as-is; otherwise treat as dollars.
  if (!cleaned.includes(".") && num > 10000) return num;
  return Math.round(num * 100);
}

/**
 * Parse a date string into a Date object.
 * Handles ISO 8601, MM/DD/YYYY, M/D/YYYY, YYYY-MM-DD, and "Month D, YYYY".
 */
export function parseDate(raw: string): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === "n/a") return null;

  // Try ISO first
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) return d;

  // MM/DD/YYYY or M/D/YYYY
  const mdyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(date.getTime())) return date;
  }

  return null;
}

/**
 * Normalize a payment method string to the accepted enum values.
 */
export function normalizeMethod(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (lower.includes("square"))  return "square";
  if (lower.includes("check"))   return "check";
  if (lower.includes("cash"))    return "cash";
  if (lower.includes("credit"))  return "credit";
  if (lower.includes("zelle"))   return "zelle";
  if (lower.includes("venmo"))   return "venmo";
  if (lower.includes("ach"))     return "ach";
  if (lower.includes("card"))    return "credit";
  if (lower.includes("debit"))   return "credit";
  if (lower.includes("stripe"))  return "square";
  return lower || "other";
}

/**
 * Normalize a job status string.
 */
export function normalizeJobStatus(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (lower.includes("complet"))  return "completed";
  if (lower.includes("cancel"))   return "cancelled";
  if (lower.includes("pending"))  return "pending";
  if (lower.includes("schedule")) return "scheduled";
  if (lower.includes("in prog"))  return "in_progress";
  return lower || "scheduled";
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalized record types (from CSV or JSON body)
// ─────────────────────────────────────────────────────────────────────────────

export type NormalizedJob = {
  externalId:   string | null;
  customerId:   string | null;
  status:       string;
  serviceType:  string | null;
  amountCents:  number;
  completedAt:  Date | null;
  scheduledFor: Date | null;
};

export type NormalizedPayment = {
  externalId:  string | null;
  jobId:       string | null;
  amountCents: number;
  method:      string;
  status:      string;
  paidAt:      Date | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// CSV row → normalized record converters
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert one CSV row from a GorillaDesk Jobs export into a NormalizedJob.
 * Returns null + error if the row is too malformed to be useful.
 *
 * Known GorillaDesk column names (Jobs export):
 *   ID / Job ID / Job # / #
 *   Customer / Customer Name / Client / Client Name
 *   Customer ID / Client ID
 *   Service Type / Type / Service / Pest
 *   Status / Job Status
 *   Amount / Total / Job Total / Price / Subtotal
 *   Scheduled Date / Scheduled For / Service Date / Date
 *   Completed Date / Completed At / Completion Date
 */
export function csvRowToJob(
  row: Record<string, string>,
  rowIndex: number
): { job: NormalizedJob | null; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  const externalIdRaw = col(row, "id", "job id", "job_id", "job #", "#", "job number");
  const statusRaw     = col(row, "status", "job status");
  const serviceType   = col(row, "service type", "service_type", "type", "service", "pest", "pest type") || null;
  const amountRaw     = col(row, "amount", "total", "job total", "price", "subtotal", "balance");
  const completedRaw  = col(row, "completed date", "completed at", "completed_at", "completion date", "date completed");
  const scheduledRaw  = col(row, "scheduled date", "scheduled for", "scheduled_for", "service date", "date", "appt date", "appointment date");
  const customerIdRaw = col(row, "customer id", "customer_id", "client id", "client_id");

  const amountCents = parseAmountCents(amountRaw);
  if (amountCents === null) {
    errors.push({ row: rowIndex, field: "amount", message: `Cannot parse amount: "${amountRaw}"` });
  }

  const job: NormalizedJob = {
    externalId:   externalIdRaw || null,
    customerId:   customerIdRaw || null,
    status:       normalizeJobStatus(statusRaw),
    serviceType:  serviceType,
    amountCents:  amountCents ?? 0,
    completedAt:  parseDate(completedRaw),
    scheduledFor: parseDate(scheduledRaw),
  };

  return { job: errors.length === 0 ? job : null, errors };
}

/**
 * Convert one CSV row from a GorillaDesk Payments export into a NormalizedPayment.
 *
 * Known GorillaDesk column names (Payments export):
 *   ID / Payment ID / Payment # / #
 *   Job ID / Job # / Job
 *   Amount / Payment Amount / Total
 *   Method / Payment Method / Type / Payment Type
 *   Status / Payment Status
 *   Date / Paid At / Paid Date / Payment Date
 */
export function csvRowToPayment(
  row: Record<string, string>,
  rowIndex: number
): { payment: NormalizedPayment | null; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  const externalIdRaw = col(row, "id", "payment id", "payment_id", "payment #", "#");
  const jobIdRaw      = col(row, "job id", "job_id", "job #", "job");
  const amountRaw     = col(row, "amount", "payment amount", "total", "balance");
  const methodRaw     = col(row, "method", "payment method", "type", "payment type");
  const statusRaw     = col(row, "status", "payment status");
  const paidAtRaw     = col(row, "date", "paid at", "paid_at", "paid date", "payment date");

  const amountCents = parseAmountCents(amountRaw);
  if (amountCents === null) {
    errors.push({ row: rowIndex, field: "amount", message: `Cannot parse amount: "${amountRaw}"` });
  }

  if (!methodRaw) {
    errors.push({ row: rowIndex, field: "method", message: "Payment method is required" });
  }

  const payment: NormalizedPayment = {
    externalId:  externalIdRaw || null,
    jobId:       jobIdRaw || null,
    amountCents: amountCents ?? 0,
    method:      normalizeMethod(methodRaw),
    status:      statusRaw ? (statusRaw.toLowerCase().includes("collect") ? "collected" : statusRaw.toLowerCase()) : "unknown",
    paidAt:      parseDate(paidAtRaw),
  };

  return { payment: errors.length === 0 ? payment : null, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Upsert functions — return ImportSummary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upsert a batch of normalized jobs into the DB.
 *
 * Strategy:
 *   - Rows WITH externalId  → upsert on external_id (insert or update)
 *   - Rows WITHOUT externalId → insert only (no conflict key available)
 *
 * Returns a full ImportSummary with inserted/updated/skipped counts.
 */
export async function upsertJobs(
  jobs: NormalizedJob[],
  projectId: string
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    rows_processed: jobs.length,
    rows_inserted: 0,
    rows_updated: 0,
    rows_skipped: 0,
    validation_errors: [],
  };

  if (jobs.length === 0) return summary;

  const withId    = jobs.filter(j => j.externalId !== null);
  const withoutId = jobs.filter(j => j.externalId === null);

  // Pre-fetch existing external_ids to distinguish insert vs update
  let safeWithId = withId;
  const existingIds = new Set<string>();
  if (withId.length > 0) {
    const existingRows = await db
      .select({ externalId: gorilladeskJobsTable.externalId, projectId: gorilladeskJobsTable.projectId })
      .from(gorilladeskJobsTable)
      .where(
        inArray(
          gorilladeskJobsTable.externalId,
          withId.map(j => j.externalId as string)
        )
      );
    const ownership = classifyProviderIds(withId.map(j => j.externalId as string), existingRows, projectId);
    for (const id of ownership.owned) existingIds.add(id);
    safeWithId = withId.filter(job => !ownership.foreign.has(job.externalId as string));
    if (ownership.foreign.size > 0) {
      summary.rows_skipped += ownership.foreign.size;
      summary.validation_errors.push({ row: 0, field: "externalId", message: "Provider job ID belongs to another tenant" });
    }
  }

  // Upsert rows that have an externalId
  if (safeWithId.length > 0) {
    await db
      .insert(gorilladeskJobsTable)
      .values(
        safeWithId.map(j => ({
          projectId,
          externalId:   j.externalId,
          customerId:   j.customerId,
          status:       j.status,
          serviceType:  j.serviceType,
          amountCents:  j.amountCents,
          completedAt:  j.completedAt,
          scheduledFor: j.scheduledFor,
        }))
      )
      .onConflictDoUpdate({
        target: gorilladeskJobsTable.externalId,
        setWhere: eq(gorilladeskJobsTable.projectId, projectId),
        set: {
          status:       sql`excluded.status`,
          serviceType:  sql`excluded.service_type`,
          amountCents:  sql`excluded.amount_cents`,
          completedAt:  sql`excluded.completed_at`,
          scheduledFor: sql`excluded.scheduled_for`,
          customerId:   sql`excluded.customer_id`,
        },
      });

    for (const j of safeWithId) {
      if (existingIds.has(j.externalId as string)) {
        summary.rows_updated++;
      } else {
        summary.rows_inserted++;
      }
    }
  }

  // Insert rows that have no externalId (can't conflict; always insert)
  if (withoutId.length > 0) {
    await db.insert(gorilladeskJobsTable).values(
      withoutId.map(j => ({
        projectId,
        externalId:   null,
        customerId:   j.customerId,
        status:       j.status,
        serviceType:  j.serviceType,
        amountCents:  j.amountCents,
        completedAt:  j.completedAt,
        scheduledFor: j.scheduledFor,
      }))
    );
    summary.rows_inserted += withoutId.length;
  }

  return summary;
}

/**
 * Upsert a batch of normalized payments into the DB.
 * Same insert-vs-update tracking strategy as upsertJobs.
 */
export async function upsertPayments(
  payments: NormalizedPayment[],
  projectId: string
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    rows_processed: payments.length,
    rows_inserted: 0,
    rows_updated: 0,
    rows_skipped: 0,
    validation_errors: [],
  };

  if (payments.length === 0) return summary;

  const withId    = payments.filter(p => p.externalId !== null);
  const withoutId = payments.filter(p => p.externalId === null);

  let safeWithId = withId;
  const existingIds = new Set<string>();
  if (withId.length > 0) {
    const existingRows = await db
      .select({ externalId: gorilladeskPaymentsTable.externalId, projectId: gorilladeskPaymentsTable.projectId })
      .from(gorilladeskPaymentsTable)
      .where(
        inArray(
          gorilladeskPaymentsTable.externalId,
          withId.map(p => p.externalId as string)
        )
      );
    const ownership = classifyProviderIds(withId.map(p => p.externalId as string), existingRows, projectId);
    for (const id of ownership.owned) existingIds.add(id);
    safeWithId = withId.filter(payment => !ownership.foreign.has(payment.externalId as string));
    if (ownership.foreign.size > 0) {
      summary.rows_skipped += ownership.foreign.size;
      summary.validation_errors.push({ row: 0, field: "externalId", message: "Provider payment ID belongs to another tenant" });
    }
  }

  if (safeWithId.length > 0) {
    await db
      .insert(gorilladeskPaymentsTable)
      .values(
        safeWithId.map(p => ({
          projectId,
          externalId:  p.externalId,
          jobId:       p.jobId,
          amountCents: p.amountCents,
          method:      p.method,
          status:      p.status,
          paidAt:      p.paidAt,
        }))
      )
      .onConflictDoUpdate({
        target: gorilladeskPaymentsTable.externalId,
        setWhere: eq(gorilladeskPaymentsTable.projectId, projectId),
        set: {
          jobId:       sql`excluded.job_id`,
          amountCents: sql`excluded.amount_cents`,
          method:      sql`excluded.method`,
          status:      sql`excluded.status`,
          paidAt:      sql`excluded.paid_at`,
        },
      });

    for (const p of safeWithId) {
      if (existingIds.has(p.externalId as string)) {
        summary.rows_updated++;
      } else {
        summary.rows_inserted++;
      }
    }
  }

  if (withoutId.length > 0) {
    await db.insert(gorilladeskPaymentsTable).values(
      withoutId.map(p => ({
        projectId,
        externalId:  null,
        jobId:       p.jobId,
        amountCents: p.amountCents,
        method:      p.method,
        status:      p.status,
        paidAt:      p.paidAt,
      }))
    );
    summary.rows_inserted += withoutId.length;
  }

  return summary;
}

// ─────────────────────────────────────────────────────────────────────────────
// High-level CSV import entrypoints
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a jobs CSV string and upsert into the DB.
 */
export async function importJobsFromCSV(
  csvContent: string,
  projectId: string
): Promise<ImportSummary> {
  const rows = parseCSV(csvContent);
  const jobs: NormalizedJob[] = [];
  const allErrors: ValidationError[] = [];
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const { job, errors } = csvRowToJob(rows[i], i + 1);
    if (errors.length > 0) {
      allErrors.push(...errors);
      skipped++;
    } else if (job) {
      jobs.push(job);
    }
  }

  const summary = await upsertJobs(jobs, projectId);
  summary.rows_skipped   += skipped;
  summary.rows_processed  = rows.length;
  summary.validation_errors.push(...allErrors);
  return summary;
}

/**
 * Parse a payments CSV string and upsert into the DB.
 */
export async function importPaymentsFromCSV(
  csvContent: string,
  projectId: string
): Promise<ImportSummary> {
  const rows = parseCSV(csvContent);
  const payments: NormalizedPayment[] = [];
  const allErrors: ValidationError[] = [];
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const { payment, errors } = csvRowToPayment(rows[i], i + 1);
    if (errors.length > 0) {
      allErrors.push(...errors);
      skipped++;
    } else if (payment) {
      payments.push(payment);
    }
  }

  const summary = await upsertPayments(payments, projectId);
  summary.rows_skipped   += skipped;
  summary.rows_processed  = rows.length;
  summary.validation_errors.push(...allErrors);
  return summary;
}

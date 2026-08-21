/**
 * GorillaDesk Live Sync
 *
 * Fetches live data from the GorillaDesk REST API and upserts into local DB tables.
 *
 * ┌─────────────────┬───────────────────────────────────────────────────────┐
 * │ Data source     │ Sync method                                           │
 * ├─────────────────┼───────────────────────────────────────────────────────┤
 * │ customers       │ LIVE API SYNC — GET /v1/customers (paginated)         │
 * │                 │ Upserts into gorilladesk_customers by external_id.    │
 * │                 │ Also derives lead_sources from customer.source field. │
 * ├─────────────────┼───────────────────────────────────────────────────────┤
 * │ lead_sources    │ LIVE API SYNC — derived from /v1/customers            │
 * │                 │ Grouped by customer.source.name, no separate endpoint.│
 * ├─────────────────┼───────────────────────────────────────────────────────┤
 * │ jobs            │ MANUAL / CSV IMPORT ONLY                              │
 * │                 │ GorillaDesk public API does not expose /jobs.         │
 * │                 │ Import via POST /api/analytics/gorilladesk/seed       │
 * ├─────────────────┼───────────────────────────────────────────────────────┤
 * │ payments        │ MANUAL / CSV IMPORT ONLY                              │
 * │                 │ GorillaDesk public API does not expose /payments,     │
 * │                 │ /invoices, or /transactions.                          │
 * │                 │ Import via POST /api/analytics/gorilladesk/seed       │
 * └─────────────────┴───────────────────────────────────────────────────────┘
 *
 * Verified live: 2026-07-01 — 445 customers, 8 lead sources synced.
 * Auth: Authorization: Bearer <GORILLADESK_API_KEY>
 */

import { db } from "@workspace/db";
import {
  gorilladeskJobsTable,
  gorilladeskCustomersTable,
  gorilladeskPaymentsTable,
  gorilladeskLeadSourcesTable,
  gorilladeskMetricSnapshotsTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Shared API primitives
// ─────────────────────────────────────────────────────────────────────────────

const GD_BASE = "https://api.gorilladesk.com/v1";

function getApiKey(): string {
  const key = process.env.GORILLADESK_API_KEY;
  if (!key) throw new Error("GORILLADESK_API_KEY environment variable is not set");
  return key;
}

function gdHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function gdGet(path: string, params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${GD_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const resp = await fetch(url.toString(), { headers: gdHeaders() });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "(no body)");
    throw new GdApiError(resp.status, path, body);
  }
  return resp.json();
}

class GdApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly gdPath: string,
    public readonly body: string,
  ) {
    super(`GorillaDesk API ${statusCode} at ${gdPath}: ${body}`);
    this.name = "GdApiError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GorillaDesk types (from /v1/specs)
// ─────────────────────────────────────────────────────────────────────────────

type GdCustomer = {
  id: string;
  account_number: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phones: Array<{ id: string; phone: string; type: string }>;
  company: string;
  source: { id: string; name: string } | null;
  tags: string[];
  state: "active" | "deleted";
  status: "active" | "inactive" | "lead";
  created: string;  // ISO 8601
  updated: string;  // ISO 8601
};

// ─────────────────────────────────────────────────────────────────────────────
// Result types
// ─────────────────────────────────────────────────────────────────────────────

export type SyncFunctionResult = {
  ok: boolean;
  endpoint: string;
  records_synced: number;
  error?: string;
  endpoint_not_available?: boolean;
};

export type SyncAllResult = {
  ok: boolean;
  synced_at: string;
  period: string;
  results: {
    jobs:        SyncFunctionResult;
    customers:   SyncFunctionResult;
    payments:    SyncFunctionResult;
    lead_sources: SyncFunctionResult;
  };
  total_records_synced: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Fetches all pages of customers from GorillaDesk using created[gt] cursor pagination.
 * Deduplicates by ID in case of boundary overlaps.
 */
async function fetchAllGdCustomers(maxPages = 50): Promise<GdCustomer[]> {
  const all: GdCustomer[] = [];
  const seen = new Set<string>();
  let createdAfter: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const params: Record<string, string> = { limit: "100" };
    if (createdAfter) params["created[gt]"] = createdAfter;

    const data = (await gdGet("/customers", params)) as {
      data: GdCustomer[];
      has_more: boolean;
    };

    for (const c of data.data) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        all.push(c);
      }
    }

    if (!data.has_more || data.data.length === 0) break;
    createdAfter = data.data[data.data.length - 1].created;
  }

  return all;
}

// ─────────────────────────────────────────────────────────────────────────────
// syncGorillaDeskJobs
//
// GorillaDesk does NOT expose a /jobs endpoint in their public API.
// Returns ok:false with a clear endpoint_not_available error.
// ─────────────────────────────────────────────────────────────────────────────

export async function syncGorillaDeskJobs(
  _projectId = "bed-bugs-and-beyond",
): Promise<SyncFunctionResult> {
  const endpoint = `${GD_BASE}/jobs`;

  // Attempt the real call so the error is live, not assumed
  try {
    await gdGet("/jobs");
    // If this ever succeeds in a future API version, we'd process it here
    return { ok: false, endpoint, records_synced: 0, error: "Unexpected success — /jobs parsing not yet implemented" };
  } catch (err) {
    if (err instanceof GdApiError && err.statusCode === 404) {
      return {
        ok: false,
        endpoint,
        records_synced: 0,
        endpoint_not_available: true,
        error: `GorillaDesk does not expose a public /jobs endpoint (HTTP 404). ` +
               `Job data must be imported manually via POST /api/analytics/gorilladesk/seed.`,
      };
    }
    return {
      ok: false,
      endpoint,
      records_synced: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// syncGorillaDeskCustomers
//
// Fetches all customers from GET /v1/customers (paginated).
// Upserts into gorilladesk_customers table by external_id.
// ─────────────────────────────────────────────────────────────────────────────

export async function syncGorillaDeskCustomers(
  projectId = "bed-bugs-and-beyond",
): Promise<SyncFunctionResult> {
  const endpoint = `${GD_BASE}/customers`;

  try {
    const customers = await fetchAllGdCustomers();
    const period = currentPeriod();
    let upserted = 0;

    for (const c of customers) {
      const name  = `${c.first_name} ${c.last_name}`.trim();
      const phone = c.phones?.[0]?.phone ?? null;

      const existing = await db
        .select({ id: gorilladeskCustomersTable.id })
        .from(gorilladeskCustomersTable)
        .where(and(
          eq(gorilladeskCustomersTable.externalId, c.id),
          eq(gorilladeskCustomersTable.projectId, projectId),
        ))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(gorilladeskCustomersTable)
          .set({ name, email: c.email, phone, leadSource: c.source?.name ?? null })
          .where(and(
            eq(gorilladeskCustomersTable.externalId, c.id),
            eq(gorilladeskCustomersTable.projectId, projectId),
          ));
        upserted++;
      } else {
        const inserted = await db.insert(gorilladeskCustomersTable).values({
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
        }).onConflictDoNothing().returning({ id: gorilladeskCustomersTable.id });
        upserted += inserted.length;
      }
    }

    // Write api_sync customers snapshot
    const [year, month] = period.split("-").map(Number);
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd   = new Date(year, month, 1);

    const active       = customers.filter(c => c.state === "active");
    const newThisMonth = active.filter(c => {
      const d = new Date(c.created);
      return d >= monthStart && d < monthEnd;
    });

    await db.delete(gorilladeskMetricSnapshotsTable).where(and(
      eq(gorilladeskMetricSnapshotsTable.projectId, projectId),
      eq(gorilladeskMetricSnapshotsTable.period, period),
      eq(gorilladeskMetricSnapshotsTable.metricType, "customers"),
      eq(gorilladeskMetricSnapshotsTable.source, "api_sync"),
    ));

    await db.insert(gorilladeskMetricSnapshotsTable).values({
      projectId,
      period,
      metricType: "customers",
      source:     "api_sync",
      importedAt: new Date(),
      data: JSON.stringify({
        new_customers:       newThisMonth.length,
        returning_customers: null,
        active_services:     active.length,
        recurring_services:  0,
        total_customers:     customers.length,
      }),
    });

    return { ok: true, endpoint, records_synced: upserted };
  } catch (err) {
    return {
      ok: false,
      endpoint,
      records_synced: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// syncGorillaDeskPayments
//
// GorillaDesk does NOT expose a /payments or /invoices endpoint in their
// public API. Returns ok:false with a clear endpoint_not_available error.
// ─────────────────────────────────────────────────────────────────────────────

export async function syncGorillaDeskPayments(
  _projectId = "bed-bugs-and-beyond",
): Promise<SyncFunctionResult> {
  const endpoint = `${GD_BASE}/payments`;

  // Attempt real calls for both plausible paths
  const paths = ["/payments", "/invoices", "/transactions"] as const;

  for (const path of paths) {
    try {
      await gdGet(path);
      return { ok: false, endpoint: `${GD_BASE}${path}`, records_synced: 0,
        error: `Unexpected success at ${path} — parsing not yet implemented` };
    } catch (err) {
      if (!(err instanceof GdApiError && err.statusCode === 404)) {
        return {
          ok: false,
          endpoint: `${GD_BASE}${path}`,
          records_synced: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
  }

  return {
    ok: false,
    endpoint,
    records_synced: 0,
    endpoint_not_available: true,
    error: `GorillaDesk does not expose public /payments, /invoices, or /transactions endpoints (all return HTTP 404). ` +
           `Payment data must be imported manually via POST /api/analytics/gorilladesk/seed.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// syncGorillaDeskLeadSources
//
// Derives lead source breakdown from customers fetched via GET /v1/customers.
// Groups by customer.source.name, upserts into gorilladesk_lead_sources and
// writes a marketing api_sync snapshot.
// ─────────────────────────────────────────────────────────────────────────────

export async function syncGorillaDeskLeadSources(
  projectId = "bed-bugs-and-beyond",
): Promise<SyncFunctionResult> {
  const endpoint = `${GD_BASE}/customers (derived lead sources)`;

  try {
    const customers = await fetchAllGdCustomers();
    const period    = currentPeriod();

    // Build lead source map from active customers
    const sourceMap = new Map<string, number>();
    for (const c of customers.filter(x => x.state === "active")) {
      const name = c.source?.name ?? "Direct / Unknown";
      sourceMap.set(name, (sourceMap.get(name) ?? 0) + 1);
    }

    const leadSources = Array.from(sourceMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, customer_count: count }));

    // Upsert into gorilladesk_lead_sources table (delete period rows, re-insert)
    await db.delete(gorilladeskLeadSourcesTable).where(and(
      eq(gorilladeskLeadSourcesTable.projectId, projectId),
      eq(gorilladeskLeadSourcesTable.period, period),
    ));

    if (leadSources.length > 0) {
      await db.insert(gorilladeskLeadSourcesTable).values(
        leadSources.map(s => ({
          projectId,
          period,
          name:         s.name,
          jobCount:     s.customer_count,
          revenueCents: 0,           // revenue not available from customer API
        }))
      );
    }

    // Write api_sync marketing snapshot
    await db.delete(gorilladeskMetricSnapshotsTable).where(and(
      eq(gorilladeskMetricSnapshotsTable.projectId, projectId),
      eq(gorilladeskMetricSnapshotsTable.period, period),
      eq(gorilladeskMetricSnapshotsTable.metricType, "marketing"),
      eq(gorilladeskMetricSnapshotsTable.source, "api_sync"),
    ));

    await db.insert(gorilladeskMetricSnapshotsTable).values({
      projectId,
      period,
      metricType: "marketing",
      source:     "api_sync",
      importedAt: new Date(),
      data: JSON.stringify({
        lead_sources: leadSources.map(s => ({
          name:           s.name,
          customer_count: s.customer_count,
          job_count:      s.customer_count,
          revenue_cents:  0,
        })),
      }),
    });

    return { ok: true, endpoint, records_synced: leadSources.length };
  } catch (err) {
    return {
      ok: false,
      endpoint,
      records_synced: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// syncAllGorillaDeskData
//
// Runs all four sync functions and returns a combined summary.
// Each function is independent — a failure in one does not abort others.
// ─────────────────────────────────────────────────────────────────────────────

export async function syncAllGorillaDeskData(
  projectId = "bed-bugs-and-beyond",
): Promise<SyncAllResult> {
  const [jobs, customers, payments, lead_sources] = await Promise.all([
    syncGorillaDeskJobs(projectId),
    syncGorillaDeskCustomers(projectId),
    syncGorillaDeskPayments(projectId),
    syncGorillaDeskLeadSources(projectId),
  ]);

  const total_records_synced =
    jobs.records_synced +
    customers.records_synced +
    payments.records_synced +
    lead_sources.records_synced;

  const allOk = [jobs, customers, payments, lead_sources].every(
    r => r.ok || r.endpoint_not_available,
  );

  return {
    ok:                  allOk,
    synced_at:           new Date().toISOString(),
    period:              currentPeriod(),
    results:             { jobs, customers, payments, lead_sources },
    total_records_synced,
  };
}

/**
 * GorillaDesk API Client
 * Base URL: https://api.gorilladesk.com/v1
 * Auth: Bearer token from GORILLADESK_API_KEY env var
 */

const BASE = "https://api.gorilladesk.com/v1";

function getApiKey(): string {
  const key = process.env.GORILLADESK_API_KEY;
  if (!key) throw new Error("GORILLADESK_API_KEY is not set");
  return key;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function gdFetch(path: string, params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const resp = await fetch(url.toString(), { headers: headers() });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`GorillaDesk API error ${resp.status} at ${path}: ${body}`);
  }
  return resp.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type GdCustomer = {
  id: string;
  account_number: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phones: Array<{ phone: string; type: string }>;
  company: string;
  source: { id: string; name: string } | null;
  tags: string[];
  state: "active" | "deleted";
  status: "active" | "inactive" | "lead";
  created: string;
  updated: string;
};

export type GdCompany = {
  name: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  timezone: string;
  office_hours: { start: string; end: string };
};

export type GdUser = {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  role: "super_admin" | "admin" | "technician";
  email: string;
  avatar_url: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Paginated customer fetch
// Uses created[gt] cursor pagination — fetches up to maxPages pages of 100
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchAllCustomers(maxPages = 50): Promise<GdCustomer[]> {
  const all: GdCustomer[] = [];
  const seen = new Set<string>();
  let createdAfter: string | null = null;
  let page = 0;

  while (page < maxPages) {
    const params: Record<string, string> = { limit: "100" };
    if (createdAfter) params["created[gt]"] = createdAfter;

    const data = (await gdFetch("/customers", params)) as { data: GdCustomer[]; has_more: boolean };

    for (const c of data.data) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        all.push(c);
      }
    }

    if (!data.has_more || data.data.length === 0) break;

    // Advance cursor to the created timestamp of the last record
    createdAfter = data.data[data.data.length - 1].created;
    page++;
  }

  return all;
}

export async function fetchCompany(): Promise<GdCompany> {
  const data = (await gdFetch("/company")) as { data: GdCompany };
  return data.data;
}

export async function fetchUsers(): Promise<GdUser[]> {
  const data = (await gdFetch("/users")) as { data: GdUser[] };
  return data.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived metrics from customer list
// ─────────────────────────────────────────────────────────────────────────────

export function computeCustomerMetrics(customers: GdCustomer[], period: string) {
  const [year, month] = period.split("-").map(Number);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd   = new Date(year, month, 1);

  const active    = customers.filter(c => c.state === "active");
  const newThisMonth = active.filter(c => {
    const d = new Date(c.created);
    return d >= monthStart && d < monthEnd;
  });

  // Lead source breakdown (from all non-deleted customers)
  const sourceMap = new Map<string, number>();
  for (const c of active) {
    const name = c.source?.name ?? "Direct / Unknown";
    sourceMap.set(name, (sourceMap.get(name) ?? 0) + 1);
  }

  const leadSources = Array.from(sourceMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, customer_count: count }));

  return {
    total_customers:   customers.length,
    active_customers:  active.length,
    new_this_month:    newThisMonth.length,
    lead_sources:      leadSources,
  };
}

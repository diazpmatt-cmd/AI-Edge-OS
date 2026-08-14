import type { DataForSEOBacklinkConfig } from "./backlink-provider-config";
import { buildBacklinkAuthHeader } from "./backlink-provider-config";
import type {
  BacklinkInventoryProvider,
  BacklinkInventoryProviderInput,
  BacklinkInventoryProviderResult,
} from "./backlink-inventory-provider";
import type { BacklinkInventoryObservation } from "./observed-backlink-lifecycle";

type FetchFn = typeof globalThis.fetch;

const DATAFORSEO_BACKLINKS_INVENTORY_PROVIDER = "dataforseo_backlinks";
const DATAFORSEO_BACKLINKS_INVENTORY_REVISION = "dataforseo-backlinks-inventory-v1";
export const DATAFORSEO_BACKLINKS_INVENTORY_MAX_ROWS = 1000;

interface DFSBacklinkItem {
  domain_from?: unknown;
  url_from?: unknown;
  url_to?: unknown;
}

interface DFSBacklinksResult {
  target?: unknown;
  total_count?: unknown;
  items_count?: unknown;
  items?: unknown;
}

interface DFSTask<T> {
  status_code?: unknown;
  status_message?: unknown;
  result?: T[] | null;
}

interface DFSEnvelope<T> {
  status_code?: unknown;
  status_message?: unknown;
  tasks?: DFSTask<T>[];
}

function normalizeDomain(value: string): string {
  const raw = value.trim().toLowerCase();
  if (!raw) throw new Error("client_domain_required");
  let domain = raw;
  if (raw.includes("://")) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error("client_domain_invalid");
    }
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new Error("client_domain_must_not_include_path");
    }
    domain = parsed.hostname;
  }
  domain = domain.replace(/^www\./, "").replace(/\.$/, "");
  if (!domain || domain.includes("/") || /\s/.test(domain)) throw new Error("client_domain_invalid");
  return domain;
}

function failure(reason: string, requestCount: number): BacklinkInventoryProviderResult {
  return Object.freeze({
    status: "failed" as const,
    providerId: DATAFORSEO_BACKLINKS_INVENTORY_PROVIDER,
    providerRevision: DATAFORSEO_BACKLINKS_INVENTORY_REVISION,
    completeness: "incomplete" as const,
    links: Object.freeze([]) as readonly [],
    requestCount,
    providerTotalCount: null,
    providerItemsCount: null,
    reason,
  });
}

function nonNegativeInteger(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function mapItem(item: unknown): BacklinkInventoryObservation | null {
  if (!item || typeof item !== "object") return null;
  const candidate = item as DFSBacklinkItem;
  if (
    typeof candidate.domain_from !== "string" || !candidate.domain_from.trim() ||
    typeof candidate.url_from !== "string" || !candidate.url_from.trim() ||
    typeof candidate.url_to !== "string" || !candidate.url_to.trim()
  ) {
    return null;
  }
  return Object.freeze({
    sourceDomain: candidate.domain_from,
    sourceUrl: candidate.url_from,
    targetUrl: candidate.url_to,
  });
}

/**
 * V1 intentionally performs exactly one live request. It marks the result
 * complete only when DataForSEO proves that total_count === items_count and
 * every returned item can be mapped into the canonical lifecycle identity.
 * Any cap/partial/malformed result remains incomplete, so it can never advance
 * missing/lost state.
 */
export class DataForSEOBacklinkInventoryAdapter implements BacklinkInventoryProvider {
  readonly name = DATAFORSEO_BACKLINKS_INVENTORY_PROVIDER;
  readonly revision = DATAFORSEO_BACKLINKS_INVENTORY_REVISION;

  constructor(
    private readonly config: DataForSEOBacklinkConfig,
    private readonly fetchFn: FetchFn = globalThis.fetch,
  ) {}

  async scan(input: BacklinkInventoryProviderInput): Promise<BacklinkInventoryProviderResult> {
    if (!this.config.enabled) return failure("provider_disabled", 0);

    let clientDomain: string;
    try {
      clientDomain = normalizeDomain(input.clientDomain);
    } catch {
      return failure("client_domain_invalid", 0);
    }
    if (!input.clientId?.trim()) return failure("client_id_required", 0);
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > DATAFORSEO_BACKLINKS_INVENTORY_MAX_ROWS) {
      return failure("inventory_limit_invalid", 0);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.retry.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchFn(
        `${this.config.baseUrl}/v3/backlinks/backlinks/live`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": buildBacklinkAuthHeader(this.config.login, this.config.password),
          },
          body: JSON.stringify([{
            target: clientDomain,
            limit: input.limit,
            offset: 0,
            mode: "as_is",
            backlinks_status_type: "live",
            exclude_internal_backlinks: true,
            order_by: ["rank,desc"],
          }]),
          signal: controller.signal,
        },
      );
    } catch (error) {
      return failure((error as Error)?.name === "AbortError" ? "provider_timeout" : "provider_network_error", 1);
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) return failure("provider_auth_error", 1);
    if (response.status === 402) return failure("provider_quota_exceeded", 1);
    if (response.status === 429) return failure("provider_rate_limited", 1);
    if (!response.ok) return failure("provider_http_error", 1);

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return failure("provider_malformed_response", 1);
    }

    if (!body || typeof body !== "object") return failure("provider_malformed_response", 1);
    const envelope = body as DFSEnvelope<DFSBacklinksResult>;
    const task = Array.isArray(envelope.tasks) ? envelope.tasks[0] : undefined;
    if (!task || task.status_code !== 20000 || !Array.isArray(task.result) || task.result.length < 1) {
      return failure("provider_task_error", 1);
    }

    const result = task.result[0];
    if (!result || typeof result !== "object") return failure("provider_malformed_response", 1);
    const totalCount = nonNegativeInteger(result.total_count);
    const itemsCount = nonNegativeInteger(result.items_count);
    if (totalCount === null || itemsCount === null || totalCount < itemsCount) {
      return failure("provider_malformed_response", 1);
    }
    if (!Array.isArray(result.items)) return failure("provider_malformed_response", 1);

    const mapped = result.items.map(mapItem);
    const validLinks = mapped.filter((item): item is BacklinkInventoryObservation => item !== null);
    const allItemsMapped = validLinks.length === result.items.length && result.items.length === itemsCount;
    const providerReturnedEverything = totalCount === itemsCount;

    const completeness = providerReturnedEverything && allItemsMapped ? "complete" : "incomplete";
    const reason = completeness === "complete"
      ? null
      : !providerReturnedEverything
        ? "provider_result_capped"
        : "provider_items_incomplete";

    return Object.freeze({
      status: "succeeded" as const,
      providerId: DATAFORSEO_BACKLINKS_INVENTORY_PROVIDER,
      providerRevision: DATAFORSEO_BACKLINKS_INVENTORY_REVISION,
      completeness,
      links: Object.freeze(validLinks),
      requestCount: 1,
      providerTotalCount: totalCount,
      providerItemsCount: itemsCount,
      reason,
    });
  }
}

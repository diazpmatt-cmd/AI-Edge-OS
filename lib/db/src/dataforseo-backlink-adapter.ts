/**
 * C8R-8 — DataForSEO Backlinks API Adapter
 *
 * Implements BacklinkDataProvider using DataForSEO's Backlinks API suite.
 *
 * ── DataForSEO Backlinks endpoints used ───────────────────────────────────────
 *   POST /v3/backlinks/referring_domains/live
 *     Discovers domains that link to a competitor target.
 *     Mapped to: category="referring_domain", opportunityCategory="competitor_link_gap"
 *
 *   POST /v3/backlinks/domain_intersection/live
 *     Finds domains linking to ≥1 competitor but NOT to the client.
 *     Mapped to: category="link_intersection", opportunityCategory="competitor_link_gap"
 *
 * ── Capabilities declared ─────────────────────────────────────────────────────
 *   referring_domains, link_intersections, authority_metrics
 *
 * ── Disabled state (Path B — current) ────────────────────────────────────────
 *   When BACKLINK_DATAFORSEO_ENABLED != "true", discover() throws
 *   BacklinkProviderError("provider_disabled") before any HTTP call.
 *   The registry catches this and surfaces "disabled" in the health report.
 *
 * ── Security guarantees ───────────────────────────────────────────────────────
 *   - Credentials never appear in logs, error messages, or RawBacklinkEvidence.
 *   - _guardEnabled() short-circuits before any network access when disabled.
 *   - All HTTP errors are mapped to typed BacklinkProviderError before re-throw.
 *   - Domains with spam_score > SPAM_THRESHOLD are silently filtered.
 *
 * ── Testing ───────────────────────────────────────────────────────────────────
 *   Inject a mock fetchFn in the constructor to test HTTP mapping without real
 *   credentials.  See backlink-dataforseo-adapter.test.ts for the contract harness.
 */

import type { BacklinkCapability, RawBacklinkEvidence } from "./backlink-types";
import type { BacklinkDataProvider, BacklinkDiscoveryInput } from "./backlink-providers";
import type { DataForSEOBacklinkConfig } from "./backlink-provider-config";
import { BacklinkProviderError, buildBacklinkAuthHeader } from "./backlink-provider-config";

type FetchFn = typeof globalThis.fetch;

export interface DataForSEOBacklinkAdapterOptions {
  /** Proof-only fail-closed mode. Default false preserves normal best-effort discovery semantics. */
  readonly strictFailures?: boolean;
}

// ── Spam threshold ────────────────────────────────────────────────────────────

/** Domains with spam_score above this are excluded from results. */
const SPAM_THRESHOLD = 50;

/** Maximum competitor domains sent in a single referring_domains pass. */
const MAX_COMPETITOR_PASS = 3;

// ── Internal DataForSEO Backlinks API shapes (private) ────────────────────────

interface DFSTaskEnvelope<T> {
  status_code:    number;
  status_message: string;
  tasks:          DFSTask<T>[];
}

interface DFSTask<T> {
  status_code:    number;
  status_message: string;
  result:         T[] | null;
}

interface DFSReferringDomainItem {
  type:             string;
  domain:           string;
  rank:             number;   // 0–100 domain authority
  spam_score:       number;   // 0–100 (higher = more spammy)
  backlinks:        number;
  referring_pages:  number;
  referring_ips:    number;
  broken_backlinks: number;
  first_seen:       string | null;
}

interface DFSReferringDomainsResult {
  target:      string;
  total_count: number;
  items_count: number;
  items:       DFSReferringDomainItem[] | null;
}

interface DFSDomainIntersectionItem {
  type:          string;
  domain:        string;
  rank:          number;
  spam_score:    number;
  intersections: Array<{ target: string; backlinks: number }>;
}

interface DFSDomainIntersectionResult {
  total_count: number;
  items_count: number;
  items:       DFSDomainIntersectionItem[] | null;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function fetchWithTimeout(
  url:       string,
  options:   RequestInit,
  timeoutMs: number,
  fetchFn:   FetchFn,
): Promise<Response> {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...options, signal: controller.signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new BacklinkProviderError(
        "timeout",
        `DataForSEO backlink request timed out after ${timeoutMs}ms`,
      );
    }
    throw new BacklinkProviderError("provider_error", `Network error: ${String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function postBacklinksAPI<T>(
  url:      string,
  payload:  unknown,
  config:   DataForSEOBacklinkConfig,
  fetchFn:  FetchFn,
): Promise<DFSTaskEnvelope<T>> {
  const authHeader = buildBacklinkAuthHeader(config.login, config.password);
  const options: RequestInit = {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": authHeader,
    },
    body: JSON.stringify(payload),
  };

  let lastError: BacklinkProviderError | null = null;

  for (let attempt = 0; attempt < config.retry.maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, config.retry.delayMs * attempt),
      );
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(url, options, config.retry.timeoutMs, fetchFn);
    } catch (err) {
      if (err instanceof BacklinkProviderError && err.kind === "timeout") throw err;
      lastError = err instanceof BacklinkProviderError
        ? err
        : new BacklinkProviderError("provider_error", String(err));
      continue;
    }

    // Non-retryable HTTP errors — throw immediately
    if (response.status === 401 || response.status === 403) {
      throw new BacklinkProviderError(
        "auth_error",
        `DataForSEO backlink API returned HTTP ${response.status}. ` +
        "Verify DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD.",
        response.status,
      );
    }
    if (response.status === 402) {
      throw new BacklinkProviderError(
        "quota_exceeded",
        "DataForSEO account balance exhausted (HTTP 402).",
        response.status,
      );
    }
    if (response.status === 429) {
      throw new BacklinkProviderError(
        "rate_limited",
        "DataForSEO rate limit exceeded (HTTP 429).",
        response.status,
      );
    }

    // Retryable 5xx
    if (response.status >= 500) {
      lastError = new BacklinkProviderError(
        "provider_error",
        `DataForSEO backlink API returned HTTP ${response.status}.`,
        response.status,
      );
      continue;
    }

    // Parse JSON
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new BacklinkProviderError(
        "malformed_response",
        `DataForSEO response is not valid JSON (HTTP ${response.status}).`,
      );
    }

    if (
      !body ||
      typeof body !== "object" ||
      !Array.isArray((body as DFSTaskEnvelope<T>).tasks)
    ) {
      throw new BacklinkProviderError(
        "malformed_response",
        "DataForSEO response is missing the 'tasks' array.",
      );
    }

    return body as DFSTaskEnvelope<T>;
  }

  throw (
    lastError ??
    new BacklinkProviderError("provider_error", "Unknown error after exhausting retries.")
  );
}

// ── Evidence builders ─────────────────────────────────────────────────────────

const clamp100 = (v: number) => Math.min(100, Math.max(0, Math.round(v)));

function referringDomainItemToEvidence(
  item:         DFSReferringDomainItem,
  targetDomain: string,
  discoveredAt: Date,
): RawBacklinkEvidence {
  const backlinksPerPage = item.referring_pages > 0
    ? item.backlinks / item.referring_pages
    : item.backlinks;

  return {
    sourceDomain:              item.domain,
    sourceUrl:                 `https://${item.domain}/`,
    targetUrl:                 `https://${targetDomain}/`,
    competitorUrl:             `https://${targetDomain}/`,
    category:                  "referring_domain",
    opportunityCategory:       "competitor_link_gap",
    discoveredAt,
    authority:                 clamp100(item.rank),
    localRelevance:            40,
    serviceRelevance:          50,
    competitorFrequency:       clamp100(Math.min(10, backlinksPerPage) * 10),
    relationshipAccessibility: clamp100(100 - item.spam_score),
    editorialRequirements:     50,
    estimatedEffort:           50,
    metadata: {
      rank:            item.rank,
      spam_score:      item.spam_score,
      backlinks:       item.backlinks,
      referring_pages: item.referring_pages,
      target_domain:   targetDomain,
      data_source:     "dataforseo_referring_domains",
    },
  };
}

function intersectionItemToEvidence(
  item:         DFSDomainIntersectionItem,
  discoveredAt: Date,
): RawBacklinkEvidence {
  const firstCompetitor = item.intersections[0]?.target ?? null;
  return {
    sourceDomain:              item.domain,
    sourceUrl:                 `https://${item.domain}/`,
    targetUrl:                 null,
    competitorUrl:             firstCompetitor ? `https://${firstCompetitor}/` : null,
    category:                  "link_intersection",
    opportunityCategory:       "competitor_link_gap",
    discoveredAt,
    authority:                 clamp100(item.rank),
    localRelevance:            40,
    serviceRelevance:          50,
    competitorFrequency:       clamp100(Math.min(item.intersections.length, 5) * 20),
    relationshipAccessibility: clamp100(100 - item.spam_score),
    editorialRequirements:     50,
    estimatedEffort:           50,
    metadata: {
      rank:        item.rank,
      spam_score:  item.spam_score,
      competitors: item.intersections.map((i) => i.target).join(","),
      data_source: "dataforseo_domain_intersection",
    },
  };
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class DataForSEOBacklinkAdapter implements BacklinkDataProvider {
  readonly name = "dataforseo_backlinks";
  readonly capabilities: ReadonlySet<BacklinkCapability> = new Set<BacklinkCapability>([
    "referring_domains",
    "link_intersections",
    "authority_metrics",
  ]);

  constructor(
    private readonly config:   DataForSEOBacklinkConfig,
    private readonly fetchFn:  FetchFn = globalThis.fetch,
    private readonly options:  DataForSEOBacklinkAdapterOptions = {},
  ) {}

  async discover(input: BacklinkDiscoveryInput): Promise<RawBacklinkEvidence[]> {
    this._guardEnabled();
    if (!input.clientId?.trim())     throw new Error("clientId is required");
    if (!input.clientDomain?.trim()) throw new Error("clientDomain is required");
    if (!Number.isInteger(input.limit) || input.limit < 1) {
      throw new Error("limit must be a positive integer");
    }

    const discoveredAt = new Date();
    const results: RawBacklinkEvidence[] = [];
    const budget   = this.config.maxRequestsPerRun;
    let   used     = 0;

    // ── Pass 1: referring domains per competitor domain ───────────────────────
    const competitors = input.competitorDomains.slice(0, Math.min(MAX_COMPETITOR_PASS, budget));
    for (const target of competitors) {
      if (used >= budget) break;
      try {
        const url     = `${this.config.baseUrl}/v3/backlinks/referring_domains/live`;
        const payload = [{
          target,
          limit:       Math.min(200, input.limit * 4),
          order_by:    ["rank,desc"],
          mode:        "as_is",
        }];
        const envelope = await postBacklinksAPI<DFSReferringDomainsResult>(
          url, payload, this.config, this.fetchFn,
        );
        used++;
        const task = envelope.tasks[0];
        this._assertStrictTask(task, "referring_domains");
        if (!task || task.status_code !== 20000 || !task.result?.length) continue;
        const items = task.result[0]?.items ?? [];
        for (const item of items) {
          if (item.spam_score > SPAM_THRESHOLD) continue;
          results.push(referringDomainItemToEvidence(item, target, discoveredAt));
        }
      } catch (err) {
        if (this.options.strictFailures || isFatal(err)) throw err;
        console.warn(
          `[dataforseo_backlinks] referring_domains failed for "${target}":`,
          (err as Error).message ?? err,
        );
      }
    }

    // ── Pass 2: domain intersection (links to competitors but not client) ─────
    if (input.competitorDomains.length >= 2 && used < budget) {
      try {
        const url     = `${this.config.baseUrl}/v3/backlinks/domain_intersection/live`;
        const targets = input.competitorDomains
          .slice(0, 3)
          .map((d) => ({ url: d, type: "domain" }));
        const payload = [{
          targets,
          exclude_targets: [{ url: input.clientDomain, type: "domain" }],
          limit:           Math.min(200, input.limit * 2),
          order_by:        ["rank,desc"],
        }];
        const envelope = await postBacklinksAPI<DFSDomainIntersectionResult>(
          url, payload, this.config, this.fetchFn,
        );
        used++;
        const task = envelope.tasks[0];
        this._assertStrictTask(task, "domain_intersection");
        if (task?.status_code === 20000 && task.result?.length) {
          const items = task.result[0]?.items ?? [];
          for (const item of items) {
            if (item.spam_score > SPAM_THRESHOLD) continue;
            results.push(intersectionItemToEvidence(item, discoveredAt));
          }
        }
      } catch (err) {
        if (this.options.strictFailures || isFatal(err)) throw err;
        console.warn(
          "[dataforseo_backlinks] domain_intersection failed:",
          (err as Error).message ?? err,
        );
      }
    }

    // ── Deduplicate and cap ───────────────────────────────────────────────────
    const seen   = new Set<string>();
    const deduped = results.filter((ev) => {
      const key = `${ev.sourceDomain}|${ev.category}|${ev.targetUrl ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return deduped.slice(0, input.limit);
  }

  private _assertStrictTask(task: DFSTask<unknown> | undefined, operation: string): void {
    if (!this.options.strictFailures) return;
    if (!task) {
      throw new BacklinkProviderError("malformed_response", `DataForSEO ${operation} response is missing a task.`);
    }
    if (task.status_code !== 20000) {
      throw new BacklinkProviderError(
        "provider_error",
        `DataForSEO ${operation} task failed with status ${task.status_code}.`,
      );
    }
    if (task.result === null) {
      throw new BacklinkProviderError("malformed_response", `DataForSEO ${operation} task returned a null result.`);
    }
  }

  private _guardEnabled(): void {
    if (!this.config.enabled) {
      throw new BacklinkProviderError(
        "provider_disabled",
        "DataForSEO backlink provider is not enabled. " +
        "Set BACKLINK_DATAFORSEO_ENABLED=true to enable live backlink discovery.",
      );
    }
  }
}

// ── Helper ────────────────────────────────────────────────────────────────────

/** Fatal errors should always propagate; non-fatal errors per-competitor are swallowed unless strictFailures is enabled. */
function isFatal(err: unknown): boolean {
  if (!(err instanceof BacklinkProviderError)) return false;
  return (
    err.kind === "auth_error"     ||
    err.kind === "quota_exceeded" ||
    err.kind === "rate_limited"   ||
    err.kind === "timeout"
  );
}

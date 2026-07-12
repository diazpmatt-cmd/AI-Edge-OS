/**
 * Phase C4 — DataForSEO SearchDataProvider Adapter
 *
 * Implements the canonical SearchDataProvider interface using two DataForSEO APIs:
 *   1. Keywords Data (Google Ads) — keyword volume, competition, CPC
 *   2. SERP Organic — real search result positions, URLs, domains, PAA questions
 *
 * Key design properties:
 *   - NEVER fabricates missing data: null volume/difficulty stays null.
 *   - All provider-specific types are private to this file.
 *   - fetchFn is injectable for unit testing (no global fetch mock needed).
 *   - All errors are converted to typed DataForSEOError before re-throwing.
 *   - fetchCompetitorKeywords returns [] in Phase C4 (Stage 5 not yet active).
 *   - evidenceStrength = 90 for dataforseo signals (per EVIDENCE_STRENGTH table).
 *   - Competitor domain extraction filters directories, social, and aggregators.
 *   - PAA questions from SERP responses are preserved in providerRaw.paaQuestions.
 *   - No Math.random(). No hardcoded competitor lists. No GPT calls.
 *
 * Security:
 *   - Credentials are never logged.
 *   - buildBasicAuthHeader is the only place they are used.
 *   - No credential appears in any thrown error, signal, or providerRaw field.
 */

import type { SearchDataProvider, RawKeywordResult } from "./discovery-providers";
import type { ProviderSource } from "./discovery-types";
import type { DiscoveryContext } from "./discovery-context";
import type { DataForSEOConfig } from "./dataforseo-config";
import {
  DataForSEOError,
  buildBasicAuthHeader,
} from "./dataforseo-config";
import {
  buildDataForSEOQueryPlan,
  isQueryBlocked,
  isQueryEducationalOnly,
  type DataForSEOQueryPlan,
  type PlannedSerpQuery,
} from "./dataforseo-query-planner";

// ── Internal types ─────────────────────────────────────────────────────────────

interface FlatSerpQuery {
  keyword:         string;
  locationName:    string;
  category:        "local" | "commercial";
  serviceId:       null;
  educationalOnly: boolean;
}

// ── DataForSEO raw API response types (private to adapter) ────────────────────

interface DFSKeywordVolumeItem {
  keyword:           string;
  search_volume:     number | null;
  competition:       number | null;
  competition_level: string | null;
  cpc:               number | null;
  monthly_searches:  unknown | null;
}

interface DFSOrganicItem {
  type:           "organic";
  rank_group:     number;
  rank_absolute:  number;
  url:            string;
  title:          string;
  description:    string | null;
  domain:         string;
}

interface DFSPAAElement {
  type:             string;
  title:            string;
  featured_snippet?: { description?: string };
}

interface DFSPAAContainer {
  type:  "people_also_ask";
  items: DFSPAAElement[];
}

type DFSSERPItem = DFSOrganicItem | DFSPAAContainer | { type: string; [k: string]: unknown };

interface DFSSERPResultItem {
  keyword:     string;
  items_count: number;
  items:       DFSSERPItem[];
}

interface DFSTask<T> {
  id:             string;
  status_code:    number;
  status_message: string;
  result:         T[] | null;
}

interface DFSEnvelope<T> {
  status_code:    number;
  status_message: string;
  tasks:          DFSTask<T>[];
}

// ── Domain exclusion list ─────────────────────────────────────────────────────

/**
 * Domains that MUST NOT be classified as local competitors.
 * These are national directories, social platforms, search engines, or aggregators.
 * The raw result is still preserved in providerRaw.organicResults for auditability.
 */
const EXCLUDED_COMPETITOR_DOMAINS = new Set<string>([
  // Search engines
  "google.com", "bing.com", "yahoo.com", "duckduckgo.com", "ask.com",
  // Directories / aggregators
  "yelp.com", "yellowpages.com", "angi.com", "angieslist.com",
  "thumbtack.com", "homeadvisor.com", "houzz.com", "buildzoom.com",
  "porch.com", "bbb.org", "manta.com", "mapquest.com",
  "foursquare.com", "tripadvisor.com", "trustpilot.com",
  // Social
  "facebook.com", "instagram.com", "twitter.com", "x.com",
  "tiktok.com", "youtube.com", "pinterest.com", "linkedin.com",
  "nextdoor.com", "reddit.com",
  // Retail / home improvement
  "amazon.com", "homedepot.com", "lowes.com", "walmart.com",
  // Reference / wiki
  "wikipedia.org", "wikihow.com", "wikiHow.org",
  // News / media
  "cnn.com", "foxnews.com", "nytimes.com",
]);

/**
 * Extract candidate competitor domains from organic SERP results.
 * Excludes EXCLUDED_COMPETITOR_DOMAINS.
 * Returns at most 10 unique domains (enough for signals without flooding).
 */
export function extractCompetitorDomains(organicItems: DFSOrganicItem[]): string[] {
  const seen  = new Set<string>();
  const result: string[] = [];
  for (const item of organicItems) {
    const domain = item.domain.toLowerCase().replace(/^www\./, "");
    if (!seen.has(domain) && !EXCLUDED_COMPETITOR_DOMAINS.has(domain)) {
      seen.add(domain);
      result.push(domain);
    }
    if (result.length >= 10) break;
  }
  return result;
}

/**
 * Extract PAA questions from a SERP result item list.
 * Returns titles of all people_also_ask elements found.
 */
export function extractPAAQuestions(items: DFSSERPItem[]): string[] {
  const questions: string[] = [];
  for (const item of items) {
    if (item.type === "people_also_ask") {
      const paa = item as DFSPAAContainer;
      for (const el of paa.items ?? []) {
        if (el.title && typeof el.title === "string") {
          questions.push(el.title);
        }
      }
    }
  }
  return questions;
}

// ── HTTP transport ────────────────────────────────────────────────────────────

type FetchFn = typeof fetch;

/**
 * Fetch a URL with an explicit timeout using AbortController.
 * Throws a DataForSEOError("timeout") when the timeout expires.
 * All other network errors are re-thrown as DataForSEOError("provider_error").
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  fetchFn: FetchFn,
): Promise<Response> {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...options, signal: controller.signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new DataForSEOError("timeout", `Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw new DataForSEOError("provider_error", `Network error calling ${url}: ${String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST to a DataForSEO endpoint with auth, timeout, and 1 retry for transient errors.
 *
 * Retry policy:
 *   - 1 automatic retry for 5xx errors, with 2-second delay.
 *   - NO retry for 401, 402, 403, 429 — these are deterministic failures.
 *   - NO retry for timeout — caller decides whether to attempt other queries.
 *   - After max retries, throws the last error.
 *
 * Error mapping:
 *   HTTP 401 / 403 → DataForSEOError("auth_error")
 *   HTTP 402       → DataForSEOError("quota_exceeded")
 *   HTTP 429       → DataForSEOError("rate_limited")
 *   HTTP 5xx       → DataForSEOError("provider_error")
 *   Non-JSON body  → DataForSEOError("malformed_response")
 */
async function postDataForSEO<T>(
  url: string,
  payload: unknown,
  config: DataForSEOConfig,
  fetchFn: FetchFn,
  maxRetries = 1,
): Promise<DFSEnvelope<T>> {
  const authHeader = buildBasicAuthHeader(config.login, config.password);
  const options: RequestInit = {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": authHeader,
    },
    body: JSON.stringify(payload),
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 2s, 4s
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(url, options, config.timeoutMs, fetchFn);
    } catch (err) {
      // Timeout or network error — don't retry timeout (it's deterministic)
      if (err instanceof DataForSEOError && err.kind === "timeout") throw err;
      lastError = err as Error;
      continue;
    }

    // Map HTTP error codes to typed errors (no retry for these)
    if (response.status === 401 || response.status === 403) {
      throw new DataForSEOError("auth_error", `HTTP ${response.status} from DataForSEO — check DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD`, response.status);
    }
    if (response.status === 402) {
      throw new DataForSEOError("quota_exceeded", "DataForSEO account balance exhausted (HTTP 402).", response.status);
    }
    if (response.status === 429) {
      throw new DataForSEOError("rate_limited", "DataForSEO rate limit exceeded (HTTP 429).", response.status);
    }
    if (response.status >= 500) {
      lastError = new DataForSEOError("provider_error", `DataForSEO returned HTTP ${response.status}`, response.status);
      continue; // retry 5xx
    }

    // Parse JSON
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new DataForSEOError("malformed_response", `DataForSEO response is not valid JSON (HTTP ${response.status})`);
    }

    // Validate envelope shape
    if (!body || typeof body !== "object" || !Array.isArray((body as DFSEnvelope<T>).tasks)) {
      throw new DataForSEOError("malformed_response", `DataForSEO response missing 'tasks' array: ${JSON.stringify(body).slice(0, 200)}`);
    }

    return body as DFSEnvelope<T>;
  }

  throw lastError ?? new DataForSEOError("provider_error", "Unknown DataForSEO error after retries");
}

// ── Keywords Data API call ─────────────────────────────────────────────────────

/**
 * Call the DataForSEO Keywords Data (Google Ads Search Volume) API.
 *
 * Endpoint: POST /v3/keywords_data/google_ads/search_volume/live
 *
 * Returns a Map<keyword_lowercase → DFSKeywordVolumeItem> for fast lookup.
 * Missing keywords get null volume (never fabricated).
 */
async function fetchKeywordVolumes(
  keywords:     string[],
  locationName: string,
  config:       DataForSEOConfig,
  fetchFn:      FetchFn,
): Promise<Map<string, DFSKeywordVolumeItem>> {
  if (!keywords.length) return new Map();

  const url = `${config.baseUrl}/v3/keywords_data/google_ads/search_volume/live`;

  // Batch into chunks of maxKeywordsPerBatch (DataForSEO max is 700)
  const result = new Map<string, DFSKeywordVolumeItem>();
  const BATCH  = config.maxKeywordsPerBatch;

  for (let i = 0; i < keywords.length; i += BATCH) {
    const batch = keywords.slice(i, i + BATCH);
    const payload = [{
      keywords:       batch,
      location_name:  locationName,
      language_name:  "English",
      search_partners: false,
    }];

    const envelope = await postDataForSEO<DFSKeywordVolumeItem>(url, payload, config, fetchFn);
    const task     = envelope.tasks[0];
    if (!task) continue;

    // Task-level error check
    if (task.status_code !== 20000) {
      console.warn(`[dataforseo] keyword volume task error ${task.status_code}: ${task.status_message}`);
      continue; // Don't throw — volume data is enrichment, not critical
    }

    for (const item of task.result ?? []) {
      result.set(item.keyword.toLowerCase(), item);
    }
  }

  return result;
}

// ── SERP API call ──────────────────────────────────────────────────────────────

/**
 * Call the DataForSEO SERP Organic API for a single keyword.
 *
 * Endpoint: POST /v3/serp/google/organic/live/regular
 *
 * Returns the first task's first result, or null if the task failed or
 * returned no results.
 */
async function fetchSerpResult(
  query:   PlannedSerpQuery,
  config:  DataForSEOConfig,
  fetchFn: FetchFn,
): Promise<DFSSERPResultItem | null> {
  const url = `${config.baseUrl}/v3/serp/google/organic/live/regular`;

  const payload = [{
    keyword:       query.keyword,
    location_name: query.locationName,
    language_name: "English",
    device:        "desktop",
    os:            "windows",
    depth:         config.maxResultsPerQuery,
  }];

  const envelope = await postDataForSEO<DFSSERPResultItem>(url, payload, config, fetchFn);
  const task     = envelope.tasks[0];
  if (!task || task.status_code !== 20000 || !task.result?.length) {
    if (task && task.status_code !== 20000) {
      throw new DataForSEOError(
        "task_error",
        `DataForSEO SERP task error ${task.status_code}: ${task.status_message}`,
        task.status_code,
      );
    }
    return null;
  }

  return task.result[0] ?? null;
}

// ── Result builder ─────────────────────────────────────────────────────────────

/**
 * Build a RawKeywordResult from a SERP result, enriched with volume data.
 *
 * Canonical rules:
 *   - volumeMonthly: from volume API, or null (NEVER fabricated).
 *   - difficulty: competition × 100 on DataForSEO's "adwords competition" scale.
 *     Not the same as SEO difficulty — documented in providerRaw.
 *   - intent: inferred from query category (local/commercial/informational).
 *   - relatedQueries: empty array (no related query data in SERP responses).
 *   - providerRaw: full SERP data including organicResults, competitorDomains,
 *     paaQuestions — preserved for auditability.
 */
function buildSerpKeywordResult(
  query:        PlannedSerpQuery,
  serpResult:   DFSSERPResultItem,
  volumeMap:    Map<string, DFSKeywordVolumeItem>,
): RawKeywordResult {
  const kw     = query.keyword.toLowerCase();
  const volume = volumeMap.get(kw);

  // Extract organic items only
  const organicItems = (serpResult.items ?? []).filter(
    (item): item is DFSOrganicItem => item.type === "organic",
  );

  const competitorDomains = extractCompetitorDomains(organicItems);
  const paaQuestions      = extractPAAQuestions(serpResult.items ?? []);

  // Map intent from query category
  const intentMap = {
    local:         "local",
    commercial:    "commercial",
    informational: "informational",
    regional:      "local",
  } as const;
  const intent = intentMap[query.category] ?? "local";

  // difficulty: adwords competition 0.0–1.0 → 0–100, null if not available
  const difficulty = volume?.competition != null
    ? Math.round(volume.competition * 100)
    : null;

  return {
    keyword:       query.keyword,
    volumeMonthly: volume?.search_volume ?? null,  // null preserved — NEVER fabricated
    difficulty,
    intent,
    cpc:           volume?.cpc ?? null,
    relatedQueries: [],
    providerRaw: {
      source:              "dataforseo_serp",
      locationName:        query.locationName,
      serviceId:           query.serviceId,
      educationalOnly:     query.educationalOnly,
      competitionLevel:    volume?.competition_level ?? null,
      organicResultCount:  organicItems.length,
      organicResults:      organicItems.map(item => ({
        rank:    item.rank_absolute,
        url:     item.url,
        domain:  item.domain,
        title:   item.title,
        snippet: item.description ?? null,
      })),
      competitorDomains,
      paaQuestions,
    },
  };
}

/**
 * Build a RawKeywordResult from volume data only (no SERP call was made).
 * Used for keywords that appear in the volume batch but not the SERP cap.
 */
function buildVolumeOnlyResult(
  keyword:  string,
  volume:   DFSKeywordVolumeItem,
  location: string,
): RawKeywordResult {
  // Infer intent from keyword text
  const kw     = keyword.toLowerCase();
  let intent: RawKeywordResult["intent"] = "local";
  if (kw.includes("cost") || kw.includes("price") || kw.includes("how much")) intent = "commercial";
  else if (kw.includes("how") || kw.includes("what") || kw.includes("why"))    intent = "informational";

  const difficulty = volume.competition != null ? Math.round(volume.competition * 100) : null;

  return {
    keyword,
    volumeMonthly: volume.search_volume ?? null,
    difficulty,
    intent,
    cpc:           volume.cpc ?? null,
    relatedQueries: [],
    providerRaw: {
      source:           "dataforseo_volume",
      locationName:     location,
      competitionLevel: volume.competition_level ?? null,
    },
  };
}

// ── DataForSEOAdapter ──────────────────────────────────────────────────────────

/**
 * DataForSEO implementation of SearchDataProvider.
 *
 * Usage:
 *   const config  = parseDataForSEOConfig();
 *   const adapter = new DataForSEOAdapter(config!);
 *   const pipeline = new DiscoveryPipeline({ search: adapter }, repo);
 *
 * Unit testing:
 *   const mockFetch = vi.fn().mockResolvedValue(makeKeywordVolumeResponse(...));
 *   const adapter = new DataForSEOAdapter(testConfig, mockFetch);
 *
 * Health check before use:
 *   const health = getDataForSEOHealthState(config);
 *   if (health.status !== "configured") { ... }
 */
export class DataForSEOAdapter implements SearchDataProvider {
  readonly name: ProviderSource = "dataforseo";

  constructor(
    private readonly config: DataForSEOConfig,
    private readonly fetchFn: FetchFn = globalThis.fetch,
  ) {}

  /**
   * Fetch keyword data for a set of seed terms + location.
   *
   * Process:
   *   1. Guard: throw if disabled or unconfigured.
   *   2. Build query plan from context seeds + config caps.
   *   3. Fetch keyword volume for all planned keywords (1 batch call).
   *   4. Fetch SERP for top serpQueries (N calls, N ≤ maxQueriesPerRun).
   *   5. Build RawKeywordResult[] from SERP results (enriched with volume).
   *   6. Append volume-only results for keywords that had no SERP call.
   *   7. Return merged deduplicated list (by keyword lowercase).
   *
   * Errors:
   *   - provider_disabled → thrown immediately (caught by pipeline stage 2)
   *   - auth_error / quota_exceeded → thrown immediately (no retry)
   *   - Individual SERP failures → logged, results from that query skipped
   *   - Keyword volume failure → logged, volume data treated as null
   */
  async fetchKeywords(input: {
    seeds:    string[];
    city:     string;
    state:    string;
    industry: string;
    limit:    number;
  }): Promise<RawKeywordResult[]> {
    this._guardEnabled();

    // The pipeline passes seeds from Stage 1 (extractSeeds).
    // We rebuild the query plan from the seeds + location to stay deterministic.
    // Build a minimal context-shaped object from the flat input.
    const locationName = input.city && input.state
      ? `${input.city},${input.state},United States`
      : input.state ? `${input.state},United States`
      : "United States";

    // Use seeds directly as query plan volume keywords + build SERP queries
    const serpPlan = this._buildFlatSerpPlan(input.seeds, input.city, input.state);
    const volumeKeywords = input.seeds.slice(0, this.config.maxKeywordsPerBatch);

    // Step 1: Keyword volume batch (1 API call)
    let volumeMap = new Map<string, DFSKeywordVolumeItem>();
    try {
      volumeMap = await fetchKeywordVolumes(volumeKeywords, locationName, this.config, this.fetchFn);
    } catch (err) {
      if (err instanceof DataForSEOError && (err.kind === "auth_error" || err.kind === "quota_exceeded" || err.kind === "rate_limited")) {
        throw err; // Fatal errors — propagate to pipeline
      }
      console.warn(`[dataforseo] keyword volume batch failed: ${String(err)}. Continuing with null volumes.`);
    }

    // Step 2: SERP calls for top queries
    const results: RawKeywordResult[] = [];
    const serpKeywordsSeen = new Set<string>();

    for (const query of serpPlan) {
      try {
        const serpResult = await fetchSerpResult(query, this.config, this.fetchFn);
        if (!serpResult) continue;

        const result = buildSerpKeywordResult(query, serpResult, volumeMap);
        results.push(result);
        serpKeywordsSeen.add(query.keyword.toLowerCase());
      } catch (err) {
        if (err instanceof DataForSEOError && (err.kind === "auth_error" || err.kind === "quota_exceeded" || err.kind === "rate_limited")) {
          throw err; // Fatal — propagate
        }
        console.warn(`[dataforseo] SERP call failed for "${query.keyword}": ${String(err)}`);
        // Continue with remaining queries
      }
    }

    // Step 3: Volume-only results for seeds that didn't get a SERP call
    for (const kw of volumeKeywords) {
      const kwLower = kw.toLowerCase();
      if (serpKeywordsSeen.has(kwLower)) continue;
      const volume = volumeMap.get(kwLower);
      if (!volume) continue; // No data at all — skip
      results.push(buildVolumeOnlyResult(kw, volume, locationName));
    }

    // Deduplicate by keyword lowercase (SERP results take priority)
    const deduped = new Map<string, RawKeywordResult>();
    for (const r of results) {
      const key = r.keyword.toLowerCase();
      if (!deduped.has(key)) deduped.set(key, r);
    }

    return [...deduped.values()].slice(0, input.limit);
  }

  /**
   * Fetch keywords a competitor ranks for that the client doesn't.
   *
   * Phase C4: returns empty array.
   * Stage 5 of the discovery pipeline is not yet active — no competitor
   * domain source is connected. This will be implemented in Phase C7 when
   * competitor domains are sourced from ai_visibility_audits or client config.
   */
  async fetchCompetitorKeywords(_input: {
    competitorDomain: string;
    clientDomain:     string;
    location:         string;
  }): Promise<RawKeywordResult[]> {
    // Stage 5 is intentionally skipped in Phase C4.
    // Returning [] causes the pipeline to record zero competitor signals
    // without recording a provider failure.
    return [];
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Guard: throws typed errors when the adapter cannot make live calls.
   * These errors are caught by the pipeline's Stage 2 try/catch.
   */
  private _guardEnabled(): void {
    if (!this.config.enabled) {
      throw new DataForSEOError(
        "provider_disabled",
        "DataForSEO is configured but DISCOVERY_DATAFORSEO_ENABLED is not 'true'. " +
        "Set DISCOVERY_DATAFORSEO_ENABLED=true to enable live discovery calls.",
      );
    }
  }

  /**
   * Build a flat SERP query plan from raw seed strings (without DiscoveryContext).
   * Used when fetchKeywords is called with the pipeline's flat input signature.
   *
   * Applies the same blocked-query filtering as buildDataForSEOQueryPlan.
   */
  private _buildFlatSerpPlan(
    seeds: string[],
    city:  string,
    state: string,
  ): FlatSerpQuery[] {
    const locationName = city && state
      ? `${city},${state},United States`
      : state ? `${state},United States`
      : "United States";

    const plan: FlatSerpQuery[] = [];
    const seen = new Set<string>();

    for (const seed of seeds) {
      if (plan.length >= this.config.maxQueriesPerRun) break;
      const kw = seed.trim();
      if (!kw) continue;

      if (isQueryBlocked(kw)) continue;

      const kwLower = kw.toLowerCase();
      if (seen.has(kwLower)) continue;
      seen.add(kwLower);

      plan.push({
        keyword:         kw,
        locationName,
        category:        kwLower.includes("cost") ? "commercial" : "local",
        serviceId:       null,
        educationalOnly: isQueryEducationalOnly(kwLower),
      });
    }

    return plan;
  }
}

/**
 * Build a DataForSEOAdapter from a DiscoveryContext.
 * Uses buildDataForSEOQueryPlan for the full structured query plan.
 *
 * This version is used when the full pipeline has DiscoveryContext available
 * (e.g., in the manual run route or a future scheduled runner).
 *
 * The adapter returned here has a custom fetchKeywords that uses the full
 * structured plan rather than the flat seed list.
 */
export class DataForSEOContextAdapter implements SearchDataProvider {
  readonly name: ProviderSource = "dataforseo";

  private readonly plan: DataForSEOQueryPlan;

  constructor(
    private readonly config: DataForSEOConfig,
    context: DiscoveryContext,
    private readonly fetchFn: FetchFn = globalThis.fetch,
  ) {
    this.plan = buildDataForSEOQueryPlan(context, config);
  }

  /** Expose the query plan for dry-run inspection. */
  getQueryPlan(): DataForSEOQueryPlan {
    return this.plan;
  }

  async fetchKeywords(_input: {
    seeds:    string[];
    city:     string;
    state:    string;
    industry: string;
    limit:    number;
  }): Promise<RawKeywordResult[]> {
    if (!this.config.enabled) {
      throw new DataForSEOError(
        "provider_disabled",
        "DataForSEO is configured but DISCOVERY_DATAFORSEO_ENABLED is not 'true'.",
      );
    }

    const locationName = this.plan.serpQueries[0]?.locationName ?? "United States";

    // Step 1: Volume batch
    let volumeMap = new Map<string, DFSKeywordVolumeItem>();
    if (this.plan.volumeKeywords.length > 0) {
      try {
        volumeMap = await fetchKeywordVolumes(
          this.plan.volumeKeywords.map(v => v.keyword),
          locationName,
          this.config,
          this.fetchFn,
        );
      } catch (err) {
        if (err instanceof DataForSEOError && (err.kind === "auth_error" || err.kind === "quota_exceeded" || err.kind === "rate_limited")) {
          throw err;
        }
        console.warn(`[dataforseo] volume batch failed: ${String(err)}`);
      }
    }

    // Step 2: SERP calls
    const results: RawKeywordResult[] = [];
    const serpKeywordsSeen = new Set<string>();

    for (const query of this.plan.serpQueries) {
      try {
        const serpResult = await fetchSerpResult(query, this.config, this.fetchFn);
        if (!serpResult) continue;
        results.push(buildSerpKeywordResult(query, serpResult, volumeMap));
        serpKeywordsSeen.add(query.keyword.toLowerCase());
      } catch (err) {
        if (err instanceof DataForSEOError && (err.kind === "auth_error" || err.kind === "quota_exceeded" || err.kind === "rate_limited")) {
          throw err;
        }
        console.warn(`[dataforseo] SERP failed for "${query.keyword}": ${String(err)}`);
      }
    }

    // Step 3: Volume-only results
    for (const { keyword } of this.plan.volumeKeywords) {
      const kwLower = keyword.toLowerCase();
      if (serpKeywordsSeen.has(kwLower)) continue;
      const volume = volumeMap.get(kwLower);
      if (!volume) continue;
      results.push(buildVolumeOnlyResult(keyword, volume, locationName));
    }

    const deduped = new Map<string, RawKeywordResult>();
    for (const r of results) {
      const key = r.keyword.toLowerCase();
      if (!deduped.has(key)) deduped.set(key, r);
    }

    return [...deduped.values()].slice(0, _input.limit);
  }

  async fetchCompetitorKeywords(_input: {
    competitorDomain: string;
    clientDomain:     string;
    location:         string;
  }): Promise<RawKeywordResult[]> {
    return [];
  }
}

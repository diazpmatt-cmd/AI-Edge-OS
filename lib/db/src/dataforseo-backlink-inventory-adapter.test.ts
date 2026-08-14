import { describe, expect, it, vi } from "vitest";
import type { DataForSEOBacklinkConfig } from "./backlink-provider-config";
import {
  DATAFORSEO_BACKLINKS_INVENTORY_MAX_ROWS,
  DataForSEOBacklinkInventoryAdapter,
} from "./dataforseo-backlink-inventory-adapter";
import { buildBacklinkInventoryScanFromProviderResult } from "./backlink-inventory-provider";

const config: DataForSEOBacklinkConfig = Object.freeze({
  login: "inventory@example.com",
  password: "not-a-real-secret",
  baseUrl: "https://api.dataforseo.com",
  enabled: true,
  maxRequestsPerRun: 10,
  retry: Object.freeze({ maxAttempts: 3, delayMs: 1, timeoutMs: 1000 }),
});

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function envelope(items: unknown[], totalCount = items.length, itemsCount = items.length) {
  return {
    status_code: 20000,
    status_message: "Ok.",
    tasks: [{
      status_code: 20000,
      status_message: "Ok.",
      result: [{
        target: "bedbugsbeyond.com",
        total_count: totalCount,
        items_count: itemsCount,
        items,
      }],
    }],
  };
}

const first = {
  domain_from: "example.com",
  url_from: "https://example.com/local-pest-guide",
  url_to: "https://bedbugsbeyond.com/services/bed-bugs",
};
const second = {
  domain_from: "directory.example.org",
  url_from: "https://directory.example.org/bed-bugs-and-beyond",
  url_to: "https://bedbugsbeyond.com/",
};

describe("DataForSEO backlink inventory adapter", () => {
  it("fails before network access when the provider is disabled", async () => {
    const fetchFn = vi.fn();
    const adapter = new DataForSEOBacklinkInventoryAdapter({ ...config, enabled: false }, fetchFn as never);
    const result = await adapter.scan({ clientId: "client-a", clientDomain: "bedbugsbeyond.com", limit: 1000 });

    expect(result).toMatchObject({ status: "failed", completeness: "incomplete", requestCount: 0, reason: "provider_disabled" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("marks a one-request inventory complete only when total_count and items_count prove the whole set was returned", async () => {
    const fetchFn = vi.fn(async () => response(envelope([first, second])));
    const adapter = new DataForSEOBacklinkInventoryAdapter(config, fetchFn as never);
    const result = await adapter.scan({ clientId: "client-a", clientDomain: "https://www.bedbugsbeyond.com/", limit: 1000 });

    expect(result).toMatchObject({
      status: "succeeded",
      completeness: "complete",
      requestCount: 1,
      providerTotalCount: 2,
      providerItemsCount: 2,
      reason: null,
    });
    if (result.status !== "succeeded") throw new Error("expected success");
    expect(result.links).toEqual([
      { sourceDomain: first.domain_from, sourceUrl: first.url_from, targetUrl: first.url_to },
      { sourceDomain: second.domain_from, sourceUrl: second.url_from, targetUrl: second.url_to },
    ]);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("https://api.dataforseo.com/v3/backlinks/backlinks/live");
    const payload = JSON.parse(String((init as RequestInit).body));
    expect(payload).toEqual([expect.objectContaining({
      target: "bedbugsbeyond.com",
      limit: 1000,
      offset: 0,
      backlinks_status_type: "live",
      exclude_internal_backlinks: true,
    })]);
  });

  it("marks a capped response incomplete so it cannot advance lost-link state", async () => {
    const fetchFn = vi.fn(async () => response(envelope([first, second], 1500, 2)));
    const adapter = new DataForSEOBacklinkInventoryAdapter(config, fetchFn as never);
    const result = await adapter.scan({ clientId: "client-a", clientDomain: "bedbugsbeyond.com", limit: 2 });

    expect(result).toMatchObject({
      status: "succeeded",
      completeness: "incomplete",
      requestCount: 1,
      providerTotalCount: 1500,
      providerItemsCount: 2,
      reason: "provider_result_capped",
    });
  });

  it("marks malformed item coverage incomplete even when provider counts match", async () => {
    const fetchFn = vi.fn(async () => response(envelope([first, { domain_from: "broken.example" }], 2, 2)));
    const adapter = new DataForSEOBacklinkInventoryAdapter(config, fetchFn as never);
    const result = await adapter.scan({ clientId: "client-a", clientDomain: "bedbugsbeyond.com", limit: 1000 });

    expect(result).toMatchObject({
      status: "succeeded",
      completeness: "incomplete",
      reason: "provider_items_incomplete",
    });
    if (result.status === "succeeded") expect(result.links).toHaveLength(1);
  });

  it("treats a provider-confirmed empty inventory as complete", async () => {
    const fetchFn = vi.fn(async () => response(envelope([], 0, 0)));
    const adapter = new DataForSEOBacklinkInventoryAdapter(config, fetchFn as never);
    const result = await adapter.scan({ clientId: "client-a", clientDomain: "bedbugsbeyond.com", limit: 1000 });

    expect(result).toMatchObject({
      status: "succeeded",
      completeness: "complete",
      providerTotalCount: 0,
      providerItemsCount: 0,
      links: [],
    });
  });

  it("never retries a failed inventory request inside one scan", async () => {
    const fetchFn = vi.fn(async () => response({ error: "temporary" }, 500));
    const adapter = new DataForSEOBacklinkInventoryAdapter(config, fetchFn as never);
    const result = await adapter.scan({ clientId: "client-a", clientDomain: "bedbugsbeyond.com", limit: 1000 });

    expect(result).toMatchObject({ status: "failed", completeness: "incomplete", requestCount: 1, reason: "provider_http_error" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("fails closed on invalid limits and never exceeds the documented provider maximum", async () => {
    const fetchFn = vi.fn();
    const adapter = new DataForSEOBacklinkInventoryAdapter(config, fetchFn as never);
    const result = await adapter.scan({
      clientId: "client-a",
      clientDomain: "bedbugsbeyond.com",
      limit: DATAFORSEO_BACKLINKS_INVENTORY_MAX_ROWS + 1,
    });

    expect(result).toMatchObject({ status: "failed", requestCount: 0, reason: "inventory_limit_invalid" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("bridges provider outcomes into lifecycle scans without turning failures into misses", async () => {
    const failed = await new DataForSEOBacklinkInventoryAdapter(
      config,
      vi.fn(async () => response({ error: true }, 500)) as never,
    ).scan({ clientId: "client-a", clientDomain: "bedbugsbeyond.com", limit: 1000 });

    const scan = buildBacklinkInventoryScanFromProviderResult({
      clientId: "client-a",
      runId: "inventory-run-1",
      completedAt: "2026-08-14T15:00:00Z",
      result: failed,
    });
    expect(scan).toMatchObject({
      status: "failed",
      completeness: "incomplete",
      links: [],
      providerId: "dataforseo_backlinks",
      providerRevision: "dataforseo-backlinks-inventory-v1",
    });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import type { DataForSEOBacklinkConfig } from "./backlink-provider-config";
import { DataForSEOBacklinkAdapter } from "./dataforseo-backlink-adapter";

const config: DataForSEOBacklinkConfig = Object.freeze({
  login: "proof@example.com",
  password: "not-a-real-secret",
  baseUrl: "https://api.dataforseo.com",
  enabled: true,
  maxRequestsPerRun: 1,
  retry: Object.freeze({ maxAttempts: 1, delayMs: 0, timeoutMs: 1_000 }),
});

const discovery = Object.freeze({
  clientId: "00000000-0000-4000-8000-000000000001",
  clientDomain: "bedbugsbeyond.com",
  competitorDomains: Object.freeze(["competitor.example"]),
  serviceIds: Object.freeze(["bed-bug-treatment"]),
  city: "Foley",
  region: "Baldwin County, Alabama",
  limit: 10,
});

afterEach(() => vi.restoreAllMocks());

describe("DataForSEO backlink proof failure mode", () => {
  it("preserves normal best-effort behavior by default for a non-fatal provider error", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchFn = vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    const adapter = new DataForSEOBacklinkAdapter(config, fetchFn);

    await expect(adapter.discover(discovery)).resolves.toEqual([]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("fails closed on the same provider error when strict proof mode is enabled", async () => {
    const fetchFn = vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    const adapter = new DataForSEOBacklinkAdapter(config, fetchFn, { strictFailures: true });

    await expect(adapter.discover(discovery)).rejects.toMatchObject({ kind: "provider_error" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("fails closed on a provider task failure instead of treating it as an empty success", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({
      status_code: 20000,
      status_message: "Ok.",
      tasks: [{ status_code: 50000, status_message: "Provider task failed", result: null }],
    }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const adapter = new DataForSEOBacklinkAdapter(config, fetchFn, { strictFailures: true });

    await expect(adapter.discover(discovery)).rejects.toMatchObject({ kind: "provider_error" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("allows a truthful successful zero-result task in strict proof mode", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({
      status_code: 20000,
      status_message: "Ok.",
      tasks: [{
        status_code: 20000,
        status_message: "Ok.",
        result: [{ target: "competitor.example", total_count: 0, items_count: 0, items: [] }],
      }],
    }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const adapter = new DataForSEOBacklinkAdapter(config, fetchFn, { strictFailures: true });

    await expect(adapter.discover(discovery)).resolves.toEqual([]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

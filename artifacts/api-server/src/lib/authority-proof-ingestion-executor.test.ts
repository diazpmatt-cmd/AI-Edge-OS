import { describe, expect, it, vi } from "vitest";
import {
  InMemoryBacklinkRepository,
  type BacklinkCapability,
  type DataForSEOBacklinkConfig,
} from "@workspace/db";
import {
  AuthorityProofFailedRunRequiresReviewError,
  createAuthorityProofIngestionExecutor,
} from "./authority-proof-ingestion-executor.js";
import {
  DATAFORSEO_BACKLINK_PROVIDER_REVISION,
  buildAuthorityScheduledExecutionPlan,
} from "./authority-scheduled-execution-plan.js";

const now = new Date("2026-08-14T18:30:00.000Z");
const capabilities = Object.freeze([
  "authority_metrics",
  "link_intersections",
  "referring_domains",
] as const satisfies readonly BacklinkCapability[]);

const baseConfig: DataForSEOBacklinkConfig = Object.freeze({
  login: "proof@example.com",
  password: "not-a-real-secret",
  baseUrl: "https://api.dataforseo.com",
  enabled: true,
  maxRequestsPerRun: 10,
  retry: Object.freeze({ maxAttempts: 3, delayMs: 100, timeoutMs: 1_000 }),
});

function canonicalPlan(capabilityOverride: readonly BacklinkCapability[] = capabilities) {
  const result = buildAuthorityScheduledExecutionPlan({
    discovery: {
      clientId: "00000000-0000-4000-8000-000000000001",
      clientDomain: "bedbugsbeyond.com",
      competitorDomains: ["competitor.example"],
      serviceIds: ["bed-bug-treatment"],
      city: "Foley",
      region: "Baldwin County, Alabama",
      limit: 10,
    },
    provider: {
      providerId: "dataforseo_backlinks",
      providerRevision: DATAFORSEO_BACKLINK_PROVIDER_REVISION,
      capabilities: capabilityOverride,
    },
  });
  if (!result.ok) throw new Error(result.code);
  return result.plan;
}

function successResponse() {
  return new Response(JSON.stringify({
    status_code: 20000,
    status_message: "Ok.",
    tasks: [{
      status_code: 20000,
      status_message: "Ok.",
      result: [{
        target: "competitor.example",
        total_count: 1,
        items_count: 1,
        items: [{
          type: "backlinks_referring_domain",
          domain: "example-authority.org",
          rank: 62,
          spam_score: 4,
          backlinks: 3,
          referring_pages: 2,
          referring_ips: 2,
          broken_backlinks: 0,
          first_seen: "2026-08-01T00:00:00.000Z",
        }],
      }],
    }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("Authority proof canonical ingestion executor", () => {
  it("uses one provider call on the first successful canonical ingestion", async () => {
    const repository = new InMemoryBacklinkRepository();
    const fetchFn = vi.fn(async () => successResponse()) as unknown as typeof fetch;
    const executor = createAuthorityProofIngestionExecutor({ baseConfig, repository, fetchFn });
    const plan = canonicalPlan();

    const result = await executor.executeIngestion({ plan, now });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.providerCallMade).toBe(true);
    expect(result.replayed).toBe(false);
    expect(result.result).toMatchObject({
      clientId: plan.clientId,
      provider: "dataforseo_backlinks",
      observed: 1,
      accepted: 1,
      rejected: 0,
    });
  });

  it("replays a successful canonical run without another provider call", async () => {
    const repository = new InMemoryBacklinkRepository();
    const fetchFn = vi.fn(async () => successResponse()) as unknown as typeof fetch;
    const executor = createAuthorityProofIngestionExecutor({ baseConfig, repository, fetchFn });
    const plan = canonicalPlan();

    const first = await executor.executeIngestion({ plan, now });
    const second = await executor.executeIngestion({ plan, now: new Date(now.getTime() + 1_000) });

    expect(first.providerCallMade).toBe(true);
    expect(second.providerCallMade).toBe(false);
    expect(second.replayed).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("records a strict provider failure and refuses any automatic second billable attempt", async () => {
    const repository = new InMemoryBacklinkRepository();
    const fetchFn = vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    const executor = createAuthorityProofIngestionExecutor({ baseConfig, repository, fetchFn });
    const plan = canonicalPlan();

    await expect(executor.executeIngestion({ plan, now })).rejects.toThrow("backlink ingestion failed at provider");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect((await repository.getIngestionRun(plan.runId, plan.clientId))?.status).toBe("failed");

    await expect(executor.executeIngestion({
      plan,
      now: new Date(now.getTime() + 1_000),
    })).rejects.toBeInstanceOf(AuthorityProofFailedRunRequiresReviewError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("fails before provider execution when canonical capabilities do not match the adapter", async () => {
    const repository = new InMemoryBacklinkRepository();
    const fetchFn = vi.fn(async () => successResponse()) as unknown as typeof fetch;
    const executor = createAuthorityProofIngestionExecutor({ baseConfig, repository, fetchFn });
    const plan = canonicalPlan(["referring_domains"]);

    await expect(executor.executeIngestion({ plan, now })).rejects.toThrow("identity/capabilities");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type {
  BacklinkInventoryProvider,
  BacklinkInventoryProviderResult,
} from "./backlink-inventory-provider";
import type {
  BacklinkInventoryRunReceipt,
  ObservedBacklinkRepository,
  PersistedBacklinkInventoryResult,
} from "./observed-backlink-repository";
import {
  runBacklinkInventoryMeasurementCycle,
  type BacklinkInventoryCycleDependencies,
} from "./backlink-inventory-cycle";

const CLIENT = "client-a";
const RUN = "inventory-run-1";
const COMPLETED_AT = "2026-08-14T15:00:00.000Z";

function receipt(
  overrides: Partial<BacklinkInventoryRunReceipt> = {},
): BacklinkInventoryRunReceipt {
  return {
    id: "inventory::client-a::inventory-run-1",
    clientId: CLIENT,
    runId: RUN,
    providerId: "dataforseo_backlinks",
    providerRevision: "dataforseo-backlinks-inventory-v1",
    status: "succeeded",
    completeness: "complete",
    completedAt: COMPLETED_AT,
    inputFingerprint: "a".repeat(64),
    observedCount: 1,
    absenceEvaluationApplied: true,
    metrics: {
      activeBacklinkCount: 1,
      referringDomainCount: 1,
      newCount: 1,
      lostCount: 0,
      restoredCount: 0,
    },
    ...overrides,
  };
}

function providerResult(
  overrides: Partial<Extract<BacklinkInventoryProviderResult, { status: "succeeded" }>> = {},
): BacklinkInventoryProviderResult {
  return {
    status: "succeeded",
    providerId: "dataforseo_backlinks",
    providerRevision: "dataforseo-backlinks-inventory-v1",
    completeness: "complete",
    links: [
      {
        sourceUrl: "https://example.com/local-guide",
        sourceDomain: "example.com",
        targetUrl: "https://client.example.com/",
      },
    ],
    requestCount: 1,
    providerTotalCount: 1,
    providerItemsCount: 1,
    reason: null,
    ...overrides,
  };
}

function makeDependencies(input: {
  existing?: BacklinkInventoryRunReceipt | null;
  result?: BacklinkInventoryProviderResult;
  persisted?: PersistedBacklinkInventoryResult;
  measurement?: { written: true; inventoryRunId: string } | { written: false; reason: string };
} = {}) {
  const existing = input.existing ?? null;
  const result = input.result ?? providerResult();
  const persisted = input.persisted ?? {
    outcome: "applied" as const,
    receipt: receipt(),
    transitions: [],
  };
  const provider: BacklinkInventoryProvider = {
    name: "fake_inventory",
    revision: "v1",
    scan: vi.fn(async () => result),
  };
  const repository: ObservedBacklinkRepository = {
    getInventoryRun: vi.fn(async () => existing),
    applyInventoryScan: vi.fn(async () => persisted),
    listStates: vi.fn(async () => []),
    listTransitions: vi.fn(async () => []),
  };
  const recordMeasurement = vi.fn(async () => input.measurement ?? ({
    written: true as const,
    inventoryRunId: RUN,
  }));

  return {
    dependencies: {
      provider,
      repository,
      recordMeasurement,
      now: () => new Date(COMPLETED_AT),
    } satisfies BacklinkInventoryCycleDependencies,
    provider,
    repository,
    recordMeasurement,
  };
}

const cycleInput = {
  clientId: CLIENT,
  clientDomain: "client.example.com",
  runId: RUN,
  limit: 1000,
} as const;

describe("backlink inventory Measurement cycle", () => {
  it("persists a new complete inventory and writes trusted Measurement", async () => {
    const setup = makeDependencies();
    const result = await runBacklinkInventoryMeasurementCycle(cycleInput, setup.dependencies);

    expect(setup.provider.scan).toHaveBeenCalledTimes(1);
    expect(setup.provider.scan).toHaveBeenCalledWith({
      clientId: CLIENT,
      clientDomain: "client.example.com",
      limit: 1000,
    });
    expect(setup.repository.applyInventoryScan).toHaveBeenCalledTimes(1);
    expect(setup.recordMeasurement).toHaveBeenCalledWith(CLIENT, new Date(COMPLETED_AT));
    expect(result).toMatchObject({
      lifecycleOutcome: "applied",
      providerCallMade: true,
      providerRequestCount: 1,
      measurement: { written: true, inventoryRunId: RUN },
    });
  });

  it("persists an incomplete inventory but never writes trusted Measurement", async () => {
    const incompleteReceipt = receipt({
      completeness: "incomplete",
      absenceEvaluationApplied: false,
    });
    const setup = makeDependencies({
      result: providerResult({
        completeness: "incomplete",
        reason: "provider_result_capped",
      }),
      persisted: {
        outcome: "applied",
        receipt: incompleteReceipt,
        transitions: [],
      },
    });

    const result = await runBacklinkInventoryMeasurementCycle(cycleInput, setup.dependencies);
    expect(setup.repository.applyInventoryScan).toHaveBeenCalledTimes(1);
    expect(setup.recordMeasurement).not.toHaveBeenCalled();
    expect(result.measurement).toEqual({ written: false, reason: "inventory_not_complete" });
  });

  it("persists a failed provider attempt without turning it into a miss or snapshot", async () => {
    const failed: BacklinkInventoryProviderResult = {
      status: "failed",
      providerId: "dataforseo_backlinks",
      providerRevision: "dataforseo-backlinks-inventory-v1",
      completeness: "incomplete",
      links: [],
      requestCount: 1,
      providerTotalCount: null,
      providerItemsCount: null,
      reason: "provider_http_error",
    };
    const failedReceipt = receipt({
      status: "failed",
      completeness: "incomplete",
      observedCount: 0,
      absenceEvaluationApplied: false,
      metrics: {
        activeBacklinkCount: 0,
        referringDomainCount: 0,
        newCount: 0,
        lostCount: 0,
        restoredCount: 0,
      },
    });
    const setup = makeDependencies({
      result: failed,
      persisted: { outcome: "applied", receipt: failedReceipt, transitions: [] },
    });

    const result = await runBacklinkInventoryMeasurementCycle(cycleInput, setup.dependencies);
    expect(setup.recordMeasurement).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      providerCallMade: true,
      providerRequestCount: 1,
      measurement: { written: false, reason: "inventory_not_complete" },
    });
  });

  it("replays an existing complete run without making any provider call", async () => {
    const existing = receipt();
    const setup = makeDependencies({ existing });

    const result = await runBacklinkInventoryMeasurementCycle(cycleInput, setup.dependencies);
    expect(setup.provider.scan).not.toHaveBeenCalled();
    expect(setup.repository.applyInventoryScan).not.toHaveBeenCalled();
    expect(setup.recordMeasurement).toHaveBeenCalledWith(CLIENT, new Date(COMPLETED_AT));
    expect(result).toMatchObject({
      lifecycleOutcome: "replayed",
      providerCallMade: false,
      providerRequestCount: 0,
    });
  });

  it("replays an existing failed run without provider retry or Measurement", async () => {
    const existing = receipt({
      status: "failed",
      completeness: "incomplete",
      absenceEvaluationApplied: false,
    });
    const setup = makeDependencies({ existing });

    const result = await runBacklinkInventoryMeasurementCycle(cycleInput, setup.dependencies);
    expect(setup.provider.scan).not.toHaveBeenCalled();
    expect(setup.repository.applyInventoryScan).not.toHaveBeenCalled();
    expect(setup.recordMeasurement).not.toHaveBeenCalled();
    expect(result.measurement).toEqual({ written: false, reason: "inventory_not_complete" });
  });

  it("after a post-persistence Measurement failure, restart retries only Measurement", async () => {
    let stored: BacklinkInventoryRunReceipt | null = null;
    const provider: BacklinkInventoryProvider = {
      name: "fake_inventory",
      revision: "v1",
      scan: vi.fn(async () => providerResult()),
    };
    const repository: ObservedBacklinkRepository = {
      getInventoryRun: vi.fn(async () => stored),
      applyInventoryScan: vi.fn(async () => {
        stored = receipt();
        return { outcome: "applied" as const, receipt: stored, transitions: [] };
      }),
      listStates: vi.fn(async () => []),
      listTransitions: vi.fn(async () => []),
    };
    const recordMeasurement = vi
      .fn<BacklinkInventoryCycleDependencies["recordMeasurement"]>()
      .mockRejectedValueOnce(new Error("snapshot_write_failed"))
      .mockResolvedValueOnce({ written: true, inventoryRunId: RUN });
    const dependencies: BacklinkInventoryCycleDependencies = {
      provider,
      repository,
      recordMeasurement,
      now: () => new Date(COMPLETED_AT),
    };

    await expect(runBacklinkInventoryMeasurementCycle(cycleInput, dependencies))
      .rejects.toThrow("snapshot_write_failed");
    const replay = await runBacklinkInventoryMeasurementCycle(cycleInput, dependencies);

    expect(provider.scan).toHaveBeenCalledTimes(1);
    expect(repository.applyInventoryScan).toHaveBeenCalledTimes(1);
    expect(recordMeasurement).toHaveBeenCalledTimes(2);
    expect(replay).toMatchObject({
      lifecycleOutcome: "replayed",
      providerCallMade: false,
      providerRequestCount: 0,
      measurement: { written: true, inventoryRunId: RUN },
    });
  });

  it("remains an unmounted pure coordinator with no provider construction or network access", () => {
    const source = readFileSync(new URL("./backlink-inventory-cycle.ts", import.meta.url), "utf8");
    expect(source).not.toContain("process.env");
    expect(source).not.toContain("DataForSEOBacklinkInventoryAdapter");
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toContain("Router(");
    expect(source).not.toContain("setInterval(");
    expect(source).not.toContain("setTimeout(");
  });
});

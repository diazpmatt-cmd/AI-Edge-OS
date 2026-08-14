import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  OBSERVED_BACKLINK_MEASUREMENT_SOURCE,
  buildLifecycleBacklinkMeasurementSnapshot,
  recordObservedBacklinkMeasurementSnapshot,
  type ObservedBacklinkMeasurementDependencies,
} from "./observed-backlink-measurement.js";

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT = "client-a";

function dependencies(
  overrides: Partial<ObservedBacklinkMeasurementDependencies> = {},
): ObservedBacklinkMeasurementDependencies {
  return {
    getLatestCompleteBaseline: vi.fn(async () => ({ runId: "inventory-run-3", completedAt: "2026-08-14T12:00:00.000Z" })),
    getCurrentMetrics: vi.fn(async () => ({ activeBacklinkCount: 3, referringDomainCount: 2 })),
    getPeriodTransitions: vi.fn(async () => ({ newCount: 2, lostCount: 1, restoredCount: 1 })),
    getOpportunityCount: vi.fn(async () => 5),
    getVerifiedWinCount: vi.fn(async () => 1),
    upsertSnapshot: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("observed backlink measurement snapshots", () => {
  it("refuses to write until at least one successful complete inventory baseline exists", async () => {
    const deps = dependencies({ getLatestCompleteBaseline: vi.fn(async () => null) });
    const result = await recordObservedBacklinkMeasurementSnapshot(
      CLIENT,
      new Date("2026-08-14T15:30:00.000Z"),
      deps,
    );

    expect(result).toEqual({ written: false, reason: "complete_inventory_baseline_unavailable" });
    expect(deps.getCurrentMetrics).not.toHaveBeenCalled();
    expect(deps.getPeriodTransitions).not.toHaveBeenCalled();
    expect(deps.upsertSnapshot).not.toHaveBeenCalled();
  });

  it("writes current active inventory plus UTC-period lifecycle transitions with provenance", async () => {
    const deps = dependencies();
    const result = await recordObservedBacklinkMeasurementSnapshot(
      CLIENT,
      new Date("2026-08-14T15:30:00.000Z"),
      deps,
    );

    expect(result.written).toBe(true);
    if (!result.written) throw new Error("expected snapshot write");
    expect(result.snapshot).toMatchObject({
      clientId: CLIENT,
      snapshotDate: "2026-08-14",
      inventoryRunId: "inventory-run-3",
      measurementSource: OBSERVED_BACKLINK_MEASUREMENT_SOURCE,
      measurementObservedAt: "2026-08-14T15:30:00.000Z",
      backlinkCount: 3,
      referringDomainCount: 2,
      newCount: 2,
      lostCount: 1,
      restoredCount: 1,
      opportunityCount: 5,
      wonCount: 1,
    });
    expect(result.snapshot.edgeAuthorityScore).not.toBeNull();

    expect(deps.getPeriodTransitions).toHaveBeenCalledWith(
      CLIENT,
      new Date("2026-08-14T00:00:00.000Z"),
      new Date("2026-08-15T00:00:00.000Z"),
    );
    expect(deps.upsertSnapshot).toHaveBeenCalledWith(result.snapshot);
  });

  it("keeps Edge Authority unavailable when no qualifying observed backlink evidence exists", () => {
    const snapshot = buildLifecycleBacklinkMeasurementSnapshot({
      clientId: CLIENT,
      snapshotDate: "2026-08-14",
      inventoryRunId: "inventory-run-empty",
      measurementObservedAt: "2026-08-14T15:30:00.000Z",
      current: { activeBacklinkCount: 0, referringDomainCount: 0 },
      period: { newCount: 0, lostCount: 0, restoredCount: 0 },
      opportunityCount: 4,
      wonCount: 0,
    });
    expect(snapshot.edgeAuthorityScore).toBeNull();
  });

  it("rejects impossible referring-domain and verified-win counts", () => {
    expect(() => buildLifecycleBacklinkMeasurementSnapshot({
      clientId: CLIENT,
      snapshotDate: "2026-08-14",
      inventoryRunId: "inventory-run-1",
      measurementObservedAt: "2026-08-14T15:30:00.000Z",
      current: { activeBacklinkCount: 1, referringDomainCount: 2 },
      period: { newCount: 0, lostCount: 0, restoredCount: 0 },
      opportunityCount: 1,
      wonCount: 0,
    })).toThrow("referring_domain_count_exceeds_backlink_count");

    expect(() => buildLifecycleBacklinkMeasurementSnapshot({
      clientId: CLIENT,
      snapshotDate: "2026-08-14",
      inventoryRunId: "inventory-run-1",
      measurementObservedAt: "2026-08-14T15:30:00.000Z",
      current: { activeBacklinkCount: 1, referringDomainCount: 1 },
      period: { newCount: 0, lostCount: 0, restoredCount: 0 },
      opportunityCount: 1,
      wonCount: 2,
    })).toThrow("verified_won_count_exceeds_opportunity_count");
  });

  it("uses an upsert that never overwrites the legacy authority_score field", () => {
    const source = readFileSync(resolve(here, "observed-backlink-measurement.ts"), "utf8");
    const conflictClause = source.slice(source.indexOf("ON CONFLICT (client_id, snapshot_date)"));

    expect(conflictClause).toContain("backlink_count               = EXCLUDED.backlink_count");
    expect(conflictClause).toContain("measurement_source           = EXCLUDED.measurement_source");
    expect(conflictClause).not.toContain("authority_score              = EXCLUDED.authority_score");
    expect(source).toContain("complete_inventory_baseline_unavailable");
  });
});

describe("backlink measurement history migration", () => {
  it("adds provenance without rewriting legacy rows as trusted measurements", () => {
    const migration = readFileSync(resolve(here, "../../../../lib/db/migrations/0013_backlink_measurement_provenance.sql"), "utf8");
    const bootstrap = readFileSync(resolve(here, "backlink-measurement-migrate.ts"), "utf8");

    for (const source of [migration, bootstrap]) {
      expect(source).toContain("ADD COLUMN IF NOT EXISTS restored_count");
      expect(source).toContain("ADD COLUMN IF NOT EXISTS measurement_source");
      expect(source).toContain("ADD COLUMN IF NOT EXISTS measurement_inventory_run_id");
      expect(source).toContain("ADD COLUMN IF NOT EXISTS measurement_observed_at");
      expect(source).toContain("measurement_source IS NULL");
      expect(source).toContain("observed_backlink_lifecycle_v1");
      expect(source).not.toMatch(/UPDATE\s+backlink_score_history/i);
      expect(source).not.toMatch(/\b(DROP|TRUNCATE)\b/i);
    }
  });
});

/**
 * GBP Alert Threshold — Behavioral tests (Area 2)
 *
 * Verifies that generateAndPersistAlerts reads alert_on_drop from the DB at
 * runtime and applies it correctly, rather than using a hardcoded constant.
 *
 * All assertions verify actual SQL calls and their arguments via mocked pool.
 * No source-text matching is used.
 *
 * Invariants tested:
 *   - Missing schedule row → effective threshold = 10 (default)
 *   - threshold=0 or negative → treated as invalid → default 10
 *   - Configured threshold is honoured when a schedule row exists
 *   - Alert fires at exactly the threshold boundary (drop >= threshold)
 *   - Alert does NOT fire when drop < threshold
 *   - Duplicate prevention: second alert for same snapshot_id is suppressed
 *   - new_critical/new_high alerts fire regardless of score drop
 *   - Pool client is always released, even on DB error (finally block)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@workspace/db", () => ({
  db:   { update: vi.fn(), select: vi.fn(), insert: vi.fn() },
  pool: { connect: vi.fn(), query: vi.fn() },
  eq:   vi.fn(),
  and:  vi.fn(),
  ne:   vi.fn(),
  sql:  vi.fn(),
  evaluateGbpAudit:          vi.fn(),
  generateOptimizations:     vi.fn(),
  evaluateClientEligibility: vi.fn(),
  createWeeklyPlanId:        vi.fn(),
  isValidIanaTimezone:       vi.fn(() => true),
}));

vi.mock("@workspace/db/schema", () => ({
  localPresenceProfilesTable:        {},
  socialConnectionsTable:            {},
  reviewPlatformStatsTable:          {},
  socialPostsTable:                  {},
  gbpAuditSnapshotsTable:            {},
  gbpAuditChecksTable:               {},
  gbpOptimizationOpportunitiesTable: {},
}));

vi.mock("drizzle-orm", () => ({ desc: vi.fn(), inArray: vi.fn() }));
vi.mock("@clerk/express", () => ({ getAuth: vi.fn(() => ({ userId: "u" })) }));
vi.mock("../lib/gbp-live-data", () => ({ fetchGbpLiveData: vi.fn() }));
vi.mock("../lib/scheduler-secret", () => ({ SCHEDULER_SECRET: "test-secret" }));

import { generateAndPersistAlerts } from "../routes/gbp-audit.js";
import { pool } from "@workspace/db";

type QueryResult = { rows: unknown[]; rowCount?: number };

function makeClientWithSequence(...responses: QueryResult[]) {
  const queryFn = vi.fn();
  for (const r of responses) {
    queryFn.mockResolvedValueOnce({ rows: r.rows, rowCount: r.rowCount ?? r.rows.length });
  }
  const releaseFn = vi.fn();
  vi.mocked(pool.connect).mockResolvedValue({ query: queryFn, release: releaseFn } as never);
  return { queryFn, releaseFn };
}

function findInsertCall(queryFn: ReturnType<typeof vi.fn>) {
  return (queryFn.mock.calls as Array<[unknown, unknown[]]>).find(
    ([sql]) => typeof sql === "string" && sql.includes("INSERT INTO gbp_alert_log"),
  );
}

describe("generateAndPersistAlerts — threshold reads from DB at runtime", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses default threshold=10 when no schedule row exists; drop of 11 triggers alert", async () => {
    const { queryFn } = makeClientWithSequence(
      { rows: [] },                   // SELECT alert_on_drop → no row (default=10)
      { rows: [], rowCount: 0 },      // dupe check → no duplicate
      { rows: [] },                   // INSERT score_drop alert
      { rows: [] },                   // UPDATE schedule next_run_at
    );

    await generateAndPersistAlerts("c1", "s1", 54, 65, 0, 0); // drop=11

    expect(findInsertCall(queryFn)).toBeDefined();
  });

  it("no alert fires when drop is below default threshold (drop=9 < default 10)", async () => {
    const { queryFn } = makeClientWithSequence(
      { rows: [] },  // no schedule row → default threshold=10
      { rows: [] },  // UPDATE schedule (no INSERT)
    );

    await generateAndPersistAlerts("c1", "s1", 56, 65, 0, 0); // drop=9

    expect(findInsertCall(queryFn)).toBeUndefined();
  });

  it("uses a configured threshold of 5 — drop of 7 triggers alert", async () => {
    const { queryFn } = makeClientWithSequence(
      { rows: [{ alert_on_drop: 5 }] }, // threshold=5
      { rows: [], rowCount: 0 },          // no dupe
      { rows: [] },                       // INSERT
      { rows: [] },                       // UPDATE
    );

    await generateAndPersistAlerts("c1", "s1", 58, 65, 0, 0); // drop=7

    expect(findInsertCall(queryFn)).toBeDefined();
  });

  it("uses a configured threshold of 15 — drop of 7 does NOT trigger alert", async () => {
    const { queryFn } = makeClientWithSequence(
      { rows: [{ alert_on_drop: 15 }] }, // threshold=15
      { rows: [] },                        // UPDATE schedule only
    );

    await generateAndPersistAlerts("c1", "s1", 58, 65, 0, 0); // drop=7

    expect(findInsertCall(queryFn)).toBeUndefined();
  });

  it("threshold=0 is invalid — falls back to default 10; drop of 11 triggers alert", async () => {
    const { queryFn } = makeClientWithSequence(
      { rows: [{ alert_on_drop: 0 }] }, // 0 → invalid → fallback 10
      { rows: [], rowCount: 0 },          // no dupe
      { rows: [] },                       // INSERT
      { rows: [] },                       // UPDATE
    );

    await generateAndPersistAlerts("c1", "s1", 54, 65, 0, 0); // drop=11

    expect(findInsertCall(queryFn)).toBeDefined();
  });

  it("alert fires at exactly the threshold boundary (drop === threshold)", async () => {
    // prevScore=50, currScore=40, threshold=10 → drop=10 (>= 10) → ALERT
    const { queryFn } = makeClientWithSequence(
      { rows: [{ alert_on_drop: 10 }] },
      { rows: [], rowCount: 0 },
      { rows: [] },
      { rows: [] },
    );

    await generateAndPersistAlerts("c1", "s1", 40, 50, 0, 0);

    expect(findInsertCall(queryFn)).toBeDefined();
  });

  it("alert does NOT fire when drop is one point below threshold (drop = threshold - 1)", async () => {
    // prevScore=50, currScore=41, threshold=10 → drop=9 → NO ALERT
    const { queryFn } = makeClientWithSequence(
      { rows: [{ alert_on_drop: 10 }] },
      { rows: [] }, // UPDATE only
    );

    await generateAndPersistAlerts("c1", "s1", 41, 50, 0, 0);

    expect(findInsertCall(queryFn)).toBeUndefined();
  });

  it("duplicate prevention — second score_drop for same snapshot is suppressed", async () => {
    const { queryFn } = makeClientWithSequence(
      { rows: [{ alert_on_drop: 10 }] },
      { rows: [{ "1": 1 }], rowCount: 1 }, // dupe exists
      { rows: [] },                          // UPDATE schedule (no INSERT)
    );

    await generateAndPersistAlerts("c1", "snap-already-alerted", 40, 55, 0, 0);

    expect(findInsertCall(queryFn)).toBeUndefined();
  });

  it("new_critical alert is inserted when criticalNew > 0, regardless of score drop", async () => {
    // score drop=3 < threshold=10 → no score_drop, but criticalNew=2 → INSERT new_critical
    const { queryFn } = makeClientWithSequence(
      { rows: [{ alert_on_drop: 10 }] },
      { rows: [] }, // INSERT new_critical
      { rows: [] }, // UPDATE schedule
    );

    await generateAndPersistAlerts("c1", "s1", 62, 65, 2, 0); // drop=3

    const insertCall = findInsertCall(queryFn);
    expect(insertCall).toBeDefined();
    const params = insertCall?.[1] as unknown[];
    expect(params).toContain("new_critical");
  });

  it("new_high alert is inserted when highNew > 0 and criticalNew === 0", async () => {
    const { queryFn } = makeClientWithSequence(
      { rows: [{ alert_on_drop: 10 }] },
      { rows: [] }, // INSERT new_high
      { rows: [] }, // UPDATE
    );

    await generateAndPersistAlerts("c1", "s1", 62, 65, 0, 3); // drop=3, highNew=3

    const insertCall = findInsertCall(queryFn);
    expect(insertCall).toBeDefined();
    const params = insertCall?.[1] as unknown[];
    expect(params).toContain("new_high");
  });

  it("pool client is always released, even when a DB query throws", async () => {
    const releaseFn = vi.fn();
    const queryFn   = vi.fn().mockRejectedValue(new Error("DB connection lost"));
    vi.mocked(pool.connect).mockResolvedValue({ query: queryFn, release: releaseFn } as never);

    await expect(generateAndPersistAlerts("c1", "s1", 40, 65, 0, 0)).rejects.toThrow("DB connection lost");

    expect(releaseFn).toHaveBeenCalledTimes(1);
  });
});

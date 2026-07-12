/**
 * C7 Scheduler — Audit + Unit Tests
 *
 * Covers:
 *   §1  Repository bug-fix verification (pure / structural checks)
 *   §2  Schedule domain primitives
 *   §3  Scheduler config
 *   §4  Dispatcher (mocked execution service + pool)
 *   §5  Tick (mocked pool, service, context resolver)
 *   §6  Catch-up logic
 *   §7  Failure policy
 *   §8  Overlap resolution
 *   §9  ID derivation determinism
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  // Domain types
  validateScheduleInput,
  calculateNextRun,
  enumerateCronOccurrences,
  resolveCatchUp,
  deriveScheduleId,
  deriveOccurrenceId,
  deriveOccurrenceIdempotencyKey,
  deriveSchedulerOwnerId,
  isValidScheduleTimezone,
  validateCronExpression,
  validateScheduleTransition,
  isScheduleTerminal,
  isScheduleEligibleForDispatch,
  // Policy
  evaluateFailurePolicy,
  resolveOverlap,
  evaluateScheduleBudget,
  makeEmptyTickSummary,
  // Types
  type DiscoverySchedule,
  type ScheduleOccurrence,
} from "@workspace/db";

import {
  DEFAULT_SCHEDULER_CONFIG,
  loadSchedulerConfig,
  validateSchedulerConfig,
} from "../lib/discovery-scheduler-config.js";
import { ScheduledDispatcher } from "../lib/discovery-scheduler-dispatcher.js";
import { runSchedulerTick, recoverStaleOccurrences } from "../lib/discovery-scheduler-tick.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSchedule(overrides: Partial<DiscoverySchedule> = {}): DiscoverySchedule {
  const now = new Date("2026-07-12T12:00:00Z");
  return {
    id:                  "sched::test::abc123",
    clientId:            "client-A",
    name:                "Test Schedule",
    status:              "active",
    executionMode:       "live",
    cronExpr:            "0 * * * *",
    timezone:            "UTC",
    nextRunAt:           new Date(now.getTime() - 5 * 60 * 1000),
    lastRunAt:           new Date(now.getTime() - 65 * 60 * 1000),
    lastSuccessAt:       new Date(now.getTime() - 65 * 60 * 1000),
    consecutiveFailures: 0,
    maxCostPerRunUsd:    1.0,
    maxRequestsPerRun:   50,
    catchUpPolicy:       "skip_missed",
    maxCatchUpCount:     3,
    overlapPolicy:       "skip",
    pauseReason:         null,
    contextSnapshot:     null,
    providerPolicy:      null,
    createdBy:           null,
    updatedBy:           null,
    createdAt:           new Date("2026-01-01T00:00:00Z"),
    updatedAt:           now,
    version:             1,
    ...overrides,
  };
}

function makeOccurrence(overrides: Partial<ScheduleOccurrence> = {}): ScheduleOccurrence {
  const now = new Date("2026-07-12T12:00:00Z");
  return {
    id:                    "occ::sched::test::abc123::1752321600000",
    scheduleId:            "sched::test::abc123",
    clientId:              "client-A",
    intendedAt:            new Date(now.getTime() - 5 * 60 * 1000),
    status:                "pending",
    runId:                 null,
    idempotencyKey:        "sched_occ::s::t::1000::dry::1",
    catchUpReason:         null,
    overlapPolicyApplied:  null,
    skipReason:            null,
    claimedBy:             "runtime::abc123",
    claimedAt:             now,
    claimExpiresAt:        new Date(now.getTime() + 5 * 60 * 1000),
    dispatchCorrelationId: "occ::sched::test::abc123::1752321600000",
    scheduleVersion:       1,
    createdAt:             now,
    updatedAt:             now,
    ...overrides,
  };
}

// ── §1 Repository audit: bug-fix verification ─────────────────────────────────

describe("§1 Repository bug-fix verification", () => {
  it("BUG-1: releaseSchedulerLeadership SQL has no updated_at reference", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync(
        new URL("../../../../lib/db/src/discovery-c7-repository.ts", import.meta.url).pathname,
        "utf8",
      )
    );
    const releaseBlock = src.slice(
      src.indexOf("export async function releaseSchedulerLeadership"),
      src.indexOf("export async function releaseSchedulerLeadership") + 600,
    );
    expect(releaseBlock).not.toContain("updated_at");
    expect(releaseBlock).toContain("SET released_at = $2");
  });

  it("BUG-2: updateOccurrenceStatus SQL has client_id predicate", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync(
        new URL("../../../../lib/db/src/discovery-c7-repository.ts", import.meta.url).pathname,
        "utf8",
      )
    );
    const updateBlock = src.slice(
      src.indexOf("export async function updateOccurrenceStatus"),
      src.indexOf("export async function updateOccurrenceStatus") + 600,
    );
    expect(updateBlock).toContain("client_id");
    expect(updateBlock).toContain("WHERE id = $1 AND client_id = $2");
  });

  it("BUG-3: atomicAdvanceScheduleNextRun exists and uses optimistic WHERE", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync(
        new URL("../../../../lib/db/src/discovery-c7-repository.ts", import.meta.url).pathname,
        "utf8",
      )
    );
    expect(src).toContain("atomicAdvanceScheduleNextRun");
    const fnBlock = src.slice(
      src.indexOf("export async function atomicAdvanceScheduleNextRun"),
      src.indexOf("export async function atomicAdvanceScheduleNextRun") + 800,
    );
    expect(fnBlock).toContain("next_run_at = $3");
    expect(fnBlock).toContain("RETURNING *");
    expect(fnBlock).toContain("status = 'active'");
  });

  it("leadership table schema has no updated_at column", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync(
        new URL("../../../../lib/db/src/schema/discovery-schedules.ts", import.meta.url).pathname,
        "utf8",
      )
    );
    const leadershipBlock = src.slice(
      src.indexOf("discoverySchedulerLeadershipTable"),
      src.indexOf("discoverySchedulerLeadershipTable") + 600,
    );
    expect(leadershipBlock).not.toContain("updated_at");
    expect(leadershipBlock).toContain("releasedAt");
  });
});

// ── §2 Schedule domain primitives ─────────────────────────────────────────────

describe("§2 Schedule domain primitives", () => {
  describe("validateScheduleInput", () => {
    it("passes a fully valid schedule input", () => {
      const result = validateScheduleInput({
        name:             "My Schedule",
        cronExpr:         "0 * * * *",
        timezone:         "America/Chicago",
        executionMode:    "dry",
        maxCostPerRunUsd: 0.5,
        maxRequestsPerRun: 20,
        catchUpPolicy:    "skip_missed",
        overlapPolicy:    "skip",
        maxCatchUpCount:  3,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("fails when name is empty", () => {
      const result = validateScheduleInput({ name: "", cronExpr: "0 * * * *", timezone: "UTC", executionMode: "dry" });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === "name")).toBe(true);
    });

    it("fails when cronExpr is invalid", () => {
      const result = validateScheduleInput({ name: "S", cronExpr: "not-a-cron", timezone: "UTC", executionMode: "dry" });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === "cronExpr")).toBe(true);
    });

    it("fails when timezone is invalid", () => {
      const result = validateScheduleInput({ name: "S", cronExpr: "0 * * * *", timezone: "Not/Real", executionMode: "dry" });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === "timezone")).toBe(true);
    });

    it("fails when executionMode is invalid", () => {
      const result = validateScheduleInput({ name: "S", cronExpr: "0 * * * *", timezone: "UTC", executionMode: "other" as never });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === "executionMode")).toBe(true);
    });

    it("fails when maxCostPerRunUsd > 100", () => {
      const result = validateScheduleInput({ name: "S", cronExpr: "0 * * * *", timezone: "UTC", executionMode: "dry", maxCostPerRunUsd: 200 });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === "maxCostPerRunUsd")).toBe(true);
    });
  });

  describe("validateCronExpression", () => {
    it("accepts standard 5-field cron", () => {
      expect(validateCronExpression("0 9 * * 1-5")).toBeNull();
    });
    it("accepts @hourly alias equivalent", () => {
      expect(validateCronExpression("0 * * * *")).toBeNull();
    });
    it("rejects invalid expressions", () => {
      expect(validateCronExpression("bad")).not.toBeNull();
      expect(validateCronExpression("60 * * * *")).not.toBeNull();
    });
    it("rejects empty string", () => {
      expect(validateCronExpression("")).not.toBeNull();
    });
  });

  describe("isValidScheduleTimezone", () => {
    it("accepts valid IANA timezones", () => {
      expect(isValidScheduleTimezone("UTC")).toBe(true);
      expect(isValidScheduleTimezone("America/New_York")).toBe(true);
      expect(isValidScheduleTimezone("Europe/London")).toBe(true);
    });
    it("rejects invalid timezones", () => {
      expect(isValidScheduleTimezone("Not/Real")).toBe(false);
      expect(isValidScheduleTimezone("")).toBe(false);
      expect(isValidScheduleTimezone(null)).toBe(false);
    });
  });

  describe("calculateNextRun", () => {
    it("returns a date strictly after the reference", () => {
      const after = new Date("2026-07-12T14:30:00Z");
      const next  = calculateNextRun("0 * * * *", "UTC", after);
      expect(next).not.toBeNull();
      expect(next!.getTime()).toBeGreaterThan(after.getTime());
    });

    it("returns the top of the next hour for an hourly cron", () => {
      const after = new Date("2026-07-12T14:30:00Z");
      const next  = calculateNextRun("0 * * * *", "UTC", after);
      expect(next?.toISOString()).toBe("2026-07-12T15:00:00.000Z");
    });

    it("returns null for an invalid cron", () => {
      const next = calculateNextRun("bad", "UTC", new Date());
      expect(next).toBeNull();
    });

    it("respects the timezone when computing next run", () => {
      const after = new Date("2026-07-12T12:00:00Z");
      const next  = calculateNextRun("0 9 * * *", "America/New_York", after);
      expect(next).not.toBeNull();
      expect(next!.getUTCHours()).toBe(13);
    });
  });

  describe("enumerateCronOccurrences", () => {
    it("returns all occurrences in the window", () => {
      const start = new Date("2026-07-12T10:00:00Z");
      const end   = new Date("2026-07-12T13:00:00Z");
      const occurrences = enumerateCronOccurrences("0 * * * *", "UTC", start, end, 10);
      expect(occurrences).toHaveLength(3);
      expect(occurrences[0]!.toISOString()).toBe("2026-07-12T11:00:00.000Z");
      expect(occurrences[2]!.toISOString()).toBe("2026-07-12T13:00:00.000Z");
    });

    it("respects maxCount", () => {
      const start = new Date("2026-07-12T10:00:00Z");
      const end   = new Date("2026-07-12T20:00:00Z");
      const occurrences = enumerateCronOccurrences("0 * * * *", "UTC", start, end, 3);
      expect(occurrences).toHaveLength(3);
    });

    it("returns empty array when window is in the past with no cron matches", () => {
      const start = new Date("2026-07-12T10:00:00Z");
      const end   = new Date("2026-07-12T10:30:00Z");
      const occurrences = enumerateCronOccurrences("0 * * * *", "UTC", start, end, 10);
      expect(occurrences).toHaveLength(0);
    });
  });

  describe("FSM transitions", () => {
    it("active → paused is valid", () => {
      expect(validateScheduleTransition("active", "paused")).toBe(true);
    });
    it("active → archived is NOT valid (must go through paused/disabled first)", () => {
      expect(validateScheduleTransition("active", "archived")).toBe(false);
    });
    it("archived is terminal", () => {
      expect(isScheduleTerminal("archived")).toBe(true);
      expect(isScheduleTerminal("active")).toBe(false);
    });
    it("only active is eligible for dispatch", () => {
      expect(isScheduleEligibleForDispatch("active")).toBe(true);
      expect(isScheduleEligibleForDispatch("paused")).toBe(false);
      expect(isScheduleEligibleForDispatch("error_blocked")).toBe(false);
    });
  });
});

// ── §3 Scheduler config ───────────────────────────────────────────────────────

describe("§3 Scheduler config", () => {
  it("default config is disabled", () => {
    expect(DEFAULT_SCHEDULER_CONFIG.enabled).toBe(false);
  });

  it("default config is conservative (dry override false, low tick count)", () => {
    expect(DEFAULT_SCHEDULER_CONFIG.dryRunOverride).toBe(false);
    expect(DEFAULT_SCHEDULER_CONFIG.maxSchedulesPerTick).toBeLessThanOrEqual(10);
  });

  it("loadSchedulerConfig returns disabled when env var is absent", () => {
    const original = process.env.DISCOVERY_SCHEDULER_ENABLED;
    delete process.env.DISCOVERY_SCHEDULER_ENABLED;
    const cfg = loadSchedulerConfig();
    expect(cfg.enabled).toBe(false);
    if (original !== undefined) process.env.DISCOVERY_SCHEDULER_ENABLED = original;
  });

  it("loadSchedulerConfig enables when env var is 'true'", () => {
    const original = process.env.DISCOVERY_SCHEDULER_ENABLED;
    process.env.DISCOVERY_SCHEDULER_ENABLED = "true";
    const cfg = loadSchedulerConfig();
    expect(cfg.enabled).toBe(true);
    if (original !== undefined) process.env.DISCOVERY_SCHEDULER_ENABLED = original;
    else delete process.env.DISCOVERY_SCHEDULER_ENABLED;
  });

  it("validateSchedulerConfig rejects tick interval < 5s", () => {
    const result = validateSchedulerConfig({ ...DEFAULT_SCHEDULER_CONFIG, enabled: true, tickIntervalMs: 1000 });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("tickIntervalMs"))).toBe(true);
  });

  it("validateSchedulerConfig rejects leadershipTtlMs < tickIntervalMs", () => {
    const result = validateSchedulerConfig({
      ...DEFAULT_SCHEDULER_CONFIG,
      enabled: true,
      tickIntervalMs: 30_000,
      leadershipTtlMs: 20_000,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("leadershipTtlMs"))).toBe(true);
  });

  it("validateSchedulerConfig passes for valid config", () => {
    const result = validateSchedulerConfig(DEFAULT_SCHEDULER_CONFIG);
    expect(result.valid).toBe(true);
  });
});

// ── §4 Dispatcher (mocked) ────────────────────────────────────────────────────

describe("§4 Dispatcher", () => {
  function makePool(overrides: Record<string, unknown> = {}): typeof import("@workspace/db").pool {
    return {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
      ...overrides,
    } as unknown as typeof import("@workspace/db").pool;
  }

  function makeExecutionService(resultOverride?: Partial<{
    status: string; runId: string; error: string;
  }>) {
    const result = {
      status: resultOverride?.status ?? "complete",
      runId:  resultOverride?.runId  ?? "run-xyz",
      ...(resultOverride?.error ? { error: resultOverride.error } : {}),
    };
    return {
      execute: vi.fn().mockResolvedValue(result),
    } as unknown as import("../lib/discovery-execution-service.js").DiscoveryExecutionService;
  }

  const mockContextResolver = vi.fn().mockResolvedValue({
    clientId:         "client-A",
    clientName:       "Test Client",
    currentWeek:      "2026-W28",
    month:            7,
    snapshotId:       "pending",
    discoveryServices: [],
    serviceAreas:     [],
    location:         { city: "Test", state: "AL", region: "Test Region" },
    region:           "Test Region",
    industry:         "pest_control",
    industryLabel:    "Pest Control",
    topics:           ["test"],
    aiSearchGapScore: 50,
    registry: {
      matchByTopic:           () => null,
      getGeneratableServices: () => [],
      getServices:            () => [],
      getActiveServices:      () => [],
      getServicesByTopic:     () => [],
    },
  });

  beforeEach(() => { mockContextResolver.mockClear(); });

  it("dispatched → returns dispatched with runId on complete execution", async () => {
    const pool    = makePool();
    const service = makeExecutionService({ status: "complete", runId: "run-123" });
    const dispatcher = new ScheduledDispatcher(pool, service);

    const result = await dispatcher.dispatch({
      schedule:        makeSchedule(),
      occurrence:      makeOccurrence(),
      now:             new Date("2026-07-12T12:00:00Z"),
      dryRunOverride:  false,
      contextResolver: mockContextResolver,
    });

    expect(result.result).toBe("dispatched");
    if (result.result === "dispatched") {
      expect(result.runId).toBe("run-123");
      expect(result.executionStatus).toBe("complete");
    }
    expect(service.execute).toHaveBeenCalledOnce();
  });

  it("passes actorType=system and schedule id as actorId to execute()", async () => {
    const pool    = makePool();
    const service = makeExecutionService();
    const sched   = makeSchedule({ id: "sched::client-A::aaabbbcccddd" });
    const dispatcher = new ScheduledDispatcher(pool, service);

    await dispatcher.dispatch({
      schedule:        sched,
      occurrence:      makeOccurrence({ scheduleId: sched.id }),
      now:             new Date("2026-07-12T12:00:00Z"),
      dryRunOverride:  false,
      contextResolver: mockContextResolver,
    });

    const callArgs = (service.execute as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.actor.actorType).toBe("system");
    expect(callArgs.actor.actorId).toBe("sched::client-A::aaabbbcccddd");
  });

  it("dryRunOverride skips execute() and returns dry_run_simulated status", async () => {
    const pool       = makePool();
    const service    = makeExecutionService();
    const dispatcher = new ScheduledDispatcher(pool, service);

    const result = await dispatcher.dispatch({
      schedule:        makeSchedule({ executionMode: "live" }),
      occurrence:      makeOccurrence(),
      now:             new Date("2026-07-12T12:00:00Z"),
      dryRunOverride:  true,
      contextResolver: mockContextResolver,
    });

    expect(service.execute).not.toHaveBeenCalled();
    expect(result.result).toBe("dispatched");
    if (result.result === "dispatched") {
      expect(result.executionStatus).toBe("dry_run_simulated");
      expect(result.runId).toMatch(/^dry::/);
    }
  });

  it("context_failed when contextResolver returns null", async () => {
    const pool    = makePool();
    const service = makeExecutionService();
    const dispatcher = new ScheduledDispatcher(pool, service);

    const result = await dispatcher.dispatch({
      schedule:        makeSchedule(),
      occurrence:      makeOccurrence(),
      now:             new Date("2026-07-12T12:00:00Z"),
      dryRunOverride:  false,
      contextResolver: vi.fn().mockResolvedValue(null),
    });

    expect(result.result).toBe("context_failed");
    expect(service.execute).not.toHaveBeenCalled();
  });

  it("context_failed when contextResolver throws", async () => {
    const pool    = makePool();
    const service = makeExecutionService();
    const dispatcher = new ScheduledDispatcher(pool, service);

    const result = await dispatcher.dispatch({
      schedule:        makeSchedule(),
      occurrence:      makeOccurrence(),
      now:             new Date("2026-07-12T12:00:00Z"),
      dryRunOverride:  false,
      contextResolver: vi.fn().mockRejectedValue(new Error("DB connection lost")),
    });

    expect(result.result).toBe("context_failed");
    expect(service.execute).not.toHaveBeenCalled();
  });

  it("lease_denied when execution returns lease_denied", async () => {
    const pool    = makePool();
    const service = makeExecutionService({ status: "lease_denied", runId: "run-aaa" });
    const dispatcher = new ScheduledDispatcher(pool, service);

    const result = await dispatcher.dispatch({
      schedule:        makeSchedule(),
      occurrence:      makeOccurrence(),
      now:             new Date("2026-07-12T12:00:00Z"),
      dryRunOverride:  false,
      contextResolver: mockContextResolver,
    });

    expect(result.result).toBe("lease_denied");
  });

  it("error when execute() throws", async () => {
    const pool    = makePool();
    const service = {
      execute: vi.fn().mockRejectedValue(new Error("provider timeout")),
    } as unknown as import("../lib/discovery-execution-service.js").DiscoveryExecutionService;
    const dispatcher = new ScheduledDispatcher(pool, service);

    const result = await dispatcher.dispatch({
      schedule:        makeSchedule(),
      occurrence:      makeOccurrence(),
      now:             new Date("2026-07-12T12:00:00Z"),
      dryRunOverride:  false,
      contextResolver: mockContextResolver,
    });

    expect(result.result).toBe("error");
    if (result.result === "error") {
      expect(result.message).toContain("provider timeout");
    }
  });
});

// ── §5 Tick (mocked) ──────────────────────────────────────────────────────────

describe("§5 Scheduler tick", () => {
  function makePool(overrides: Record<string, unknown> = {}) {
    return {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      ...overrides,
    } as unknown as typeof import("@workspace/db").pool;
  }

  function makeService() {
    return {
      execute: vi.fn().mockResolvedValue({ status: "complete", runId: "run-tick-test" }),
    } as unknown as import("../lib/discovery-execution-service.js").DiscoveryExecutionService;
  }

  it("returns 'none' leadership state when pool query fails", async () => {
    const pool = {
      query: vi.fn().mockRejectedValue(new Error("connection refused")),
    } as unknown as typeof import("@workspace/db").pool;

    const summary = await runSchedulerTick({
      pool,
      config:           { ...DEFAULT_SCHEDULER_CONFIG, enabled: true },
      executionService: makeService(),
      ownerId:          "test-owner",
      now:              new Date("2026-07-12T12:00:00Z"),
    });

    expect(summary.leadershipState).toBe("none");
    expect(summary.schedulesFound).toBe(0);
    expect(summary.tickCompletedAt).not.toBeNull();
  });

  it("returns 'none' leadership state when leadership not acquired", async () => {
    const pool = makePool({
      query: vi.fn()
        // acquireSchedulerLeadership: INSERT → nothing, SELECT → returns another owner
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ owner_id: "other-owner", expires_at: new Date(Date.now() + 60000).toISOString(), released_at: null }], rowCount: 1 }),
    });

    const summary = await runSchedulerTick({
      pool,
      config:           { ...DEFAULT_SCHEDULER_CONFIG, enabled: true },
      executionService: makeService(),
      ownerId:          "test-owner",
      now:              new Date("2026-07-12T12:00:00Z"),
    });

    expect(summary.leadershipState).toBe("none");
    expect(summary.schedulesFound).toBe(0);
  });

  it("makeEmptyTickSummary has correct initial state", () => {
    const now     = new Date("2026-07-12T12:00:00Z");
    const summary = makeEmptyTickSummary("owner-1", now, "acquired");
    expect(summary.ownerId).toBe("owner-1");
    expect(summary.leadershipState).toBe("acquired");
    expect(summary.schedulesFound).toBe(0);
    expect(summary.schedulesClaimed).toBe(0);
    expect(summary.occurrencesDispatched).toBe(0);
    expect(summary.occurrencesSkipped).toBe(0);
    expect(summary.occurrencesError).toBe(0);
    expect(summary.outcomes).toHaveLength(0);
    expect(summary.tickCompletedAt).toBeNull();
  });

  it("tick with leadership wins + 0 due schedules returns correct summary shape", async () => {
    const pool = makePool({
      query: vi.fn()
        // acquireSchedulerLeadership: INSERT (no-op), SELECT (returns this owner)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ owner_id: "test-owner", expires_at: new Date(Date.now() + 90000).toISOString(), released_at: null }], rowCount: 1 })
        // renew UPDATE
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        // findDueSchedules → empty
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        // recoverStaleOccurrences → empty
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }),
    });

    const summary = await runSchedulerTick({
      pool,
      config:           { ...DEFAULT_SCHEDULER_CONFIG, enabled: true },
      executionService: makeService(),
      ownerId:          "test-owner",
      now:              new Date("2026-07-12T12:00:00Z"),
    });

    expect(summary.schedulesFound).toBe(0);
    expect(summary.schedulesClaimed).toBe(0);
    expect(summary.occurrencesDispatched).toBe(0);
    expect(summary.tickCompletedAt).not.toBeNull();
  });
});

// ── §6 Catch-up logic ─────────────────────────────────────────────────────────

describe("§6 Catch-up policy", () => {
  const base = {
    cronExpr:      "0 * * * *",
    timezone:      "UTC",
    catchUpPolicy: "skip_missed" as const,
    maxCatchUpCount: 3,
  };

  it("skip_missed with multiple missed returns empty occurrencesToDispatch", () => {
    const now         = new Date("2026-07-12T15:00:00Z");
    const lastRunAt   = new Date("2026-07-12T10:00:00Z");
    const nextRunAt   = new Date("2026-07-12T11:00:00Z");
    const resolution = resolveCatchUp({ ...base, nextRunAt, lastRunAt }, now);
    expect(resolution.reason).toBe("skip_missed");
    expect(resolution.occurrencesToDispatch).toHaveLength(0);
    expect(resolution.skippedCount).toBeGreaterThan(0);
  });

  it("run_latest with multiple missed returns only the latest", () => {
    const now       = new Date("2026-07-12T15:00:00Z");
    const lastRunAt = new Date("2026-07-12T10:00:00Z");
    const nextRunAt = new Date("2026-07-12T11:00:00Z");
    const resolution = resolveCatchUp({
      ...base, catchUpPolicy: "run_latest", nextRunAt, lastRunAt,
    }, now);
    expect(resolution.occurrencesToDispatch).toHaveLength(1);
    expect(resolution.occurrencesToDispatch[0]!.toISOString()).toBe("2026-07-12T14:00:00.000Z");
  });

  it("run_all_bounded with 5 missed returns at most maxCatchUpCount occurrences", () => {
    const now       = new Date("2026-07-12T15:00:00Z");
    const lastRunAt = new Date("2026-07-12T09:00:00Z");
    const nextRunAt = new Date("2026-07-12T10:00:00Z");
    const resolution = resolveCatchUp({
      ...base, catchUpPolicy: "run_all_bounded", maxCatchUpCount: 3, nextRunAt, lastRunAt,
    }, now);
    expect(resolution.occurrencesToDispatch.length).toBeLessThanOrEqual(3);
  });

  it("no_missed when nextRunAt is in the future", () => {
    const now     = new Date("2026-07-12T12:00:00Z");
    const resolution = resolveCatchUp({
      ...base,
      nextRunAt: new Date("2026-07-12T13:00:00Z"),
      lastRunAt: new Date("2026-07-12T11:00:00Z"),
    }, now);
    expect(resolution.occurrencesToDispatch).toHaveLength(0);
    expect(resolution.reason).toBe("no_missed");
  });
});

// ── §7 Failure policy ─────────────────────────────────────────────────────────

describe("§7 Failure policy", () => {
  it("skipped_overlap failure does not increment consecutive count", () => {
    const result = evaluateFailurePolicy(2, "skipped_overlap");
    expect(result.action).toBe("retry_next_normal");
    expect(result.newConsecutiveCount).toBe(2);
  });

  it("transient_provider increments count and applies delay", () => {
    const result = evaluateFailurePolicy(0, "transient_provider");
    expect(result.action).toBe("retry_with_delay");
    expect(result.newConsecutiveCount).toBe(1);
    expect(result.delayMs).toBeGreaterThan(0);
  });

  it("pauses schedule at pauseThreshold", () => {
    const result = evaluateFailurePolicy(2, "transient_provider", {
      pauseThreshold: 3, errorBlockThreshold: 10, baseDelayMs: 300_000, maxDelayMs: 14_400_000,
    });
    expect(result.action).toBe("pause_schedule");
    expect(result.newConsecutiveCount).toBe(3);
  });

  it("error-blocks schedule at errorBlockThreshold", () => {
    const result = evaluateFailurePolicy(9, "permanent_provider", {
      pauseThreshold: 3, errorBlockThreshold: 10, baseDelayMs: 300_000, maxDelayMs: 14_400_000,
    });
    expect(result.action).toBe("error_block_schedule");
    expect(result.newConsecutiveCount).toBe(10);
  });
});

// ── §8 Overlap resolution ─────────────────────────────────────────────────────

describe("§8 Overlap resolution", () => {
  it("dispatches when no active runs regardless of policy", () => {
    const result = resolveOverlap("skip", 0, 0, true);
    expect(result.decision).toBe("dispatch");
  });

  it("skip policy skips when active run exists", () => {
    const result = resolveOverlap("skip", 1, 0, true);
    expect(result.decision).toBe("skip");
  });

  it("queue_one queues when active=1 and pending=0", () => {
    const result = resolveOverlap("queue_one", 1, 0, true);
    expect(result.decision).toBe("queue_one");
  });

  it("queue_one skips when queue is already full (pending >= 1)", () => {
    const result = resolveOverlap("queue_one", 1, 1, true);
    expect(result.decision).toBe("skip");
  });

  it("allow policy dispatches when governance allows", () => {
    const result = resolveOverlap("allow", 1, 0, true);
    expect(result.decision).toBe("dispatch");
  });

  it("allow policy is denied when governance blocks", () => {
    const result = resolveOverlap("allow", 1, 0, false);
    expect(result.decision).toBe("deny_governance");
  });

  it("evaluateScheduleBudget allows within limits", () => {
    const result = evaluateScheduleBudget(0.5, 25, {
      maxCostPerRunUsd: 1.0, maxRequestsPerRun: 50, globalEmergencyPause: false,
    });
    expect(result.allowed).toBe(true);
  });

  it("evaluateScheduleBudget denies when globalEmergencyPause is true", () => {
    const result = evaluateScheduleBudget(0, 0, {
      maxCostPerRunUsd: 1.0, maxRequestsPerRun: 50, globalEmergencyPause: true,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("global_emergency_pause");
    }
  });

  it("evaluateScheduleBudget denies when cost ceiling exceeded", () => {
    const result = evaluateScheduleBudget(2.0, 10, {
      maxCostPerRunUsd: 1.0, maxRequestsPerRun: 50, globalEmergencyPause: false,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("cost_ceiling_exceeded");
    }
  });
});

// ── §9 ID derivation ──────────────────────────────────────────────────────────

describe("§9 ID derivation", () => {
  it("deriveScheduleId is deterministic", () => {
    expect(deriveScheduleId("client-A", "My Schedule")).toBe(
      deriveScheduleId("client-A", "My Schedule"),
    );
  });

  it("deriveScheduleId differs across clients", () => {
    expect(deriveScheduleId("client-A", "My Schedule")).not.toBe(
      deriveScheduleId("client-B", "My Schedule"),
    );
  });

  it("deriveOccurrenceId is deterministic for same (schedule, time)", () => {
    const t = new Date("2026-07-12T12:00:00Z");
    expect(deriveOccurrenceId("sched::x", t)).toBe(deriveOccurrenceId("sched::x", t));
  });

  it("deriveOccurrenceId differs across schedules", () => {
    const t = new Date("2026-07-12T12:00:00Z");
    expect(deriveOccurrenceId("sched::A", t)).not.toBe(deriveOccurrenceId("sched::B", t));
  });

  it("deriveOccurrenceIdempotencyKey includes mode and version", () => {
    const t   = new Date("2026-07-12T12:00:00Z");
    const dry  = deriveOccurrenceIdempotencyKey("sched::X", t, "dry",  1);
    const live = deriveOccurrenceIdempotencyKey("sched::X", t, "live", 1);
    const v2   = deriveOccurrenceIdempotencyKey("sched::X", t, "dry",  2);
    expect(dry).not.toBe(live);
    expect(dry).not.toBe(v2);
  });

  it("deriveSchedulerOwnerId is deterministic for same correlationId", () => {
    expect(deriveSchedulerOwnerId("corr-123")).toBe(deriveSchedulerOwnerId("corr-123"));
  });
});

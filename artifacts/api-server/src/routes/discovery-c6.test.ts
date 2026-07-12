/**
 * C6 Lifecycle Governance — Integration Tests
 *
 * Covers the 10 required scenarios:
 *   1.  deriveRunId is scoped per clientId (tenant isolation)
 *   2.  deriveRunId is deterministic
 *   3.  CancellationSignal initial state
 *   4.  CancellationSignal.request() transitions state
 *   5.  shouldCancel returns false for NullCancellationToken
 *   6.  shouldCancel returns true for a cancelled signal
 *   7.  Pipeline with pre-cancelled token → status "cancelled", no provider calls
 *   8.  Pipeline mid-run cancellation → partial signals preserved, Stage 3 not called
 *   9.  Rate limiter key is scoped per (userId × clientId) — cross-tenant isolation
 *   10. deriveIdempotencyId scoped per clientId — same key, different client → different IDs
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Pure library imports — no DB connection needed for most tests
import {
  deriveRunId,
  CancellationSignal,
  NullCancellationToken,
  shouldCancel,
  discoveryRateLimiter,
  deriveIdempotencyId,
  DiscoveryPipeline,
} from "@workspace/db";
import type { DiscoveryContext } from "@workspace/db";

// ── Mock helpers ───────────────────────────────────────────────────────────────

/**
 * Minimal DiscoveryContext for pipeline tests.
 * Uses `as unknown as DiscoveryContext` because not every field
 * matters for these unit-level pipeline tests.
 */
function makeMockContext(clientId: string): DiscoveryContext {
  return {
    clientId,
    clientName:      `Client ${clientId}`,
    currentWeek:     "2026-W28",
    month:           7,
    snapshotId:      "pending",
    discoveryServices: [],
    serviceAreas:    ["Foley, AL"],
    location:        { city: "Foley", state: "AL", region: "Gulf Coast" },
    region:          "Gulf Coast",
    industry:        "pest_control",
    industryLabel:   "Pest Control",
    topics:          ["bed bugs", "pest control"],
    aiSearchGapScore: 50,
    registry: {
      matchByTopic:          () => null,
      getGeneratableServices: () => [],
      getServices:           () => [],
      getActiveServices:     () => [],
      getServicesByTopic:    () => [],
    },
  } as unknown as DiscoveryContext;
}

/** Raw keyword result shape expected by normalizeKeywordResult */
function makeRawKeyword(keyword: string) {
  return {
    keyword,
    searchVolume:    100,
    cpc:             1.5,
    competition:     0.4,
    trend:           "stable" as const,
    relatedKeywords: [],
  };
}

// ── T1: Tenant isolation — run IDs are scoped per clientId ────────────────────

describe("T1: deriveRunId tenant isolation", () => {
  const WEEK = "2026-W28";

  it("produces different IDs for different clients on the same week", () => {
    const idA = deriveRunId("client-A", WEEK);
    const idB = deriveRunId("client-B", WEEK);
    expect(idA).not.toBe(idB);
    expect(idA).toContain("client-A");
    expect(idB).toContain("client-B");
  });

  it("T2: deriveRunId is deterministic — same inputs always produce same output", () => {
    const id1 = deriveRunId("client-A", WEEK);
    const id2 = deriveRunId("client-A", WEEK);
    expect(id1).toBe(id2);
  });

  it("produces different IDs for the same client on different weeks", () => {
    const idW28 = deriveRunId("client-A", "2026-W28");
    const idW29 = deriveRunId("client-A", "2026-W29");
    expect(idW28).not.toBe(idW29);
  });
});

// ── T3: CancellationSignal initial state ─────────────────────────────────────

describe("T3: CancellationSignal initial state", () => {
  it("starts with isCancelled=false and cancelledAt=null", () => {
    const signal = new CancellationSignal();
    expect(signal.isCancelled).toBe(false);
    expect(signal.cancelledAt).toBeNull();
    expect(signal.cancellationReasonCode).toBeNull();
  });

  it("T4: request() transitions to cancelled state", () => {
    const signal = new CancellationSignal();
    const before = Date.now();
    signal.request("User clicked cancel", "user_requested");
    const after = Date.now();

    expect(signal.isCancelled).toBe(true);
    expect(signal.cancellationReasonCode).toBe("user_requested");
    expect(signal.cancelledAt).not.toBeNull();
    expect(signal.cancelledAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(signal.cancelledAt!.getTime()).toBeLessThanOrEqual(after);
  });

  it("T5: NullCancellationToken.isCancelled is always false", () => {
    expect(NullCancellationToken.isCancelled).toBe(false);
    expect(NullCancellationToken.cancelledAt).toBeNull();
  });

  it("T6: shouldCancel returns false for NullCancellationToken", () => {
    expect(shouldCancel(NullCancellationToken, "before_execution")).toBe(false);
    expect(shouldCancel(NullCancellationToken, "between_stages")).toBe(false);
  });

  it("shouldCancel returns true for a cancelled signal", () => {
    const signal = new CancellationSignal();
    signal.request("Cancelled", "user_requested");
    expect(shouldCancel(signal, "before_execution")).toBe(true);
    expect(shouldCancel(signal, "between_stages")).toBe(true);
  });
});

// ── T7: Pipeline with pre-cancelled token → no provider calls ─────────────────

describe("T7: Pipeline cancellation — pre-cancelled before_execution", () => {
  it("returns status 'cancelled' without invoking any provider", async () => {
    const fetchKeywords = vi.fn();
    const fetchPAA      = vi.fn();
    const probeQuery    = vi.fn();

    const pipeline = new DiscoveryPipeline({
      search: {
        name: "test_fixture", fetchKeywords,
        fetchCompetitorKeywords: vi.fn(),
      },
      paa:      { name: "test_fixture", fetchPAA },
      aiSearch: { name: "test_fixture", probeQuery },
    });

    const signal = new CancellationSignal();
    signal.request("Test pre-cancel", "user_requested"); // cancelled BEFORE run

    const ctx     = makeMockContext("tenant-X");
    const summary = await pipeline.run(ctx, signal);

    expect(summary.status).toBe("cancelled");
    expect(summary.clientId).toBe("tenant-X");
    expect(fetchKeywords).not.toHaveBeenCalled();
    expect(fetchPAA).not.toHaveBeenCalled();
    expect(probeQuery).not.toHaveBeenCalled();
  });
});

// ── T8: Pipeline mid-run cancellation preserves partial signals ───────────────

describe("T8: Pipeline mid-run cancellation — partial signals preserved", () => {
  it("Stage 3 (PAA) is not called when token cancelled during Stage 2 fetchKeywords", async () => {
    const cancelSignal = new CancellationSignal();

    // Stage 2: fetchKeywords runs, returns signals, AND requests cancellation
    const fetchKeywords = vi.fn().mockImplementation(async () => {
      // Signal cancellation inside Stage 2 so the between-stage check fires next
      cancelSignal.request("Cancelled during Stage 2", "user_requested");
      return [
        makeRawKeyword("bed bug inspection"),
        makeRawKeyword("pest control Foley"),
      ];
    });

    const fetchPAA = vi.fn(); // should NEVER be called

    const pipeline = new DiscoveryPipeline({
      search: {
        name: "test_fixture", fetchKeywords,
        fetchCompetitorKeywords: vi.fn(),
      },
      paa: { name: "test_fixture", fetchPAA },
    });

    const ctx     = makeMockContext("tenant-Y");
    const summary = await pipeline.run(ctx, cancelSignal);

    // Pipeline must honour the cancellation
    expect(summary.status).toBe("cancelled");

    // Stage 2 ran and produced signals before cancellation was observed
    // (signals are collected inside Stage 2 before the between-stage check)
    expect(summary.allSignals.length).toBeGreaterThan(0);

    // Stage 3 must NOT have run
    expect(fetchPAA).not.toHaveBeenCalled();

    // Cancelled summary is still scoped to the correct client
    expect(summary.clientId).toBe("tenant-Y");
    expect(summary.runId).toContain("tenant-Y");
  });
});

// ── T9: Rate limiter scoping ───────────────────────────────────────────────────

describe("T9: Rate limiter per-(userId × clientId) scoping", () => {
  beforeEach(() => {
    // Reset rate limiter between tests so limits from one test don't bleed
    discoveryRateLimiter.reset("live_run", "user-1", "client-A");
    discoveryRateLimiter.reset("live_run", "user-1", "client-B");
    discoveryRateLimiter.reset("live_run", "user-2", "client-A");
  });

  it("exhausting clientA's limit does NOT deny clientB for the same user", () => {
    // Use up all available slots for user-1+clientA
    let allowed = true;
    for (let i = 0; i < 100 && allowed; i++) {
      const result = discoveryRateLimiter.check("live_run", "user-1", "client-A");
      allowed = result.allowed;
    }
    // At this point, client-A's limit for user-1 must be exhausted
    const afterExhaust = discoveryRateLimiter.check("live_run", "user-1", "client-A");
    expect(afterExhaust.allowed).toBe(false);

    // client-B's limit for user-1 is NOT affected — independent key
    const clientBResult = discoveryRateLimiter.check("live_run", "user-1", "client-B");
    expect(clientBResult.allowed).toBe(true);
  });

  it("exhausting user-1's limit for clientA does NOT deny user-2 for clientA", () => {
    let allowed = true;
    for (let i = 0; i < 100 && allowed; i++) {
      const result = discoveryRateLimiter.check("live_run", "user-1", "client-A");
      allowed = result.allowed;
    }
    const afterExhaust = discoveryRateLimiter.check("live_run", "user-1", "client-A");
    expect(afterExhaust.allowed).toBe(false);

    // Different user is NOT affected
    const user2Result = discoveryRateLimiter.check("live_run", "user-2", "client-A");
    expect(user2Result.allowed).toBe(true);
  });
});

// ── T10: Idempotency key scoping ──────────────────────────────────────────────

describe("T10: Idempotency key isolation across clients", () => {
  it("same idempotency key for different clients produces different IDs", () => {
    const KEY = "my-replay-key";
    const idA = deriveIdempotencyId("client-A", KEY, "manual_run", false);
    const idB = deriveIdempotencyId("client-B", KEY, "manual_run", false);

    expect(idA).not.toBe(idB);
    // Both should be non-empty strings
    expect(typeof idA).toBe("string");
    expect(typeof idB).toBe("string");
    expect(idA.length).toBeGreaterThan(0);
    expect(idB.length).toBeGreaterThan(0);
  });

  it("same clientId + same key always produces the same ID (deterministic)", () => {
    const id1 = deriveIdempotencyId("client-A", "replay-key", "manual_run", false);
    const id2 = deriveIdempotencyId("client-A", "replay-key", "manual_run", false);
    expect(id1).toBe(id2);
  });

  it("dry-run and live-run produce different IDs for the same key (operation scoping)", () => {
    const dryId  = deriveIdempotencyId("client-A", "key1", "dry_run", true);
    const liveId = deriveIdempotencyId("client-A", "key1", "manual_run", false);
    expect(dryId).not.toBe(liveId);
  });
});

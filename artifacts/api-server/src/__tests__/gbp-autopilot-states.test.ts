/**
 * GBP → Content Autopilot — Behavioral tests (Area 4)
 *
 * Verifies runtime behaviour of the Content Autopilot state machine and scheduler:
 *
 *   publishDuePosts (scheduler tick):
 *     - T4.1  Does not dispatch when no approved posts are due
 *     - T4.2  Dispatches fetch for each approved+due post
 *     - T4.3  Approval gate: query includes approvalStatus IN (approved, auto_approved)
 *     - T4.4  inFlight guard prevents duplicate dispatch within one tick
 *     - T4.5  inFlight entry is added before fetch and removed after (finally)
 *     - T4.6  Network failure marks post as failed via db.update
 *     - T4.7  Failed post is removed from inFlight (finally block)
 *     - T4.8  One failing post does not prevent other posts in the same cycle
 *
 *   Concurrent idempotency:
 *     - T4.9  A post already in inFlight from a prior tick is skipped
 *     - T4.10 Two simultaneous publishDuePosts calls dispatch each post at most once
 *
 * No source-text matching — all assertions operate on mock call records and
 * observable module state (inFlight Set).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
  pool: { query: vi.fn() },
  createWeeklyPlanId:        vi.fn(),
  evaluateClientEligibility: vi.fn(),
  isValidIanaTimezone:       vi.fn(() => true),
  eq:      vi.fn((_col: unknown, val: unknown) => ({ _eq: val })),
  and:     vi.fn((...args: unknown[]) => ({ _and: args })),
  gte:     vi.fn(),
  sql:     vi.fn(),
  inArray: vi.fn((_col: unknown, vals: unknown) => ({ _inArray: vals })),
}));

vi.mock("@workspace/db/schema", () => ({
  socialPostsTable: {
    id:             "id",
    userId:         "userId",
    status:         "status",
    scheduledAt:    "scheduledAt",
    approvalStatus: "approvalStatus",
    errorMessage:   "errorMessage",
    updatedAt:      "updatedAt",
    weeklyPlanId:   "weeklyPlanId",
  },
  leadsTable:               {},
  autoContentSettingsTable: {},
  clientsTable:             {},
}));

vi.mock("drizzle-orm", () => ({
  eq:      vi.fn((_col: unknown, val: unknown) => ({ _eq: val })),
  and:     vi.fn((...args: unknown[]) => ({ _and: args })),
  gte:     vi.fn(),
  sql:     vi.fn(),
  inArray: vi.fn((_col: unknown, vals: unknown) => ({ _inArray: vals })),
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("../lib/scheduler-secret", () => ({
  SCHEDULER_SECRET: "test-secret",
}));

vi.mock("../lib/sms", () => ({
  sendSms: vi.fn(),
}));

import { publishDuePosts, inFlight } from "../lib/scheduler.js";
import { db } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { socialPostsTable } from "@workspace/db/schema";

function selectReturning(rows: unknown[]) {
  vi.mocked(db.select).mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  } as never);
}

function makeUpdateChain() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  };
}

function goodFetch() {
  return vi.fn().mockResolvedValue({
    ok:   true,
    json: async () => ({ ok: true, status: "published" }),
  });
}

describe("publishDuePosts — approval gate & scheduling (T4.1–T4.8)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    inFlight.clear();
    fetchMock = goodFetch();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    inFlight.clear();
  });

  it("T4.1 — does not call fetch when there are no due approved posts", async () => {
    selectReturning([]);

    await publishDuePosts();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("T4.2 — calls fetch once per approved due post", async () => {
    selectReturning([
      { id: "post-1", userId: "user-1" },
      { id: "post-2", userId: "user-2" },
    ]);

    await publishDuePosts();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("T4.3 — approval gate: inArray is called with approvalStatus column and both valid values", async () => {
    selectReturning([]);

    await publishDuePosts();

    const calls = vi.mocked(inArray).mock.calls;
    const approvalCall = calls.find(
      (args) => Array.isArray(args[1]) && (args[1] as string[]).includes("approved"),
    );
    expect(approvalCall).toBeDefined();
    const values = approvalCall?.[1] as string[];
    expect(values).toContain("approved");
    expect(values).toContain("auto_approved");
  });

  it("T4.4 — inFlight guard: post already in set is skipped without dispatching", async () => {
    inFlight.add("post-in-progress");
    selectReturning([{ id: "post-in-progress", userId: "user-1" }]);

    await publishDuePosts();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("T4.5 — post is added to inFlight before fetch and removed after (finally block)", async () => {
    let wasInFlightDuringFetch = false;

    fetchMock = vi.fn().mockImplementation(async () => {
      wasInFlightDuringFetch = inFlight.has("post-lifecycle");
      return { ok: true, json: async () => ({ ok: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    selectReturning([{ id: "post-lifecycle", userId: "user-1" }]);

    await publishDuePosts();

    expect(wasInFlightDuringFetch).toBe(true);
    expect(inFlight.has("post-lifecycle")).toBe(false);
  });

  it("T4.6 — network failure: db.update is called to mark post as failed", async () => {
    fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(db.update).mockReturnValue(makeUpdateChain() as never);

    selectReturning([{ id: "post-fail", userId: "user-1" }]);

    await publishDuePosts();

    expect(db.update).toHaveBeenCalledWith(socialPostsTable);
  });

  it("T4.7 — failed post is removed from inFlight (finally block on error path)", async () => {
    fetchMock = vi.fn().mockRejectedValue(new Error("timeout"));
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(db.update).mockReturnValue(makeUpdateChain() as never);

    selectReturning([{ id: "post-crash", userId: "user-1" }]);

    await publishDuePosts();

    expect(inFlight.has("post-crash")).toBe(false);
  });

  it("T4.8 — one failing post does not prevent remaining posts from being dispatched", async () => {
    vi.mocked(db.update).mockReturnValue(makeUpdateChain() as never);

    fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    selectReturning([
      { id: "post-fail", userId: "user-1" },
      { id: "post-good", userId: "user-2" },
    ]);

    await publishDuePosts();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("publishDuePosts — concurrent idempotency (T4.9–T4.10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inFlight.clear();
    vi.stubGlobal("fetch", goodFetch());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    inFlight.clear();
  });

  it("T4.9 — post in inFlight from a prior in-progress tick is skipped by a second tick", async () => {
    const fetchMock = goodFetch();
    vi.stubGlobal("fetch", fetchMock);

    inFlight.add("post-already-dispatched");
    selectReturning([{ id: "post-already-dispatched", userId: "user-1" }]);

    await publishDuePosts();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("T4.10 — two simultaneous publishDuePosts calls dispatch each post at most once", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return { ok: true, json: async () => ({ ok: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    selectReturning([{ id: "post-race", userId: "user-1" }]);

    await Promise.all([publishDuePosts(), publishDuePosts()]);

    const postFetchCalls = fetchMock.mock.calls.filter(
      (args: unknown[]) =>
        typeof args[0] === "string" && (args[0] as string).includes("post-race"),
    );
    expect(postFetchCalls.length).toBeLessThanOrEqual(1);
  });
});

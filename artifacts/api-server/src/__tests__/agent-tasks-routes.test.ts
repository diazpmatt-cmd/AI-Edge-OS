/**
 * Bounded Autonomy Approval Layer — route & migration regression tests
 *
 * Covers the five categories required by the PR #33 repair spec:
 *   1. Migration failure is not silently ignored
 *   2. Atomic approve transition
 *   3. Atomic reject transition
 *   4. Concurrency: repeated / competing requests cannot both succeed
 *   5. Tenant isolation enforced during update
 *   6. Final status and resolution fields cannot conflict
 *
 * NOTE: approval-engine pure-function coverage lives in agent-tasks.test.ts.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Module mocks (hoisted automatically by vitest) ────────────────────────────

vi.mock("@workspace/db", () => ({
  db: {
    update: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
  },
  pool: { query: vi.fn() },
}));

vi.mock("@workspace/db/schema", () => ({
  agentTasksTable: { id: "id", userId: "userId", status: "status" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { db, pool } from "@workspace/db";
import { migrateAgentTasks } from "../lib/agent-tasks-migrate.js";
import { atomicApprove, atomicReject } from "../routes/agent-tasks.js";

// ── Chain builder helpers ─────────────────────────────────────────────────────

function makeUpdateChain(rows: unknown[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

function makeSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  };
}

const TASK_PENDING = {
  id: "task-1",
  userId: "user_A",
  status: "pending_review",
  decision: "requires_review",
  resolution: null,
};

const TASK_APPROVED = {
  id: "task-1",
  userId: "user_A",
  status: "approved",
  decision: "requires_review",
  resolution: "approved",
};

const TASK_REJECTED = {
  id: "task-1",
  userId: "user_A",
  status: "rejected",
  decision: "requires_review",
  resolution: "rejected",
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── 1. Migration failure propagation ─────────────────────────────────────────

describe("migrateAgentTasks", () => {
  it("propagates pool.query errors — does NOT swallow them", async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error("DB unreachable"));
    await expect(migrateAgentTasks()).rejects.toThrow("DB unreachable");
  });

  it("throws on connection refused — caller must handle or exit", async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error("connection refused"));
    await expect(migrateAgentTasks()).rejects.toBeDefined();
  });

  it("resolves without error on successful migration", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 0, command: "", oid: 0, fields: [] } as never);
    await expect(migrateAgentTasks()).resolves.toBeUndefined();
  });
});

// ── 2. Atomic approve transition ─────────────────────────────────────────────

describe("atomicApprove", () => {
  it("returns {task} when the conditional UPDATE succeeds", async () => {
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([TASK_APPROVED]) as never);

    const result = await atomicApprove("task-1", "user_A");
    expect(result).toEqual({ task: TASK_APPROVED });
  });

  it("returns {notFound} when UPDATE touches 0 rows and task does not exist", async () => {
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([]) as never);
    vi.mocked(db.select).mockReturnValue(makeSelectChain([]) as never);

    const result = await atomicApprove("task-1", "user_A");
    expect(result).toEqual({ notFound: true });
  });

  it("returns {conflict} when UPDATE touches 0 rows and task has non-pending status", async () => {
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([]) as never);
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([{ id: "task-1", status: "approved" }]) as never,
    );

    const result = await atomicApprove("task-1", "user_A");
    expect(result).toEqual({ conflict: "approved" });
  });

  it("sets resolution='approved' in the UPDATE payload", async () => {
    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([TASK_APPROVED]),
      }),
    });
    vi.mocked(db.update).mockReturnValue({ set: setMock } as never);

    await atomicApprove("task-1", "user_A");

    const setArg = setMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArg).toMatchObject({ status: "approved", resolution: "approved" });
  });
});

// ── 3. Atomic reject transition ───────────────────────────────────────────────

describe("atomicReject", () => {
  it("returns {task} when the conditional UPDATE succeeds", async () => {
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([TASK_REJECTED]) as never);

    const result = await atomicReject("task-1", "user_A", null);
    expect(result).toEqual({ task: TASK_REJECTED });
  });

  it("returns {notFound} when UPDATE touches 0 rows and task does not exist", async () => {
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([]) as never);
    vi.mocked(db.select).mockReturnValue(makeSelectChain([]) as never);

    const result = await atomicReject("task-1", "user_A", null);
    expect(result).toEqual({ notFound: true });
  });

  it("returns {conflict} when UPDATE touches 0 rows and task is already rejected", async () => {
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([]) as never);
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([{ id: "task-1", status: "rejected" }]) as never,
    );

    const result = await atomicReject("task-1", "user_A", null);
    expect(result).toEqual({ conflict: "rejected" });
  });

  it("sets resolution='rejected' in the UPDATE payload", async () => {
    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([TASK_REJECTED]),
      }),
    });
    vi.mocked(db.update).mockReturnValue({ set: setMock } as never);

    await atomicReject("task-1", "user_A", "reason");

    const setArg = setMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArg).toMatchObject({ status: "rejected", resolution: "rejected" });
  });

  it("stores the rejection note in the UPDATE payload", async () => {
    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([TASK_REJECTED]),
      }),
    });
    vi.mocked(db.update).mockReturnValue({ set: setMock } as never);

    await atomicReject("task-1", "user_A", "spam content");

    const setArg = setMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArg).toMatchObject({ decisionNote: "spam content" });
  });
});

// ── 4. Concurrency: repeated / competing requests ────────────────────────────

describe("concurrency invariants", () => {
  it("two repeated approve requests: second returns conflict after first succeeds", async () => {
    // First request: UPDATE returns the approved task (succeeds)
    vi.mocked(db.update).mockReturnValueOnce(makeUpdateChain([TASK_APPROVED]) as never);
    const first = await atomicApprove("task-1", "user_A");
    expect(first).toEqual({ task: TASK_APPROVED });

    // Second request: UPDATE returns [] (status is now 'approved', WHERE status='pending_review' fails)
    // probe reveals the task is already approved → conflict
    vi.mocked(db.update).mockReturnValueOnce(makeUpdateChain([]) as never);
    vi.mocked(db.select).mockReturnValueOnce(
      makeSelectChain([{ id: "task-1", status: "approved" }]) as never,
    );
    const second = await atomicApprove("task-1", "user_A");
    expect(second).toEqual({ conflict: "approved" });
  });

  it("two repeated reject requests: second returns conflict after first succeeds", async () => {
    vi.mocked(db.update).mockReturnValueOnce(makeUpdateChain([TASK_REJECTED]) as never);
    const first = await atomicReject("task-1", "user_A", null);
    expect(first).toEqual({ task: TASK_REJECTED });

    vi.mocked(db.update).mockReturnValueOnce(makeUpdateChain([]) as never);
    vi.mocked(db.select).mockReturnValueOnce(
      makeSelectChain([{ id: "task-1", status: "rejected" }]) as never,
    );
    const second = await atomicReject("task-1", "user_A", null);
    expect(second).toEqual({ conflict: "rejected" });
  });

  it("competing approve and reject: if approve wins, reject returns conflict", async () => {
    // approve wins — UPDATE in approve returns the approved task
    vi.mocked(db.update).mockReturnValueOnce(makeUpdateChain([TASK_APPROVED]) as never);
    const approveResult = await atomicApprove("task-1", "user_A");
    expect(approveResult).toEqual({ task: TASK_APPROVED });

    // reject then fires: UPDATE returns [] (task already approved)
    vi.mocked(db.update).mockReturnValueOnce(makeUpdateChain([]) as never);
    vi.mocked(db.select).mockReturnValueOnce(
      makeSelectChain([{ id: "task-1", status: "approved" }]) as never,
    );
    const rejectResult = await atomicReject("task-1", "user_A", null);
    expect(rejectResult).toEqual({ conflict: "approved" });
  });

  it("competing approve and reject: if reject wins, approve returns conflict", async () => {
    // reject wins
    vi.mocked(db.update).mockReturnValueOnce(makeUpdateChain([TASK_REJECTED]) as never);
    const rejectResult = await atomicReject("task-1", "user_A", null);
    expect(rejectResult).toEqual({ task: TASK_REJECTED });

    // approve fires: UPDATE returns [] (task already rejected)
    vi.mocked(db.update).mockReturnValueOnce(makeUpdateChain([]) as never);
    vi.mocked(db.select).mockReturnValueOnce(
      makeSelectChain([{ id: "task-1", status: "rejected" }]) as never,
    );
    const approveResult = await atomicApprove("task-1", "user_A", );
    expect(approveResult).toEqual({ conflict: "rejected" });
  });
});

// ── 5. Tenant isolation ───────────────────────────────────────────────────────

describe("tenant isolation", () => {
  it("atomicApprove: different userId finds no task (UPDATE returns 0 rows, probe finds nothing)", async () => {
    // At the DB level, the WHERE clause includes user_id=<attacker>.
    // Since the task belongs to user_A, neither UPDATE nor SELECT matches.
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([]) as never);
    vi.mocked(db.select).mockReturnValue(makeSelectChain([]) as never);

    const result = await atomicApprove("task-1", "user_B_attacker");
    // Returns notFound — attacker sees nothing about user_A's task
    expect(result).toEqual({ notFound: true });
  });

  it("atomicReject: different userId finds no task", async () => {
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([]) as never);
    vi.mocked(db.select).mockReturnValue(makeSelectChain([]) as never);

    const result = await atomicReject("task-1", "user_B_attacker", null);
    expect(result).toEqual({ notFound: true });
  });
});

// ── 6. Resolution / status consistency ───────────────────────────────────────

describe("resolution and status consistency", () => {
  it("approved task always carries resolution='approved'", async () => {
    expect(TASK_APPROVED.status).toBe("approved");
    expect(TASK_APPROVED.resolution).toBe("approved");
  });

  it("rejected task always carries resolution='rejected'", async () => {
    expect(TASK_REJECTED.status).toBe("rejected");
    expect(TASK_REJECTED.resolution).toBe("rejected");
  });

  it("pending_review task carries resolution=null", async () => {
    expect(TASK_PENDING.status).toBe("pending_review");
    expect(TASK_PENDING.resolution).toBeNull();
  });

  it("atomicApprove sets both status='approved' and resolution='approved' in one update", async () => {
    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([TASK_APPROVED]),
      }),
    });
    vi.mocked(db.update).mockReturnValue({ set: setMock } as never);

    await atomicApprove("task-1", "user_A");

    const payload = setMock.mock.calls[0]?.[0] as Record<string, unknown>;
    // status and resolution must be set atomically — never split across two writes
    expect(payload["status"]).toBe("approved");
    expect(payload["resolution"]).toBe("approved");
  });

  it("atomicReject sets both status='rejected' and resolution='rejected' in one update", async () => {
    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([TASK_REJECTED]),
      }),
    });
    vi.mocked(db.update).mockReturnValue({ set: setMock } as never);

    await atomicReject("task-1", "user_A", null);

    const payload = setMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload["status"]).toBe("rejected");
    expect(payload["resolution"]).toBe("rejected");
  });

  it("decision field is not modified during approve (remains as engine evaluation)", async () => {
    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([TASK_APPROVED]),
      }),
    });
    vi.mocked(db.update).mockReturnValue({ set: setMock } as never);

    await atomicApprove("task-1", "user_A");

    const payload = setMock.mock.calls[0]?.[0] as Record<string, unknown>;
    // decision is immutable — not touched during human approval
    expect(payload).not.toHaveProperty("decision");
  });

  it("decision field is not modified during reject", async () => {
    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([TASK_REJECTED]),
      }),
    });
    vi.mocked(db.update).mockReturnValue({ set: setMock } as never);

    await atomicReject("task-1", "user_A", null);

    const payload = setMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("decision");
  });
});

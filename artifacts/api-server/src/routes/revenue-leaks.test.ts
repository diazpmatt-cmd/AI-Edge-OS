import { describe, expect, it, vi } from "vitest";
import { createRevenueLeaksHandler } from "./revenue-leaks.js";

function response() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe("createRevenueLeaksHandler", () => {
  it("rejects unauthenticated callers before resolving tenant or loading evidence", async () => {
    const resolveClient = vi.fn();
    const loadEvidence = vi.fn();
    const handler = createRevenueLeaksHandler(
      (() => ({ userId: null })) as any,
      resolveClient as any,
      loadEvidence as any,
    );
    const res = response();

    await handler({}, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(resolveClient).not.toHaveBeenCalled();
    expect(loadEvidence).not.toHaveBeenCalled();
  });

  it("loads evidence only for the authenticated tenant clientId", async () => {
    const loadEvidence = vi.fn(async () => ({ leads: [], attributions: [] }));
    const handler = createRevenueLeaksHandler(
      (() => ({ userId: "user_a" })) as any,
      (async () => ({ ok: true, clientId: "client_a", clientName: "A", slug: "a" })) as any,
      loadEvidence as any,
      () => new Date("2026-08-17T02:30:00.000Z"),
    );
    const res = response();

    await handler({}, res);

    expect(loadEvidence).toHaveBeenCalledTimes(1);
    expect(loadEvidence).toHaveBeenCalledWith("client_a");
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      generatedAt: "2026-08-17T02:30:00.000Z",
      summary: { total: 0, revenueRisks: 0, proofGaps: 0, verifiedRevenueAtIssue: 0 },
      items: [],
    });
  });

  it("fails closed for inactive or unknown tenants", async () => {
    for (const [reason, status] of [["inactive", 403], ["not_found", 404]] as const) {
      const loadEvidence = vi.fn();
      const handler = createRevenueLeaksHandler(
        (() => ({ userId: "user_a" })) as any,
        (async () => ({ ok: false, reason })) as any,
        loadEvidence as any,
      );
      const res = response();

      await handler({}, res);

      expect(res.status).toHaveBeenCalledWith(status);
      expect(loadEvidence).not.toHaveBeenCalled();
    }
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/client-resolver.js", () => ({
  resolveClientActiveCheck: vi.fn(),
}));
vi.mock("../services/lead-conversion", () => ({
  updateLeadConversionStage: vi.fn(),
}));

import { createLeadConversionHandler } from "../routes/lead-conversion";

function response() {
  const res: any = { statusCode: 200, payload: undefined };
  res.status = vi.fn((code: number) => { res.statusCode = code; return res; });
  res.json = vi.fn((payload: unknown) => { res.payload = payload; return res; });
  return res;
}

describe("lead conversion tenant boundary", () => {
  it("requires authentication before resolving a tenant", async () => {
    const resolveTenant = vi.fn();
    const update = vi.fn();
    const handler = createLeadConversionHandler(
      vi.fn(() => ({ userId: null })) as any,
      resolveTenant as any,
      update as any,
    );
    const res = response();

    await handler({ params: { id: "lead-other" }, body: { stage: "won" } }, res);

    expect(res.statusCode).toBe(401);
    expect(resolveTenant).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("blocks inactive tenants before any lead mutation", async () => {
    const update = vi.fn();
    const handler = createLeadConversionHandler(
      vi.fn(() => ({ userId: "user-a" })) as any,
      vi.fn().mockResolvedValue({ ok: false, reason: "inactive" }) as any,
      update as any,
    );
    const res = response();

    await handler({ params: { id: "lead-a" }, body: { stage: "booked" } }, res);

    expect(res.statusCode).toBe(403);
    expect(res.payload).toEqual({ error: "client_inactive" });
    expect(update).not.toHaveBeenCalled();
  });

  it("passes the resolved client id into the conversion write", async () => {
    const update = vi.fn().mockResolvedValue({ status: "updated", lead: { id: "lead-a", status: "won" } });
    const handler = createLeadConversionHandler(
      vi.fn(() => ({ userId: "user-a" })) as any,
      vi.fn().mockResolvedValue({ ok: true, clientId: "client-a", clientName: "A", slug: "a" }) as any,
      update as any,
    );
    const res = response();

    await handler({ params: { id: "lead-a" }, body: { stage: "won", note: "Booked and paid" } }, res);

    expect(update).toHaveBeenCalledWith("client-a", "lead-a", "won", "Booked and paid");
    expect(res.statusCode).toBe(200);
    expect(res.payload.action).toBe("conversion_updated");
  });

  it("returns not found when the tenant-scoped service cannot see the lead", async () => {
    const update = vi.fn().mockResolvedValue({ status: "not_found", error: "lead_not_found" });
    const handler = createLeadConversionHandler(
      vi.fn(() => ({ userId: "user-a" })) as any,
      vi.fn().mockResolvedValue({ ok: true, clientId: "client-a", clientName: "A", slug: "a" }) as any,
      update as any,
    );
    const res = response();

    await handler({ params: { id: "lead-b" }, body: { stage: "won" } }, res);

    expect(res.statusCode).toBe(404);
    expect(res.payload).toEqual({ error: "lead_not_found" });
    expect(update).toHaveBeenCalledWith("client-a", "lead-b", "won", undefined);
  });
});

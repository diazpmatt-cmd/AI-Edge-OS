import { describe, expect, it, vi } from "vitest";
import { createProofPackHandler } from "./proof-pack.js";

function response() { const res: any = {}; res.status = vi.fn(() => res); res.json = vi.fn(() => res); return res; }
const empty = { leads: [], calls: [], attributions: [], jobs: [], payments: [], reviews: [], referrals: [], referralAttributions: [], posts: [] };

describe("createProofPackHandler", () => {
  it("rejects unauthenticated callers before tenant resolution", async () => {
    const resolve = vi.fn(); const load = vi.fn(); const res = response();
    await createProofPackHandler((() => ({ userId: null })) as any, resolve as any, load as any)({ query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(401); expect(resolve).not.toHaveBeenCalled(); expect(load).not.toHaveBeenCalled();
  });

  it("loads evidence using only the resolved tenant id and slug", async () => {
    const load = vi.fn(async () => empty); const res = response();
    await createProofPackHandler((() => ({ userId: "user-a" })) as any, (async () => ({ ok: true, clientId: "client-a", slug: "tenant-a" })) as any, load as any, () => new Date("2026-08-19T00:00:00.000Z"))({ query: { from: "2026-08-01", to: "2026-09-01", clientId: "attacker" } }, res);
    expect(load).toHaveBeenCalledWith("client-a", "tenant-a");
    expect(res.json.mock.calls[0][0].period).toEqual({ from: "2026-08-01T00:00:00.000Z", toExclusive: "2026-09-01T00:00:00.000Z" });
  });

  it("fails closed for inactive tenants and invalid periods", async () => {
    const load = vi.fn(); const inactive = response();
    await createProofPackHandler((() => ({ userId: "u" })) as any, (async () => ({ ok: false, reason: "inactive" })) as any, load as any)({ query: {} }, inactive);
    expect(inactive.status).toHaveBeenCalledWith(403); expect(load).not.toHaveBeenCalled();
    const invalid = response();
    await createProofPackHandler((() => ({ userId: "u" })) as any, (async () => ({ ok: true, clientId: "c", slug: "s" })) as any, load as any)({ query: { from: "bad", to: "2026-09-01" } }, invalid);
    expect(invalid.status).toHaveBeenCalledWith(422); expect(load).not.toHaveBeenCalled();
  });
});

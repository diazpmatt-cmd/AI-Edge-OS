import { describe, expect, it, vi } from "vitest";

import { authorizeWebLeadsAccess } from "./web-leads-access-policy.js";

describe("authorizeWebLeadsAccess", () => {
  it("rejects unauthenticated callers", () => {
    const isAdmin = vi.fn(() => true);
    expect(authorizeWebLeadsAccess(null, isAdmin)).toEqual({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
    expect(isAdmin).not.toHaveBeenCalled();
  });

  it("rejects authenticated non-admin callers", () => {
    expect(authorizeWebLeadsAccess("user_client", () => false)).toEqual({
      ok: false,
      status: 403,
      error: "APOLLOS_ADMIN_REQUIRED",
    });
  });

  it("allows authenticated Apollos admins", () => {
    expect(authorizeWebLeadsAccess("user_admin", userId => userId === "user_admin")).toEqual({ ok: true });
  });
});

import { describe, expect, it, vi } from "vitest";

import { authorizeAssessmentsAccess } from "./assessments-access-policy.js";

describe("authorizeAssessmentsAccess", () => {
  it("rejects unauthenticated callers", () => {
    const isAdmin = vi.fn(() => true);
    expect(authorizeAssessmentsAccess(null, isAdmin)).toEqual({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
    expect(isAdmin).not.toHaveBeenCalled();
  });

  it("rejects authenticated non-admin callers", () => {
    expect(authorizeAssessmentsAccess("user_client", () => false)).toEqual({
      ok: false,
      status: 403,
      error: "APOLLOS_ADMIN_REQUIRED",
    });
  });

  it("allows authenticated Apollos admins", () => {
    expect(authorizeAssessmentsAccess("user_admin", userId => userId === "user_admin")).toEqual({ ok: true });
  });
});

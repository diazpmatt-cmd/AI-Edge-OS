import { describe, expect, it } from "vitest";

import {
  isApollosAdminUser,
  parseApollosAdminUserIds,
} from "./apollos-admin-access-policy";

describe("Apollos admin access policy", () => {
  it("fails closed for unknown users when no allowlist is configured", () => {
    expect(isApollosAdminUser("user_admin", undefined)).toBe(false);
  });

  it("keeps the canonical owner authorized without an injected allowlist", () => {
    expect(isApollosAdminUser("user_3HkOtNU3q322CdLb2NMPhpPwpiH", undefined)).toBe(true);
    expect(isApollosAdminUser("user_3HkOtNU3q322CdLb2NMPHpPwpiH", undefined)).toBe(false);
  });

  it("matches exact Clerk user IDs only", () => {
    const configured = "user_admin,user_second";
    expect(isApollosAdminUser("user_admin", configured)).toBe(true);
    expect(isApollosAdminUser("user_second", configured)).toBe(true);
    expect(isApollosAdminUser("user", configured)).toBe(false);
    expect(isApollosAdminUser("user_admin_extra", configured)).toBe(false);
  });

  it("trims and deduplicates configured IDs", () => {
    expect(parseApollosAdminUserIds(" user_admin, user_second, user_admin ,, "))
      .toEqual(["user_admin", "user_second"]);
  });
});

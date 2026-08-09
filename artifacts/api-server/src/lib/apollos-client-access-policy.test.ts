import { describe, expect, it } from "vitest";

import {
  normalizeApollosClientAccessLevel,
  selectAuthorizedApollosClient,
} from "./apollos-client-access-policy";

const self = { clientId: "client-self", ownership: "self" as const };
const bbb = { clientId: "client-bbb", ownership: "delegated" as const };
const boatliner = { clientId: "client-boatliner", ownership: "delegated" as const };

describe("normalizeApollosClientAccessLevel", () => {
  it("preserves canonical access levels", () => {
    expect(normalizeApollosClientAccessLevel("viewer")).toBe("viewer");
    expect(normalizeApollosClientAccessLevel("operator")).toBe("operator");
    expect(normalizeApollosClientAccessLevel("owner")).toBe("owner");
  });

  it("fails closed to viewer for unexpected persisted values", () => {
    expect(normalizeApollosClientAccessLevel("admin")).toBe("viewer");
    expect(normalizeApollosClientAccessLevel("")).toBe("viewer");
  });
});

describe("selectAuthorizedApollosClient", () => {
  it("fails closed when the actor has no authorized clients", () => {
    expect(selectAuthorizedApollosClient([], null)).toEqual({ ok: false, reason: "not_found" });
  });

  it("selects the only authorized client without requiring an explicit clientId", () => {
    expect(selectAuthorizedApollosClient([bbb], null)).toEqual({ ok: true, target: bbb });
  });

  it("preserves the actor's self-owned client as the default when delegated clients also exist", () => {
    expect(selectAuthorizedApollosClient([bbb, self, boatliner], null)).toEqual({ ok: true, target: self });
  });

  it("requires explicit selection when multiple delegated clients exist and none is self-owned", () => {
    expect(selectAuthorizedApollosClient([bbb, boatliner], null)).toEqual({
      ok: false,
      reason: "selection_required",
    });
  });

  it("selects an explicitly requested client only when it is in the authorized set", () => {
    expect(selectAuthorizedApollosClient([bbb, boatliner], "client-boatliner")).toEqual({
      ok: true,
      target: boatliner,
    });
  });

  it("rejects a clientId outside the actor's authorized set", () => {
    expect(selectAuthorizedApollosClient([bbb, boatliner], "client-other")).toEqual({
      ok: false,
      reason: "unauthorized",
    });
  });
});

import { describe, expect, it } from "vitest";
import { selectGoogleBusinessLocation } from "../lib/google-business-location-selection";

describe("Google Business OAuth location selection", () => {
  const mainStreet = { name: "locations/mainstreet", title: "MainStreet Web Co." };
  const bbb = { name: "locations/bbb", title: "Bed Bugs and Beyond Pest Control" };

  it("selects BBB when MainStreet is returned first", () => {
    expect(selectGoogleBusinessLocation([mainStreet, bbb])).toEqual({
      kind: "selected",
      location: bbb,
      reason: "business_identity",
    });
  });

  it("selects BBB regardless of Google result order", () => {
    expect(selectGoogleBusinessLocation([bbb, mainStreet])).toMatchObject({
      kind: "selected",
      location: bbb,
    });
  });

  it("fails closed for an unmatched multi-location account", () => {
    const result = selectGoogleBusinessLocation([
      mainStreet,
      { name: "locations/other", title: "Another Company" },
    ]);
    expect(result.kind).toBe("selection_required");
  });

  it("allows the sole location because selection is unambiguous", () => {
    expect(selectGoogleBusinessLocation([mainStreet])).toEqual({
      kind: "selected",
      location: mainStreet,
      reason: "single_location",
    });
  });

  it("returns none for an account with no locations", () => {
    expect(selectGoogleBusinessLocation([])).toEqual({ kind: "none" });
  });
});

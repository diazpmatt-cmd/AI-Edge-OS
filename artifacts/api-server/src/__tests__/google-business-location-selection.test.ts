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

// ── Regression tests: production metadata repair scenarios ────────────────────
//
// These guard against the July 2026 production incident where the connection-
// status poll returned "MainStreet Web Co." because:
//   • locationName was NULL (primaryLocation held the resource name)
//   • verifiedByApi was NULL
//   • The inline guard required both; selection fell through to locs[0]

describe("Google Business location selection — stored identity regression", () => {
  const MAINSTREET = { name: "locations/mainstreet-001", title: "MainStreet Web Co." };
  const BBB        = { name: "locations/15297903476613092613", title: "Bed Bugs and Beyond Pest Control" };

  // Regression 1: mainstreet returned first must never win over a stored primaryLocation
  it("stored primaryLocation (legacy key) wins over MainStreet returned first", () => {
    const result = selectGoogleBusinessLocation([MAINSTREET, BBB], {
      primaryLocation: BBB.name,
    });
    expect(result).toEqual({
      kind: "selected",
      location: BBB,
      reason: "stored_name",
    });
  });

  // Regression 2: stale primaryLocationTitle = "MainStreet" cannot override a stored resource name
  it("stored locationName beats a stale primaryLocationTitle pointing to MainStreet", () => {
    const result = selectGoogleBusinessLocation([MAINSTREET, BBB], {
      locationName:        BBB.name,
      verifiedByApi:       true,
      primaryLocationTitle: "MainStreet Web Co.", // stale legacy field — must be ignored
    });
    expect(result).toEqual({
      kind: "selected",
      location: BBB,
      reason: "stored_name",
    });
  });

  // Regression 3: displayed account resolves to BBB even when only primaryLocation and
  // primaryLocationTitle are stored (the exact production row state that caused the bug)
  it("resolves to BBB when only primaryLocation + primaryLocationTitle are set (no locationName, no verifiedByApi)", () => {
    const result = selectGoogleBusinessLocation([MAINSTREET, BBB], {
      locationName:         null,
      primaryLocation:      BBB.name,
      locationTitle:        null,
      primaryLocationTitle: BBB.title,
      verifiedByApi:        null,
    });
    expect(result).toEqual({
      kind: "selected",
      location: BBB,
      reason: "stored_name",
    });
  });

  // Regression 4: a row that is fully resolved (locationName + verifiedByApi = true) stays on BBB
  // even when a refresh returns MainStreet first
  it("fully-verified locationName preserves BBB across refreshes", () => {
    const result = selectGoogleBusinessLocation([MAINSTREET, BBB], {
      locationName:  BBB.name,
      locationTitle: BBB.title,
      verifiedByApi: true,
    });
    expect(result).toEqual({
      kind: "selected",
      location: BBB,
      reason: "stored_name",
    });
  });

  // Regression 5: an account with no BBB location and no stored identity fails closed —
  // the caller must ask the user to pick
  it("unresolved multi-location account with no stored identity fails closed", () => {
    const result = selectGoogleBusinessLocation(
      [MAINSTREET, { name: "locations/other", title: "Another Pest Co." }],
      { locationName: null, primaryLocation: null, locationTitle: null, primaryLocationTitle: null },
    );
    expect(result.kind).toBe("selection_required");
  });

  // Edge: stored name that no longer appears in the API result falls through to regex
  it("falls through to business_identity regex when stored name is absent from candidates", () => {
    const staleNameLoc = { name: "locations/old-bbb-id", title: "Old BBB Location" };
    const result = selectGoogleBusinessLocation([MAINSTREET, BBB], {
      locationName: staleNameLoc.name, // stale — not in candidates
    });
    // name match fails → falls to regex → finds BBB by title pattern
    expect(result).toEqual({
      kind: "selected",
      location: BBB,
      reason: "business_identity",
    });
  });

  // Edge: stored title match works when resource name has rotated
  it("stored_title fallback resolves BBB when resource name has rotated and no regex match", () => {
    const renamedLocation = { name: "locations/new-id-999", title: "Cornerstone Furniture" };
    const result = selectGoogleBusinessLocation(
      [MAINSTREET, renamedLocation],
      {
        locationName:  null,
        locationTitle: "Cornerstone Furniture",
      },
    );
    expect(result).toEqual({
      kind: "selected",
      location: renamedLocation,
      reason: "stored_title",
    });
  });
});

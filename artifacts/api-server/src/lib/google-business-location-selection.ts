export type GoogleBusinessLocationCandidate = {
  name: string;
  title: string;
};

export type GoogleBusinessLocationSelection =
  | { kind: "selected"; location: GoogleBusinessLocationCandidate; reason: "business_identity" | "single_location" }
  | { kind: "selection_required"; locations: GoogleBusinessLocationCandidate[] }
  | { kind: "none" };

/**
 * Select only when identity is strong or the account has exactly one location.
 * Google does not promise location ordering, so multi-location accounts must
 * never fall back to the first result.
 */
export function selectGoogleBusinessLocation(
  locations: GoogleBusinessLocationCandidate[],
): GoogleBusinessLocationSelection {
  const identityMatch = locations.find((location) =>
    /bed\s+bugs?.{0,16}beyond/i.test(location.title),
  );

  if (identityMatch) {
    return { kind: "selected", location: identityMatch, reason: "business_identity" };
  }
  if (locations.length === 1) {
    return { kind: "selected", location: locations[0], reason: "single_location" };
  }
  if (locations.length > 1) {
    return { kind: "selection_required", locations };
  }
  return { kind: "none" };
}

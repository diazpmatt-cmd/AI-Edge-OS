export type GoogleBusinessLocationCandidate = {
  name: string;
  title: string;
};

export type GoogleBusinessLocationSelection =
  | {
      kind: "selected";
      location: GoogleBusinessLocationCandidate;
      reason: "stored_name" | "business_identity" | "stored_title" | "single_location";
    }
  | { kind: "selection_required"; locations: GoogleBusinessLocationCandidate[] }
  | { kind: "none" };

/**
 * Stored metadata that provides authoritative identity hints.
 * Any non-null field constrains which location should be selected.
 */
export type GbpStoredIdentity = {
  /** Canonical resource name from a previous selection, e.g. "locations/15297903476613092613" */
  locationName?: string | null;
  /** Legacy key holding the same resource name — used when locationName was not yet written */
  primaryLocation?: string | null;
  /** Canonical title from a previous verified selection */
  locationTitle?: string | null;
  /** Legacy key holding the same title — used when locationTitle was not yet written */
  primaryLocationTitle?: string | null;
  /** True only when a previous API call explicitly confirmed the identity */
  verifiedByApi?: boolean | null;
};

const normTitle = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const BBB_PATTERN = /bed\s*bugs?.{0,20}beyond/i;

/**
 * Select only when identity is strong or the account has exactly one location.
 * Google does not promise location ordering, so multi-location accounts must
 * never fall back to the first result.
 *
 * Priority order (first match wins):
 * 1. Exact resource-name match against stored locationName / primaryLocation
 * 2. Business-identity regex match (BBB pattern)
 * 3. Normalized title match against stored locationTitle / primaryLocationTitle
 * 4. Single-location account (unambiguous)
 * 5. selection_required — caller must ask the user to choose
 */
export function selectGoogleBusinessLocation(
  locations: GoogleBusinessLocationCandidate[],
  stored?: GbpStoredIdentity,
): GoogleBusinessLocationSelection {
  if (locations.length === 0) return { kind: "none" };

  // 1. Exact resource-name match — most authoritative; works even after a title change
  const storedName = stored?.locationName ?? stored?.primaryLocation ?? null;
  if (storedName) {
    const nameMatch = locations.find(l => l.name === storedName);
    if (nameMatch) return { kind: "selected", location: nameMatch, reason: "stored_name" };
  }

  // 2. Business-identity regex (BBB pattern) — survives location-name rotation
  const identityMatch = locations.find(l => BBB_PATTERN.test(l.title));
  if (identityMatch) return { kind: "selected", location: identityMatch, reason: "business_identity" };

  // 3. Normalized title match against stored title (handles minor rename/reformat)
  const storedTitle = stored?.locationTitle ?? stored?.primaryLocationTitle ?? null;
  if (storedTitle) {
    const normStored = normTitle(storedTitle);
    const titleMatch = locations.find(l => normTitle(l.title) === normStored);
    if (titleMatch) return { kind: "selected", location: titleMatch, reason: "stored_title" };
  }

  // 4. Exactly one location — selection is unambiguous regardless of name/title
  if (locations.length === 1) return { kind: "selected", location: locations[0], reason: "single_location" };

  // 5. Ambiguous multi-location account — must prompt the user
  return { kind: "selection_required", locations };
}

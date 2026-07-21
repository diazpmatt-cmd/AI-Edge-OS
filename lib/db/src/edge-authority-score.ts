/**
 * Edge Authority Score — AI Edge OS proprietary scoring
 *
 * A deterministic 0-100 score computed exclusively from real, tenant-scoped
 * backlink evidence stored in the AI Edge OS database.
 *
 * THIS IS NOT a Moz Domain Authority, Ahrefs Domain Rating, or any other
 * third-party metric. It is a proprietary indicator owned by AI Edge OS.
 *
 * Score components:
 *   Backlink volume  (0–40 pts): log10 scale, 1 000+ backlinks  → 40 pts
 *   Domain diversity (0–30 pts): log10 scale, 100+ ref domains  → 30 pts
 *   Win quality      (0–20 pts): (wonCount / opportunityCount) × 20
 *   Discovery breadth(0–10 pts): log10 scale, 50+ opportunities → 10 pts
 *
 * Fail-closed contract:
 *   Returns null when no qualifying backlink evidence exists
 *   (backlinkCount = 0 AND referringDomainCount = 0).
 *   A null return MUST be rendered as "Unavailable", never as "0".
 *
 * Inputs must come from a live configured provider run.
 * Fixture/demo provider data MUST NOT be passed to this function.
 *
 * See ADR-016 for rationale and governance rules.
 */

export interface EdgeAuthorityScoreInput {
  backlinkCount:        number;
  referringDomainCount: number;
  opportunityCount:     number;
  wonCount:             number;
}

/**
 * Returns a deterministic 0-100 Edge Authority Score, or null when
 * insufficient real backlink evidence exists.
 */
export function computeEdgeAuthorityScore(
  input: EdgeAuthorityScoreInput,
): number | null {
  const { backlinkCount, referringDomainCount, opportunityCount, wonCount } = input;

  // Fail closed: no qualifying backlink evidence
  // opportunityCount alone is insufficient (may originate from fixture/demo runs)
  if (backlinkCount === 0 && referringDomainCount === 0) {
    return null;
  }

  // Backlink volume (0–40 pts): log10 scale, ceiling at 1000 backlinks
  const backlinkComponent = backlinkCount > 0
    ? Math.min(40, Math.round((Math.log10(backlinkCount + 1) / Math.log10(1001)) * 40))
    : 0;

  // Domain diversity (0–30 pts): log10 scale, ceiling at 100 referring domains
  const domainComponent = referringDomainCount > 0
    ? Math.min(30, Math.round((Math.log10(referringDomainCount + 1) / Math.log10(101)) * 30))
    : 0;

  // Win quality (0–20 pts): fraction of discovered opportunities that were won
  const wonRate          = opportunityCount > 0 ? wonCount / opportunityCount : 0;
  const qualityComponent = Math.min(20, Math.round(wonRate * 20));

  // Discovery breadth (0–10 pts): log10 scale, ceiling at 50 opportunities
  const breadthComponent = opportunityCount > 0
    ? Math.min(10, Math.round((Math.log10(opportunityCount + 1) / Math.log10(51)) * 10))
    : 0;

  return Math.min(100, Math.max(0,
    backlinkComponent + domainComponent + qualityComponent + breadthComponent,
  ));
}

/**
 * Returns true when computeEdgeAuthorityScore would produce a non-null value.
 * Use this to gate "Unavailable" display logic.
 */
export function hasQualifyingBacklinkEvidence(input: EdgeAuthorityScoreInput): boolean {
  return computeEdgeAuthorityScore(input) !== null;
}

import { describe, expect, it } from "vitest";
import { matchAttributionCandidate } from "./revenue-attribution-matcher.js";

describe("matchAttributionCandidate", () => {
  it("returns reproducible evidence for an exact normalized phone match", () => {
    expect(matchAttributionCandidate(
      { name: "Alex Lead", phone: "+1 (251) 555-0100" },
      { name: "Different Name", phone: "2515550100" },
    )).toMatchObject({ method: "normalized_phone", confidence: 90 });
  });

  it("keeps a first-name-only match as a low-confidence candidate", () => {
    expect(matchAttributionCandidate(
      { name: "Alex Lead" },
      { name: "Alex Customer" },
    )).toMatchObject({ method: "first_name_candidate", confidence: 25 });
  });

  it("does not invent a candidate without shared evidence", () => {
    expect(matchAttributionCandidate(
      { name: "Alex Lead", phone: "2515550100" },
      { name: "Taylor Customer", phone: "2515550199" },
    )).toBeNull();
  });
});

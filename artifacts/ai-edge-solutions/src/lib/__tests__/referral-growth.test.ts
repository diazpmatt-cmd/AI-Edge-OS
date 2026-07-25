import { describe, expect, it } from "vitest";
import { buildReferralShareUrl } from "../referral-growth";

describe("Referral Growth share links", () => {
  it("builds a public referral URL from the current application origin", () => {
    expect(buildReferralShareUrl(
      "https://aiedgesolutions.online",
      "REF-ABC12345",
    )).toBe("https://aiedgesolutions.online/refer/REF-ABC12345");
  });

  it("removes trailing origin slashes and encodes the code", () => {
    expect(buildReferralShareUrl(
      "https://example.com/",
      "REF TEST",
    )).toBe("https://example.com/refer/REF%20TEST");
  });
});

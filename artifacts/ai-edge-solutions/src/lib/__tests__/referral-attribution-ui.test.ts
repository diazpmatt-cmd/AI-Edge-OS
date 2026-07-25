import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/components/referrals/ReferralAttributionPanel.tsx",
  "utf8",
);

describe("RGE-7 attribution UI", () => {
  it("states that the bridge is read only", () => {
    expect(source).toContain("Read-only candidates");
    expect(source).toContain("No external API");
  });

  it("requires explicit human confirmation", () => {
    expect(source).toContain("window.confirm");
    expect(source).toContain("Confirm link");
  });

  it("keeps absent revenue unavailable", () => {
    expect(source).toContain('"Unavailable"');
  });
});

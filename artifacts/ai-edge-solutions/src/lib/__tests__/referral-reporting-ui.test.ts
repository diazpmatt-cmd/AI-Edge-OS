import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(
  "src/components/referrals/ReferralReportingPanel.tsx",
  "utf8",
);

describe("RGE-6 referral reporting UI", () => {
  it("labels missing ROI as unavailable", () => {
    expect(source).toContain('row.roi === null ? "Unavailable"');
  });

  it("explains that revenue requires an explicit measured link", () => {
    expect(source).toContain("explicitly");
    expect(source).toContain("measured revenue");
  });

  it("does not present missing revenue as zero", () => {
    expect(source).toContain('value === null');
    expect(source).toContain('"—"');
  });
});

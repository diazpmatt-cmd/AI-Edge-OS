import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/components/referrals/ReferralReadinessPanel.tsx",
  "utf8",
);

describe("RGE-8 readiness UI", () => {
  it("separates implementation from production acceptance", () => {
    expect(source).toContain(
      "Local implementation does not equal production acceptance",
    );
  });

  it("states that autonomy remains disabled", () => {
    expect(source).toContain("Autonomous");
    expect(source).toContain("disabled");
  });

  it("shows safety and unresolved work queues", () => {
    expect(source).toContain("Emergency stop engaged");
    expect(source).toContain("Open fraud reviews");
    expect(source).toContain("Failed deliveries");
  });
});

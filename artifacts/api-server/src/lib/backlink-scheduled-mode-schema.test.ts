import { describe, expect, it } from "vitest";

import { isBacklinkScheduledModeConstraintReady } from "./backlink-scheduled-mode-schema.js";

describe("isBacklinkScheduledModeConstraintReady", () => {
  it("accepts the expanded manual and scheduled constraint", () => {
    expect(isBacklinkScheduledModeConstraintReady(
      "CHECK ((mode = ANY (ARRAY['manual'::text, 'scheduled'::text])))",
    )).toBe(true);
  });

  it("rejects the legacy manual-only constraint", () => {
    expect(isBacklinkScheduledModeConstraintReady(
      "CHECK ((mode = 'manual'::text))",
    )).toBe(false);
  });

  it("rejects a missing constraint", () => {
    expect(isBacklinkScheduledModeConstraintReady(null)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { sanitizeDeliveryDiagnostic } from "./apollos-weekly-delivery-status";

describe("weekly delivery status documentation invariant", () => {
  it("keeps empty provider diagnostics operator-safe", () => {
    expect(sanitizeDeliveryDiagnostic(null)).toBe(
      "No provider diagnostic was recorded.",
    );
  });
});

import { describe, expect, it } from "vitest";

import { webLeadMutationSchema } from "./leads";

describe("Web Leads company-sales mutation contract", () => {
  it("accepts only bounded existing Web Leads states", () => {
    for (const status of ["new", "contacted", "closed", "lost"]) {
      expect(webLeadMutationSchema.safeParse({ status }).success).toBe(true);
    }
    expect(webLeadMutationSchema.safeParse({ status: "won" }).success).toBe(false);
  });

  it("bounds notes and rejects empty or unknown mutations", () => {
    expect(webLeadMutationSchema.safeParse({ notes: "Synthetic acceptance note" }).success).toBe(true);
    expect(webLeadMutationSchema.safeParse({ notes: "x".repeat(5001) }).success).toBe(false);
    expect(webLeadMutationSchema.safeParse({}).success).toBe(false);
    expect(webLeadMutationSchema.safeParse({ status: "new", clientId: "other-tenant" }).success).toBe(false);
  });
});

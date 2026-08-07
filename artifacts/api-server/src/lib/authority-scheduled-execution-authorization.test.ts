import { describe, expect, it } from "vitest";

import { readAuthorityScheduledExecutionAuthorization } from "./authority-scheduled-execution-authorization.js";

describe("Authority scheduled execution authorization", () => {
  it("fails closed when the flag is missing", () => {
    expect(readAuthorityScheduledExecutionAuthorization({})).toMatchObject({
      authorized: false,
      code: "AUTHORITY_SCHEDULED_EXECUTION_NOT_AUTHORIZED",
    });
  });

  it("accepts only the exact explicit true value", () => {
    expect(readAuthorityScheduledExecutionAuthorization({
      AUTHORITY_SCHEDULED_BACKLINK_EXECUTION_ENABLED: "true",
    })).toMatchObject({
      authorized: true,
      code: "AUTHORITY_SCHEDULED_EXECUTION_AUTHORIZED",
    });
  });

  it("rejects ambiguous truthy values", () => {
    for (const value of ["TRUE", "1", "yes", "on", " true "]) {
      expect(readAuthorityScheduledExecutionAuthorization({
        AUTHORITY_SCHEDULED_BACKLINK_EXECUTION_ENABLED: value,
      }).authorized).toBe(false);
    }
  });
});

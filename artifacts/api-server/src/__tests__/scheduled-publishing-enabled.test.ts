import { describe, expect, it } from "vitest";
import { resolveScheduledPublishingOwner } from "../lib/scheduled-publishing-enabled.js";

describe("scheduled publishing ownership", () => {
  it("fails closed when both switches are absent", () => {
    expect(resolveScheduledPublishingOwner({})).toBe("disabled");
  });

  it("enables only the dedicated monitor for an exact true value", () => {
    expect(
      resolveScheduledPublishingOwner({ SCHEDULED_PUBLISHING_ENABLED: "true" }),
    ).toBe("dedicated_monitor");
    expect(
      resolveScheduledPublishingOwner({ SCHEDULED_PUBLISHING_ENABLED: "TRUE" }),
    ).toBe("disabled");
    expect(
      resolveScheduledPublishingOwner({ SCHEDULED_PUBLISHING_ENABLED: "1" }),
    ).toBe("disabled");
  });

  it("gives the legacy scheduler ownership when it is enabled", () => {
    expect(resolveScheduledPublishingOwner({ SCHEDULER_ENABLED: "true" })).toBe(
      "legacy_scheduler",
    );
    expect(
      resolveScheduledPublishingOwner({
        SCHEDULER_ENABLED: "true",
        SCHEDULED_PUBLISHING_ENABLED: "true",
      }),
    ).toBe("legacy_scheduler");
  });
});

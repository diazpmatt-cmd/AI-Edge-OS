import { describe, expect, it } from "vitest";

import {
  hasCompleteAdapterDeliveryScope,
  selectLatestAdapterDeliveryAttempts,
} from "./publishing-adapter-receipts";

const row = (
  platform: string,
  attemptNumber: number,
  updatedAt: string,
  id = `${platform}-${attemptNumber}`,
) => ({
  id,
  platform,
  status: "publishing",
  attemptNumber,
  updatedAt,
});

describe("selectLatestAdapterDeliveryAttempts", () => {
  it("selects the highest attempt number independently for each platform", () => {
    const latest = selectLatestAdapterDeliveryAttempts([
      row("facebook", 1, "2026-08-06T20:00:00.000Z"),
      row("google", 1, "2026-08-06T20:01:00.000Z"),
      row("facebook", 2, "2026-08-06T20:02:00.000Z"),
    ]);

    expect(latest.get("facebook")?.id).toBe("facebook-2");
    expect(latest.get("google")?.id).toBe("google-1");
    expect(latest.size).toBe(2);
  });

  it("uses updated time to break an equal-attempt tie", () => {
    const latest = selectLatestAdapterDeliveryAttempts([
      row("facebook", 2, "2026-08-06T20:02:00.000Z", "older"),
      row("facebook", 2, "2026-08-06T20:03:00.000Z", "newer"),
    ]);

    expect(latest.get("facebook")?.id).toBe("newer");
  });

  it("keeps the first row when equal attempts have invalid or equal timestamps", () => {
    const latest = selectLatestAdapterDeliveryAttempts([
      row("facebook", 1, "invalid", "first"),
      row("facebook", 1, "invalid", "second"),
    ]);

    expect(latest.get("facebook")?.id).toBe("first");
  });
});

describe("hasCompleteAdapterDeliveryScope", () => {
  it("requires a latest delivery row for every expected platform", () => {
    const latest = selectLatestAdapterDeliveryAttempts([
      row("facebook", 1, "2026-08-06T20:00:00.000Z"),
      row("google", 1, "2026-08-06T20:01:00.000Z"),
    ]);

    expect(
      hasCompleteAdapterDeliveryScope(["facebook", "google"], latest),
    ).toBe(true);
    expect(
      hasCompleteAdapterDeliveryScope(
        ["facebook", "google", "youtube"],
        latest,
      ),
    ).toBe(false);
    expect(hasCompleteAdapterDeliveryScope([], latest)).toBe(false);
  });
});

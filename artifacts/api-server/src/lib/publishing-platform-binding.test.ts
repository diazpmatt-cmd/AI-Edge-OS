import { describe, expect, it } from "vitest";

import { parsePublishingPlatformBinding } from "./publishing-platform-binding";

describe("parsePublishingPlatformBinding", () => {
  it("normalizes and deduplicates valid platform arrays", () => {
    expect(
      parsePublishingPlatformBinding(
        '[" facebook ","google","facebook","youtube"]',
      ),
    ).toEqual({
      ok: true,
      platforms: ["facebook", "google", "youtube"],
    });
  });

  it.each([
    "not-json",
    '{"platform":"facebook"}',
    '["facebook",""]',
    '["facebook",42]',
    "null",
  ])("fails closed for malformed binding: %s", (raw) => {
    expect(parsePublishingPlatformBinding(raw)).toMatchObject({
      ok: false,
      code: "PLATFORM_BINDING_INVALID",
    });
  });

  it("keeps an empty platform list as a separate valid state", () => {
    expect(parsePublishingPlatformBinding("[]")).toEqual({
      ok: true,
      platforms: [],
    });
  });
});

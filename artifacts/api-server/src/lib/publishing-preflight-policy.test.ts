import { describe, expect, it } from "vitest";

import {
  getPublishRejection,
  parsePublishPlatformBinding,
  shouldTerminallyFailScheduledPost,
} from "./publishing-preflight-policy";

describe("publishing preflight rejection policy", () => {
  it.each([
    "POST_NOT_FOUND",
    "APPROVAL_REQUIRED",
    "PLATFORM_BINDING_INVALID",
    "NO_PLATFORMS_SELECTED",
    "CLAIMS_POLICY_BLOCKED",
  ] as const)("stops a scheduled retry loop for %s", (code) => {
    const rejection = getPublishRejection(code);

    expect(rejection).toMatchObject({
      code,
      retryable: false,
      terminalForScheduledPost: true,
    });
    expect(shouldTerminallyFailScheduledPost(rejection)).toBe(true);
  });

  it("does not overwrite a concurrent in-flight publish", () => {
    const rejection = getPublishRejection("ALREADY_PUBLISHING");

    expect(rejection).toMatchObject({
      retryable: true,
      terminalForScheduledPost: false,
    });
    expect(shouldTerminallyFailScheduledPost(rejection)).toBe(false);
  });

  it("does not turn an already-published race into failed", () => {
    const rejection = getPublishRejection("ALREADY_PUBLISHED");

    expect(rejection).toMatchObject({
      retryable: false,
      terminalForScheduledPost: false,
    });
    expect(shouldTerminallyFailScheduledPost(rejection)).toBe(false);
  });
});

describe("parsePublishPlatformBinding", () => {
  it("normalizes and deduplicates valid platform bindings", () => {
    expect(
      parsePublishPlatformBinding(
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
  ])("fails closed for malformed platform scope: %s", (raw) => {
    expect(parsePublishPlatformBinding(raw)).toMatchObject({
      ok: false,
      code: "PLATFORM_BINDING_INVALID",
    });
  });

  it("keeps an empty array distinct from malformed scope", () => {
    expect(parsePublishPlatformBinding("[]")).toEqual({
      ok: true,
      platforms: [],
    });
  });
});

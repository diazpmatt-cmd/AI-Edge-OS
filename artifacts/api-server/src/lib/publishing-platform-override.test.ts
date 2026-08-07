import { describe, expect, it } from "vitest";

import { resolveInternalPublishPlatformSelection } from "./publishing-platform-override.js";

describe("resolveInternalPublishPlatformSelection", () => {
  it("preserves the full bound platform set when no override is supplied", () => {
    expect(resolveInternalPublishPlatformSelection({
      boundPlatforms: ["facebook", "instagram"],
      rawHeader: undefined,
      internalAuthorized: false,
    })).toEqual({ ok: true, platforms: ["facebook", "instagram"] });
  });

  it("rejects an override without internal authorization", () => {
    const result = resolveInternalPublishPlatformSelection({
      boundPlatforms: ["facebook", "instagram"],
      rawHeader: "instagram",
      internalAuthorized: false,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INTERNAL_PLATFORM_OVERRIDE_FORBIDDEN");
  });

  it("selects exactly one bound platform for an authorized internal request", () => {
    expect(resolveInternalPublishPlatformSelection({
      boundPlatforms: ["facebook", "instagram"],
      rawHeader: " instagram ",
      internalAuthorized: true,
    })).toEqual({ ok: true, platforms: ["instagram"] });
  });

  it("rejects a platform that is not bound to the source post", () => {
    const result = resolveInternalPublishPlatformSelection({
      boundPlatforms: ["facebook", "instagram"],
      rawHeader: "google",
      internalAuthorized: true,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INTERNAL_PLATFORM_OVERRIDE_NOT_BOUND");
  });

  it("rejects array and blank override values", () => {
    expect(resolveInternalPublishPlatformSelection({
      boundPlatforms: ["facebook"],
      rawHeader: ["facebook", "instagram"],
      internalAuthorized: true,
    }).ok).toBe(false);
    expect(resolveInternalPublishPlatformSelection({
      boundPlatforms: ["facebook"],
      rawHeader: "   ",
      internalAuthorized: true,
    }).ok).toBe(false);
  });
});

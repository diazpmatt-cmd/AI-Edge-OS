import { describe, expect, it } from "vitest";

import {
  isAdapterResultsEnvelope,
  mapAdapterResultToDelivery,
} from "./publishing-adapter-result";

describe("mapAdapterResultToDelivery", () => {
  it("requires a durable external receipt for provider success", () => {
    expect(
      mapAdapterResultToDelivery({ ok: true, postId: "external-123" }),
    ).toEqual({
      status: "published",
      externalPostId: "external-123",
      externalPostUrl: null,
      errorMessage: null,
      isPublished: true,
      isFailed: false,
    });

    expect(mapAdapterResultToDelivery({ ok: true })).toMatchObject({
      status: "failed",
      errorMessage:
        "Provider reported success without an external post receipt",
      isPublished: false,
      isFailed: true,
    });
  });

  it("fails closed when a platform result is missing", () => {
    expect(mapAdapterResultToDelivery(undefined)).toMatchObject({
      status: "failed",
      errorMessage: "Platform adapter did not return a result",
    });
  });

  it.each([
    "YouTube requires video content",
    "Instagram requires image content",
    "Skipped because media is unavailable",
  ])("classifies media validation as skipped: %s", (error) => {
    expect(mapAdapterResultToDelivery({ ok: false, error })).toMatchObject({
      status: "skipped",
      isFailed: false,
    });
  });

  it("sanitizes provider errors", () => {
    const decision = mapAdapterResultToDelivery({
      ok: false,
      error: "Bearer secret-token provider failed",
    });

    expect(decision).toMatchObject({ status: "failed", isFailed: true });
    expect(decision.errorMessage).toContain("[REDACTED]");
    expect(decision.errorMessage).not.toContain("secret-token");
  });
});

describe("isAdapterResultsEnvelope", () => {
  it("accepts object result maps and rejects malformed bodies", () => {
    expect(
      isAdapterResultsEnvelope({
        results: { facebook: { ok: true, postId: "fb-1" } },
      }),
    ).toBe(true);
    expect(isAdapterResultsEnvelope({ results: [] })).toBe(false);
    expect(isAdapterResultsEnvelope({})).toBe(false);
    expect(isAdapterResultsEnvelope(null)).toBe(false);
  });
});

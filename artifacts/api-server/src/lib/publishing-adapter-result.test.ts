import { describe, expect, it } from "vitest";

import {
  isAdapterResultsEnvelope,
  mapAdapterResultToDelivery,
  readAdapterResultsEnvelope,
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

describe("adapter results envelopes", () => {
  it("accepts object result maps and rejects malformed bodies", () => {
    const envelope = {
      results: { facebook: { ok: true, postId: "fb-1" } },
    };
    expect(isAdapterResultsEnvelope(envelope)).toBe(true);
    expect(readAdapterResultsEnvelope(envelope)).toEqual(envelope.results);
    expect(isAdapterResultsEnvelope({ results: [] })).toBe(false);
    expect(readAdapterResultsEnvelope({ results: [] })).toBeNull();
    expect(readAdapterResultsEnvelope({})).toBeNull();
    expect(readAdapterResultsEnvelope(null)).toBeNull();
  });

  it("reads a valid partial result map independently of HTTP status", () => {
    const body = {
      error: "unexpected adapter exception",
      results: {
        facebook: { ok: true, postId: "fb-1" },
        google: { ok: false, error: "Google failed" },
      },
    };

    expect(readAdapterResultsEnvelope(body)).toEqual(body.results);
  });
});

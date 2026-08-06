import { describe, expect, it, vi } from "vitest";

import {
  hasValidInternalPublishSecret,
  requireInternalPublishAdapter,
} from "./internalPublishAdapterMiddleware";

describe("hasValidInternalPublishSecret", () => {
  it("accepts only the exact shared secret", () => {
    expect(hasValidInternalPublishSecret("correct-secret", "correct-secret")).toBe(true);
    expect(hasValidInternalPublishSecret("wrong-secret", "correct-secret")).toBe(false);
    expect(hasValidInternalPublishSecret(undefined, "correct-secret")).toBe(false);
    expect(hasValidInternalPublishSecret(["correct-secret"], "correct-secret")).toBe(false);
  });

  it("fails closed when no expected secret exists", () => {
    expect(hasValidInternalPublishSecret("anything", "")).toBe(false);
  });
});

describe("requireInternalPublishAdapter", () => {
  it("blocks a post-ID request without the internal secret", () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const next = vi.fn();

    requireInternalPublishAdapter(
      { params: { id: "post-123" }, headers: {} } as never,
      { status } as never,
      next,
    );

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "INTERNAL_PUBLISH_ADAPTER_ONLY" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("preserves the canonical bulk publish route", () => {
    const status = vi.fn();
    const next = vi.fn();

    requireInternalPublishAdapter(
      { params: { id: "bulk" }, headers: {} } as never,
      { status } as never,
      next,
    );

    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });
});

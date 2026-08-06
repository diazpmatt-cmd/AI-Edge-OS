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
  it("blocks a request without the internal secret", () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const next = vi.fn();

    requireInternalPublishAdapter(
      { headers: {} } as never,
      { status } as never,
      next,
    );

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "INTERNAL_PUBLISH_ADAPTER_ONLY" }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});

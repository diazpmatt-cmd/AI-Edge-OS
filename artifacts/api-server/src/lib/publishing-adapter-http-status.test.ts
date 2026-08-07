import { describe, expect, it } from "vitest";

import { readAdapterResultsEnvelope } from "./publishing-adapter-result";
import {
  INTERNAL_PARTIAL_ADAPTER_STATUS,
  resolveInternalAdapterResponseStatus,
} from "../middlewares/internalPublishReceiptMiddleware";

describe("internal adapter partial-result status contract", () => {
  it("keeps a valid partial result envelope consumable by PublishingService", () => {
    const body = {
      results: {
        facebook: { ok: true, postId: "fb-1" },
        google: { ok: false, error: "Google failed" },
      },
    };

    const status = resolveInternalAdapterResponseStatus(500, body);

    expect(status).toBe(INTERNAL_PARTIAL_ADAPTER_STATUS);
    expect(status).toBeLessThan(500);
    expect(readAdapterResultsEnvelope(body)).toEqual(body.results);
  });

  it("does not make an unstructured server failure consumable", () => {
    const body = { error: "adapter crashed" };

    expect(resolveInternalAdapterResponseStatus(500, body)).toBe(500);
    expect(readAdapterResultsEnvelope(body)).toBeNull();
  });
});

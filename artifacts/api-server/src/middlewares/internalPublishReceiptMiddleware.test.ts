import { describe, expect, it, vi } from "vitest";

import {
  createInternalPublishReceiptMiddleware,
  shouldCaptureInternalPublishReceipt,
} from "./internalPublishReceiptMiddleware";

describe("shouldCaptureInternalPublishReceipt", () => {
  it("captures real post adapter routes and excludes bulk", () => {
    expect(shouldCaptureInternalPublishReceipt("post-123")).toBe(true);
    expect(shouldCaptureInternalPublishReceipt("bulk")).toBe(false);
    expect(shouldCaptureInternalPublishReceipt(undefined)).toBe(false);
  });
});

describe("createInternalPublishReceiptMiddleware", () => {
  it("delays the JSON response until receipt persistence settles", async () => {
    let resolvePersistence!: (value: { persisted: number; expected: number }) => void;
    const persistence = new Promise<{ persisted: number; expected: number }>(
      (resolve) => { resolvePersistence = resolve; },
    );
    const persist = vi.fn(() => persistence);
    const sendJson = vi.fn();
    const next = vi.fn();
    const res = {
      json: sendJson,
    } as never;

    createInternalPublishReceiptMiddleware(persist as never)(
      { params: { id: "post-123" } } as never,
      res,
      next,
    );

    expect(next).toHaveBeenCalledOnce();
    const body = { results: { facebook: { ok: true, postId: "fb-1" } } };
    (res as { json: (value: unknown) => unknown }).json(body);

    expect(persist).toHaveBeenCalledWith({ postId: "post-123", body });
    expect(sendJson).not.toHaveBeenCalled();

    resolvePersistence({ persisted: 1, expected: 1 });
    await persistence;
    await Promise.resolve();

    expect(sendJson).toHaveBeenCalledWith(body);
  });

  it("bypasses the canonical bulk route", () => {
    const persist = vi.fn();
    const next = vi.fn();

    createInternalPublishReceiptMiddleware(persist as never)(
      { params: { id: "bulk" } } as never,
      { json: vi.fn() } as never,
      next,
    );

    expect(next).toHaveBeenCalledOnce();
    expect(persist).not.toHaveBeenCalled();
  });
});

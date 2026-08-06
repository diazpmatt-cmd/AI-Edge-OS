import { describe, expect, it, vi } from "vitest";

import {
  INTERNAL_PARTIAL_ADAPTER_STATUS,
  createInternalPublishReceiptMiddleware,
  resolveInternalAdapterResponseStatus,
  shouldCaptureInternalPublishReceipt,
} from "./internalPublishReceiptMiddleware";

describe("shouldCaptureInternalPublishReceipt", () => {
  it("captures real post adapter routes and excludes bulk", () => {
    expect(shouldCaptureInternalPublishReceipt("post-123")).toBe(true);
    expect(shouldCaptureInternalPublishReceipt("bulk")).toBe(false);
    expect(shouldCaptureInternalPublishReceipt(undefined)).toBe(false);
  });
});

describe("resolveInternalAdapterResponseStatus", () => {
  const partialBody = {
    results: {
      facebook: { ok: true, postId: "fb-1" },
      google: { ok: false, error: "Google failed" },
    },
  };

  it("normalizes a valid 5xx result envelope to internal multi-status", () => {
    expect(resolveInternalAdapterResponseStatus(500, partialBody)).toBe(
      INTERNAL_PARTIAL_ADAPTER_STATUS,
    );
  });

  it("preserves non-5xx and malformed adapter responses", () => {
    expect(resolveInternalAdapterResponseStatus(400, partialBody)).toBe(400);
    expect(resolveInternalAdapterResponseStatus(500, { error: "failed" })).toBe(500);
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
    const status = vi.fn();
    const next = vi.fn();
    const res = {
      json: sendJson,
      status,
      statusCode: 200,
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
    expect(status).not.toHaveBeenCalled();

    resolvePersistence({ persisted: 1, expected: 1 });
    await persistence;
    await Promise.resolve();

    expect(sendJson).toHaveBeenCalledWith(body);
  });

  it("normalizes a 5xx partial result before releasing it", async () => {
    const persistence = Promise.resolve({ persisted: 2, expected: 2 });
    const sendJson = vi.fn();
    const status = vi.fn();
    const res = {
      json: sendJson,
      status,
      statusCode: 500,
    } as never;

    createInternalPublishReceiptMiddleware(() => persistence)(
      { params: { id: "post-123" } } as never,
      res,
      vi.fn(),
    );

    const body = {
      results: {
        facebook: { ok: true, postId: "fb-1" },
        google: { ok: false, error: "Google failed" },
      },
    };
    (res as { json: (value: unknown) => unknown }).json(body);

    await persistence;
    await Promise.resolve();

    expect(status).toHaveBeenCalledWith(INTERNAL_PARTIAL_ADAPTER_STATUS);
    expect(sendJson).toHaveBeenCalledWith(body);
  });

  it("releases the adapter response when receipt persistence fails", async () => {
    const persistence = Promise.reject(new Error("database unavailable"));
    const persist = vi.fn(() => persistence);
    const sendJson = vi.fn();
    const next = vi.fn();
    const res = { json: sendJson, status: vi.fn(), statusCode: 200 } as never;

    createInternalPublishReceiptMiddleware(persist as never)(
      { params: { id: "post-123" } } as never,
      res,
      next,
    );

    const body = { results: { facebook: { ok: true, postId: "fb-1" } } };
    (res as { json: (value: unknown) => unknown }).json(body);

    await persistence.catch(() => undefined);
    await Promise.resolve();
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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("@clerk/react", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "@clerk/react";
import { useApiFetch } from "../api";

const mockUseAuth = vi.mocked(useAuth);

function makeGetToken(token: string | null = "test-jwt") {
  return vi.fn().mockResolvedValue(token);
}

function makeResponse(body: unknown, status = 200) {
  return new Response(
    body === null ? null : JSON.stringify(body),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  global.fetch = vi.fn();
});

// ── 1. Reference stability ─────────────────────────────────────────────────────

describe("reference stability", () => {
  it("returns the same function reference across re-renders when getToken has not changed", () => {
    const getToken = makeGetToken();
    mockUseAuth.mockReturnValue({ getToken } as ReturnType<typeof useAuth>);

    const { result, rerender } = renderHook(() => useApiFetch());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("returns a new reference when getToken changes between renders", () => {
    const getToken1 = makeGetToken("tok-a");
    const getToken2 = makeGetToken("tok-b");
    let getToken = getToken1;
    mockUseAuth.mockImplementation(() => ({ getToken } as ReturnType<typeof useAuth>));

    const { result, rerender } = renderHook(() => useApiFetch());
    const first = result.current;

    getToken = getToken2;
    rerender();
    expect(result.current).not.toBe(first);
  });
});

// ── 2. Fresh token per request ─────────────────────────────────────────────────

describe("token freshness", () => {
  it("calls getToken once per API invocation", async () => {
    const getToken = vi.fn()
      .mockResolvedValueOnce("tok-1")
      .mockResolvedValueOnce("tok-2");
    mockUseAuth.mockReturnValue({ getToken } as ReturnType<typeof useAuth>);
    vi.mocked(global.fetch).mockImplementation(() => Promise.resolve(makeResponse({ ok: true })));

    const { result } = renderHook(() => useApiFetch());
    await result.current("/a");
    await result.current("/b");

    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it("sends different tokens on successive calls as getToken rotates", async () => {
    const getToken = vi.fn()
      .mockResolvedValueOnce("first-token")
      .mockResolvedValueOnce("second-token");
    mockUseAuth.mockReturnValue({ getToken } as ReturnType<typeof useAuth>);
    vi.mocked(global.fetch).mockImplementation(() => Promise.resolve(makeResponse({ ok: true })));

    const { result } = renderHook(() => useApiFetch());
    await result.current("/x");
    await result.current("/y");

    const calls = vi.mocked(global.fetch).mock.calls;
    const auth0 = (calls[0][1]?.headers as Record<string, string>)["Authorization"];
    const auth1 = (calls[1][1]?.headers as Record<string, string>)["Authorization"];

    expect(auth0).toBe("Bearer first-token");
    expect(auth1).toBe("Bearer second-token");
  });
});

// ── 3. Authorization header attachment ────────────────────────────────────────

describe("Authorization header", () => {
  it("attaches Bearer token when getToken returns a string", async () => {
    mockUseAuth.mockReturnValue({ getToken: makeGetToken("my-jwt") } as ReturnType<typeof useAuth>);
    vi.mocked(global.fetch).mockResolvedValue(makeResponse({ data: 1 }));

    const { result } = renderHook(() => useApiFetch());
    await result.current<{ data: number }>("/endpoint");

    const headers = vi.mocked(global.fetch).mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer my-jwt");
  });

  it("omits Authorization header when getToken returns null", async () => {
    mockUseAuth.mockReturnValue({ getToken: makeGetToken(null) } as ReturnType<typeof useAuth>);
    vi.mocked(global.fetch).mockResolvedValue(makeResponse({ data: 1 }));

    const { result } = renderHook(() => useApiFetch());
    await result.current<{ data: number }>("/endpoint");

    const headers = vi.mocked(global.fetch).mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("omits Authorization header when getToken rejects", async () => {
    const getToken = vi.fn().mockRejectedValue(new Error("no session"));
    mockUseAuth.mockReturnValue({ getToken } as ReturnType<typeof useAuth>);
    vi.mocked(global.fetch).mockResolvedValue(makeResponse({ data: 1 }));

    const { result } = renderHook(() => useApiFetch());
    await result.current<{ data: number }>("/endpoint");

    const headers = vi.mocked(global.fetch).mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });
});

// ── 4. Successful JSON response ────────────────────────────────────────────────

describe("successful responses", () => {
  it("returns parsed JSON body on 200", async () => {
    mockUseAuth.mockReturnValue({ getToken: makeGetToken() } as ReturnType<typeof useAuth>);
    const payload = { hello: "world", count: 42 };
    vi.mocked(global.fetch).mockResolvedValue(makeResponse(payload, 200));

    const { result } = renderHook(() => useApiFetch());
    const data = await result.current<typeof payload>("/hello");

    expect(data).toEqual(payload);
  });

  it("returns undefined for 204 No Content", async () => {
    mockUseAuth.mockReturnValue({ getToken: makeGetToken() } as ReturnType<typeof useAuth>);
    vi.mocked(global.fetch).mockResolvedValue(new Response(null, { status: 204 }));

    const { result } = renderHook(() => useApiFetch());
    const data = await result.current<undefined>("/delete-something");

    expect(data).toBeUndefined();
  });
});

// ── 5. API error behavior ──────────────────────────────────────────────────────

describe("error handling", () => {
  it("throws with status code in message on 404", async () => {
    mockUseAuth.mockReturnValue({ getToken: makeGetToken() } as ReturnType<typeof useAuth>);
    vi.mocked(global.fetch).mockResolvedValue(
      new Response("Not found", { status: 404 }),
    );

    const { result } = renderHook(() => useApiFetch());
    await expect(result.current("/missing")).rejects.toThrow("API 404");
  });

  it("throws with status code in message on 500", async () => {
    mockUseAuth.mockReturnValue({ getToken: makeGetToken() } as ReturnType<typeof useAuth>);
    vi.mocked(global.fetch).mockResolvedValue(
      new Response("Internal Server Error", { status: 500 }),
    );

    const { result } = renderHook(() => useApiFetch());
    await expect(result.current("/crash")).rejects.toThrow("API 500");
  });

  it("includes server error text in the thrown message", async () => {
    mockUseAuth.mockReturnValue({ getToken: makeGetToken() } as ReturnType<typeof useAuth>);
    vi.mocked(global.fetch).mockResolvedValue(
      new Response("Unauthorized: bad token", { status: 401 }),
    );

    const { result } = renderHook(() => useApiFetch());
    await expect(result.current("/secure")).rejects.toThrow("Unauthorized: bad token");
  });
});

/**
 * google-token.ts — unit tests for the shared Google OAuth token service.
 *
 * Key behaviour under test:
 *  1. Valid non-expired token → returned as-is (no refresh).
 *  2. expiresAt = null with a refresh token → refresh triggered
 *     (this is the critical dev-sync bug fix: dev-sync drops expiresAt to NULL).
 *  3. Expired expiresAt with a refresh token → refresh triggered.
 *  4. No refresh token (any expiry state) → return existing token, no refresh.
 *  5. Refresh HTTP 400/401 → { ok: false, reason: "revoked" }.
 *  6. Refresh HTTP 5xx  → { ok: false, reason: "refresh_failed" }.
 *  7. Refresh response missing access_token → { ok: false, reason: "refresh_failed" }.
 *
 * The DB persist inside _refreshAndPersist is inside try/catch (non-fatal).
 * Tests do not mock the DB — a DB error there is swallowed and the return
 * value is still correct.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveGoogleToken } from "../lib/google-token.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function stubFetch(overrides: {
  ok:     boolean;
  status?: number;
  json?:  () => Promise<unknown>;
  text?:  () => Promise<string>;
}) {
  const mock = vi.fn().mockResolvedValue({
    ok:     overrides.ok,
    status: overrides.status ?? (overrides.ok ? 200 : 500),
    json:   overrides.json  ?? (() => Promise.resolve({})),
    text:   overrides.text  ?? (() => Promise.resolve("")),
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

const FUTURE = new Date(Date.now() + 3_600_000);
const PAST   = new Date(Date.now() -     1_000);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("resolveGoogleToken — no-refresh paths", () => {
  it("returns existing token when not expired (future expiresAt)", async () => {
    const fetchMock = stubFetch({ ok: true, json: async () => ({ access_token: "should-not-be-returned" }) });
    const result = await resolveGoogleToken({
      userId: "u1", accessToken: "valid-token", refreshToken: "r", expiresAt: FUTURE,
    });
    expect(result).toEqual({ ok: true, token: "valid-token" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns existing token when no refreshToken, even if expired", async () => {
    const fetchMock = stubFetch({ ok: true, json: async () => ({ access_token: "should-not-be-returned" }) });
    const result = await resolveGoogleToken({
      userId: "u1", accessToken: "stale-token", refreshToken: null, expiresAt: PAST,
    });
    expect(result).toEqual({ ok: true, token: "stale-token" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns existing token when no refreshToken and expiresAt is null", async () => {
    const fetchMock = stubFetch({ ok: true, json: async () => ({ access_token: "new" }) });
    const result = await resolveGoogleToken({
      userId: "u1", accessToken: "current-token", refreshToken: null, expiresAt: null,
    });
    expect(result).toEqual({ ok: true, token: "current-token" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("resolveGoogleToken — refresh paths", () => {
  it("dev-sync bug fix: refreshes when expiresAt is null (not treated as non-expired)", async () => {
    // Old bug: `conn.expiresAt ? expiresAt < now : false` evaluated to false when
    // expiresAt is null → no refresh, stale token returned.
    // New fix: `!expiresAt || expiresAt < now` → isExpired=true → refresh triggered.
    const fetchMock = stubFetch({
      ok: true,
      json: async () => ({ access_token: "freshly-refreshed", expires_in: 3600 }),
    });
    const result = await resolveGoogleToken({
      userId: "u1", accessToken: "stale-token", refreshToken: "valid-refresh", expiresAt: null,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true, token: "freshly-refreshed" });
  });

  it("refreshes when token is expired (past expiresAt)", async () => {
    stubFetch({
      ok: true,
      json: async () => ({ access_token: "renewed-token", expires_in: 3600 }),
    });
    const result = await resolveGoogleToken({
      userId: "u1", accessToken: "old-token", refreshToken: "ref", expiresAt: PAST,
    });
    expect(result).toEqual({ ok: true, token: "renewed-token" });
  });

  it("sends correct grant_type and refresh_token in POST body", async () => {
    const fetchMock = stubFetch({
      ok: true,
      json: async () => ({ access_token: "tok", expires_in: 3600 }),
    });
    await resolveGoogleToken({
      userId: "u1", accessToken: "old", refreshToken: "my-refresh", expiresAt: null,
    });
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(opts.method).toBe("POST");
    const params = new URLSearchParams(opts.body as string);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("my-refresh");
  });
});

describe("resolveGoogleToken — refresh failure paths", () => {
  it("returns revoked when OAuth endpoint returns 400", async () => {
    stubFetch({ ok: false, status: 400, text: async () => "invalid_grant" });
    const result = await resolveGoogleToken({
      userId: "u1", accessToken: "t", refreshToken: "r", expiresAt: null,
    });
    expect(result).toEqual({ ok: false, reason: "revoked" });
  });

  it("returns revoked when OAuth endpoint returns 401", async () => {
    stubFetch({ ok: false, status: 401, text: async () => "unauthorized" });
    const result = await resolveGoogleToken({
      userId: "u1", accessToken: "t", refreshToken: "r", expiresAt: null,
    });
    expect(result).toEqual({ ok: false, reason: "revoked" });
  });

  it("returns refresh_failed when OAuth endpoint returns 5xx", async () => {
    stubFetch({ ok: false, status: 500, text: async () => "server error" });
    const result = await resolveGoogleToken({
      userId: "u1", accessToken: "t", refreshToken: "r", expiresAt: null,
    });
    expect(result).toEqual({ ok: false, reason: "refresh_failed" });
  });

  it("returns refresh_failed when response body has no access_token", async () => {
    stubFetch({
      ok: true,
      json: async () => ({ token_type: "Bearer" }),
    });
    const result = await resolveGoogleToken({
      userId: "u1", accessToken: "t", refreshToken: "r", expiresAt: null,
    });
    expect(result).toEqual({ ok: false, reason: "refresh_failed" });
  });

  it("returns refresh_failed when fetch throws (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const result = await resolveGoogleToken({
      userId: "u1", accessToken: "t", refreshToken: "r", expiresAt: null,
    });
    expect(result).toEqual({ ok: false, reason: "refresh_failed" });
  });
});

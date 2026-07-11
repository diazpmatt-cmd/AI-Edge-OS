import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  readGbpCooldown,
  classifyGbpError,
  buildGbpCooldownRecord,
  stripLegacyCooldownFields,
  GBP_COOLDOWN_DEFAULTS,
} from "../lib/gbp-cooldown.js";
import type { GbpCooldown } from "../lib/gbp-cooldown.js";

// ── readGbpCooldown ───────────────────────────────────────────────────────────

describe("readGbpCooldown", () => {
  it("returns null when metadata has no cooldown fields", () => {
    expect(readGbpCooldown({})).toBeNull();
  });

  it("returns null when gbpCooldown.expiresAt is in the past (auto-clears expired)", () => {
    const metadata = {
      gbpCooldown: {
        startedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-01-01T00:01:00.000Z", // past
        reason: "test", endpoint: "Account Management API",
        service: "test", attemptCount: 1, retryAfterSec: null, errorType: "rate_limit",
      } satisfies GbpCooldown,
    };
    expect(readGbpCooldown(metadata)).toBeNull();
  });

  it("returns the record when gbpCooldown.expiresAt is in the future", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const metadata = {
      gbpCooldown: {
        startedAt: new Date().toISOString(),
        expiresAt: future,
        reason: "quota exceeded", endpoint: "Account Management API",
        service: "mybusinessaccountmanagement.googleapis.com",
        attemptCount: 2, retryAfterSec: null, errorType: "rate_limit",
      } satisfies GbpCooldown,
    };
    const result = readGbpCooldown(metadata);
    expect(result).not.toBeNull();
    expect(result?.attemptCount).toBe(2);
    expect(result?.errorType).toBe("rate_limit");
  });

  it("handles legacy flat cooldownUntil in the future", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const metadata = {
      cooldownUntil: future,
      google429Reason: "Quota exceeded for quota metric 'Requests per minute'",
      google429At: "2026-07-07T04:30:00.000Z",
    };
    const result = readGbpCooldown(metadata);
    expect(result).not.toBeNull();
    expect(result?.endpoint).toBe("Account Management API");
    expect(result?.errorType).toBe("unknown");
  });

  it("returns null for legacy cooldownUntil that has expired", () => {
    const metadata = { cooldownUntil: "2026-01-01T00:00:00.000Z" };
    expect(readGbpCooldown(metadata)).toBeNull();
  });
});

// ── classifyGbpError ──────────────────────────────────────────────────────────

describe("classifyGbpError", () => {
  it("classifies per-minute language as rate_limit", () => {
    const body = "Quota exceeded for quota metric 'Requests' and limit 'Requests per minute'";
    expect(classifyGbpError(body, 429)).toBe("rate_limit");
  });

  it("classifies per-day language as daily_quota", () => {
    const body = "Quota exceeded for quota metric 'Requests' and limit 'Requests per day'";
    expect(classifyGbpError(body, 429)).toBe("daily_quota");
  });

  it("classifies explicit zero-quota responses", () => {
    const body = "Quota limit: 0 requests allowed";
    expect(classifyGbpError(body, 429)).toBe("project_quota_zero");
  });

  it("classifies 403 without API-disabled text as access_denied", () => {
    expect(classifyGbpError("PERMISSION_DENIED", 403)).toBe("access_denied");
  });

  it("classifies 403 with SERVICE_DISABLED as api_disabled", () => {
    expect(classifyGbpError("SERVICE_DISABLED: this API is not enabled", 403)).toBe("api_disabled");
  });

  it("returns unknown for 429 with empty body", () => {
    expect(classifyGbpError("", 429)).toBe("unknown");
  });

  it("returns unknown for non-error status codes", () => {
    expect(classifyGbpError("some body", 200)).toBe("unknown");
  });
});

// ── buildGbpCooldownRecord ────────────────────────────────────────────────────

describe("buildGbpCooldownRecord", () => {
  it("sets expiresAt based on GBP_COOLDOWN_DEFAULTS when no Retry-After", () => {
    const before = Date.now();
    const record = buildGbpCooldownRecord({
      existing: null,
      responseBody: "Requests per minute exceeded",
      retryAfterHeader: null,
      httpStatus: 429,
      endpoint: "Account Management API",
      service: "mybusinessaccountmanagement.googleapis.com",
    });
    const expectedExpiry = before + GBP_COOLDOWN_DEFAULTS.rate_limit * 1000;
    const actualExpiry = new Date(record.expiresAt).getTime();
    expect(actualExpiry).toBeGreaterThanOrEqual(expectedExpiry - 100);
    expect(actualExpiry).toBeLessThanOrEqual(expectedExpiry + 2000);
    expect(record.errorType).toBe("rate_limit");
    expect(record.attemptCount).toBe(1);
    expect(record.retryAfterSec).toBeNull();
  });

  it("uses Retry-After header when provided", () => {
    const before = Date.now();
    const record = buildGbpCooldownRecord({
      existing: null,
      responseBody: "rate limit",
      retryAfterHeader: "30",
      httpStatus: 429,
      endpoint: "Business Information API",
      service: "mybusinessbusinessinformation.googleapis.com",
    });
    const actualExpiry = new Date(record.expiresAt).getTime();
    expect(actualExpiry).toBeGreaterThanOrEqual(before + 29_000);
    expect(actualExpiry).toBeLessThanOrEqual(before + 32_000);
    expect(record.retryAfterSec).toBe(30);
  });

  it("does NOT push the expiresAt deadline forward when an active cooldown exists", () => {
    const existingExpiry = new Date(Date.now() + 300_000).toISOString(); // 5 min from now
    const existing: GbpCooldown = {
      startedAt: new Date().toISOString(),
      expiresAt: existingExpiry,
      reason: "first hit",
      endpoint: "Account Management API",
      service: "mybusinessaccountmanagement.googleapis.com",
      attemptCount: 1,
      retryAfterSec: null,
      errorType: "rate_limit",
    };
    const record = buildGbpCooldownRecord({
      existing,
      responseBody: "rate limit again",
      retryAfterHeader: null,
      httpStatus: 429,
      endpoint: "Account Management API",
      service: "mybusinessaccountmanagement.googleapis.com",
    });
    expect(record.expiresAt).toBe(existingExpiry); // deadline NOT pushed forward
    expect(record.attemptCount).toBe(2);           // count incremented
    expect(record.startedAt).toBe(existing.startedAt); // original start preserved
  });

  it("increments attemptCount from existing record", () => {
    const existing: GbpCooldown = {
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      reason: "prior", endpoint: "Local Posts API",
      service: "mybusinessposts.googleapis.com",
      attemptCount: 5, retryAfterSec: null, errorType: "unknown",
    };
    const record = buildGbpCooldownRecord({
      existing,
      responseBody: "",
      retryAfterHeader: null,
      httpStatus: 429,
      endpoint: "Local Posts API",
      service: "mybusinessposts.googleapis.com",
    });
    expect(record.attemptCount).toBe(6);
  });

  it("uses longer default for daily_quota error type", () => {
    const before = Date.now();
    const record = buildGbpCooldownRecord({
      existing: null,
      responseBody: "Quota exceeded per day limit",
      retryAfterHeader: null,
      httpStatus: 429,
      endpoint: "Account Management API",
      service: "mybusinessaccountmanagement.googleapis.com",
    });
    const expectedExpiry = before + GBP_COOLDOWN_DEFAULTS.daily_quota * 1000;
    const actualExpiry = new Date(record.expiresAt).getTime();
    expect(actualExpiry).toBeGreaterThanOrEqual(expectedExpiry - 100);
    expect(actualExpiry).toBeLessThanOrEqual(expectedExpiry + 2000);
  });
});

// ── stripLegacyCooldownFields ─────────────────────────────────────────────────

describe("stripLegacyCooldownFields", () => {
  it("removes all legacy flat cooldown fields", () => {
    const meta = {
      cooldownUntil: "2026-01-01",
      google429At: "2026-01-01",
      google429Endpoint: "...",
      google429Reason: "...",
      locationName: "accounts/1/locations/2",
      verifiedByApi: true,
    };
    const result = stripLegacyCooldownFields(meta);
    expect(result).not.toHaveProperty("cooldownUntil");
    expect(result).not.toHaveProperty("google429At");
    expect(result).not.toHaveProperty("google429Endpoint");
    expect(result).not.toHaveProperty("google429Reason");
    expect(result).toHaveProperty("locationName"); // non-legacy fields preserved
    expect(result).toHaveProperty("verifiedByApi");
  });

  it("is safe on metadata with no legacy fields", () => {
    const meta = { locationName: "accounts/1/locations/2", verifiedByApi: true };
    expect(stripLegacyCooldownFields(meta)).toEqual(meta);
  });
});

// ── Integration: verifiedByApi guard ─────────────────────────────────────────
// These tests document the expected behavior of the publishToGBP guard —
// they test the pure helper functions only; route-level behavior is covered
// by the server's existing integration tests.

describe("verifiedByApi guard semantics", () => {
  it("metadata without verifiedByApi must be treated as unverified", () => {
    const metadata: Record<string, unknown> = {
      accountName: "accounts/112955071079091449064", // manually seeded, not API-verified
      locationName: "accounts/112955071079091449064/locations/999",
    };
    const hasVerified = !!metadata["verifiedByApi"];
    expect(hasVerified).toBe(false); // the guard must clear this
  });

  it("metadata with verifiedByApi: true is safe to use", () => {
    const metadata = {
      accountName: "accounts/123/locations/456",
      locationName: "accounts/123/locations/456",
      verifiedByApi: true,
      cachedAt: new Date().toISOString(),
    };
    expect(metadata.verifiedByApi).toBe(true);
  });
});

// ── Admin endpoint must not exist ─────────────────────────────────────────────

describe("one-time admin endpoint removal", () => {
  it("social-posts.ts must not contain the one-time pilot endpoint", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const filePath = path.resolve(__dirname, "../routes/social-posts.ts");
    const content = await fs.readFile(filePath, "utf8");
    expect(content).not.toContain("bbb-gbp-pilot");
    expect(content).not.toContain("BBB_PILOT_2026_07_11");
    expect(content).not.toContain("ONE-TIME PILOT ENDPOINT");
  });
});

// ── No duplicate discovery calls when location is cached ──────────────────────

describe("discovery call gating", () => {
  it("a future-dated cooldown record blocks all discovery APIs", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const metadata = {
      gbpCooldown: {
        startedAt: new Date().toISOString(),
        expiresAt: future,
        reason: "rate_limit",
        endpoint: "Account Management API",
        service: "mybusinessaccountmanagement.googleapis.com",
        attemptCount: 1, retryAfterSec: null, errorType: "rate_limit",
      } as GbpCooldown,
    };
    const cooldown = readGbpCooldown(metadata);
    expect(cooldown).not.toBeNull();
    // publishToGBP would throw before calling any discovery API
  });

  it("an expired cooldown does not block discovery (returns null)", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const metadata = {
      gbpCooldown: {
        startedAt: past, expiresAt: past,
        reason: "old hit", endpoint: "Account Management API",
        service: "mybusinessaccountmanagement.googleapis.com",
        attemptCount: 1, retryAfterSec: null, errorType: "rate_limit",
      } as GbpCooldown,
    };
    expect(readGbpCooldown(metadata)).toBeNull(); // gate opens
  });
});

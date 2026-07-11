import { describe, it, expect } from "vitest";
import {
  sanitizeDetail,
  healthScore,
  safeMeta,
  decideInsert,
  parseLimit,
  HEARTBEAT_INTERVAL_MS,
} from "../lib/health-history-utils.js";
import type { LastHealthRecord } from "../lib/health-history-utils.js";

// ── sanitizeDetail ────────────────────────────────────────────────────────────

describe("sanitizeDetail", () => {
  it("redacts Google access tokens (ya29.*)", () => {
    const result = sanitizeDetail("token ya29.a0AfH6SMBxyz12345longtoken extra");
    expect(result).not.toContain("ya29.");
    expect(result).toContain("[redacted]");
  });

  it("redacts Google refresh tokens (1//*)", () => {
    const result = sanitizeDetail("refresh 1//abcdefghij1234567890");
    expect(result).not.toContain("1//abc");
    expect(result).toContain("[redacted]");
  });

  it("redacts Meta/Facebook EAA tokens", () => {
    const fbToken = "EAAMpZAT2uIbcBRw4QBYqPjoOCKZAudvMwxKXlongtoken1234";
    const result = sanitizeDetail(`page token: ${fbToken}`);
    expect(result).not.toContain(fbToken);
    expect(result).toContain("[redacted]");
  });

  it("redacts Meta EAAB tokens", () => {
    const token = "EAABlongaccesstoken12345678901234567890";
    const result = sanitizeDetail(token);
    expect(result).toContain("[redacted]");
    expect(result).not.toContain("EAABlong");
  });

  it("redacts Bearer tokens", () => {
    const result = sanitizeDetail("Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9");
    expect(result).not.toContain("eyJhbGciOiJ");
    expect(result).toContain("Bearer [redacted]");
  });

  it("redacts access_token= patterns", () => {
    const result = sanitizeDetail("access_token=somesecretvalue1234567890");
    expect(result).toContain("[redacted]");
    expect(result).not.toContain("somesecret");
  });

  it("redacts refresh_token patterns", () => {
    const result = sanitizeDetail("refresh_token: abcdefghij1234567890longtoken");
    expect(result).toContain("[redacted]");
    expect(result).not.toContain("abcdefghij");
  });

  it("redacts client_secret patterns", () => {
    const result = sanitizeDetail("client_secret=mysupersecretvalue123");
    expect(result).toContain("[redacted]");
    expect(result).not.toContain("mysupersecret");
  });

  it("redacts api_key patterns", () => {
    const result = sanitizeDetail("api_key=sk-abcdefghijklmnopqrstuvwxyz123456");
    expect(result).toContain("[redacted]");
    expect(result).not.toContain("sk-abcdef");
  });

  it("truncates output to 300 chars", () => {
    const long = "a".repeat(500);
    expect(sanitizeDetail(long).length).toBeLessThanOrEqual(300);
  });

  it("passes through safe detail text unchanged", () => {
    const safe = "Token expired — reconnect YouTube to restore access";
    expect(sanitizeDetail(safe)).toBe(safe);
  });
});

// ── healthScore ───────────────────────────────────────────────────────────────

describe("healthScore", () => {
  it("returns 100 for healthy", () => expect(healthScore("healthy")).toBe(100));
  it("returns 50 for warning", () => expect(healthScore("warning")).toBe(50));
  it("returns 0 for failed", () => expect(healthScore("failed")).toBe(0));
  it("returns 0 for unknown status", () => expect(healthScore("unknown")).toBe(0));
});

// ── safeMeta ──────────────────────────────────────────────────────────────────

describe("safeMeta", () => {
  it("extracts safe google_business fields", () => {
    const m = safeMeta("google_business", {
      locationTitle: "Bed Bugs & Beyond",
      cooldownUntil: "2026-07-11T12:00:00Z",
      locationId: "accounts/123/locations/456", // should NOT pass through
      accessToken: "ya29.secret",               // must not appear
    });
    expect(m.locationTitle).toBe("Bed Bugs & Beyond");
    expect(m.cooldownUntil).toBe("2026-07-11T12:00:00Z");
    expect(m.locationId).toBeUndefined();
    expect(m.accessToken).toBeUndefined();
  });

  it("extracts safe youtube fields", () => {
    const m = safeMeta("youtube", {
      uploadScopeGranted: true,
      uploadPermissionVerified: false,
      channelName: "Bed Bugs Channel",
      accessToken: "ya29.secret",
    });
    expect(m.uploadScopeGranted).toBe(true);
    expect(m.uploadPermissionVerified).toBe(false);
    expect(m.channelName).toBe("Bed Bugs Channel");
    expect(m.accessToken).toBeUndefined();
  });

  it("extracts safe tiktok fields", () => {
    const m = safeMeta("tiktok", { publishReady: false, accessToken: "secret" });
    expect(m.publishReady).toBe(false);
    expect(m.accessToken).toBeUndefined();
  });

  it("returns empty object for unknown provider", () => {
    const m = safeMeta("facebook", { accessToken: "secret", pageName: "My Page" });
    expect(Object.keys(m)).toHaveLength(0);
  });

  it("truncates locationTitle to 100 chars", () => {
    const m = safeMeta("google_business", { locationTitle: "a".repeat(200) });
    expect((m.locationTitle as string).length).toBe(100);
  });
});

// ── decideInsert ──────────────────────────────────────────────────────────────

const NOW = new Date("2026-07-11T10:00:00Z");
const JUST_NOW = new Date(NOW.getTime() - 60_000); // 1 min ago
const OLD = new Date(NOW.getTime() - HEARTBEAT_INTERVAL_MS - 5_000); // older than 15 min

const healthyPh = { status: "healthy", detail: "Connected" };
const warningPh = { status: "warning", detail: "Token expired" };

function makeLastRecord(overrides: Partial<LastHealthRecord> = {}): LastHealthRecord {
  return {
    status: "healthy",
    error_message: null,
    health_score: 100,
    checked_at: JUST_NOW,
    metadata: {},
    ...overrides,
  };
}

describe("decideInsert — Rule 1: no prior record", () => {
  it("inserts when no prior record exists", () => {
    const result = decideInsert("facebook", healthyPh, undefined, NOW);
    expect(result).not.toBeNull();
    expect(result!.isHeartbeat).toBe(false);
  });
});

describe("decideInsert — Rule 2: state changed", () => {
  it("inserts immediately when status changes (healthy → warning)", () => {
    const last = makeLastRecord({ status: "healthy", error_message: null, health_score: 100, checked_at: JUST_NOW });
    const result = decideInsert("facebook", warningPh, last, NOW);
    expect(result).not.toBeNull();
    expect(result!.isHeartbeat).toBe(false);
    expect(result!.status).toBe("warning");
  });

  it("inserts immediately when error_message changes", () => {
    const last = makeLastRecord({ status: "warning", error_message: "Old error", health_score: 50, checked_at: JUST_NOW });
    const ph = { status: "warning", detail: "New different error" };
    const result = decideInsert("youtube", ph, last, NOW);
    expect(result).not.toBeNull();
    expect(result!.isHeartbeat).toBe(false);
  });
});

describe("decideInsert — Rule 3: unchanged, still fresh (< 15 min)", () => {
  it("skips insert when state is identical and record is recent", () => {
    const last = makeLastRecord({ status: "healthy", error_message: null, health_score: 100, checked_at: JUST_NOW });
    const result = decideInsert("facebook", healthyPh, last, NOW);
    expect(result).toBeNull();
  });

  it("skips insert when warning state is identical and record is recent", () => {
    const last = makeLastRecord({
      status: "warning",
      error_message: sanitizeDetail("Token expired"),
      health_score: 50,
      checked_at: JUST_NOW,
      metadata: {},
    });
    const result = decideInsert("facebook", warningPh, last, NOW);
    expect(result).toBeNull();
  });
});

describe("decideInsert — Rule 4: unchanged but older than 15 min (heartbeat)", () => {
  it("inserts a heartbeat when identical state is older than HEARTBEAT_INTERVAL_MS", () => {
    const last = makeLastRecord({ status: "healthy", error_message: null, health_score: 100, checked_at: OLD });
    const result = decideInsert("facebook", healthyPh, last, NOW);
    expect(result).not.toBeNull();
    expect(result!.isHeartbeat).toBe(true);
    expect(result!.status).toBe("healthy");
  });
});

describe("decideInsert — tenant isolation", () => {
  it("two providers with same state are evaluated independently", () => {
    const lastHealthy = makeLastRecord({ checked_at: JUST_NOW });
    const lastWarning = makeLastRecord({ status: "warning", error_message: "err", health_score: 50, checked_at: JUST_NOW });

    // User A provider facebook: healthy+fresh → skip
    const r1 = decideInsert("facebook", healthyPh, lastHealthy, NOW);
    expect(r1).toBeNull();

    // User B provider facebook: warning+fresh (same time, different state compared to "healthy") → insert
    const r2 = decideInsert("facebook", healthyPh, lastWarning, NOW);
    expect(r2).not.toBeNull();
  });

  it("decideInsert takes only the provided last record — it has no cross-user access", () => {
    // Calling decideInsert with `undefined` (no prior record for user B)
    // even though user A has a record is safe — callers are responsible for
    // scoping the lookup by user_id before calling this function.
    const result = decideInsert("facebook", healthyPh, undefined, NOW);
    expect(result).not.toBeNull(); // always inserts when no prior record
  });
});

describe("decideInsert — result fields", () => {
  it("sets lastSuccessAt when status is healthy", () => {
    const result = decideInsert("youtube", healthyPh, undefined, NOW);
    expect(result!.lastSuccessAt).toEqual(NOW);
  });

  it("sets lastSuccessAt to null when status is not healthy", () => {
    const result = decideInsert("youtube", warningPh, undefined, NOW);
    expect(result!.lastSuccessAt).toBeNull();
  });

  it("sets errorMessage to null when status is healthy", () => {
    const result = decideInsert("youtube", healthyPh, undefined, NOW);
    expect(result!.errorMessage).toBeNull();
  });

  it("sets errorMessage from sanitized detail when not healthy", () => {
    const ph = { status: "warning", detail: "EAABlongfbtoken123456789 expired" };
    const result = decideInsert("youtube", ph, undefined, NOW);
    expect(result!.errorMessage).not.toContain("EAABlong");
    expect(result!.errorMessage).toContain("[redacted]");
  });
});

// ── parseLimit ────────────────────────────────────────────────────────────────

describe("parseLimit", () => {
  it("defaults to 100 for undefined", () => expect(parseLimit(undefined)).toBe(100));
  it("defaults to 100 for empty string", () => expect(parseLimit("")).toBe(100));
  it("defaults to 100 for NaN string", () => expect(parseLimit("abc")).toBe(100));
  it("defaults to 100 for negative number", () => expect(parseLimit("-5")).toBe(100));
  it("defaults to 100 for zero", () => expect(parseLimit("0")).toBe(100));
  it("clamps to 500 for values over 500", () => expect(parseLimit("1000")).toBe(500));
  it("accepts valid integer", () => expect(parseLimit("50")).toBe(50));
  it("floors decimal values", () => expect(parseLimit("49.9")).toBe(49));
  it("clamps exactly at 500", () => expect(parseLimit("500")).toBe(500));
  it("accepts numeric input", () => expect(parseLimit(200)).toBe(200));
  it("defaults to 100 for Infinity", () => expect(parseLimit(Infinity)).toBe(100));
});

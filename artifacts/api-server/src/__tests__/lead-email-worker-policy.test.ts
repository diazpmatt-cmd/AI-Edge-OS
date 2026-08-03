import { describe, expect, it } from "vitest";
import {
  buildCheckpointedGmailQuery,
  classifyWorkerErrorCode,
  computeRetryDelayMs,
  getProviderRetryAfterMs,
  isWorkerStale,
  nextCheckpointInternalDateMs,
  sanitizeWorkerError,
} from "../lib/lead-email-worker-policy.js";

describe("Lead Bridge checkpoint query", () => {
  it("uses the original bounded query before a checkpoint exists", () => {
    expect(buildCheckpointedGmailQuery(" newer_than:14d from:example.com ", null))
      .toBe("newer_than:14d from:example.com");
  });

  it("adds a six-hour replay overlap to a durable checkpoint", () => {
    const checkpoint = Date.parse("2026-08-03T06:00:00Z");
    const expectedAfter = Math.floor(Date.parse("2026-08-03T00:00:00Z") / 1_000);
    expect(buildCheckpointedGmailQuery("from:example.com", checkpoint))
      .toBe(`(from:example.com) after:${expectedAfter}`);
  });

  it("rejects empty and unreasonably long queries", () => {
    expect(() => buildCheckpointedGmailQuery("   ", null)).toThrow("must not be empty");
    expect(() => buildCheckpointedGmailQuery("x".repeat(1_001), null)).toThrow("too long");
  });
});

describe("Lead Bridge retry policy", () => {
  it("backs off exponentially and caps at the approved maximum", () => {
    expect(computeRetryDelayMs(1, 60_000, 600_000)).toBe(60_000);
    expect(computeRetryDelayMs(2, 60_000, 600_000)).toBe(120_000);
    expect(computeRetryDelayMs(10, 60_000, 600_000)).toBe(600_000);
  });

  it("honors a longer provider Retry-After without exceeding the approved maximum", () => {
    expect(computeRetryDelayMs(1, 60_000, 600_000, 300_000)).toBe(300_000);
    expect(computeRetryDelayMs(2, 60_000, 600_000, 30_000)).toBe(120_000);
    expect(computeRetryDelayMs(1, 60_000, 600_000, 900_000)).toBe(600_000);
  });

  it("reads only a valid non-negative retryAfterMs hint from an error", () => {
    expect(getProviderRetryAfterMs(Object.assign(new Error("rate limited"), { retryAfterMs: 180_000 })))
      .toBe(180_000);
    expect(getProviderRetryAfterMs({ retryAfterMs: -1 })).toBeNull();
    expect(getProviderRetryAfterMs({ retryAfterMs: "180000" })).toBeNull();
    expect(getProviderRetryAfterMs(new Error("no hint"))).toBeNull();
  });
});

describe("Lead Bridge redaction and error classification", () => {
  it("redacts bearer and OAuth credential values", () => {
    const error = new Error('Bearer bearer-value-123 refresh_token=refresh-value-456 "access_token":"access-value-789" ya29.token-value');
    const safe = sanitizeWorkerError(error);
    expect(safe).not.toContain("bearer-value-123");
    expect(safe).not.toContain("refresh-value-456");
    expect(safe).not.toContain("access-value-789");
    expect(safe).not.toContain("token-value");
    expect(safe).toContain("[redacted]");
  });

  it("classifies authorization, rate-limit, timeout, and generic failures", () => {
    expect(classifyWorkerErrorCode(new Error("Gmail API request failed with status 401"))).toBe("GMAIL_AUTHORIZATION_FAILED");
    expect(classifyWorkerErrorCode(new Error("Gmail API request failed with status 429"))).toBe("GMAIL_RATE_LIMITED");
    expect(classifyWorkerErrorCode(new Error("Gmail API request timed out after 20000ms"))).toBe("GMAIL_TIMEOUT");
    expect(classifyWorkerErrorCode(new Error("unexpected"))).toBe("LEAD_EMAIL_POLL_FAILED");
  });
});

describe("Lead Bridge durable health policy", () => {
  it("advances only to the greatest successfully processed internal date", () => {
    const current = Date.parse("2026-08-03T01:00:00Z");
    expect(nextCheckpointInternalDateMs(current, [
      Date.parse("2026-08-03T00:30:00Z"),
      Date.parse("2026-08-03T02:00:00Z"),
      Number.NaN,
    ])).toBe(Date.parse("2026-08-03T02:00:00Z"));
    expect(nextCheckpointInternalDateMs(current, [])).toBe(current);
  });

  it("treats a missing or overdue successful poll as stale", () => {
    const now = new Date("2026-08-03T03:00:00Z");
    expect(isWorkerStale(null, now, 20 * 60 * 1_000)).toBe(true);
    expect(isWorkerStale(new Date("2026-08-03T02:50:00Z"), now, 20 * 60 * 1_000)).toBe(false);
    expect(isWorkerStale(new Date("2026-08-03T02:30:00Z"), now, 20 * 60 * 1_000)).toBe(true);
  });
});

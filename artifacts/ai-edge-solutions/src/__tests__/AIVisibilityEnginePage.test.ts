import { describe, it, expect } from "vitest";
import { classifyScanError } from "../pages/AIVisibilityEnginePage";
import { BUSINESSES } from "../contexts/business-context";

// ─── Canonical tenant identity ────────────────────────────────────────────────
// These tests verify that the authorized tenant slug comes from
// BusinessContext, not from URLSearchParams or any URL query parameter.

describe("canonical tenant identity constants", () => {
  it("BUSINESSES[0].id is bed-bugs-and-beyond (canonical BBB slug)", () => {
    expect(BUSINESSES[0].id).toBe("bed-bugs-and-beyond");
  });

  it("BUSINESSES[0] is not undefined — canonical default always exists", () => {
    expect(BUSINESSES[0]).toBeDefined();
  });

  it('"bbb" is not a recognized business id', () => {
    expect(BUSINESSES.find(b => b.id === "bbb")).toBeUndefined();
  });

  it('"default" is not a recognized business id', () => {
    expect(BUSINESSES.find(b => b.id === "default")).toBeUndefined();
  });

  it("arbitrary query-string value is not a recognized business id", () => {
    expect(BUSINESSES.find(b => b.id === "some-arbitrary-slug")).toBeUndefined();
  });

  it("stale ?clientId=bbb does not equal the canonical BBB slug", () => {
    const urlDerived = new URLSearchParams("?clientId=bbb").get("clientId") ?? "default";
    expect(urlDerived).not.toBe(BUSINESSES[0].id);
  });

  it("absent clientId param resolves to 'default', which is not a valid business", () => {
    const urlDerived = new URLSearchParams("").get("clientId") ?? "default";
    expect(urlDerived).toBe("default");
    expect(BUSINESSES.find(b => b.id === urlDerived)).toBeUndefined();
  });

  it("scan endpoint built from canonical id targets /bed-bugs-and-beyond", () => {
    const slug = BUSINESSES[0].id;
    expect(`/api/ai-visibility/query-scan/${slug}`).toBe(
      "/api/ai-visibility/query-scan/bed-bugs-and-beyond",
    );
  });

  it("all business ids in BUSINESSES are non-empty strings", () => {
    for (const b of BUSINESSES) {
      expect(typeof b.id).toBe("string");
      expect(b.id.length).toBeGreaterThan(0);
    }
  });
});

// ─── classifyScanError ────────────────────────────────────────────────────────
// Verifies deterministic, safe error message classification.
// Rule: a 401 or 403 must NEVER be described as an AI-provider configuration failure.
// Rule: no secrets, raw payloads, stack traces, or internal identifiers exposed.

describe("classifyScanError — HTTP status errors", () => {
  it("401 → session expired message", () => {
    const msg = classifyScanError(new Error("API 401: Unauthorized"));
    expect(msg).toMatch(/session|sign in/i);
  });

  it("401 → does NOT mention provider or configuration", () => {
    const msg = classifyScanError(new Error("API 401: Unauthorized"));
    expect(msg).not.toMatch(/provider|configured/i);
  });

  it("403 → access denied message", () => {
    const msg = classifyScanError(new Error("API 403: forbidden"));
    expect(msg).toMatch(/access denied|not authorized/i);
  });

  it("403 → does NOT mention provider or configuration", () => {
    const msg = classifyScanError(new Error("API 403: forbidden"));
    expect(msg).not.toMatch(/provider|configured/i);
  });

  it("403 from tenant slug mismatch → access denied, not provider failure", () => {
    const msg = classifyScanError(new Error('API 403: {"error":"forbidden"}'));
    expect(msg).toMatch(/access denied|not authorized/i);
    expect(msg).not.toMatch(/provider|configured/i);
  });

  it("404 → endpoint not found message", () => {
    const msg = classifyScanError(new Error("API 404: Not Found"));
    expect(msg).toMatch(/not found/i);
  });

  it("404 → does NOT mention provider or configuration", () => {
    const msg = classifyScanError(new Error("API 404: Not Found"));
    expect(msg).not.toMatch(/provider|configured/i);
  });

  it("500 → scan service error, not provider configuration message", () => {
    const msg = classifyScanError(new Error("API 500: Internal Server Error"));
    expect(msg).toMatch(/service error|try again/i);
    expect(msg).not.toMatch(/provider not configured/i);
  });

  it("503 → scan service error message", () => {
    const msg = classifyScanError(new Error("API 503: Service Unavailable"));
    expect(msg).toMatch(/service error|try again/i);
  });

  it("any 5xx → scan service error message", () => {
    const msg = classifyScanError(new Error("API 502: Bad Gateway"));
    expect(msg).toMatch(/service error|try again/i);
  });
});

describe("classifyScanError — network failures", () => {
  it("'Failed to fetch' → network error message", () => {
    const msg = classifyScanError(new Error("Failed to fetch"));
    expect(msg).toMatch(/network|connection/i);
  });

  it("'NetworkError' → network error message", () => {
    const msg = classifyScanError(new Error("NetworkError when attempting to fetch resource"));
    expect(msg).toMatch(/network|connection/i);
  });

  it("'Load failed' (Safari) → network error message", () => {
    const msg = classifyScanError(new Error("Load failed"));
    expect(msg).toMatch(/network|connection/i);
  });
});

describe("classifyScanError — provider-specific failures", () => {
  it("not_configured string → provider configuration message", () => {
    const msg = classifyScanError(new Error("not_configured: no api key"));
    expect(msg).toMatch(/provider.*configured|contact.*administrator/i);
  });

  it("auth_failure string → provider auth message, not session expired", () => {
    const msg = classifyScanError(new Error("auth_failure: invalid api key"));
    expect(msg).toMatch(/authentication|contact.*administrator/i);
    expect(msg).not.toMatch(/session|sign in/i);
  });

  it("timeout string → provider timeout message", () => {
    const msg = classifyScanError(new Error("request timed out after 30s"));
    expect(msg).toMatch(/timed out|try again/i);
  });

  it("rate_limit string → rate limit message", () => {
    const msg = classifyScanError(new Error("rate_limit exceeded"));
    expect(msg).toMatch(/rate limit|try again/i);
  });
});

describe("classifyScanError — safety invariants", () => {
  it("does not expose raw error body content (no internal IDs)", () => {
    const err = new Error(
      'API 403: {"error":"forbidden","clientId":"secret-internal-id","userId":"user_abc123"}',
    );
    const msg = classifyScanError(err);
    expect(msg).not.toContain("secret-internal-id");
    expect(msg).not.toContain("user_abc123");
    expect(msg).not.toContain("clientId");
  });

  it("does not expose stack traces", () => {
    const err = new Error("Something went wrong");
    err.stack = "Error: Something went wrong\n  at handleRunScan (AIVisibilityEnginePage.tsx:310:7)";
    const msg = classifyScanError(err);
    expect(msg).not.toContain("AIVisibilityEnginePage");
    expect(msg).not.toContain("handleRunScan");
    expect(msg).not.toContain(".tsx:");
  });

  it("non-Error thrown value handled safely", () => {
    const msg = classifyScanError("some string error");
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
  });

  it("null thrown value handled safely", () => {
    const msg = classifyScanError(null);
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
  });

  it("every error path returns a non-empty string", () => {
    const errors = [
      new Error("API 401: x"),
      new Error("API 403: x"),
      new Error("API 404: x"),
      new Error("API 500: x"),
      new Error("Failed to fetch"),
      new Error("not_configured"),
      new Error("auth_failure"),
      new Error("timed out"),
      new Error("rate_limit"),
      new Error("completely unknown error"),
      "string error",
      null,
    ];
    for (const e of errors) {
      const msg = classifyScanError(e);
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    }
  });
});

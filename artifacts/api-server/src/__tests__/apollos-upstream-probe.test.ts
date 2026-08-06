import { describe, expect, it, vi } from "vitest";
import { resolveApollosUpstreamProbeTarget } from "../lib/apollos-upstream-probe";

describe("resolveApollosUpstreamProbeTarget", () => {
  it("requires an explicit target and exact allowed origin", () => {
    expect(resolveApollosUpstreamProbeTarget({})).toBeNull();
    expect(resolveApollosUpstreamProbeTarget({
      APOLLOS_REPAIR_UPSTREAM_HEALTH_URL: "https://status.example.com/health",
      APOLLOS_REPAIR_UPSTREAM_ALLOWED_ORIGINS: "https://other.example.com",
    })).toBeNull();
  });

  it("accepts a health URL on an exact operator-approved origin", () => {
    expect(resolveApollosUpstreamProbeTarget({
      APOLLOS_REPAIR_UPSTREAM_HEALTH_URL: "https://status.example.com/healthz",
      APOLLOS_REPAIR_UPSTREAM_ALLOWED_ORIGINS:
        "https://api.example.com, https://status.example.com",
    })).toEqual({
      url: "https://status.example.com/healthz",
      origin: "https://status.example.com",
      hostname: "status.example.com",
    });
  });

  it("rejects credentials, fragments, and non-http protocols", () => {
    for (const url of [
      "https://user:pass@status.example.com/health",
      "https://status.example.com/health#secret",
      "file:///etc/passwd",
      "ftp://status.example.com/health",
    ]) {
      expect(resolveApollosUpstreamProbeTarget({
        APOLLOS_REPAIR_UPSTREAM_HEALTH_URL: url,
        APOLLOS_REPAIR_UPSTREAM_ALLOWED_ORIGINS:
          "https://status.example.com,file://,ftp://status.example.com",
      })).toBeNull();
    }
  });

  it("does not allow suffix or lookalike origin matches", () => {
    expect(resolveApollosUpstreamProbeTarget({
      APOLLOS_REPAIR_UPSTREAM_HEALTH_URL:
        "https://status.example.com.attacker.test/health",
      APOLLOS_REPAIR_UPSTREAM_ALLOWED_ORIGINS:
        "https://status.example.com",
    })).toBeNull();
  });
});

describe("runApollosUpstreamHealthProbe", () => {
  const env = {
    APOLLOS_REPAIR_UPSTREAM_HEALTH_URL: "https://status.example.com/health",
    APOLLOS_REPAIR_UPSTREAM_ALLOWED_ORIGINS: "https://status.example.com",
  };

  it("records a successful allowlisted probe without reading the body", async () => {
    const body = vi.fn();
    const fetcher = vi.fn(async () => ({
      status: 200,
      json: body,
    })) as unknown as typeof fetch;
    const { runApollosUpstreamHealthProbe } =
      await import("../lib/apollos-upstream-probe");
    const result = await runApollosUpstreamHealthProbe(
      env,
      new AbortController().signal,
      fetcher,
    );
    expect(result.verified).toBe(true);
    expect(result.evidence).toMatchObject({
      configured: true,
      hostname: "status.example.com",
      status: 200,
      redirected: false,
    });
    expect(body).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledWith(
      "https://status.example.com/health",
      expect.objectContaining({ redirect: "manual", method: "GET" }),
    );
  });

  it("does not follow or verify redirects", async () => {
    const fetcher = vi.fn(async () => ({
      status: 302,
      headers: new Headers({ Location: "http://169.254.169.254/" }),
    })) as unknown as typeof fetch;
    const { runApollosUpstreamHealthProbe } =
      await import("../lib/apollos-upstream-probe");
    const result = await runApollosUpstreamHealthProbe(
      env,
      new AbortController().signal,
      fetcher,
    );
    expect(result.verified).toBe(false);
    expect(result.evidence.redirected).toBe(true);
  });
});

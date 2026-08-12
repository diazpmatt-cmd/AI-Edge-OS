import { describe, expect, it } from "vitest";

import {
  CLERK_PROXY_PATH,
  getClerkProxyHost,
  getClerkProxyProtocol,
  getClerkProxyUrl,
} from "./clerkProxyMiddleware";

describe("Clerk production proxy public request reconstruction", () => {
  it("uses the original forwarded host and ignores later proxy hops", () => {
    expect(getClerkProxyHost({
      headers: {
        host: "api:3000",
        "x-forwarded-host": "aiedgesolutions.online, web:80",
      },
    })).toBe("aiedgesolutions.online");
  });

  it("falls back to the Host header when no forwarded host exists", () => {
    expect(getClerkProxyHost({
      headers: { host: "aiedgesolutions.online" },
    })).toBe("aiedgesolutions.online");
  });

  it("preserves the original HTTPS scheme through internal HTTP proxy hops", () => {
    expect(getClerkProxyProtocol({
      headers: { "x-forwarded-proto": "https, http" },
    })).toBe("https");
  });

  it("fails safely to HTTPS when the forwarding scheme is missing or invalid", () => {
    expect(getClerkProxyProtocol({ headers: {} })).toBe("https");
    expect(getClerkProxyProtocol({
      headers: { "x-forwarded-proto": "javascript" },
    })).toBe("https");
  });

  it("builds the canonical same-origin production Clerk proxy URL", () => {
    expect(getClerkProxyUrl({
      headers: {
        host: "api:3000",
        "x-forwarded-host": "aiedgesolutions.online",
        "x-forwarded-proto": "https",
      },
    })).toBe(`https://aiedgesolutions.online${CLERK_PROXY_PATH}`);
  });

  it("does not manufacture a proxy URL without a public host", () => {
    expect(getClerkProxyUrl({ headers: {} })).toBeUndefined();
  });
});

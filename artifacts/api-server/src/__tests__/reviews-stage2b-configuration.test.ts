import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getReviewRequestConfiguration,
  normalizeOwnerConfirmedGoogleReviewUrl,
  saveOwnerConfirmedReviewUrl,
} from "../lib/review-request-configuration.js";

describe("Reviews Stage 2B owner-confirmed configuration", () => {
  it("accepts known HTTPS Google review-link hosts", () => {
    expect(normalizeOwnerConfirmedGoogleReviewUrl("https://g.page/r/example/review")).toBe(
      "https://g.page/r/example/review",
    );
    expect(
      normalizeOwnerConfirmedGoogleReviewUrl(
        "https://search.google.com/local/writereview?placeid=abc123",
      ),
    ).toContain("search.google.com/local/writereview");
    expect(normalizeOwnerConfirmedGoogleReviewUrl("https://maps.app.goo.gl/example")).toBe(
      "https://maps.app.goo.gl/example",
    );
  });

  it("rejects non-HTTPS, non-Google, empty, and malformed links", () => {
    expect(normalizeOwnerConfirmedGoogleReviewUrl("http://g.page/r/example/review")).toBeNull();
    expect(normalizeOwnerConfirmedGoogleReviewUrl("https://example.com/review")).toBeNull();
    expect(normalizeOwnerConfirmedGoogleReviewUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeOwnerConfirmedGoogleReviewUrl("")).toBeNull();
  });

  it("reads an owner-confirmed review link from namespaced Google Business metadata", async () => {
    const fakePool = {
      query: async () => ({
        rows: [{
          metadata_json: JSON.stringify({
            unrelatedProviderMetadata: { keep: true },
            reviewRequest: {
              reviewUrl: "https://g.page/r/example/review",
              status: "owner_confirmed",
              confirmedAt: "2026-08-13T02:00:00.000Z",
            },
          }),
        }],
      }),
    } as any;

    await expect(getReviewRequestConfiguration("bed-bugs-and-beyond", fakePool)).resolves.toEqual({
      status: "owner_confirmed",
      reviewUrl: "https://g.page/r/example/review",
      confirmedAt: "2026-08-13T02:00:00.000Z",
    });
  });

  it("fails closed when metadata is missing, malformed, or not owner-confirmed", async () => {
    for (const metadata_json of [null, "not-json", JSON.stringify({ reviewRequest: { reviewUrl: "https://g.page/r/example/review", status: "draft" } })]) {
      const fakePool = { query: async () => ({ rows: [{ metadata_json }] }) } as any;
      await expect(getReviewRequestConfiguration("client", fakePool)).resolves.toEqual({
        status: "not_configured",
        reviewUrl: null,
        confirmedAt: null,
      });
    }
  });

  it("preserves existing Google Business metadata when saving confirmation", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const fakePool = {
      query: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        if (sql.includes("SELECT metadata_json")) {
          return {
            rows: [{
              metadata_json: JSON.stringify({
                locationId: "locations/123",
                providerState: { healthy: true },
              }),
            }],
          };
        }
        return { rows: [] };
      },
    } as any;

    const result = await saveOwnerConfirmedReviewUrl({
      clientSlug: "bed-bugs-and-beyond",
      userId: "user_owner",
      reviewUrl: "https://g.page/r/example/review",
      pool: fakePool,
    });

    expect(result.status).toBe("owner_confirmed");
    const update = calls.find(call => call.sql.includes("UPDATE local_presence_channels"));
    expect(update).toBeDefined();
    const metadata = JSON.parse(String(update!.params[0]));
    expect(metadata.locationId).toBe("locations/123");
    expect(metadata.providerState).toEqual({ healthy: true });
    expect(metadata.reviewRequest.reviewUrl).toBe("https://g.page/r/example/review");
    expect(metadata.reviewRequest.status).toBe("owner_confirmed");
    expect(metadata.reviewRequest.confirmedByUserId).toBe("user_owner");
  });

  it("never removes the controlled-send blocker from eligibility", () => {
    const routeSource = readFileSync(
      resolve(process.cwd(), "src/routes/reviews-safe.ts"),
      "utf8",
    );
    expect(routeSource).toContain('const blockers: string[] = ["controlled_send_path_not_accepted"]');
    expect(routeSource).toContain('globalBlockers = ["controlled_send_path_not_accepted"]');
    expect(routeSource).toContain("deliveryReady: false");
    expect(routeSource).toContain("deliveryReadyCount: 0");
  });

  it("binds configuration routes to the authenticated active client", () => {
    const routeSource = readFileSync(
      resolve(process.cwd(), "src/routes/reviews-configuration.ts"),
      "utf8",
    );
    expect(routeSource).toContain("resolveClientActiveCheck(userId)");
    expect(routeSource).toContain("clientSlug: tenant.slug");
    expect(routeSource).toContain("userId: tenant.userId");
    expect(routeSource).not.toContain("g.page/r/review");
  });
});

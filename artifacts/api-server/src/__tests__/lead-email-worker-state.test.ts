import { describe, expect, it, vi } from "vitest";
import {
  advanceMarketplaceCheckpoint,
  buildCheckpointedMarketplaceQuery,
  createMarketplaceEmailWorkerStateStore,
} from "../lib/lead-email-worker-state.js";

describe("marketplace email worker state", () => {
  it("builds a bounded replay-overlap query", () => {
    const checkpoint = Date.parse("2026-08-14T12:00:00Z");
    const query = buildCheckpointedMarketplaceQuery("from:yelp.com", checkpoint, 60 * 60 * 1000);
    expect(query).toContain("from:yelp.com");
    expect(query).toContain(`after:${Math.floor((checkpoint - 60 * 60 * 1000) / 1000)}`);
  });

  it("never moves the checkpoint backwards", () => {
    expect(advanceMarketplaceCheckpoint(200, [100, 150])).toBe(200);
    expect(advanceMarketplaceCheckpoint(200, [250, 225])).toBe(250);
  });

  it("scopes every mutable/read state operation by clientId and mailboxKey", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT checkpoint_internal_date_ms")) {
        return { rows: [{ checkpoint_internal_date_ms: "123", last_attempt_at: null, last_successful_poll_at: null, consecutive_failures: 0, last_error_code: null }] };
      }
      return { rows: [] };
    });
    const store = createMarketplaceEmailWorkerStateStore({ query } as any);
    await store.ensure("client-a", "primary");
    await store.read("client-a", "primary");
    await store.markAttempt("client-a", "primary");
    await store.markSuccess({ clientId: "client-a", mailboxKey: "primary", checkpointInternalDateMs: 456 });
    await store.markFailure("client-a", "primary", new Error("Gmail API request failed with status 429"));

    for (const call of query.mock.calls) {
      const [sql, params] = call as unknown as [string, unknown[] | undefined];
      if (!params) continue;
      expect(sql).toContain("client_id");
      expect(sql).toContain("mailbox_key");
      expect(params[0]).toBe("client-a");
      expect(params[1]).toBe("primary");
    }
  });

  it("stores only a bounded error code, not an exception message", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const store = createMarketplaceEmailWorkerStateStore({ query } as any);
    await store.markFailure("client-a", "primary", new Error("Bearer secret-token Gmail API request failed with status 401"));
    const [, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(params[2]).toBe("GMAIL_AUTHORIZATION_FAILED");
    expect(JSON.stringify(params)).not.toContain("secret-token");
  });
});

import { describe, expect, it } from "vitest";

import {
  deriveCompleteLedgerAggregateStatus,
  hasVerifiedExternalReceipt,
} from "./publishing-ledger-authority";

describe("hasVerifiedExternalReceipt", () => {
  it("requires both a receipt status and durable external evidence", () => {
    expect(
      hasVerifiedExternalReceipt({
        status: "published",
        externalPostId: "external-1",
        externalPostUrl: null,
      }),
    ).toBe(true);
    expect(
      hasVerifiedExternalReceipt({
        status: "published_with_warning",
        externalPostId: null,
        externalPostUrl: "https://provider.example/post/1",
      }),
    ).toBe(true);
    expect(
      hasVerifiedExternalReceipt({
        status: "published",
        externalPostId: null,
        externalPostUrl: null,
      }),
    ).toBe(false);
    expect(
      hasVerifiedExternalReceipt({
        status: "failed",
        externalPostId: "stale-id",
        externalPostUrl: null,
      }),
    ).toBe(false);
  });
});

describe("deriveCompleteLedgerAggregateStatus", () => {
  it("derives clean published only when every expected lane has a clean receipt", () => {
    expect(
      deriveCompleteLedgerAggregateStatus({
        expectedPlatforms: 2,
        latestDeliveries: 2,
        verifiedPublished: 2,
        warningReceipts: 0,
        terminalFailures: 0,
        unresolved: 0,
      }),
    ).toBe("published");
  });

  it("derives published_with_warning for mixed or warned receipts", () => {
    expect(
      deriveCompleteLedgerAggregateStatus({
        expectedPlatforms: 2,
        latestDeliveries: 2,
        verifiedPublished: 1,
        warningReceipts: 0,
        terminalFailures: 1,
        unresolved: 0,
      }),
    ).toBe("published_with_warning");
    expect(
      deriveCompleteLedgerAggregateStatus({
        expectedPlatforms: 1,
        latestDeliveries: 1,
        verifiedPublished: 1,
        warningReceipts: 1,
        terminalFailures: 0,
        unresolved: 0,
      }),
    ).toBe("published_with_warning");
  });

  it("derives failed only when every expected lane is terminal without a receipt", () => {
    expect(
      deriveCompleteLedgerAggregateStatus({
        expectedPlatforms: 2,
        latestDeliveries: 2,
        verifiedPublished: 0,
        warningReceipts: 0,
        terminalFailures: 2,
        unresolved: 0,
      }),
    ).toBe("failed");
  });

  it("returns null for missing, extra, or unresolved ledger scope", () => {
    for (const input of [
      {
        expectedPlatforms: 2,
        latestDeliveries: 1,
        verifiedPublished: 1,
        warningReceipts: 0,
        terminalFailures: 0,
        unresolved: 1,
      },
      {
        expectedPlatforms: 2,
        latestDeliveries: 3,
        verifiedPublished: 2,
        warningReceipts: 0,
        terminalFailures: 0,
        unresolved: 0,
      },
      {
        expectedPlatforms: 0,
        latestDeliveries: 0,
        verifiedPublished: 0,
        warningReceipts: 0,
        terminalFailures: 0,
        unresolved: 0,
      },
    ]) {
      expect(deriveCompleteLedgerAggregateStatus(input)).toBeNull();
    }
  });
});

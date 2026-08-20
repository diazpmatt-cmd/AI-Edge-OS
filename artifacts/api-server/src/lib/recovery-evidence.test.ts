import { describe, expect, it } from "vitest";
import { buildRecoveryEvidence } from "./recovery-evidence.js";

const event = (overrides: Record<string, unknown>) => ({ clientId: "tenant-a", source: "telnyx", metadata: {}, ...overrides }) as any;

describe("buildRecoveryEvidence", () => {
  it("counts only a complete same-tenant parent chain", () => {
    const result = buildRecoveryEvidence([
      event({ eventType: "missed_call_observed", canonicalRecordType: "telnyx_call", canonicalRecordId: "call-1" }),
      event({ eventType: "recovery_text_sent", canonicalRecordType: "telnyx_message", canonicalRecordId: "out-1", metadata: { parentCallId: "call-1" } }),
      event({ eventType: "customer_reply_observed", canonicalRecordType: "telnyx_message", canonicalRecordId: "in-1", metadata: { parentMessageId: "out-1" } }),
      event({ clientId: "tenant-b", eventType: "customer_reply_observed", canonicalRecordType: "telnyx_message", canonicalRecordId: "in-2", metadata: { parentMessageId: "out-1" } }),
    ], "tenant-a");
    expect(result).toMatchObject({ verifiedRecoveries: 1, unlinkedReplies: 0, evidenceState: "verified" });
  });

  it("keeps an unlinked reply partial rather than calling it recovered", () => {
    const result = buildRecoveryEvidence([event({ eventType: "customer_reply_observed", canonicalRecordType: "telnyx_message", canonicalRecordId: "in-1" })], "tenant-a");
    expect(result).toMatchObject({ verifiedRecoveries: 0, unlinkedReplies: 1, evidenceState: "partial" });
  });

  it("reports unavailable when no canonical events exist", () => {
    expect(buildRecoveryEvidence([], "tenant-a").evidenceState).toBe("unavailable");
  });
});

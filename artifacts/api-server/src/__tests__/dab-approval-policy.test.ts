import { describe, expect, it } from "vitest";
import {
  isSupportedPreparationCapability,
  proposalIsExpired,
  stableProposalFingerprint,
  validateDecisionInput,
} from "../lib/dab-approval-policy";

const material = {
  requestId: "req-1",
  runId: "run-1",
  resultCreatedAt: "2026-08-03T00:00:00.000Z",
  contextHash: "a".repeat(64),
  capability: "prepare_documentation_change" as const,
  summary: "Update durable documentation.",
  recommendedNextStep: "Prepare a documentation-only patch.",
  confidence: 0.9,
};

describe("DAB approval policy", () => {
  it("allows only the initial preparation categories", () => {
    expect(isSupportedPreparationCapability("prepare_documentation_change")).toBe(true);
    expect(isSupportedPreparationCapability("prepare_task_record_change")).toBe(true);
    expect(isSupportedPreparationCapability("prepare_code_patch")).toBe(true);
    expect(isSupportedPreparationCapability("merge_pull_request")).toBe(false);
    expect(isSupportedPreparationCapability("deploy_production")).toBe(false);
  });

  it("produces deterministic fingerprints and binds every material field", () => {
    const first = stableProposalFingerprint(material);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(stableProposalFingerprint(material)).toBe(first);
    expect(stableProposalFingerprint({ ...material, contextHash: "b".repeat(64) })).not.toBe(first);
    expect(stableProposalFingerprint({ ...material, recommendedNextStep: "Different" })).not.toBe(first);
  });

  it("validates approve and reject decisions", () => {
    const fingerprint = stableProposalFingerprint(material);
    expect(validateDecisionInput({ decision: "approved", proposalFingerprint: fingerprint })).toEqual({ ok: true, decision: "approved", proposalFingerprint: fingerprint, operatorInstructions: null });
    expect(validateDecisionInput({ decision: "rejected", proposalFingerprint: fingerprint, operatorInstructions: "Not now" })).toEqual({ ok: true, decision: "rejected", proposalFingerprint: fingerprint, operatorInstructions: "Not now" });
  });

  it("requires bounded instructions for modify", () => {
    const fingerprint = stableProposalFingerprint(material);
    expect(validateDecisionInput({ decision: "modify", proposalFingerprint: fingerprint })).toEqual({ ok: false, code: "MODIFY_INSTRUCTIONS_REQUIRED" });
    expect(validateDecisionInput({ decision: "modify", proposalFingerprint: fingerprint, operatorInstructions: "Limit this to ROADMAP.md." })).toEqual({ ok: true, decision: "modify", proposalFingerprint: fingerprint, operatorInstructions: "Limit this to ROADMAP.md." });
    expect(validateDecisionInput({ decision: "modify", proposalFingerprint: fingerprint, operatorInstructions: "x".repeat(2001) })).toEqual({ ok: false, code: "INSTRUCTIONS_TOO_LONG" });
  });

  it("fails closed for unsupported decisions and mismatched fingerprint shape", () => {
    expect(validateDecisionInput({ decision: "execute", proposalFingerprint: "a".repeat(64) })).toEqual({ ok: false, code: "UNSUPPORTED_DECISION" });
    expect(validateDecisionInput({ decision: "approved", proposalFingerprint: "not-a-fingerprint" })).toEqual({ ok: false, code: "INVALID_FINGERPRINT" });
  });

  it("treats exact expiry and invalid timestamps as expired", () => {
    expect(proposalIsExpired("2026-08-03T01:00:00.000Z", "2026-08-03T00:59:59.000Z")).toBe(false);
    expect(proposalIsExpired("2026-08-03T01:00:00.000Z", "2026-08-03T01:00:00.000Z")).toBe(true);
    expect(proposalIsExpired("invalid", "2026-08-03T01:00:00.000Z")).toBe(true);
  });
});

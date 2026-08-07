import { describe, expect, it } from "vitest";
import {
  planAuthorityOutreachDraftMutation,
  validateAuthorityOutreachDraftExpectedVersion,
  validateAuthorityOutreachDraftText,
} from "./authority-outreach-draft-lifecycle.js";

describe("Authority outreach draft lifecycle", () => {
  it("trims and validates bounded draft text", () => {
    expect(validateAuthorityOutreachDraftText("  Subject  ", "  Body  ")).toEqual({
      subject: "Subject",
      body: "Body",
    });
    expect(() => validateAuthorityOutreachDraftText("", "Body")).toThrow("text_required");
    expect(() => validateAuthorityOutreachDraftText("S".repeat(301), "Body")).toThrow("subject_too_long");
    expect(() => validateAuthorityOutreachDraftText("Subject", "B".repeat(8001))).toThrow("body_too_long");
  });

  it("requires a positive integer expected version", () => {
    expect(validateAuthorityOutreachDraftExpectedVersion(3)).toBe(3);
    for (const value of [undefined, null, 0, -1, 1.2, "1"]) {
      expect(() => validateAuthorityOutreachDraftExpectedVersion(value)).toThrow("expected_version_required");
    }
  });

  it("saving an approved draft returns it to draft and clears approval", () => {
    expect(planAuthorityOutreachDraftMutation("save", "approved", 4)).toEqual({
      action: "save",
      fromStatus: "approved",
      toStatus: "draft",
      nextVersion: 5,
      clearsApproval: true,
      setsApproval: false,
    });
  });

  it("allows approval only from draft", () => {
    expect(planAuthorityOutreachDraftMutation("approve", "draft", 1).toStatus).toBe("approved");
    expect(() => planAuthorityOutreachDraftMutation("approve", "approved", 2)).toThrow("invalid_transition");
    expect(() => planAuthorityOutreachDraftMutation("approve", "rejected", 2)).toThrow("invalid_transition");
  });

  it("requires explicit reopen after rejection", () => {
    expect(() => planAuthorityOutreachDraftMutation("save", "rejected", 2)).toThrow("invalid_transition");
    expect(planAuthorityOutreachDraftMutation("reopen", "rejected", 2).toStatus).toBe("draft");
  });

  it("reopening an approved draft clears approval and increments version", () => {
    expect(planAuthorityOutreachDraftMutation("reopen", "approved", 7)).toMatchObject({
      toStatus: "draft",
      nextVersion: 8,
      clearsApproval: true,
      setsApproval: false,
    });
  });

  it("rejects from draft or approved but not repeatedly from rejected", () => {
    expect(planAuthorityOutreachDraftMutation("reject", "draft", 1).toStatus).toBe("rejected");
    expect(planAuthorityOutreachDraftMutation("reject", "approved", 2)).toMatchObject({
      toStatus: "rejected",
      clearsApproval: true,
    });
    expect(() => planAuthorityOutreachDraftMutation("reject", "rejected", 3)).toThrow("invalid_transition");
  });
});

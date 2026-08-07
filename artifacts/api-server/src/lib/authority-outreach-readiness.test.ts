import { describe, expect, it } from "vitest";
import { evaluateAuthorityOutreachReadiness } from "./authority-outreach-readiness.js";

const approvedDraft = {
  status: "approved",
  version: 3,
  approvedAt: "2026-08-07T05:00:00.000Z",
  approvedBy: "user-1",
};

const verifiedContact = {
  verificationStatus: "human_verified",
  sourceUrl: "https://example.org/contact",
  verifiedAt: "2026-08-07T05:00:00.000Z",
  verifiedBy: "user-1",
};

describe("Authority outreach readiness", () => {
  it("fails closed when the Authority workflow is not pursuing", () => {
    expect(evaluateAuthorityOutreachReadiness({
      workflowStatus: "approved",
      draft: approvedDraft,
      contacts: [verifiedContact],
    }).blockers).toContain("workflow_not_pursuing");
  });

  it("reports a missing outreach draft", () => {
    expect(evaluateAuthorityOutreachReadiness({
      workflowStatus: "pursuing",
      draft: null,
      contacts: [verifiedContact],
    }).blockers).toContain("outreach_draft_missing");
  });

  it("requires current human approval metadata on the draft", () => {
    const result = evaluateAuthorityOutreachReadiness({
      workflowStatus: "pursuing",
      draft: { ...approvedDraft, status: "draft", approvedAt: null, approvedBy: null },
      contacts: [verifiedContact],
    });
    expect(result.blockers).toContain("outreach_draft_not_approved");
  });

  it("requires at least one human-verified contact", () => {
    const result = evaluateAuthorityOutreachReadiness({
      workflowStatus: "pursuing",
      draft: approvedDraft,
      contacts: [{ ...verifiedContact, verificationStatus: "unverified" }],
    });
    expect(result.blockers).toContain("verified_contact_missing");
  });

  it("requires provenance on at least one verified contact", () => {
    const result = evaluateAuthorityOutreachReadiness({
      workflowStatus: "pursuing",
      draft: approvedDraft,
      contacts: [{ ...verifiedContact, sourceUrl: null }],
    });
    expect(result.blockers).toContain("verified_contact_provenance_missing");
  });

  it("returns ready only for pursuing + approved draft + verified sourced contact", () => {
    expect(evaluateAuthorityOutreachReadiness({
      workflowStatus: "pursuing",
      draft: approvedDraft,
      contacts: [verifiedContact],
    })).toEqual({
      ready: true,
      blockers: [],
      verifiedContactCount: 1,
      sendAuthorized: false,
      meaning: "ready_for_human_consideration_only",
    });
  });

  it("never represents readiness as send authorization", () => {
    const result = evaluateAuthorityOutreachReadiness({
      workflowStatus: "pursuing",
      draft: approvedDraft,
      contacts: [verifiedContact],
    });
    expect(result.sendAuthorized).toBe(false);
  });
});

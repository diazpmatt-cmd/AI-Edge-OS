export type AuthorityOutreachReadinessBlocker =
  | "workflow_not_pursuing"
  | "outreach_draft_missing"
  | "outreach_draft_not_approved"
  | "verified_contact_missing"
  | "verified_contact_provenance_missing";

export interface AuthorityOutreachReadinessInput {
  workflowStatus: string | null;
  draft: {
    status: string;
    version: number;
    approvedAt: Date | string | null;
    approvedBy: string | null;
  } | null;
  contacts: Array<{
    verificationStatus: string;
    sourceUrl: string | null;
    verifiedAt: Date | string | null;
    verifiedBy: string | null;
  }>;
}

export interface AuthorityOutreachReadinessResult {
  ready: boolean;
  blockers: AuthorityOutreachReadinessBlocker[];
  verifiedContactCount: number;
  sendAuthorized: false;
  meaning: "ready_for_human_consideration_only";
}

export function evaluateAuthorityOutreachReadiness(
  input: AuthorityOutreachReadinessInput,
): AuthorityOutreachReadinessResult {
  const blockers: AuthorityOutreachReadinessBlocker[] = [];

  if (input.workflowStatus !== "pursuing") {
    blockers.push("workflow_not_pursuing");
  }

  if (!input.draft) {
    blockers.push("outreach_draft_missing");
  } else if (
    input.draft.status !== "approved" ||
    !input.draft.approvedAt ||
    !input.draft.approvedBy
  ) {
    blockers.push("outreach_draft_not_approved");
  }

  const verifiedContacts = input.contacts.filter(
    (contact) => contact.verificationStatus === "human_verified",
  );

  if (verifiedContacts.length === 0) {
    blockers.push("verified_contact_missing");
  } else if (
    !verifiedContacts.some(
      (contact) => Boolean(contact.sourceUrl && contact.verifiedAt && contact.verifiedBy),
    )
  ) {
    blockers.push("verified_contact_provenance_missing");
  }

  return {
    ready: blockers.length === 0,
    blockers,
    verifiedContactCount: verifiedContacts.length,
    sendAuthorized: false,
    meaning: "ready_for_human_consideration_only",
  };
}

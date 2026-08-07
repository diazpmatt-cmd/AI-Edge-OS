export type AuthorityOutreachDraftStatus = "draft" | "approved" | "rejected";
export type AuthorityOutreachDraftMutationAction = "save" | "approve" | "reopen" | "reject";

export const AUTHORITY_OUTREACH_DRAFT_SUBJECT_MAX = 300;
export const AUTHORITY_OUTREACH_DRAFT_BODY_MAX = 8_000;

export interface AuthorityOutreachDraftMutationPlan {
  action: AuthorityOutreachDraftMutationAction;
  fromStatus: AuthorityOutreachDraftStatus;
  toStatus: AuthorityOutreachDraftStatus;
  nextVersion: number;
  clearsApproval: boolean;
  setsApproval: boolean;
}

export function validateAuthorityOutreachDraftText(
  subject: unknown,
  body: unknown,
): { subject: string; body: string } {
  if (typeof subject !== "string" || typeof body !== "string") {
    throw new Error("authority_outreach_draft_text_required");
  }
  const cleanSubject = subject.trim();
  const cleanBody = body.trim();
  if (!cleanSubject || !cleanBody) {
    throw new Error("authority_outreach_draft_text_required");
  }
  if (cleanSubject.length > AUTHORITY_OUTREACH_DRAFT_SUBJECT_MAX) {
    throw new Error("authority_outreach_draft_subject_too_long");
  }
  if (cleanBody.length > AUTHORITY_OUTREACH_DRAFT_BODY_MAX) {
    throw new Error("authority_outreach_draft_body_too_long");
  }
  return { subject: cleanSubject, body: cleanBody };
}

export function validateAuthorityOutreachDraftExpectedVersion(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new Error("authority_outreach_draft_expected_version_required");
  }
  return Number(value);
}

export function planAuthorityOutreachDraftMutation(
  action: AuthorityOutreachDraftMutationAction,
  currentStatus: AuthorityOutreachDraftStatus,
  currentVersion: number,
): AuthorityOutreachDraftMutationPlan {
  if (!Number.isInteger(currentVersion) || currentVersion < 1) {
    throw new Error("authority_outreach_draft_invalid_current_version");
  }

  switch (action) {
    case "save":
      if (currentStatus === "rejected") {
        throw new Error("authority_outreach_draft_invalid_transition:rejected->save");
      }
      return {
        action,
        fromStatus: currentStatus,
        toStatus: "draft",
        nextVersion: currentVersion + 1,
        clearsApproval: currentStatus === "approved",
        setsApproval: false,
      };

    case "approve":
      if (currentStatus !== "draft") {
        throw new Error(`authority_outreach_draft_invalid_transition:${currentStatus}->approve`);
      }
      return {
        action,
        fromStatus: currentStatus,
        toStatus: "approved",
        nextVersion: currentVersion + 1,
        clearsApproval: false,
        setsApproval: true,
      };

    case "reopen":
      if (currentStatus !== "approved" && currentStatus !== "rejected") {
        throw new Error(`authority_outreach_draft_invalid_transition:${currentStatus}->reopen`);
      }
      return {
        action,
        fromStatus: currentStatus,
        toStatus: "draft",
        nextVersion: currentVersion + 1,
        clearsApproval: currentStatus === "approved",
        setsApproval: false,
      };

    case "reject":
      if (currentStatus === "rejected") {
        throw new Error("authority_outreach_draft_invalid_transition:rejected->reject");
      }
      return {
        action,
        fromStatus: currentStatus,
        toStatus: "rejected",
        nextVersion: currentVersion + 1,
        clearsApproval: currentStatus === "approved",
        setsApproval: false,
      };
  }
}

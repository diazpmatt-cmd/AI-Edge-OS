import { describe, expect, it, vi } from "vitest";

import {
  assessmentSubmissionSchema,
  createAssessmentSubmissionHandler,
  deriveAssessmentDedupeKey,
  type AssessmentSubmission,
} from "./assessments.js";

const validSubmission: AssessmentSubmission = {
  businessName: "Test Business",
  industry: "Pest Control",
  city: "Gulf Shores",
  state: "AL",
  websiteUrl: "",
  gbpUrl: "",
  facebookUrl: "",
  instagramUrl: "",
  contactName: "Test Person",
  contactEmail: "test@example.com",
  contactPhone: "251-555-0100",
  contactMethod: "email",
  scoreOverall: 42,
  scoreLeadRecovery: 40,
  scoreLocalPresence: 42,
  scoreAiVisibility: 39,
  scoreReviewStrength: 46,
};

function responseRecorder() {
  const res: any = {
    statusCode: 200,
    payload: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.payload = payload; return this; },
  };
  return res;
}

describe("assessmentSubmissionSchema", () => {
  it("normalizes bounded public input", () => {
    const parsed = assessmentSubmissionSchema.parse({
      ...validSubmission,
      businessName: "  Test Business  ",
      state: "al",
      contactEmail: " TEST@EXAMPLE.COM ",
    });

    expect(parsed.businessName).toBe("Test Business");
    expect(parsed.state).toBe("AL");
    expect(parsed.contactEmail).toBe("test@example.com");
  });

  it("rejects invalid email, score, and unknown fields", () => {
    const parsed = assessmentSubmissionSchema.safeParse({
      ...validSubmission,
      contactEmail: "not-an-email",
      scoreOverall: 101,
      unexpected: "field",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("deriveAssessmentDedupeKey", () => {
  it("is stable across casing, whitespace, and phone formatting", () => {
    const same = {
      ...validSubmission,
      businessName: " test business ",
      city: "GULF SHORES",
      state: "al",
      contactName: " test person ",
      contactEmail: "TEST@EXAMPLE.COM",
      contactPhone: "+1 (251) 555-0100",
    } as AssessmentSubmission;

    expect(deriveAssessmentDedupeKey(validSubmission)).toBe(deriveAssessmentDedupeKey(same));
  });

  it("changes when canonical submission evidence changes", () => {
    expect(deriveAssessmentDedupeKey(validSubmission)).not.toBe(
      deriveAssessmentDedupeKey({ ...validSubmission, scoreOverall: 43 }),
    );
  });
});

describe("createAssessmentSubmissionHandler", () => {
  it("returns 422 without calling capture for invalid input", async () => {
    const capture = vi.fn();
    const handler = createAssessmentSubmissionHandler(capture);
    const res = responseRecorder();

    await handler({ body: { businessName: "Only one field" } }, res);

    expect(res.statusCode).toBe(422);
    expect(res.payload.error).toBe("invalid_assessment_submission");
    expect(capture).not.toHaveBeenCalled();
  });

  it("returns 201 for a newly captured assessment", async () => {
    const capture = vi.fn().mockResolvedValue({ id: "assessment-1", duplicate: false });
    const handler = createAssessmentSubmissionHandler(capture);
    const res = responseRecorder();

    await handler({ body: validSubmission }, res);

    expect(res.statusCode).toBe(201);
    expect(res.payload).toEqual({ id: "assessment-1", duplicate: false });
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("returns the original id on a safe retry instead of creating a second logical lead", async () => {
    const capture = vi.fn().mockResolvedValue({ id: "assessment-existing", duplicate: true });
    const handler = createAssessmentSubmissionHandler(capture);
    const res = responseRecorder();

    await handler({ body: validSubmission }, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ id: "assessment-existing", duplicate: true });
  });

  it("fails closed when persistence is unavailable", async () => {
    const capture = vi.fn().mockRejectedValue(new Error("db unavailable"));
    const handler = createAssessmentSubmissionHandler(capture);
    const res = responseRecorder();

    await handler({ body: validSubmission }, res);

    expect(res.statusCode).toBe(503);
    expect(res.payload).toEqual({ error: "assessment_capture_unavailable" });
  });
});

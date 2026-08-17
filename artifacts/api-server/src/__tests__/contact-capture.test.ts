import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {} }));

import {
  contactSubmissionSchema,
  createContactHandler,
  deriveContactDedupeKey,
  type ContactCaptureFn,
} from "../routes/contact";

function validSubmission(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@example.com",
    phone: "(251) 324-9090",
    business: "Example Services LLC",
    industry: "HVAC",
    services: ["AI Receptionist", "Lead Recovery AI"],
    message: "Please show me the revenue recovery workflow.",
    packageKey: "growth",
    packageLabel: "Growth Package",
    ...overrides,
  };
}

function createResponse() {
  const res: any = { statusCode: 200, payload: undefined };
  res.status = vi.fn((statusCode: number) => {
    res.statusCode = statusCode;
    return res;
  });
  res.json = vi.fn((payload: unknown) => {
    res.payload = payload;
    return res;
  });
  return res;
}

describe("public contact revenue capture", () => {
  it("rejects malformed submissions before persistence", async () => {
    const capture = vi.fn<ContactCaptureFn>();
    const handler = createContactHandler(capture);
    const res = createResponse();

    await handler({ body: validSubmission({ email: "not-an-email" }) }, res);

    expect(res.statusCode).toBe(422);
    expect(res.payload.error).toBe("invalid_contact_submission");
    expect(res.payload.fields).toContain("email");
    expect(capture).not.toHaveBeenCalled();
  });

  it("rejects unexpected fields rather than persisting unbounded input", async () => {
    const capture = vi.fn<ContactCaptureFn>();
    const handler = createContactHandler(capture);
    const res = createResponse();

    await handler({ body: validSubmission({ admin: true }) }, res);

    expect(res.statusCode).toBe(422);
    expect(capture).not.toHaveBeenCalled();
  });

  it("returns 201 only after a lead is persisted", async () => {
    const capture = vi.fn<ContactCaptureFn>().mockResolvedValue({ id: "lead-1", duplicate: false });
    const handler = createContactHandler(capture);
    const res = createResponse();

    await handler({ body: validSubmission() }, res);

    expect(res.statusCode).toBe(201);
    expect(res.payload).toEqual({ id: "lead-1", duplicate: false });
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("treats a retry duplicate as accepted without creating another lead", async () => {
    const capture = vi.fn<ContactCaptureFn>().mockResolvedValue({ id: "lead-1", duplicate: true });
    const handler = createContactHandler(capture);
    const res = createResponse();

    await handler({ body: validSubmission() }, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ id: "lead-1", duplicate: true });
  });

  it("returns a controlled unavailable response when persistence fails", async () => {
    const capture = vi.fn<ContactCaptureFn>().mockRejectedValue(new Error("database connection detail"));
    const handler = createContactHandler(capture);
    const res = createResponse();

    await handler({ body: validSubmission() }, res);

    expect(res.statusCode).toBe(503);
    expect(res.payload).toEqual({ error: "contact_capture_unavailable" });
    expect(JSON.stringify(res.payload)).not.toContain("database connection detail");
  });

  it("derives the same retry key from semantically equivalent normalized submissions", () => {
    const first = contactSubmissionSchema.parse(validSubmission());
    const second = contactSubmissionSchema.parse(validSubmission({
      firstName: "  JANE  ",
      lastName: "DOE",
      email: "JANE@EXAMPLE.COM",
      phone: "+1 251-324-9090",
      business: "EXAMPLE SERVICES LLC",
      industry: "hvac",
      services: ["lead recovery ai", "AI RECEPTIONIST"],
      message: "PLEASE SHOW ME THE REVENUE RECOVERY WORKFLOW.",
      packageKey: "GROWTH",
      packageLabel: "GROWTH PACKAGE",
    }));

    expect(deriveContactDedupeKey(second)).toBe(deriveContactDedupeKey(first));
  });

  it("uses a different retry key when the inquiry materially changes", () => {
    const first = contactSubmissionSchema.parse(validSubmission());
    const second = contactSubmissionSchema.parse(validSubmission({ message: "I need a different workflow." }));

    expect(deriveContactDedupeKey(second)).not.toBe(deriveContactDedupeKey(first));
  });
});

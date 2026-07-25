import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canTransitionReferralInvitation,
  findUnsupportedInvitationTokens,
  normalizeInvitationDestination,
  referralContactPreferenceSchema,
  referralInvitationDraftSchema,
  referralInvitationTemplateSchema,
  renderReferralInvitation,
} from "../lib/referral-growth.js";

const routeSource = readFileSync(
  new URL("../routes/referrals.ts", import.meta.url),
  "utf8",
);
const compactRoute = routeSource.replace(/\s+/g, " ");
const invitationRoutes = compactRoute.slice(
  compactRoute.indexOf("// ── RGE-2: invitation templates"),
  compactRoute.indexOf("// ── RGE-3:"),
);

const validDraft = {
  programId: 12,
  channel: "sms",
  recipientName: "Jane Customer",
  recipientPhone: "(251) 555-0101",
  recipientEmail: null,
  initialMessage: "Hi {{first_name}}, share {{referral_link}} with a neighbor.",
  followUpMessage: "A quick reminder from {{business_name}}: {{referral_link}}",
  followUpDelayDays: 3,
  consentConfirmed: true,
  consentSource: "written_form",
  consentAt: new Date("2026-07-24T15:00:00.000Z"),
  idempotencyKey: "invite:test:0001",
};

describe("RGE-2 invitation template contract", () => {
  it("accepts an SMS template with only approved tokens", () => {
    expect(
      referralInvitationTemplateSchema.safeParse({
        name: "Neighbor invitation",
        channel: "sms",
        body: "Hi {{first_name}}, share {{referral_link}} with a neighbor.",
        followUpBody: "A quick reminder from {{business_name}}.",
        followUpDelayDays: 3,
      }).success,
    ).toBe(true);
  });

  it("requires a subject for email templates", () => {
    expect(
      referralInvitationTemplateSchema.safeParse({
        name: "Neighbor email",
        channel: "email",
        body: "Hi {{first_name}}, share {{referral_link}} with a neighbor.",
      }).success,
    ).toBe(false);
  });

  it("rejects unsupported or sensitive template tokens", () => {
    expect(
      findUnsupportedInvitationTokens(
        "Hi {{ first_name }} {{customer_balance}} {{ secret }} {{secret}}",
      ),
    ).toEqual(["customer_balance", "secret"]);
    expect(
      referralInvitationTemplateSchema.safeParse({
        name: "Unsafe",
        channel: "sms",
        body: "Hi {{first_name}}, your balance is {{customer_balance}}.",
      }).success,
    ).toBe(false);
  });

  it("renders only the approved referral invitation values", () => {
    expect(
      renderReferralInvitation(
        "Hi {{ first_name }}, {{business_name}} invited you: {{referral_link}}",
        {
          firstName: "Jane",
          businessName: "Bed Bugs & Beyond",
          referralLink: "https://example.test/refer/REF-12345678",
        },
      ),
    ).toBe(
      "Hi Jane, Bed Bugs & Beyond invited you: https://example.test/refer/REF-12345678",
    );
  });
});

describe("RGE-2 consent and destination contract", () => {
  it("normalizes a valid Baldwin County SMS destination", () => {
    expect(normalizeInvitationDestination("sms", "+1 (251) 555-0101")).toBe(
      "2515550101",
    );
  });

  it("rejects incomplete phone numbers", () => {
    expect(normalizeInvitationDestination("sms", "555-0101")).toBeNull();
  });

  it("normalizes valid email and rejects malformed email", () => {
    expect(normalizeInvitationDestination("email", " JANE@Example.COM ")).toBe(
      "jane@example.com",
    );
    expect(normalizeInvitationDestination("email", "not-an-email")).toBeNull();
  });

  it("requires affirmative documented consent", () => {
    expect(referralInvitationDraftSchema.safeParse(validDraft).success).toBe(
      true,
    );
    expect(
      referralInvitationDraftSchema.safeParse({
        ...validDraft,
        consentConfirmed: false,
      }).success,
    ).toBe(false);
    expect(
      referralInvitationDraftSchema.safeParse({
        ...validDraft,
        consentSource: "assumed",
      }).success,
    ).toBe(false);
  });

  it("rejects future consent timestamps", () => {
    expect(
      referralInvitationDraftSchema.safeParse({
        ...validDraft,
        consentAt: new Date(Date.now() + 60 * 60 * 1000),
      }).success,
    ).toBe(false);
  });

  it("requires channel-specific contact information", () => {
    expect(
      referralInvitationDraftSchema.safeParse({
        ...validDraft,
        recipientPhone: "",
      }).success,
    ).toBe(false);
    expect(
      referralInvitationDraftSchema.safeParse({
        ...validDraft,
        channel: "email",
        recipientPhone: null,
        recipientEmail: "jane@example.com",
        subject: "A referral invitation",
      }).success,
    ).toBe(true);
  });

  it("validates opt-out destinations using the same canonical rules", () => {
    expect(
      referralContactPreferenceSchema.safeParse({
        channel: "sms",
        destination: "(251) 555-0101",
        reason: "Customer said STOP.",
      }).success,
    ).toBe(true);
    expect(
      referralContactPreferenceSchema.safeParse({
        channel: "email",
        destination: "wrong",
        reason: "Customer unsubscribed.",
      }).success,
    ).toBe(false);
  });
});

describe("RGE-2 approval-state contract", () => {
  it("permits draft approval or cancellation", () => {
    expect(canTransitionReferralInvitation("draft", "approved")).toBe(true);
    expect(canTransitionReferralInvitation("draft", "cancelled")).toBe(true);
  });

  it("permits approved cancellation but not a return to draft", () => {
    expect(canTransitionReferralInvitation("approved", "cancelled")).toBe(true);
    expect(canTransitionReferralInvitation("approved", "draft")).toBe(false);
  });

  it("keeps cancelled and suppressed states terminal", () => {
    expect(canTransitionReferralInvitation("cancelled", "approved")).toBe(
      false,
    );
    expect(canTransitionReferralInvitation("suppressed", "approved")).toBe(
      false,
    );
  });
});

describe("RGE-2 route safety contract", () => {
  it("tenant-scopes every invitation and preference query", () => {
    expect(invitationRoutes).toContain("WHERE client_id = $1");
    expect(invitationRoutes).toContain("AND client_id = $2");
    expect(invitationRoutes).toContain("ri.client_id = $2");
    expect(invitationRoutes).not.toContain("req.body.clientId");
  });

  it("verifies program and template ownership before drafting", () => {
    expect(invitationRoutes).toContain(
      "WHERE id = $1 AND client_id = $2 FOR SHARE",
    );
    expect(invitationRoutes).toContain(
      "WHERE id = $1 AND client_id = $2 AND status = 'active' FOR SHARE",
    );
    expect(invitationRoutes.indexOf("active_program_not_found")).toBeLessThan(
      invitationRoutes.indexOf("INSERT INTO referral_invitations"),
    );
  });

  it("checks suppression before duplicate detection or insertion", () => {
    expect(invitationRoutes).toContain("pg_advisory_xact_lock(hashtext($1))");
    expect(invitationRoutes).toContain('status === "opted_out"');
    expect(invitationRoutes.indexOf("contact_opted_out")).toBeLessThan(
      invitationRoutes.indexOf("duplicate_invitation"),
    );
    expect(invitationRoutes.indexOf("contact_opted_out")).toBeLessThan(
      invitationRoutes.indexOf("INSERT INTO referral_invitations"),
    );
  });

  it("provides both an idempotency constraint and a 24-hour contact duplicate guard", () => {
    expect(invitationRoutes).toContain(
      "ON CONFLICT (client_id, idempotency_key) DO NOTHING",
    );
    expect(invitationRoutes).toContain(
      "created_at > NOW() - INTERVAL '24 hours'",
    );
    expect(invitationRoutes).toContain("recipient_destination = $4");
    expect(invitationRoutes.indexOf("idempotentResult")).toBeLessThan(
      invitationRoutes.indexOf("duplicateResult"),
    );
    expect(invitationRoutes).toContain("idempotency_conflict");
    expect(invitationRoutes).toContain(
      "existing.recipientDestination !== destination",
    );
  });

  it("keeps approval fail-closed when a contact has opted out", () => {
    expect(invitationRoutes).toContain("AND NOT EXISTS");
    expect(invitationRoutes).toContain("rcp.status = 'opted_out'");
    expect(invitationRoutes).toContain("invitation_not_approvable");
  });

  it("suppresses every pending row when an opt-out is recorded", () => {
    expect(invitationRoutes).toContain("status = 'suppressed'");
    expect(invitationRoutes).toContain("status IN ('draft', 'approved')");
    expect(invitationRoutes).toContain("suppressedInvitationCount");
  });

  it("makes the no-delivery boundary explicit in schema and responses", () => {
    expect(routeSource).toContain("CHECK (delivery_state = 'not_dispatched')");
    expect(routeSource).toContain("CHECK (sequence_step = 0)");
    expect(invitationRoutes).toContain("sendingEnabled: false");
    expect(invitationRoutes).toContain("no message was sent");
  });

  it("contains no provider call, message sender import, or scheduler in the RGE-2 routes", () => {
    expect(invitationRoutes).not.toContain("sendSms");
    expect(invitationRoutes).not.toContain("nodemailer");
    expect(invitationRoutes).not.toContain("TELNYX");
    expect(invitationRoutes).not.toContain("fetch(");
    expect(invitationRoutes).not.toContain("scheduler");
    expect(invitationRoutes).not.toContain("setInterval");
  });

  it("creates no seed or fabricated invitation records", () => {
    expect(invitationRoutes).not.toContain("seedDemoData");
    expect(invitationRoutes).not.toMatch(/\d{3}-555-\d{4}/);
  });
});

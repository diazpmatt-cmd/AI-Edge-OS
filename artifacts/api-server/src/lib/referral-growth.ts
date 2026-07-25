import { randomBytes } from "node:crypto";
import { z } from "zod/v4";

export const REFERRAL_CODE_PATTERN = /^[A-Z0-9-]{8,40}$/;

export const createReferralProgramSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  rewardType: z.enum(["credit", "cash", "discount"]).default("credit"),
  rewardValue: z.coerce.number().min(0).max(10_000).default(25),
  promoMessage: z.string().trim().max(1000).optional().nullable(),
  maxUses: z.coerce.number().int().positive().max(1_000_000).optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
});

export const publicReferralSubmissionSchema = z.object({
  referrerName: z.string().trim().min(2).max(120),
  referrerEmail: z.string().trim().email().max(254).optional().or(z.literal("")),
  referrerPhone: z.string().trim().max(40).optional().or(z.literal("")),
  referredName: z.string().trim().min(2).max(120),
  referredEmail: z.string().trim().email().max(254).optional().or(z.literal("")),
  referredPhone: z.string().trim().max(40).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  website: z.string().max(0).optional().default(""),
}).superRefine((value, ctx) => {
  if (!value.referrerEmail && !value.referrerPhone) {
    ctx.addIssue({
      code: "custom",
      path: ["referrerEmail"],
      message: "A referrer email or phone number is required.",
    });
  }
  if (!value.referredEmail && !value.referredPhone) {
    ctx.addIssue({
      code: "custom",
      path: ["referredEmail"],
      message: "A referred-customer email or phone number is required.",
    });
  }
});

export type PublicReferralSubmission = z.infer<typeof publicReferralSubmissionSchema>;

export interface ReferralRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export class ReferralSubmissionRateLimiter {
  private readonly attempts = new Map<string, number[]>();

  constructor(
    private readonly maxAttempts = 10,
    private readonly windowMs = 10 * 60 * 1000,
  ) {}

  check(key: string, now = Date.now()): ReferralRateLimitResult {
    const windowStart = now - this.windowMs;
    const recent = (this.attempts.get(key) ?? []).filter(timestamp => timestamp > windowStart);
    if (recent.length >= this.maxAttempts) {
      const retryAfterSeconds = Math.max(1, Math.ceil((recent[0] + this.windowMs - now) / 1000));
      this.attempts.set(key, recent);
      return { allowed: false, retryAfterSeconds };
    }
    recent.push(now);
    this.attempts.set(key, recent);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  reset(): void {
    this.attempts.clear();
  }
}

export const referralSubmissionRateLimiter = new ReferralSubmissionRateLimiter();

export interface PublicReferralProgramState {
  status: string;
  usesCount: number;
  maxUses: number | null;
  expiresAt: Date | string | null;
}

export type PublicProgramAvailability =
  | { available: true }
  | { available: false; reason: "inactive" | "expired" | "capacity_reached" };

export function generateReferralCode(): string {
  return `REF-${randomBytes(8).toString("hex").toUpperCase()}`;
}

export function normalizeReferralCode(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return REFERRAL_CODE_PATTERN.test(normalized) ? normalized : null;
}

export function normalizeEmail(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized || null;
}

export function normalizePhone(value?: string | null): string | null {
  const digits = value?.replace(/\D/g, "") ?? "";
  const normalized = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return normalized || null;
}

export function getPublicProgramAvailability(
  program: PublicReferralProgramState,
  now = new Date(),
): PublicProgramAvailability {
  if (program.status !== "active") {
    return { available: false, reason: "inactive" };
  }
  if (program.expiresAt && new Date(program.expiresAt).getTime() <= now.getTime()) {
    return { available: false, reason: "expired" };
  }
  if (program.maxUses !== null && program.usesCount >= program.maxUses) {
    return { available: false, reason: "capacity_reached" };
  }
  return { available: true };
}

export function isSelfReferral(submission: PublicReferralSubmission): boolean {
  const referrerEmail = normalizeEmail(submission.referrerEmail);
  const referredEmail = normalizeEmail(submission.referredEmail);
  if (referrerEmail && referredEmail && referrerEmail === referredEmail) return true;

  const referrerPhone = normalizePhone(submission.referrerPhone);
  const referredPhone = normalizePhone(submission.referredPhone);
  return Boolean(referrerPhone && referredPhone && referrerPhone === referredPhone);
}

// ── RGE-2: invitation drafting and approval (delivery intentionally absent) ──

export const REFERRAL_INVITATION_CHANNELS = ["sms", "email"] as const;
export type ReferralInvitationChannel =
  (typeof REFERRAL_INVITATION_CHANNELS)[number];

export const REFERRAL_INVITATION_TOKENS = [
  "first_name",
  "business_name",
  "referral_link",
] as const;

export const referralInvitationTemplateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    channel: z.enum(REFERRAL_INVITATION_CHANNELS),
    subject: z.string().trim().max(160).optional().nullable(),
    body: z.string().trim().min(10).max(1200),
    followUpBody: z.string().trim().max(1200).optional().nullable(),
    followUpDelayDays: z.coerce.number().int().min(1).max(30).default(3),
  })
  .superRefine((value, ctx) => {
    if (value.channel === "email" && !value.subject) {
      ctx.addIssue({
        code: "custom",
        path: ["subject"],
        message: "Email templates require a subject.",
      });
    }
    for (const field of ["subject", "body", "followUpBody"] as const) {
      const unsupported = findUnsupportedInvitationTokens(value[field] ?? "");
      if (unsupported.length) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: `Unsupported template token: ${unsupported.join(", ")}`,
        });
      }
    }
  });

export const referralInvitationDraftSchema = z
  .object({
    programId: z.coerce.number().int().positive(),
    templateId: z.coerce.number().int().positive().optional().nullable(),
    channel: z.enum(REFERRAL_INVITATION_CHANNELS),
    recipientName: z.string().trim().min(2).max(120),
    recipientPhone: z.string().trim().max(40).optional().nullable(),
    recipientEmail: z.string().trim().email().max(254).optional().nullable(),
    subject: z.string().trim().max(160).optional().nullable(),
    initialMessage: z.string().trim().min(10).max(1200).optional().nullable(),
    followUpMessage: z.string().trim().max(1200).optional().nullable(),
    followUpDelayDays: z.coerce.number().int().min(1).max(30).default(3),
    consentConfirmed: z.literal(true),
    consentSource: z.enum([
      "customer_request",
      "written_form",
      "web_form",
      "service_agreement",
      "other_documented",
    ]),
    consentAt: z.coerce.date(),
    idempotencyKey: z
      .string()
      .trim()
      .min(8)
      .max(120)
      .regex(/^[A-Za-z0-9._:-]+$/),
  })
  .superRefine((value, ctx) => {
    if (value.consentAt.getTime() > Date.now() + 5 * 60 * 1000) {
      ctx.addIssue({
        code: "custom",
        path: ["consentAt"],
        message: "Consent time cannot be in the future.",
      });
    }
    if (value.channel === "sms" && !normalizePhone(value.recipientPhone)) {
      ctx.addIssue({
        code: "custom",
        path: ["recipientPhone"],
        message: "A valid phone number is required for SMS.",
      });
    }
    if (value.channel === "email" && !normalizeEmail(value.recipientEmail)) {
      ctx.addIssue({
        code: "custom",
        path: ["recipientEmail"],
        message: "A valid email address is required for email.",
      });
    }
    if (!value.templateId && !value.initialMessage) {
      ctx.addIssue({
        code: "custom",
        path: ["initialMessage"],
        message: "Choose a template or provide an invitation message.",
      });
    }
    if (value.channel === "email" && !value.templateId && !value.subject) {
      ctx.addIssue({
        code: "custom",
        path: ["subject"],
        message: "Email invitations require a subject.",
      });
    }
    for (const field of [
      "subject",
      "initialMessage",
      "followUpMessage",
    ] as const) {
      const unsupported = findUnsupportedInvitationTokens(value[field] ?? "");
      if (unsupported.length) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: `Unsupported template token: ${unsupported.join(", ")}`,
        });
      }
    }
  });

export const referralContactPreferenceSchema = z
  .object({
    channel: z.enum(REFERRAL_INVITATION_CHANNELS),
    destination: z.string().trim().min(3).max(254),
    reason: z
      .string()
      .trim()
      .min(2)
      .max(500)
      .default("Customer requested no referral invitations."),
  })
  .superRefine((value, ctx) => {
    if (!normalizeInvitationDestination(value.channel, value.destination)) {
      ctx.addIssue({
        code: "custom",
        path: ["destination"],
        message: `A valid ${value.channel === "sms" ? "phone number" : "email address"} is required.`,
      });
    }
  });

export const referralDeliveryRequestSchema = z.object({
  requestedMode: z.enum(["dry_run", "live"]).default("dry_run"),
  confirmDispatch: z.literal(true),
  idempotencyKey: z
    .string()
    .trim()
    .min(8)
    .max(120)
    .regex(/^[A-Za-z0-9._:-]+$/),
});

export const referralRewardApprovalSchema = z.object({
  confirmApproval: z.literal(true),
  idempotencyKey: z
    .string()
    .trim()
    .min(8)
    .max(120)
    .regex(/^[A-Za-z0-9._:-]+$/),
});

export const referralRewardFulfillmentSchema = z.object({
  confirmFulfillment: z.literal(true),
  method: z.enum(["manual_credit", "cash", "discount", "other"]),
  reference: z.string().trim().min(3).max(160),
  note: z.string().trim().max(500).nullable().optional(),
  idempotencyKey: z
    .string()
    .trim()
    .min(8)
    .max(120)
    .regex(/^[A-Za-z0-9._:-]+$/),
});

export const referralFraudEvaluationSchema = z.object({
  confirmEvaluation: z.literal(true),
  referralId: z.number().int().positive().optional(),
});

export const referralFraudDecisionSchema = z.object({
  decision: z.enum(["clear", "hold", "reject"]),
  confirmDecision: z.literal(true),
  expectedVersion: z.number().int().nonnegative(),
  note: z.string().trim().min(3).max(1000),
  idempotencyKey: z
    .string()
    .trim()
    .min(8)
    .max(120)
    .regex(/^[A-Za-z0-9._:-]+$/),
});

export type ReferralInvitationTemplateInput = z.infer<
  typeof referralInvitationTemplateSchema
>;
export type ReferralInvitationDraftInput = z.infer<
  typeof referralInvitationDraftSchema
>;

const INVITATION_TOKEN_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/gi;

export function findUnsupportedInvitationTokens(text: string): string[] {
  const allowed = new Set<string>(REFERRAL_INVITATION_TOKENS);
  const unsupported = new Set<string>();
  for (const match of text.matchAll(INVITATION_TOKEN_PATTERN)) {
    const token = match[1].toLowerCase();
    if (!allowed.has(token)) unsupported.add(token);
  }
  return [...unsupported].sort();
}

export function renderReferralInvitation(
  text: string,
  values: { firstName: string; businessName: string; referralLink: string },
): string {
  const replacements: Record<string, string> = {
    first_name: values.firstName,
    business_name: values.businessName,
    referral_link: values.referralLink,
  };
  return text.replace(INVITATION_TOKEN_PATTERN, (_match, rawToken: string) => {
    const token = rawToken.toLowerCase();
    return replacements[token] ?? "";
  });
}

export function normalizeInvitationDestination(
  channel: ReferralInvitationChannel,
  value: string | null | undefined,
): string | null {
  if (channel === "sms") {
    const phone = normalizePhone(value);
    return phone?.length === 10 ? phone : null;
  }
  const email = normalizeEmail(value);
  return email && z.string().email().safeParse(email).success ? email : null;
}

export type ReferralInvitationStatus =
  | "draft"
  | "approved"
  | "cancelled"
  | "suppressed";

export function canTransitionReferralInvitation(
  current: ReferralInvitationStatus,
  next: ReferralInvitationStatus,
): boolean {
  if (current === "draft") return next === "approved" || next === "cancelled";
  if (current === "approved") return next === "cancelled";
  return false;
}

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

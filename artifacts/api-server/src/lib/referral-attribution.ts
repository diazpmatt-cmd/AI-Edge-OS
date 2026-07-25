export function normalizeReferralIdentity(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function normalizeReferralPhone(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "").slice(-10);
}

export function scoreReferralCustomerMatch(input: {
  referralPhone?: string | null;
  referralEmail?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
}) {
  const phone =
    normalizeReferralPhone(input.referralPhone) !== "" &&
    normalizeReferralPhone(input.referralPhone) ===
      normalizeReferralPhone(input.customerPhone);
  const email =
    normalizeReferralIdentity(input.referralEmail) !== "" &&
    normalizeReferralIdentity(input.referralEmail) ===
      normalizeReferralIdentity(input.customerEmail);
  return {
    confidence: phone && email ? 100 : phone ? 90 : email ? 85 : 0,
    reasons: [phone ? "phone_exact" : null, email ? "email_exact" : null].filter(
      Boolean,
    ),
  };
}
